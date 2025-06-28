const cron = require('node-cron');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const { getCurrentDate, shouldCreateNextInstance, getNextRecurringDate } = require('../utils/dateHelpers');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.isStarted = false;
  }

  // Запустить все cron задачи
  start() {
    if (this.isStarted) {
      logger.warn('Cron service already started');
      return;
    }

    try {
      this.setupNotificationProcessor();
      this.setupRecurringTaskCreator();
      this.setupDataCleanup();
      this.setupHealthCheck();
      this.setupStatsAggregator();

      this.isStarted = true;
      logger.info('✅ Cron service started successfully', {
        jobsCount: this.jobs.size
      });

    } catch (error) {
      logger.error('❌ Failed to start cron service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Остановить все cron задачи
  stop() {
    try {
      this.jobs.forEach((job, name) => {
        job.stop();
        logger.info(`Cron job stopped: ${name}`);
      });

      this.jobs.clear();
      this.isStarted = false;

      logger.info('✅ Cron service stopped successfully');

    } catch (error) {
      logger.error('❌ Failed to stop cron service', {
        error: error.message
      });
    }
  }

  // Обработчик уведомлений - каждые 15 минут
  setupNotificationProcessor() {
    const job = cron.schedule('*/15 * * * *', async () => {
      try {
        logger.info('Starting notification processing...');
        await notificationService.processNotificationQueue();
      } catch (error) {
        logger.error('Notification processing failed', {
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set('notificationProcessor', job);
    job.start();

    logger.info('📢 Notification processor scheduled (every 15 minutes)');
  }

  // Создание повторяющихся задач - каждый день в 00:05
  setupRecurringTaskCreator() {
    const job = cron.schedule('5 0 * * *', async () => {
      try {
        logger.info('Starting recurring task creation...');
        await this.processRecurringTasks();
      } catch (error) {
        logger.error('Recurring task creation failed', {
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set('recurringTaskCreator', job);
    job.start();

    logger.info('🔄 Recurring task creator scheduled (daily at 00:05 UTC)');
  }

  // Очистка старых данных - каждую неделю в воскресенье в 02:00
  setupDataCleanup() {
    const job = cron.schedule('0 2 * * 0', async () => {
      try {
        logger.info('Starting data cleanup...');
        await this.performDataCleanup();
      } catch (error) {
        logger.error('Data cleanup failed', {
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set('dataCleanup', job);
    job.start();

    logger.info('🧹 Data cleanup scheduled (weekly on Sunday at 02:00 UTC)');
  }

  // Health check - каждые 30 минут
  setupHealthCheck() {
    const job = cron.schedule('*/30 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed', {
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set('healthCheck', job);
    job.start();

    logger.info('❤️ Health check scheduled (every 30 minutes)');
  }

  // Агрегация статистики - каждый час
  setupStatsAggregator() {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Starting stats aggregation...');
        await this.aggregateStats();
      } catch (error) {
        logger.error('Stats aggregation failed', {
          error: error.message
        });
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set('statsAggregator', job);
    job.start();

    logger.info('📊 Stats aggregator scheduled (hourly)');
  }

  // Обработка повторяющихся задач
  async processRecurringTasks() {
    try {
      let processedCount = 0;
      let createdCount = 0;
      let errorCount = 0;

      // Получаем все активные повторяющиеся задачи
      const users = await User.findAll({ limit: 10000 });

      for (const user of users.users) {
        try {
          const { tasks } = await Task.findByUser(user.id, {
            status: 'all',
            limit: 1000
          });

          const recurringTasks = tasks.filter(task => 
            task.is_recurring && 
            task.completed && 
            !task.parent_task_id // Только родительские задачи
          );

          for (const task of recurringTasks) {
            try {
              processedCount++;

              const shouldCreate = shouldCreateNextInstance(
                task.due_date,
                task.repeat_type,
                task.repeat_interval,
                task.repeat_unit,
                user.timezone
              );

              if (shouldCreate) {
                const nextDate = getNextRecurringDate(
                  task.due_date,
                  task.repeat_type,
                  task.repeat_interval,
                  task.repeat_unit
                );

                if (nextDate && (!task.repeat_end_date || nextDate <= new Date(task.repeat_end_date))) {
                  await Task.create({
                    title: task.title,
                    description: task.description,
                    due_date: nextDate.toISOString().split('T')[0],
                    due_time: task.due_time,
                    priority: task.priority,
                    is_recurring: task.is_recurring,
                    repeat_type: task.repeat_type,
                    repeat_interval: task.repeat_interval,
                    repeat_unit: task.repeat_unit,
                    repeat_end_date: task.repeat_end_date,
                    parent_task_id: task.parent_task_id || task.id
                  }, user.id);

                  createdCount++;
                }
              }

            } catch (taskError) {
              errorCount++;
              logger.error('Failed to process recurring task', {
                error: taskError.message,
                taskId: task.id,
                userId: user.id
              });
            }
          }

        } catch (userError) {
          errorCount++;
          logger.error('Failed to process user recurring tasks', {
            error: userError.message,
            userId: user.id
          });
        }
      }

      logger.info('Recurring task processing completed', {
        processedCount,
        createdCount,
        errorCount
      });

    } catch (error) {
      logger.error('Failed to process recurring tasks', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Очистка старых данных
  async performDataCleanup() {
    try {
      let totalCleaned = 0;

      // Очищаем старые уведомления (старше 30 дней)
      const notificationsCleaned = await notificationService.cleanupOldNotifications(30);
      totalCleaned += notificationsCleaned;

      // Очищаем выполненные задачи старше года (кроме повторяющихся)
      const tasksCleaned = await this.cleanupOldTasks();
      totalCleaned += tasksCleaned;

      // TODO: Очистка других данных при необходимости

      logger.info('Data cleanup completed', {
        totalCleaned,
        notificationsCleaned,
        tasksCleaned
      });

    } catch (error) {
      logger.error('Failed to perform data cleanup', {
        error: error.message
      });
      throw error;
    }
  }

  // Очистка старых задач
  async cleanupOldTasks() {
    try {
      // TODO: Реализовать очистку старых задач через raw SQL запрос
      // DELETE FROM tasks WHERE completed = true AND completed_at < NOW() - INTERVAL '1 year' AND parent_task_id IS NULL
      
      logger.info('Old tasks cleanup - feature pending implementation');
      return 0;

    } catch (error) {
      logger.error('Failed to cleanup old tasks', {
        error: error.message
      });
      return 0;
    }
  }

  // Health check системы
  async performHealthCheck() {
    try {
      const startTime = Date.now();

      // Проверяем состояние базы данных
      const database = require('../config/database');
      const dbHealth = await database.healthCheck();

      // Проверяем состояние Telegram API
      const telegramConfig = require('../config/telegram');
      const telegramHealth = await telegramConfig.healthCheck();

      // Проверяем память и использование ресурсов
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const healthData = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealth,
        telegram: telegramHealth,
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024) // MB
        },
        cpu: cpuUsage,
        responseTime: Date.now() - startTime
      };

      const isHealthy = dbHealth.connected && telegramHealth.connected;

      if (isHealthy) {
        logger.info('✅ System health check passed', healthData);
      } else {
        logger.error('❌ System health check failed', healthData);
        
        // Уведомляем админа при проблемах
        await this.notifyAdminAboutHealth(healthData);
      }

    } catch (error) {
      logger.error('Health check execution failed', {
        error: error.message
      });

      // Критическая ошибка - уведомляем админа
      await this.notifyAdminAboutHealth({
        error: error.message,
        critical: true
      });
    }
  }

  // Агрегация статистики
  async aggregateStats() {
    try {
      // TODO: Реализовать агрегацию статистики
      // Например, подсчет активных пользователей, создание сводок и т.д.
      
      logger.info('Stats aggregation - feature pending implementation');

    } catch (error) {
      logger.error('Failed to aggregate stats', {
        error: error.message
      });
    }
  }

  // Уведомить админа о проблемах с системой
  async notifyAdminAboutHealth(healthData) {
    try {
      const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
      if (!adminTelegramId) {
        return;
      }

      const telegramService = require('./telegramService');
      
      let message = `🚨 *Проблема с системой Taskly*\n\n`;
      
      if (healthData.critical) {
        message += `❌ *Критическая ошибка:*\n\`${healthData.error}\`\n\n`;
      } else {
        if (!healthData.database?.connected) {
          message += `❌ База данных недоступна\n`;
        }
        if (!healthData.telegram?.connected) {
          message += `❌ Telegram API недоступен\n`;
        }
        
        message += `\n📊 *Использование ресурсов:*\n`;
        message += `🧠 Память: ${healthData.memory?.heapUsed}MB\n`;
        message += `⏱ Время ответа: ${healthData.responseTime}ms\n`;
      }

      message += `\n🕐 Время: ${new Date().toLocaleString('ru-RU')}`;

      await telegramService.sendMessage(adminTelegramId, message);

    } catch (error) {
      logger.error('Failed to notify admin about health issues', {
        error: error.message,
        healthData
      });
    }
  }

  // Получить статус всех cron задач
  getJobsStatus() {
    const status = {};
    
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });

    return {
      isStarted: this.isStarted,
      jobsCount: this.jobs.size,
      jobs: status
    };
  }

  // Перезапустить конкретную задачу
  restartJob(jobName) {
    try {
      const job = this.jobs.get(jobName);
      if (!job) {
        throw new Error(`Job ${jobName} not found`);
      }

      job.stop();
      job.start();

      logger.info(`Cron job restarted: ${jobName}`);
      return true;

    } catch (error) {
      logger.error(`Failed to restart cron job: ${jobName}`, {
        error: error.message
      });
      return false;
    }
  }

  // Остановить конкретную задачу
  stopJob(jobName) {
    try {
      const job = this.jobs.get(jobName);
      if (!job) {
        throw new Error(`Job ${jobName} not found`);
      }

      job.stop();
      logger.info(`Cron job stopped: ${jobName}`);
      return true;

    } catch (error) {
      logger.error(`Failed to stop cron job: ${jobName}`, {
        error: error.message
      });
      return false;
    }
  }
}

// Создаем singleton экземпляр
const cronService = new CronService();

module.exports = cronService;
