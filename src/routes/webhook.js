const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const TelegramHandlers = require('../services/telegramHandlers');
const telegramService = require('../services/telegramService');
const logger = require('../utils/logger');
const { TELEGRAM } = require('../config/environment');

// Middleware для проверки подписи webhook'а
const verifyTelegramSignature = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    return next(); // В разработке пропускаем проверку
  }

  const token = req.headers['x-telegram-bot-api-secret-token'];
  
  if (!token || token !== TELEGRAM.WEBHOOK_SECRET) {
    logger.warn('Invalid webhook signature', {
      providedToken: token,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Основной webhook endpoint
router.post('/telegram', verifyTelegramSignature, async (req, res) => {
  try {
    const update = req.body;
    
    logger.telegram('Received webhook update', {
      updateId: update.update_id,
      type: Object.keys(update).filter(key => key !== 'update_id')[0]
    });

    // Обрабатываем разные типы обновлений
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.pre_checkout_query) {
      await handlePreCheckoutQuery(update.pre_checkout_query);
    } else if (update.successful_payment) {
      await handleSuccessfulPayment(update.successful_payment);
    } else if (update.my_chat_member) {
      await handleChatMemberUpdate(update.my_chat_member);
    } else {
      logger.warn('Unknown update type', { update });
    }

    res.status(200).json({ ok: true });

  } catch (error) {
    logger.error('Webhook processing error', {
      error: error.message,
      stack: error.stack,
      update: req.body
    });
    
    // Отвечаем успешно, чтобы Telegram не повторял запрос
    res.status(200).json({ ok: true });
  }
});

// Обработка сообщений
async function handleMessage(message) {
  try {
    // Проверяем/создаем пользователя
    await ensureUserExists(message.from);
    
    // Передаем в обработчик
    await TelegramHandlers.handleMessage(message);
    
  } catch (error) {
    logger.error('Message handling error', {
      error: error.message,
      messageId: message.message_id,
      fromId: message.from.id
    });
  }
}

// Обработка callback query
async function handleCallbackQuery(callbackQuery) {
  try {
    await TelegramHandlers.handleCallbackQuery(callbackQuery);
  } catch (error) {
    logger.error('Callback query handling error', {
      error: error.message,
      callbackQueryId: callbackQuery.id,
      fromId: callbackQuery.from.id
    });
  }
}

// Обработка pre-checkout query
async function handlePreCheckoutQuery(preCheckoutQuery) {
  try {
    const { id, from, total_amount, invoice_payload } = preCheckoutQuery;
    
    // Проверяем пользователя
    const user = await User.findByTelegramId(from.id);
    if (!user) {
      await telegramService.answerPreCheckoutQuery(id, false, 'Пользователь не найден');
      return;
    }

    // Проверяем payload (можно добавить дополнительные проверки)
    if (!invoice_payload || !invoice_payload.startsWith('donation_')) {
      await telegramService.answerPreCheckoutQuery(id, false, 'Некорректный платеж');
      return;
    }

    // Одобряем платеж
    await telegramService.answerPreCheckoutQuery(id, true);
    
    logger.info('Pre-checkout approved', {
      userId: user.id,
      telegramId: from.id,
      amount: total_amount,
      payload: invoice_payload
    });

  } catch (error) {
    logger.error('Pre-checkout handling error', {
      error: error.message,
      preCheckoutQueryId: preCheckoutQuery.id
    });
    
    await telegramService.answerPreCheckoutQuery(
      preCheckoutQuery.id, 
      false, 
      'Внутренняя ошибка'
    );
  }
}

// Обработка успешного платежа
async function handleSuccessfulPayment(payment, message) {
  try {
    const { total_amount, invoice_payload, telegram_payment_charge_id } = payment;
    const fromId = message?.from?.id;
    
    if (!fromId) {
      logger.error('No from ID in successful payment');
      return;
    }

    // Находим пользователя
    const user = await User.findByTelegramId(fromId);
    if (!user) {
      logger.error('User not found for successful payment', { fromId });
      return;
    }

    // Сохраняем донат в базе
    const Donation = require('../models/Donation');
    await Donation.create({
      user_id: user.id,
      amount: total_amount,
      currency: 'XTR',
      provider: 'telegram_stars',
      provider_payment_id: telegram_payment_charge_id,
      status: 'completed',
      metadata: { invoice_payload }
    });

    // Отправляем благодарность
    await TelegramHandlers.sendThankYouMessage(fromId, total_amount);
    
    logger.info('Donation processed successfully', {
      userId: user.id,
      telegramId: fromId,
      amount: total_amount,
      chargeId: telegram_payment_charge_id
    });

  } catch (error) {
    logger.error('Successful payment handling error', {
      error: error.message,
      payment
    });
  }
}

// Обработка изменений участника чата
async function handleChatMemberUpdate(chatMemberUpdate) {
  try {
    await TelegramHandlers.handleChatMemberUpdate(chatMemberUpdate);
  } catch (error) {
    logger.error('Chat member update handling error', {
      error: error.message,
      update: chatMemberUpdate
    });
  }
}

// Проверка/создание пользователя
async function ensureUserExists(telegramUser) {
  try {
    let user = await User.findByTelegramId(telegramUser.id);
    
    if (!user) {
      // Создаем нового пользователя
      user = await User.create({
        telegram_id: telegramUser.id,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || 'User',
        last_name: telegramUser.last_name || null,
        language_code: telegramUser.language_code || 'ru',
        is_bot: telegramUser.is_bot || false,
        timezone: 'UTC'
      });
      
      logger.info('New user created', {
        userId: user.id,
        telegramId: telegramUser.id,
        username: telegramUser.username
      });
    } else {
      // Обновляем данные существующего пользователя
      const updates = {};
      
      if (user.username !== telegramUser.username) {
        updates.username = telegramUser.username;
      }
      if (user.first_name !== telegramUser.first_name) {
        updates.first_name = telegramUser.first_name;
      }
      if (user.last_name !== telegramUser.last_name) {
        updates.last_name = telegramUser.last_name;
      }
      
      if (Object.keys(updates).length > 0) {
        await user.update(updates);
        logger.info('User data updated', {
          userId: user.id,
          telegramId: telegramUser.id,
          updates
        });
      }
    }
    
    return user;
  } catch (error) {
    logger.error('Error ensuring user exists', {
      error: error.message,
      telegramUser
    });
    throw error;
  }
}

// Health check для webhook
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    webhook: 'telegram'
  });
});

module.exports = router;
