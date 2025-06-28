const Notification = require('../models/Notification');
const User = require('../models/User');
const Task = require('../models/Task');
const telegramService = require('./telegramService');
const logger = require('../utils/logger');
const { 
  formatTaskNotification, 
  formatDailySummary, 
  formatTaskList 
} = require('../utils/formatters');
const { 
  NOTIFICATION_TYPES, 
  DELIVERY_STATUS, 
  EMOJIS,
  CALLBACK_PREFIXES 
} = require('../config/constants');
const { 
  getCurrentDate, 
  getCurrentTime, 
  isDueToday, 
  isDueTomorrow, 
  isOverdue 
} = require('../utils/dateHelpers');

class NotificationService {
  constructor() {
    this.batchSize = process.env.NOTIFICATION_BATCH_SIZE || 50;
    this.isProcessing = false;
  }

  // Обработать очередь уведомлений
  async processNotificationQueue() {
    if (this.isProcessing) {
      logger.debug('Notification processing already in progress');
      return;
    }

    this.isProcessing = true;

    try {
      logger.info('Starting notification queue processing');

      // Получаем пользователей с включенными уведомлениями
      const users = await this.getUsersForNotifications();
      
      let totalNotifications = 0;
      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          const notifications = await this.processUserNotifications(user);
          totalNotifications += notifications.total;
          successCount += notifications.success;
          errorCount += notifications.errors;

          // Пауза между пользователями для избежания rate limit
          await this.sleep(100);

        } catch (error) {
          logger.error('Failed to process notifications for user', {
            error: error.message,
            userId: user.id,
            telegramId: user.telegram_id
          });
          errorCount++;
        }
      }

      logger.info('Notification queue processing completed', {
        usersProcessed: users.length,
        totalNotifications,
        successCount,
        errorCount
      });

    } catch (error) {
      logger.error('Notification queue processing failed', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }

  // Получить пользователей для отправки уведомлений
  async getUsersForNotifications() {
    try {
      // TODO: Оптимизировать запрос для получения только активных пользователей
      const users = await User.findAll({ limit: 1000 });
      
      return users.users.filter(user => 
        user.getSetting('notifications', true) && 
        user.telegram_id > 0
      );

    } catch (error) {
      logger.error('Failed to get users for notifications', {
        error: error.message
      });
      return [];
    }
  }

  // Обработать уведомления для одного пользователя
  async processUserNotifications(user) {
    const results = {
      total: 0,
      success: 0,
      errors: 0
    };

    try {
      const timezone = user.timezone || 'Europe/Moscow';
      const currentTime = getCurrentTime(timezone);
      const reminderTime = user.getSetting('reminder_time', '09:00');

      // Отправляем ежедневную сводку
      if (this.shouldSendDailySummary(currentTime, reminderTime) && 
          user.getSetting('daily_summary', true)) {
        const sent = await this.sendDailySummary(user);
        results.total++;
        if (sent) results.success++;
        else results.errors++;
      }

      // Получаем задачи для уведомлений
      const tasks = await this.getTasksForNotifications(user.id, timezone);

      for (const task of tasks) {
        try {
          const notificationType = this.getNotificationType(task, timezone);
          
          if (notificationType) {
            const sent = await this.sendTaskNotification(user, task, notificationType);
            results.total++;
            if (sent) results.success++;
            else results.errors++;

            // Отмечаем задачу как уведомленную
            await task.markNotificationSent();
          }

        } catch (error) {
          logger.error('Failed to send task notification', {
            error: error.message,
            userId: user.id,
            taskId: task.id
          });
          results.errors++;
        }
      }

    } catch (error) {
      logger.error('Failed to process user notifications', {
        error: error.message,
        userId: user.id
      });
      results.errors++;
    }

    return results;
  }

  // Получить задачи для уведомлений
  async getTasksForNotifications(userId, timezone) {
    try {
      const { tasks } = await Task.findByUser(userId, {
        status: 'all',
        limit: 100
      });

      return tasks.filter(task => task.shouldSendNotification(timezone));

    } catch (error) {
      logger.error('Failed to get tasks for notifications', {
        error: error.message,
        userId
      });
      return [];
    }
  }

  // Определить тип уведомления для задачи
  getNotificationType(task, timezone) {
    if (task.completed || task.notification_sent) {
      return null;
    }

    if (!task.due_date) {
      return null;
    }

    if (isOverdue(task.due_date, timezone)) {
      return NOTIFICATION_TYPES.OVERDUE;
    }

    if (isDueToday(task.due_date, timezone)) {
      return NOTIFICATION_TYPES.DUE_TODAY;
    }

    if (isDueTomorrow(task.due_date, timezone)) {
      return NOTIFICATION_TYPES.DUE_TOMORROW;
    }

    return null;
  }

  // Отправить уведомление о задаче
  async sendTaskNotification(user, task, notificationType) {
    try {
      const message = formatTaskNotification(task, notificationType);
      
      // Создаем inline клавиатуру
      const keyboard = telegramService.createInlineKeyboard([
        [
          telegramService.createButton('✅ Выполнить', `${CALLBACK_PREFIXES.TASK_COMPLETE}${task.id}`),
          telegramService.createButton('📝 Изменить', `${CALLBACK_PREFIXES.TASK_EDIT}${task.id}`)
        ],
        [telegramService.createButton('📋 Все задачи', 'all_tasks')]
      ]);

      const telegramMessage = await telegramService.sendMessage(
        user.telegram_id,
        message,
        { reply_markup: keyboard }
      );

      // Сохраняем уведомление в базу
      await Notification.create({
        user_id: user.id,
        task_id: task.id,
        type: notificationType,
        message: message,
        telegram_message_id: telegramMessage.message_id,
        delivery_status: DELIVERY_STATUS.DELIVERED
      });

      logger.notification('Task notification sent', {
        userId: user.id,
        taskId: task.id,
        type: notificationType,
        messageId: telegramMessage.message_id
      });

      return true;

    } catch (error) {
      logger.error('Failed to send task notification', {
        error: error.message,
        userId: user.id,
        taskId: task.id,
        type: notificationType
      });

      // Сохраняем неудачную попытку
      try {
        await Notification.create({
          user_id: user.id,
          task_id: task.id,
          type: notificationType,
          message: 'Failed to send',
          delivery_status: DELIVERY_STATUS.FAILED
        });
      } catch (saveError) {
        logger.error('Failed to save failed notification', {
          error: saveError.message,
          userId: user.id,
          taskId: task.id
        });
      }

      return false;
    }
  }

  // Отправить ежедневную сводку
  async sendDailySummary(user) {
    try {
      const timezone = user.timezone || 'Europe/Moscow';
      
      // Получаем задачи на сегодня и просроченные
      const [todayResult, overdueResult] = await Promise.all([
        Task.findByUser(user.id, { status: 'today', limit: 10 }),
        Task.findByUser(user.id, { status: 'overdue', limit: 10 })
      ]);

      const todayTasks = todayResult.tasks;
      const overdueTasks = overdueResult.tasks;

      // Если нет задач, не отправляем сводку
      if (todayTasks.length === 0 && overdueTasks.length === 0) {
        return true;
      }

      const stats = await user.getStats();
      const message = formatDailySummary(todayTasks, overdueTasks, stats);

      const keyboard = telegramService.createInlineKeyboard([
        [telegramService.createButton('🚀 Открыть приложение', { 
          web_app: { url: process.env.APP_URL } 
        })],
        [telegramService.createButton('➕ Добавить задачу', 'add_task')]
      ]);

      const telegramMessage = await telegramService.sendMessage(
        user.telegram_id,
        message,
        { reply_markup: keyboard }
      );

      // Сохраняем уведомление
      await Notification.create({
        user_id: user.id,
        type: NOTIFICATION_TYPES.DAILY_SUMMARY,
        message: message,
        telegram_message_id: telegramMessage.message_id,
        delivery_status: DELIVERY_STATUS.DELIVERED
      });

      logger.notification('Daily summary sent', {
        userId: user.id,
        todayTasks: todayTasks.length,
        overdueTasks: overdueTasks.length,
        messageId: telegramMessage.message_id
      });

      return true;

    } catch (error) {
      logger.error('Failed to send daily summary', {
        error: error.message,
        userId: user.id
      });

      return false;
    }
  }

  // Проверить, нужно ли отправлять ежедневную сводку
  shouldSendDailySummary(currentTime, reminderTime) {
    // Отправляем сводку в течение 15 минут после времени напоминания
    const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number);
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);

    const reminderMinutes = reminderHour * 60 + reminderMinute;
    const currentMinutes = currentHour * 60 + currentMinute;

    return currentMinutes >= reminderMinutes && 
           currentMinutes <= reminderMinutes + 15;
  }

  // Отправить произвольное уведомление
  async sendCustomNotification(userId, message, options = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const telegramMessage = await telegramService.sendMessage(
        user.telegram_id,
        message,
        options
      );

      // Сохраняем уведомление
      await Notification.create({
        user_id: user.id,
        type: NOTIFICATION_TYPES.REMINDER,
        message: message,
        telegram_message_id: telegramMessage.message_id,
        delivery_status: DELIVERY_STATUS.DELIVERED
      });

      return telegramMessage;

    } catch (error) {
      logger.error('Failed to send custom notification', {
        error: error.message,
        userId,
        message
      });
      throw error;
    }
  }

  // Отправить уведомление всем пользователям (админ функция)
  async sendBroadcastNotification(message, options = {}) {
    try {
      const users = await User.findAll({ limit: 10000 });
      let successCount = 0;
      let errorCount = 0;

      for (const user of users.users) {
        try {
          await this.sendCustomNotification(user.id, message, options);
          successCount++;
          
          // Пауза между отправками
          await this.sleep(50);

        } catch (error) {
          errorCount++;
          logger.error('Failed to send broadcast to user', {
            error: error.message,
            userId: user.id
          });
        }
      }

      logger.info('Broadcast notification completed', {
        totalUsers: users.users.length,
        successCount,
        errorCount
      });

      return { successCount, errorCount };

    } catch (error) {
      logger.error('Failed to send broadcast notification', {
        error: error.message,
        message
      });
      throw error;
    }
  }

  // Очистить старые уведомления
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const deletedCount = await Notification.cleanup(daysOld);
      
      logger.info('Old notifications cleaned up', {
        deletedCount,
        daysOld
      });

      return deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup old notifications', {
        error: error.message,
        daysOld
      });
      throw error;
    }
  }

  // Получить статистику уведомлений
  async getNotificationStats(userId = null, days = 7) {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      return await Notification.getStats(userId, dateFrom.toISOString());

    } catch (error) {
      logger.error('Failed to get notification stats', {
        error: error.message,
        userId,
        days
      });
      throw error;
    }
  }

  // Вспомогательная функция для паузы
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Создаем singleton экземпляр
const notificationService = new NotificationService();

module.exports = notificationService;
