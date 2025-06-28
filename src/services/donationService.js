const Donation = require('../models/Donation');
const User = require('../models/User');
const telegramService = require('./telegramService');
const logger = require('../utils/logger');
const { 
  formatDonationMessage, 
  formatDonationAmount, 
  escapeMarkdown 
} = require('../utils/formatters');
const { 
  DONATION_STATUS, 
  DONATION_PRESETS, 
  EMOJIS 
} = require('../config/constants');

class DonationService {
  // Создать инвойс для пожертвования
  async createDonationInvoice(userId, amount, description = null) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Валидируем сумму
      if (amount < 1 || amount > 2500) {
        throw new Error('Invalid donation amount');
      }

      // Создаем payload для отслеживания
      const payload = `donation_${userId}_${Date.now()}`;

      // Подготавливаем данные для инвойса
      const invoiceData = {
        title: '💙 Поддержка Taskly',
        description: description || 'Спасибо за поддержку проекта! Это помогает развивать Taskly и добавлять новые функции.',
        payload,
        currency: 'XTR',
        prices: [{
          label: `⭐ ${formatDonationAmount(amount)}`,
          amount: amount
        }]
      };

      // Отправляем инвойс
      const invoice = await telegramService.sendInvoice(
        user.telegram_id,
        invoiceData.title,
        invoiceData.description,
        invoiceData.payload,
        invoiceData.prices
      );

      logger.donation('Donation invoice created', {
        userId,
        amount,
        payload,
        invoiceMessageId: invoice.message_id
      });

      return {
        invoice,
        payload,
        amount
      };

    } catch (error) {
      logger.error('Failed to create donation invoice', {
        error: error.message,
        userId,
        amount,
        description
      });
      throw error;
    }
  }

  // Обработать pre-checkout query
  async handlePreCheckout(preCheckoutQuery) {
    try {
      const { id, from, currency, total_amount, invoice_payload } = preCheckoutQuery;

      // Валидируем payload
      if (!invoice_payload.startsWith('donation_')) {
        logger.warn('Invalid donation payload in pre-checkout', {
          payload: invoice_payload,
          userId: from.id
        });
        return { ok: false, error: 'Invalid donation payload' };
      }

      // Валидируем валюту
      if (currency !== 'XTR') {
        logger.warn('Invalid currency in pre-checkout', {
          currency,
          userId: from.id
        });
        return { ok: false, error: 'Invalid currency' };
      }

      // Валидируем сумму
      if (total_amount < 1 || total_amount > 2500) {
        logger.warn('Invalid amount in pre-checkout', {
          amount: total_amount,
          userId: from.id
        });
        return { ok: false, error: 'Invalid amount' };
      }

      // Проверяем, существует ли пользователь
      const user = await User.findByTelegramId(from.id);
      if (!user) {
        logger.warn('User not found in pre-checkout', {
          telegramId: from.id
        });
        return { ok: false, error: 'User not found' };
      }

      logger.donation('Pre-checkout validated', {
        preCheckoutId: id,
        userId: user.id,
        amount: total_amount
      });

      return { ok: true };

    } catch (error) {
      logger.error('Pre-checkout handling failed', {
        error: error.message,
        preCheckoutQuery
      });
      return { ok: false, error: 'Internal error' };
    }
  }

  // Обработать успешный платеж
  async handleSuccessfulPayment(successfulPayment, fromUser) {
    try {
      const {
        currency,
        total_amount,
        invoice_payload,
        telegram_payment_charge_id
      } = successfulPayment;

      // Находим пользователя
      const user = await User.findByTelegramId(fromUser.id);
      if (!user) {
        throw new Error('User not found');
      }

      // Проверяем, не обработан ли уже этот платеж
      const existingDonation = await Donation.findByPaymentChargeId(telegram_payment_charge_id);
      if (existingDonation) {
        logger.warn('Duplicate payment processing attempt', {
          chargeId: telegram_payment_charge_id,
          userId: user.id
        });
        return existingDonation;
      }

      // Создаем запись о пожертвовании
      const donation = await Donation.create({
        user_id: user.id,
        telegram_payment_charge_id,
        amount_stars: total_amount,
        currency,
        status: DONATION_STATUS.COMPLETED,
        description: 'Поддержка проекта через Telegram Stars'
      });

      // Отмечаем как завершенное
      await donation.markCompleted({
        invoice_payload,
        payment_date: new Date().toISOString()
      });

      // Отправляем благодарственное сообщение
      await this.sendThankYouMessage(user.telegram_id, total_amount);

      // Уведомляем админа о новом донате (если настроено)
      await this.notifyAdminAboutDonation(user, donation);

      logger.donation('Donation processed successfully', {
        donationId: donation.id,
        userId: user.id,
        amount: total_amount,
        chargeId: telegram_payment_charge_id
      });

      return donation;

    } catch (error) {
      logger.error('Failed to process successful payment', {
        error: error.message,
        successfulPayment,
        fromUser
      });
      throw error;
    }
  }

  // Отправить благодарственное сообщение
  async sendThankYouMessage(chatId, amount) {
    try {
      let message = `${EMOJIS.PARTY} *Огромное спасибо за поддержку\\!*

Вы поддержали Taskly на *${formatDonationAmount(amount)}* ${EMOJIS.STAR}

${EMOJIS.HEART} *Ваша поддержка помогает:*
- Оплачивать серверы и инфраструктуру
- Разрабатывать новые функции
- Улучшать производительность приложения
- Поддерживать проект бесплатным для всех

${EMOJIS.ROCKET} Продолжайте пользоваться Taskly и достигать своих целей\\!

*С благодарностью, команда Taskly* ${EMOJIS.HEART}`;

      const keyboard = telegramService.createInlineKeyboard([
        [telegramService.createButton('🚀 Открыть Taskly', { 
          web_app: { url: process.env.APP_URL } 
        })],
        [telegramService.createButton('📊 Моя статистика', 'stats')]
      ]);

      await telegramService.sendMessage(chatId, message, {
        reply_markup: keyboard
      });

    } catch (error) {
      logger.error('Failed to send thank you message', {
        error: error.message,
        chatId,
        amount
      });
    }
  }

  // Уведомить админа о новом пожертвовании
  async notifyAdminAboutDonation(user, donation) {
    try {
      const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
      if (!adminTelegramId) {
        return;
      }

      const message = `${EMOJIS.MONEY} *Новое пожертвование\\!*

👤 *Пользователь:* ${escapeMarkdown(user.getDisplayName())}
💰 *Сумма:* ${formatDonationAmount(donation.amount_stars)} ${EMOJIS.STAR}
🆔 *ID:* \`${donation.id}\`
📅 *Дата:* ${new Date().toLocaleString('ru-RU')}

${EMOJIS.HEART} Всего собрано: *${user.total_donated}* звезд`;

      await telegramService.sendMessage(adminTelegramId, message);

    } catch (error) {
      logger.error('Failed to notify admin about donation', {
        error: error.message,
        donationId: donation.id,
        userId: user.id
      });
    }
  }

  // Получить статистику пожертвований
  async getDonationStats(userId = null) {
    try {
      return await Donation.getStats(userId);
    } catch (error) {
      logger.error('Failed to get donation stats', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  // Получить топ донаторов
  async getTopDonors(limit = 10) {
    try {
      // TODO: Реализовать запрос топ донаторов
      // Требует специального SQL запроса с группировкой по пользователям
      
      logger.info('Top donors request', { limit });
      
      return {
        donors: [],
        message: 'Feature coming soon'
      };

    } catch (error) {
      logger.error('Failed to get top donors', {
        error: error.message,
        limit
      });
      throw error;
    }
  }

  // Создать кампанию пожертвований
  async createDonationCampaign(title, description, targetAmount, endDate) {
    try {
      // TODO: Реализовать кампании пожертвований
      // Это может быть отдельная таблица с целями сбора
      
      logger.info('Donation campaign creation requested', {
        title,
        targetAmount,
        endDate
      });

      return {
        message: 'Donation campaigns feature coming soon'
      };

    } catch (error) {
      logger.error('Failed to create donation campaign', {
        error: error.message,
        title,
        targetAmount
      });
      throw error;
    }
  }

  // Отправить напоминание о поддержке проекта
  async sendDonationReminder(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const stats = await user.getStats();
      
      // Отправляем напоминание только если пользователь активный
      if (stats.total_tasks < 5) {
        return false;
      }

      let message = `${EMOJIS.HEART} *Нравится Taskly?*

Вы создали уже *${stats.total_tasks}* задач и выполнили *${stats.completed_tasks}*\\! 

${EMOJIS.ROCKET} Если Taskly помогает вам быть продуктивнее, рассмотрите возможность поддержать проект\\.

*Ваши донаты помогают:*
- Поддерживать серверы
- Добавлять новые функции
- Делать приложение лучше

${EMOJIS.STAR} Любая поддержка важна \\- от 1 звезды\\!`;

      const keyboard = telegramService.createInlineKeyboard([
        [telegramService.createButton('💙 Поддержать проект', { 
          web_app: { url: `${process.env.APP_URL}#/donate` } 
        })],
        [telegramService.createButton('❌ Не показывать больше', 'disable_donation_reminders')]
      ]);

      await telegramService.sendMessage(user.telegram_id, message, {
        reply_markup: keyboard
      });

      logger.donation('Donation reminder sent', {
        userId: user.id,
        totalTasks: stats.total_tasks,
        completedTasks: stats.completed_tasks
      });

      return true;

    } catch (error) {
      logger.error('Failed to send donation reminder', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  // Получить предустановленные суммы
  getDonationPresets() {
    return {
      presets: DONATION_PRESETS,
      currency: 'XTR',
      minAmount: 1,
      maxAmount: 2500,
      recommended: [5, 25, 100] // Рекомендуемые суммы
    };
  }

  // Валидировать сумму пожертвования
  validateDonationAmount(amount) {
    if (typeof amount !== 'number' || amount < 1 || amount > 2500) {
      return {
        valid: false,
        error: 'Amount must be between 1 and 2500 stars'
      };
    }

    return { valid: true };
  }

  // Форматировать статистику пожертвований для отображения
  formatDonationStats(stats) {
    return {
      ...stats,
      formattedTotalAmount: formatDonationAmount(stats.total_amount),
      formattedCompletedAmount: formatDonationAmount(stats.completed_amount),
      formattedAverageDonation: formatDonationAmount(stats.average_donation)
    };
  }
}

// Создаем singleton экземпляр
const donationService = new DonationService();

module.exports = donationService;
