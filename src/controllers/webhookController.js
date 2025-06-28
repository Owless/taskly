const logger = require('../utils/logger');
const { validateTelegramWebhook } = require('../utils/telegramAuth');
const { TELEGRAM } = require('../config/environment');

// Импортируем обработчики
const TelegramHandlers = require('../services/telegramHandlers');
const DonationController = require('./donationController');

class WebhookController {
  // Главный обработчик Telegram webhook
  static async handleTelegramWebhook(req, res, next) {
    try {
      const update = req.body;

      // Логируем входящий update
      logger.info('Telegram webhook received', {
        updateId: update.update_id,
        type: WebhookController.getUpdateType(update),
        fromId: WebhookController.getFromId(update)
      });

      // Валидируем webhook (если есть secret token в header)
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      if (secretToken) {
        const validation = validateTelegramWebhook({ secret_token: secretToken }, TELEGRAM.WEBHOOK_SECRET);
        if (!validation.isValid) {
          logger.warn('Invalid webhook secret token', {
            receivedToken: secretToken ? 'present' : 'missing'
          });
          return res.status(401).json({ error: 'Invalid secret token' });
        }
      }

      // Маршрутизируем update к соответствующему обработчику
      await WebhookController.routeUpdate(update);

      // Отвечаем Telegram что все ОК
      res.json({ ok: true });

    } catch (error) {
      logger.error('Telegram webhook handling failed', {
        error: error.message,
        stack: error.stack,
        update: req.body
      });

      // Всегда отвечаем OK Telegram, чтобы избежать ретраев
      res.json({ ok: true });
    }
  }

  // Маршрутизация update'ов
  static async routeUpdate(update) {
    try {
      // Обработка текстовых сообщений и команд
      if (update.message) {
        await TelegramHandlers.handleMessage(update.message);
        return;
      }

      // Обработка callback query (inline кнопки)
      if (update.callback_query) {
        await TelegramHandlers.handleCallbackQuery(update.callback_query);
        return;
      }

      // Обработка pre-checkout query (пожертвования)
      if (update.pre_checkout_query) {
        await WebhookController.handlePreCheckoutQuery(update.pre_checkout_query);
        return;
      }

      // Обработка успешных платежей
      if (update.message?.successful_payment) {
        await WebhookController.handleSuccessfulPayment(update.message);
        return;
      }

      // Обработка изменений статуса чата
      if (update.my_chat_member) {
        await TelegramHandlers.handleChatMemberUpdate(update.my_chat_member);
        return;
      }

      // Обработка inline query (если будет нужно)
      if (update.inline_query) {
        await TelegramHandlers.handleInlineQuery(update.inline_query);
        return;
      }

      // Логируем неизвестные типы update'ов
      logger.warn('Unknown update type received', {
        updateId: update.update_id,
        type: WebhookController.getUpdateType(update),
        update
      });

    } catch (error) {
      logger.error('Update routing failed', {
        error: error.message,
        updateId: update.update_id,
        type: WebhookController.getUpdateType(update)
      });
      throw error;
    }
  }

  // Обработка pre-checkout query
  static async handlePreCheckoutQuery(preCheckoutQuery) {
    try {
      logger.info('Pre-checkout query received', {
        queryId: preCheckoutQuery.id,
        fromId: preCheckoutQuery.from.id,
        amount: preCheckoutQuery.total_amount,
        currency: preCheckoutQuery.currency
      });

      // Создаем фейковый req/res для переиспользования логики DonationController
      const fakeReq = {
        body: { pre_checkout_query: preCheckoutQuery }
      };

      const fakeRes = {
        json: (data) => {
          // Отправляем ответ Telegram
          return TelegramHandlers.answerPreCheckoutQuery(
            preCheckoutQuery.id,
            data.success,
            data.success ? null : data.error
          );
        }
      };

      await DonationController.handlePreCheckout(fakeReq, fakeRes, (error) => {
        if (error) throw error;
      });

    } catch (error) {
      logger.error('Pre-checkout handling failed', {
        error: error.message,
        queryId: preCheckoutQuery.id,
        fromId: preCheckoutQuery.from.id
      });

      // Отклоняем pre-checkout
      await TelegramHandlers.answerPreCheckoutQuery(
        preCheckoutQuery.id,
        false,
        'Internal error occurred'
      );
    }
  }

  // Обработка успешных платежей
  static async handleSuccessfulPayment(message) {
    try {
      logger.info('Successful payment received', {
        messageId: message.message_id,
        fromId: message.from.id,
        amount: message.successful_payment.total_amount,
        chargeId: message.successful_payment.telegram_payment_charge_id
      });

      // Создаем фейковый req/res для переиспользования логики DonationController
      const fakeReq = {
        body: {
          successful_payment: message.successful_payment,
          from: message.from
        }
      };

      const fakeRes = {
        json: async (data) => {
          if (data.success) {
            // Отправляем благодарность пользователю
            await TelegramHandlers.sendThankYouMessage(
              message.from.id,
              message.successful_payment.total_amount
            );
          }
          return data;
        }
      };

      await DonationController.handleSuccessfulPayment(fakeReq, fakeRes, (error) => {
        if (error) throw error;
      });

    } catch (error) {
      logger.error('Successful payment handling failed', {
        error: error.message,
        messageId: message.message_id,
        fromId: message.from.id
      });

      // Уведомляем пользователя о проблеме
      await TelegramHandlers.sendMessage(
        message.from.id,
        '❌ Произошла ошибка при обработке платежа. Обратитесь в поддержку.'
      );
    }
  }

  // Определить тип update'а
  static getUpdateType(update) {
    if (update.message?.text) return 'text_message';
    if (update.message?.successful_payment) return 'successful_payment';
    if (update.message) return 'message';
    if (update.callback_query) return 'callback_query';
    if (update.pre_checkout_query) return 'pre_checkout_query';
    if (update.my_chat_member) return 'chat_member_update';
    if (update.inline_query) return 'inline_query';
    if (update.chosen_inline_result) return 'chosen_inline_result';
    return 'unknown';
  }

  // Получить ID отправителя из update'а
  static getFromId(update) {
    if (update.message?.from?.id) return update.message.from.id;
    if (update.callback_query?.from?.id) return update.callback_query.from.id;
    if (update.pre_checkout_query?.from?.id) return update.pre_checkout_query.from.id;
    if (update.my_chat_member?.from?.id) return update.my_chat_member.from.id;
    if (update.inline_query?.from?.id) return update.inline_query.from.id;
    return null;
  }

  // Health check для webhook
  static async healthCheck(req, res, next) {
    try {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        webhook: {
          url: TELEGRAM.WEBHOOK_URL,
          secret_configured: !!TELEGRAM.WEBHOOK_SECRET
        }
      });

    } catch (error) {
      logger.error('Webhook health check failed', {
        error: error.message
      });
      next(error);
    }
  }

  // Получить статистику webhook'а (для админа)
  static async getWebhookStats(req, res, next) {
    try {
      // TODO: Implement webhook statistics
      // Можно добавить счетчики обработанных update'ов, ошибок и т.д.

      res.json({
        success: true,
        data: {
          message: 'Webhook stats coming soon',
          uptime: process.uptime(),
          processed_updates: 'N/A', // Placeholder
          errors_count: 'N/A' // Placeholder
        }
      });

    } catch (error) {
      logger.error('Get webhook stats failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = WebhookController;
