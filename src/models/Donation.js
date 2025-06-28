const database = require('../config/database');
const logger = require('../utils/logger');
const { DONATION_STATUS, LIMITS } = require('../config/constants');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class Donation {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  // Создать новое пожертвование
  static async create(donationData) {
    try {
      const supabase = database.getClient();
      
      const newDonation = {
        user_id: donationData.user_id,
        telegram_payment_charge_id: donationData.telegram_payment_charge_id,
        amount_stars: donationData.amount_stars,
        currency: donationData.currency || 'XTR',
        status: donationData.status || DONATION_STATUS.PENDING,
        description: donationData.description?.trim() || null
      };

      // Валидация суммы
      if (newDonation.amount_stars < LIMITS.MIN_DONATION_AMOUNT || 
          newDonation.amount_stars > LIMITS.MAX_DONATION_AMOUNT) {
        throw new ValidationError(
          `Amount must be between ${LIMITS.MIN_DONATION_AMOUNT} and ${LIMITS.MAX_DONATION_AMOUNT} stars`
        );
      }

      const { data, error } = await supabase
        .from('donations')
        .insert([newDonation])
        .select()
        .single();

      if (error) {
        logger.error('Failed to create donation', { error, donationData });
        throw error;
      }

      logger.info('Donation created successfully', { 
        donationId: data.id, 
        userId: data.user_id,
        amount: data.amount_stars
      });

      return new Donation(data);
    } catch (error) {
      if (error.code === '23505') { // unique_violation
        throw new ValidationError('Donation with this payment charge ID already exists');
      }
      throw error;
    }
  }

  // Найти пожертвование по ID
  static async findById(donationId) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('id', donationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new Donation(data);
    } catch (error) {
      logger.error('Failed to find donation by ID', { error, donationId });
      throw error;
    }
  }

  // Найти пожертвование по Telegram payment charge ID
  static async findByPaymentChargeId(chargeId) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('telegram_payment_charge_id', chargeId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new Donation(data);
    } catch (error) {
      logger.error('Failed to find donation by charge ID', { error, chargeId });
      throw error;
    }
  }

  // Получить пожертвования пользователя
  static async findByUser(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, status = null } = options;
      const supabase = database.getClient();
      
      let query = supabase
        .from('donations')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (status && Object.values(DONATION_STATUS).includes(status)) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        donations: (data || []).map(donationData => new Donation(donationData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find donations by user', { error, userId, options });
      throw error;
    }
  }

  // Получить все пожертвования (для админа)
  static async findAll(options = {}) {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        status = null, 
        userId = null,
        dateFrom = null,
        dateTo = null
      } = options;
      
      const supabase = database.getClient();
      
      let query = supabase
        .from('donations')
        .select(`
          *,
          users!inner(
            telegram_id,
            first_name,
            last_name,
            telegram_username
          )
        `, { count: 'exact' });

      if (status) {
        query = query.eq('status', status);
      }

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        donations: (data || []).map(donationData => new Donation(donationData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find all donations', { error, options });
      throw error;
    }
  }

  // Обновить статус пожертвования
  async updateStatus(newStatus, additionalData = {}) {
    try {
      const validStatuses = Object.values(DONATION_STATUS);
      if (!validStatuses.includes(newStatus)) {
        throw new ValidationError(`Invalid status: ${newStatus}`);
      }

      const supabase = database.getClient();
      
      const updates = {
        status: newStatus,
        ...additionalData
      };

      // Устанавливаем время оплаты для завершенных донатов
      if (newStatus === DONATION_STATUS.COMPLETED && !this.paid_at) {
        updates.paid_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('donations')
        .update(updates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);
      
      logger.info('Donation status updated', { 
        donationId: this.id,
        oldStatus: this.status,
        newStatus,
        additionalData
      });

      return this;
    } catch (error) {
      logger.error('Failed to update donation status', { 
        error, 
        donationId: this.id, 
        newStatus,
        additionalData
      });
      throw error;
    }
  }

  // Отметить как завершенное
  async markCompleted(telegramPaymentData = {}) {
    return await this.updateStatus(DONATION_STATUS.COMPLETED, {
      paid_at: new Date().toISOString(),
      ...telegramPaymentData
    });
  }

  // Отметить как неудачное
  async markFailed(reason = null) {
    return await this.updateStatus(DONATION_STATUS.FAILED, {
      failure_reason: reason
    });
  }

  // Отметить как возвращенное
  async markRefunded(reason = null) {
    return await this.updateStatus(DONATION_STATUS.REFUNDED, {
      refund_reason: reason,
      refunded_at: new Date().toISOString()
    });
  }

  // Получить статистику пожертвований
  static async getStats(userId = null) {
    try {
      const supabase = database.getClient();
      
      let query = supabase
        .from('donations')
        .select('amount_stars, status');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const stats = {
        total_donations: data.length,
        total_amount: 0,
        completed_donations: 0,
        completed_amount: 0,
        pending_donations: 0,
        pending_amount: 0,
        failed_donations: 0,
        average_donation: 0
      };

      data.forEach(donation => {
        stats.total_amount += donation.amount_stars;
        
        switch (donation.status) {
          case DONATION_STATUS.COMPLETED:
            stats.completed_donations++;
            stats.completed_amount += donation.amount_stars;
            break;
          case DONATION_STATUS.PENDING:
            stats.pending_donations++;
            stats.pending_amount += donation.amount_stars;
            break;
          case DONATION_STATUS.FAILED:
          case DONATION_STATUS.REFUNDED:
            stats.failed_donations++;
            break;
        }
      });

      if (stats.completed_donations > 0) {
        stats.average_donation = Math.round(stats.completed_amount / stats.completed_donations);
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get donation stats', { error, userId });
      throw error;
    }
  }

  // Проверить, завершено ли пожертвование
  isCompleted() {
    return this.status === DONATION_STATUS.COMPLETED;
  }

  // Проверить, можно ли отменить пожертвование
  canBeCancelled() {
    return this.status === DONATION_STATUS.PENDING;
  }

  // Получить отформатированную сумму
  getFormattedAmount() {
    const amount = this.amount_stars;
    
    if (amount === 1) {
      return `${amount} звезда`;
    } else if (amount >= 2 && amount <= 4) {
      return `${amount} звезды`;
    } else {
      return `${amount} звезд`;
    }
  }

  // Получить возраст пожертвования в днях
  getAgeDays() {
    const now = new Date();
    const created = new Date(this.created_at);
    const diffTime = now.getTime() - created.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  // Преобразовать в JSON для API
  toJSON() {
    return {
      ...this,
      formatted_amount: this.getFormattedAmount(),
      age_days: this.getAgeDays(),
      is_completed: this.isCompleted(),
      can_be_cancelled: this.canBeCancelled()
    };
  }

  // Проверить права доступа
  canBeAccessedBy(userId) {
    return this.user_id === userId;
  }
}

module.exports = Donation;
