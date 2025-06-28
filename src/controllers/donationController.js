const Donation = require('../models/Donation');
const User = require('../models/User');
const logger = require('../utils/logger');
const { donationSchema, validate } = require('../utils/validators');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { DONATION_PRESETS, DONATION_STATUS } = require('../config/constants');

class DonationController {
  // Получить предустановленные суммы пожертвований
  static async getPresets(req, res, next) {
    try {
      res.json({
        success: true,
        data: {
          presets: DONATION_PRESETS,
          currency: 'XTR',
          minAmount: 1,
          maxAmount: 2500
        }
      });

    } catch (error) {
      logger.error('Get donation presets failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Создать инвойс для пожертвования
  static async createInvoice(req, res, next) {
    try {
      // Валидируем данные пожертвования
      const donationData = validate(donationSchema, req.body);
      
      const { amount_stars, description } = donationData;

      // Генерируем уникальный payload для инвойса
      const invoicePayload = `donation_${req.user.id}_${Date.now()}`;

      // Данные для Telegram инвойса
      const invoiceData = {
        title: '💙 Поддержка Taskly',
        description: description || 'Спасибо за поддержку проекта! Это помогает развивать Taskly и добавлять новые функции.',
        payload: invoicePayload,
        currency: 'XTR',
        prices: [{
          label: `⭐ ${amount_stars} ${amount_stars === 1 ? 'звезда' : amount_stars <= 4 ? 'звезды' : 'звезд'}`,
          amount: amount_stars
        }]
      };

      logger.info('Donation invoice created', {
        userId: req.user.id,
        amount: amount_stars,
        payload: invoicePayload
      });

      res.json({
        success: true,
        data: {
          invoice: invoiceData,
          payload: invoicePayload
        },
        message: 'Invoice created successfully'
      });

    } catch (error) {
      logger.error('Create donation invoice failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Обработать pre-checkout запрос
  static async handlePreCheckout(req, res, next) {
    try {
      const { pre_checkout_query } = req.body;

      if (!pre_checkout_query) {
        throw new ValidationError('Pre-checkout query is required');
      }

      const { id, from, currency, total_amount, invoice_payload } = pre_checkout_query;

      // Проверяем валидность payload
      if (!invoice_payload.startsWith('donation_')) {
        logger.warn('Invalid donation payload in pre-checkout', {
          payload: invoice_payload,
          userId: from.id
        });
        
        return res.json({
          success: false,
          error: 'Invalid donation payload'
        });
      }

      // Проверяем валидность суммы
      if (total_amount < 1 || total_amount > 2500) {
        logger.warn('Invalid donation amount in pre-checkout', {
          amount: total_amount,
          userId: from.id
        });
        
        return res.json({
          success: false,
          error: 'Invalid donation amount'
        });
      }

      // Проверяем валидность валюты
      if (currency !== 'XTR') {
        logger.warn('Invalid currency in pre-checkout', {
          currency,
          userId: from.id
        });
        
        return res.json({
          success: false,
          error: 'Invalid currency'
        });
      }

      logger.info('Pre-checkout validated successfully', {
        preCheckoutId: id,
        userId: from.id,
        amount: total_amount
      });

      res.json({
        success: true,
        data: {
          pre_checkout_query_id: id,
          ok: true
        }
      });

    } catch (error) {
      logger.error('Handle pre-checkout failed', {
        error: error.message,
        body: req.body
      });
      next(error);
    }
  }

  // Обработать успешный платеж
  static async handleSuccessfulPayment(req, res, next) {
    try {
      const { successful_payment, from } = req.body;

      if (!successful_payment) {
        throw new ValidationError('Successful payment data is required');
      }

      const {
        currency,
        total_amount,
        invoice_payload,
        telegram_payment_charge_id
      } = successful_payment;

      // Находим пользователя
      const user = await User.findByTelegramId(from.id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Проверяем, не существует ли уже такое пожертвование
      const existingDonation = await Donation.findByPaymentChargeId(telegram_payment_charge_id);
      if (existingDonation) {
        logger.warn('Duplicate payment charge ID', {
          chargeId: telegram_payment_charge_id,
          userId: user.id
        });
        
        return res.json({
          success: true,
          message: 'Payment already processed'
        });
      }

      // Создаем запись о пожертвовании
      const donation = await Donation.create({
        user_id: user.id,
        telegram_payment_charge_id,
        amount_stars: total_amount,
        currency,
        status: DONATION_STATUS.COMPLETED,
        description: `Поддержка проекта через Telegram Stars`
      });

      // Отмечаем как завершенное
      await donation.markCompleted({
        invoice_payload,
        payment_date: new Date().toISOString()
      });

      logger.info('Donation processed successfully', {
        donationId: donation.id,
        userId: user.id,
        amount: total_amount,
        chargeId: telegram_payment_charge_id
      });

      res.json({
        success: true,
        data: {
          donation: donation.toJSON()
        },
        message: 'Thank you for your support! 💙'
      });

    } catch (error) {
      logger.error('Handle successful payment failed', {
        error: error.message,
        body: req.body
      });
      next(error);
    }
  }

  // Получить историю пожертвований пользователя
  static async getUserDonations(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const options = {
        limit: Math.min(parseInt(limit), 100),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };

      const result = await Donation.findByUser(req.user.id, options);

      res.json({
        success: true,
        data: {
          donations: result.donations.map(donation => donation.toJSON()),
          pagination: {
            total: result.total,
            page: parseInt(page),
            limit: parseInt(limit),
            hasMore: result.hasMore
          }
        }
      });

    } catch (error) {
      logger.error('Get user donations failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }

  // Получить статистику пожертвований пользователя
  static async getUserDonationStats(req, res, next) {
    try {
      const stats = await Donation.getStats(req.user.id);

      res.json({
        success: true,
        data: {
          stats
        }
      });

    } catch (error) {
      logger.error('Get user donation stats failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Получить конкретное пожертвование
  static async getDonation(req, res, next) {
    try {
      const { id } = req.params;
      
      const donation = await Donation.findById(id);
      
      if (!donation) {
        throw new NotFoundError('Donation not found');
      }

      // Проверяем права доступа
      if (!donation.canBeAccessedBy(req.user.id)) {
        throw new NotFoundError('Donation not found');
      }

      res.json({
        success: true,
        data: {
          donation: donation.toJSON()
        }
      });

    } catch (error) {
      logger.error('Get donation failed', {
        error: error.message,
        donationId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Получить общую статистику пожертвований (для админа)
  static async getAllDonationStats(req, res, next) {
    try {
      // Проверяем права администратора
      if (!req.user.isAdmin()) {
        throw new ValidationError('Admin access required');
      }

      const { dateFrom, dateTo } = req.query;

      // Общая статистика
      const totalStats = await Donation.getStats();
      
      // Статистика за период
      let periodStats = null;
      if (dateFrom || dateTo) {
        // TODO: Implement period-specific stats
      }

      // Последние пожертвования
      const { donations: recentDonations } = await Donation.findAll({
        limit: 10,
        status: DONATION_STATUS.COMPLETED
      });

      res.json({
        success: true,
        data: {
          totalStats,
          periodStats,
          recentDonations: recentDonations.map(d => d.toJSON())
        }
      });

    } catch (error) {
      logger.error('Get all donation stats failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }

  // Получить топ спонсоров (для админа)
  static async getTopDonors(req, res, next) {
    try {
      // Проверяем права администратора
      if (!req.user.isAdmin()) {
        throw new ValidationError('Admin access required');
      }

      const { limit = 10 } = req.query;

      // TODO: Implement top donors query
      // Это требует специального SQL запроса для группировки по пользователям

      res.json({
        success: true,
        data: {
          topDonors: [], // Placeholder
          message: 'Feature coming soon'
        }
      });

    } catch (error) {
      logger.error('Get top donors failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }
}

module.exports = DonationController;
