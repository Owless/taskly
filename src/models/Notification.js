const database = require('../config/database');
const logger = require('../utils/logger');
const { NOTIFICATION_TYPES, DELIVERY_STATUS } = require('../config/constants');
const { ValidationError } = require('../middleware/errorHandler');

class Notification {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  // Создать новое уведомление
  static async create(notificationData) {
    try {
      const supabase = database.getClient();
      
      const newNotification = {
        user_id: notificationData.user_id,
        task_id: notificationData.task_id || null,
        type: notificationData.type,
        message: notificationData.message,
        telegram_message_id: notificationData.telegram_message_id || null,
        delivery_status: notificationData.delivery_status || DELIVERY_STATUS.SENT
      };

      // Валидация типа уведомления
      if (!Object.values(NOTIFICATION_TYPES).includes(newNotification.type)) {
        throw new ValidationError(`Invalid notification type: ${newNotification.type}`);
      }

      const { data, error } = await supabase
        .from('notifications')
        .insert([newNotification])
        .select()
        .single();

      if (error) {
        logger.error('Failed to create notification', { error, notificationData });
        throw error;
      }

      logger.info('Notification created successfully', { 
        notificationId: data.id, 
        userId: data.user_id,
        type: data.type
      });

      return new Notification(data);
    } catch (error) {
      throw error;
    }
  }

  // Найти уведомление по ID
  static async findById(notificationId) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new Notification(data);
    } catch (error) {
      logger.error('Failed to find notification by ID', { error, notificationId });
      throw error;
    }
  }

  // Получить уведомления пользователя
  static async findByUser(userId, options = {}) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        type = null,
        delivery_status = null
      } = options;
      
      const supabase = database.getClient();
      
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (type && Object.values(NOTIFICATION_TYPES).includes(type)) {
        query = query.eq('type', type);
      }

      if (delivery_status && Object.values(DELIVERY_STATUS).includes(delivery_status)) {
        query = query.eq('delivery_status', delivery_status);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('sent_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        notifications: (data || []).map(notificationData => new Notification(notificationData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find notifications by user', { error, userId, options });
      throw error;
    }
  }

  // Получить уведомления для задачи
  static async findByTask(taskId, options = {}) {
    try {
      const { limit = 10, offset = 0 } = options;
      const supabase = database.getClient();
      
      const { data, error, count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('task_id', taskId)
        .range(offset, offset + limit - 1)
        .order('sent_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        notifications: (data || []).map(notificationData => new Notification(notificationData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find notifications by task', { error, taskId, options });
      throw error;
    }
  }

  // Получить все уведомления (для админа)
  static async findAll(options = {}) {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        type = null,
        delivery_status = null,
        dateFrom = null,
        dateTo = null
      } = options;
      
      const supabase = database.getClient();
      
      let query = supabase
        .from('notifications')
        .select(`
          *,
          users!inner(
            telegram_id,
            first_name,
            last_name
          ),
          tasks(
            title
          )
        `, { count: 'exact' });

      if (type) {
        query = query.eq('type', type);
      }

      if (delivery_status) {
        query = query.eq('delivery_status', delivery_status);
      }

      if (dateFrom) {
        query = query.gte('sent_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('sent_at', dateTo);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('sent_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        notifications: (data || []).map(notificationData => new Notification(notificationData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find all notifications', { error, options });
      throw error;
    }
  }

  // Обновить статус доставки
  async updateDeliveryStatus(newStatus, additionalData = {}) {
    try {
      const validStatuses = Object.values(DELIVERY_STATUS);
      if (!validStatuses.includes(newStatus)) {
        throw new ValidationError(`Invalid delivery status: ${newStatus}`);
      }

      const supabase = database.getClient();
      
      const updates = {
        delivery_status: newStatus,
        ...additionalData
      };

      const { data, error } = await supabase
        .from('notifications')
        .update(updates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);
      
      logger.info('Notification delivery status updated', { 
        notificationId: this.id,
        oldStatus: this.delivery_status,
        newStatus,
        additionalData
      });

      return this;
    } catch (error) {
      logger.error('Failed to update notification delivery status', { 
        error, 
        notificationId: this.id, 
        newStatus,
        additionalData
      });
      throw error;
    }
  }

  // Отметить как доставленное
  async markDelivered(telegramMessageId = null) {
    const updates = {};
    if (telegramMessageId) {
      updates.telegram_message_id = telegramMessageId;
    }
    
    return await this.updateDeliveryStatus(DELIVERY_STATUS.DELIVERED, updates);
  }

  // Отметить как неудачное
  async markFailed(errorMessage = null) {
    return await this.updateDeliveryStatus(DELIVERY_STATUS.FAILED, {
      error_message: errorMessage
    });
  }

  // Удалить уведомление
  async delete() {
    try {
      const supabase = database.getClient();
      
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw error;
      }

      logger.info('Notification deleted successfully', { notificationId: this.id });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete notification', { error, notificationId: this.id });
      throw error;
    }
  }

  // Получить статистику уведомлений
  static async getStats(userId = null, dateFrom = null, dateTo = null) {
    try {
      const supabase = database.getClient();
      
      let query = supabase
        .from('notifications')
        .select('type, delivery_status');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (dateFrom) {
        query = query.gte('sent_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('sent_at', dateTo);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const stats = {
        total: data.length,
        by_type: {},
        by_status: {},
        delivery_rate: 0
      };

      // Инициализируем счетчики
      Object.values(NOTIFICATION_TYPES).forEach(type => {
        stats.by_type[type] = 0;
      });

      Object.values(DELIVERY_STATUS).forEach(status => {
        stats.by_status[status] = 0;
      });

      // Подсчитываем
      data.forEach(notification => {
        stats.by_type[notification.type]++;
        stats.by_status[notification.delivery_status]++;
      });

      // Вычисляем процент доставки
      if (stats.total > 0) {
        const delivered = stats.by_status[DELIVERY_STATUS.DELIVERED] || 0;
        stats.delivery_rate = Math.round((delivered / stats.total) * 100);
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get notification stats', { error, userId, dateFrom, dateTo });
      throw error;
    }
  }

  // Очистить старые уведомления
  static async cleanup(daysOld = 30) {
    try {
      const supabase = database.getClient();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .lt('sent_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;
      
      logger.info('Old notifications cleaned up', { 
        deletedCount, 
        cutoffDate: cutoffDate.toISOString() 
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old notifications', { error, daysOld });
      throw error;
    }
  }

  // Проверить, доставлено ли уведомление
  isDelivered() {
    return this.delivery_status === DELIVERY_STATUS.DELIVERED;
  }

  // Проверить, провалилась ли доставка
  isFailed() {
    return this.delivery_status === DELIVERY_STATUS.FAILED;
  }

  // Получить возраст уведомления в минутах
  getAgeMinutes() {
    const now = new Date();
    const sent = new Date(this.sent_at);
    const diffTime = now.getTime() - sent.getTime();
    return Math.floor(diffTime / (1000 * 60));
  }

  // Преобразовать в JSON для API
  toJSON() {
    return {
      ...this,
      is_delivered: this.isDelivered(),
      is_failed: this.isFailed(),
      age_minutes: this.getAgeMinutes()
    };
  }

  // Проверить права доступа
  canBeAccessedBy(userId) {
    return this.user_id === userId;
  }
}

module.exports = Notification;
