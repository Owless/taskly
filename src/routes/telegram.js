const express = require('express');
const router = express.Router();

// Middleware
const { verifyTelegramWebhook } = require('../middleware/auth');

// Services
const telegramService = require('../services/telegram');
const notificationsService = require('../services/notifications');
const donationsController = require('../controllers/donations');
const { supabase } = require('../config/supabase');

// Webhook endpoint
router.post('/webhook', verifyTelegramWebhook, async (req, res) => {
  try {
    const update = req.body;
    console.log('📨 Telegram webhook received:', JSON.stringify(update, null, 2));

    // Always respond with 200 to Telegram
    res.status(200).json({ ok: true });

    // Process update asynchronously
    await processUpdate(update);

  } catch (error) {
    console.error('Telegram webhook error:', error.message);
    res.status(200).json({ ok: true }); // Still return 200 to Telegram
  }
});

// Process different types of updates
const processUpdate = async (update) => {
  try {
    // Handle different update types
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.pre_checkout_query) {
      await handlePreCheckoutQuery(update.pre_checkout_query);
    } else if (update.successful_payment) {
      await handleSuccessfulPayment(update.successful_payment, update.message);
    }
  } catch (error) {
    console.error('Process update error:', error.message);
  }
};

// Handle regular messages
const handleMessage = async (message) => {
  try {
    const { from, text, chat } = message;
    console.log(`💬 Message from ${from.first_name}: ${text}`);

    // Ignore non-private chats
    if (chat.type !== 'private') {
      return;
    }

    // Handle commands
    if (text?.startsWith('/')) {
      await handleCommand(message);
      return;
    }

    // For regular messages, send info about the app
    if (text && !message.successful_payment) {
      await sendAppInfo(from.id);
    }

  } catch (error) {
    console.error('Handle message error:', error.message);
  }
};

// Handle bot commands
const handleCommand = async (message) => {
  try {
    const { from, text } = message;
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
        await handleStartCommand(from);
        break;
      
      case '/help':
        await handleHelpCommand(from.id);
        break;
      
      case '/app':
        await sendAppInfo(from.id);
        break;
      
      case '/settings':
        await handleSettingsCommand(from.id);
        break;
      
      case '/stats':
        await handleStatsCommand(from.id);
        break;
      
      default:
        await sendAppInfo(from.id);
    }

  } catch (error) {
    console.error('Handle command error:', error.message);
  }
};

// Handle /start command
const handleStartCommand = async (from) => {
  try {
    // Check if user exists
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', from.id)
      .single();

    if (!user) {
      // New user - send welcome message
      await notificationsService.sendWelcomeMessage({
        telegram_id: from.id,
        first_name: from.first_name
      });
    } else {
      // Existing user - send app info
      await sendAppInfo(from.id);
    }

  } catch (error) {
    console.error('Handle start command error:', error.message);
  }
};

// Handle /help command
const handleHelpCommand = async (chatId) => {
  try {
    const helpMessage = `🤖 <b>Taskly Bot - Помощь</b>\n\n` +
      `📋 <b>Команды:</b>\n` +
      `/start - Начать работу\n` +
      `/app - Открыть приложение\n` +
      `/settings - Настройки уведомлений\n` +
      `/stats - Статистика задач\n` +
      `/help - Эта справка\n\n` +
      `💡 <b>Основные функции:</b>\n` +
      `• Управление задачами\n` +
      `• Умные напоминания\n` +
      `• Повторяющиеся задачи\n` +
      `• Статистика прогресса\n\n` +
      `💙 Поддержите разработку через /donate`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
        }
      ]]
    };

    await telegramService.sendMessage(chatId, helpMessage, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Handle help command error:', error.message);
  }
};

// Handle /settings command
const handleSettingsCommand = async (chatId) => {
  try {
    // Get user settings
    const { data: user } = await supabase
      .from('users')
      .select('settings, timezone')
      .eq('telegram_id', chatId)
      .single();

    if (!user) {
      await sendAppInfo(chatId);
      return;
    }

    const settings = user.settings || {};
    const notificationsEnabled = settings.notifications !== false;
    const reminderTime = settings.reminder_time || '09:00';

    const settingsMessage = `⚙️ <b>Настройки уведомлений</b>\n\n` +
      `🔔 Уведомления: ${notificationsEnabled ? '✅ Включены' : '❌ Отключены'}\n` +
      `⏰ Время напоминаний: ${reminderTime}\n` +
      `🌍 Часовой пояс: ${user.timezone || 'Europe/Moscow'}\n\n` +
      `Для изменения настроек используйте приложение.`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: notificationsEnabled ? '🔕 Отключить уведомления' : '🔔 Включить уведомления',
            callback_data: `toggle_notifications_${!notificationsEnabled}`
          }
        ],
        [
          {
            text: '⚙️ Открыть настройки',
            web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
          }
        ]
      ]
    };

    await telegramService.sendMessage(chatId, settingsMessage, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Handle settings command error:', error.message);
  }
};

// Handle /stats command
const handleStatsCommand = async (chatId) => {
  try {
    // Get user by telegram_id
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', chatId)
      .single();

    if (!user) {
      await sendAppInfo(chatId);
      return;
    }

    // Get user stats
    const { data: stats } = await supabase
      .from('user_task_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const taskStats = stats || {
      total_tasks: 0,
      completed_tasks: 0,
      active_tasks: 0,
      today_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0
    };

    const statsMessage = `📊 <b>Ваша статистика</b>\n\n` +
      `📝 Всего задач: ${taskStats.total_tasks}\n` +
      `✅ Выполнено: ${taskStats.completed_tasks}\n` +
      `⏳ Активных: ${taskStats.active_tasks}\n` +
      `📅 На сегодня: ${taskStats.today_tasks}\n` +
      `⚠️ Просрочено: ${taskStats.overdue_tasks}\n` +
      `📈 Процент выполнения: ${taskStats.completion_rate}%`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: '📱 Открыть приложение',
          web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
        }
      ]]
    };

    await telegramService.sendMessage(chatId, statsMessage, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Handle stats command error:', error.message);
  }
};

// Send app info
const sendAppInfo = async (chatId) => {
  try {
    const appMessage = `📋 <b>Taskly</b> - Простое управление задачами\n\n` +
      `🚀 <b>Возможности:</b>\n` +
      `• Создание и управление задачами\n` +
      `• Умные напоминания\n` +
      `• Повторяющиеся задачи\n` +
      `• Фильтрация по датам\n` +
      `• Статистика прогресса\n\n` +
      `💡 Нажмите кнопку ниже, чтобы начать!`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть Taskly',
            web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
          }
        ],
        [
          {
            text: '❓ Помощь',
            callback_data: 'help'
          },
          {
            text: '💙 Поддержать',
            callback_data: 'donate'
          }
        ]
      ]
    };

    await telegramService.sendMessage(chatId, appMessage, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Send app info error:', error.message);
  }
};

// Handle callback queries (button presses)
const handleCallbackQuery = async (callbackQuery) => {
  try {
    const { from, data, message } = callbackQuery;
    console.log(`🔘 Callback query from ${from.first_name}: ${data}`);

    // Answer callback query to remove loading state
    await answerCallbackQuery(callbackQuery.id);

    // Handle different callback actions
    if (data.startsWith('complete_task_')) {
      const taskId = data.replace('complete_task_', '');
      await handleTaskCompletion(taskId, from.id, message);
    } else if (data.startsWith('postpone_task_')) {
      const taskId = data.replace('postpone_task_', '');
      await handleTaskPostpone(taskId, from.id, message);
    } else if (data.startsWith('toggle_notifications_')) {
      const enabled = data.replace('toggle_notifications_', '') === 'true';
      await handleNotificationToggle(from.id, enabled, message);
    } else if (data === 'help') {
      await handleHelpCommand(from.id);
    } else if (data === 'donate') {
      await handleDonateCallback(from.id);
    }

  } catch (error) {
    console.error('Handle callback query error:', error.message);
  }
};

// Answer callback query
const answerCallbackQuery = async (callbackQueryId, text = null) => {
  try {
    const axios = require('axios');
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false
    });
  } catch (error) {
    console.error('Answer callback query error:', error.message);
  }
};

// Handle task completion from notification
const handleTaskCompletion = async (taskId, telegramId, message) => {
  try {
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) return;

    // Mark task as completed
    const { data: task, error } = await supabase
      .from('tasks')
      .update({
        completed: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('user_id', user.id)
      .select('title')
      .single();

    if (error || !task) {
      await telegramService.editMessage(
        telegramId,
        message.message_id,
        '❌ Задача не найдена или уже выполнена'
      );
      return;
    }

    // Update message
    const completedMessage = `✅ <b>Задача выполнена!</b>\n\n<s>${task.title}</s>\n\n🎉 Отличная работа!`;
    
    await telegramService.editMessage(
      telegramId,
      message.message_id,
      completedMessage
    );

    console.log(`✅ Task completed via Telegram: ${task.title}`);

  } catch (error) {
    console.error('Handle task completion error:', error.message);
  }
};

// Handle task postpone
const handleTaskPostpone = async (taskId, telegramId, message) => {
  try {
    // Send reminder in 1 hour
    setTimeout(async () => {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single();

        if (user) {
          await notificationsService.sendImmediateNotification(user.id, taskId, 'reminder');
        }
      } catch (error) {
        console.error('Postponed reminder error:', error.message);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Update message
    const postponedMessage = `⏰ <b>Напоминание отложено</b>\n\n${message.text}\n\n📝 Напомню через час!`;
    
    await telegramService.editMessage(
      telegramId,
      message.message_id,
      postponedMessage
    );

  } catch (error) {
    console.error('Handle task postpone error:', error.message);
  }
};

// Handle notification toggle
const handleNotificationToggle = async (telegramId, enabled, message) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        settings: { notifications: enabled }
      })
      .eq('telegram_id', telegramId);

    if (error) throw error;

    const statusText = enabled ? 'включены' : 'отключены';
    const statusEmoji = enabled ? '🔔' : '🔕';
    
    await answerCallbackQuery(message.message_id, `${statusEmoji} Уведомления ${statusText}`);
    
    // Refresh settings
    await handleSettingsCommand(telegramId);

  } catch (error) {
    console.error('Handle notification toggle error:', error.message);
  }
};

// Handle donate callback
const handleDonateCallback = async (telegramId) => {
  try {
    const donateMessage = `💙 <b>Поддержать Taskly</b>\n\n` +
      `Ваша поддержка помогает развивать приложение!\n\n` +
      `🌟 Доступные варианты:\n` +
      `☕ 25 звезд - Кофе\n` +
      `💙 50 звезд - Поддержка\n` +
      `⭐ 100 звезд - Благодарность\n` +
      `🚀 250 звезд - Мега спасибо\n\n` +
      `Используйте приложение для пожертвования.`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: '💙 Открыть донаты',
          web_app: { url: `${process.env.FRONTEND_URL}#donate` || 'https://your-app.com' }
        }
      ]]
    };

    await telegramService.sendMessage(telegramId, donateMessage, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Handle donate callback error:', error.message);
  }
};

// Handle pre-checkout query
const handlePreCheckoutQuery = async (preCheckoutQuery) => {
  try {
    console.log('💳 Pre-checkout query:', preCheckoutQuery);
    
    // Always approve the payment
    await telegramService.answerPreCheckoutQuery(preCheckoutQuery.id, true);
    
  } catch (error) {
    console.error('Handle pre-checkout query error:', error.message);
    // Decline payment on error
    await telegramService.answerPreCheckoutQuery(
      preCheckoutQuery.id, 
      false, 
      'Payment processing error'
    );
  }
};

// Handle successful payment
const handleSuccessfulPayment = async (payment, message) => {
  try {
    console.log('💰 Successful payment:', payment);
    
    // Process payment through donations controller
    await donationsController.handlePaymentSuccess({
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      total_amount: payment.total_amount,
      invoice_payload: payment.invoice_payload
    });

  } catch (error) {
    console.error('Handle successful payment error:', error.message);
  }
};

// Webhook management routes
router.post('/set-webhook', async (req, res) => {
  try {
    const { url, secret_token } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'Webhook URL is required'
      });
    }

    const result = await telegramService.setWebhook(url, secret_token);
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Set webhook error:', error.message);
    res.status(500).json({
      error: 'Failed to set webhook'
    });
  }
});

router.get('/webhook-info', async (req, res) => {
  try {
    const info = await telegramService.getWebhookInfo();
    
    res.json({
      success: true,
      data: info
    });

  } catch (error) {
    console.error('Get webhook info error:', error.message);
    res.status(500).json({
      error: 'Failed to get webhook info'
    });
  }
});

router.delete('/webhook', async (req, res) => {
  try {
    const result = await telegramService.deleteWebhook();
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Delete webhook error:', error.message);
    res.status(500).json({
      error: 'Failed to delete webhook'
    });
  }
});

module.exports = router;
