// Telegram Bot configuration
const telegramConfig = {
  // Bot settings
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  botUsername: process.env.TELEGRAM_BOT_USERNAME || 'taskly_bot',
  
  // Webhook settings
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  
  // API settings
  apiBase: 'https://api.telegram.org',
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  
  // Rate limiting
  maxMessagesPerSecond: 30,
  maxMessagesPerMinute: 20,
  
  // Mini App settings
  miniAppUrl: process.env.FRONTEND_URL || 'https://your-app.com',
  
  // Commands configuration
  commands: [
    {
      command: 'start',
      description: 'Начать работу с ботом'
    },
    {
      command: 'app',
      description: 'Открыть приложение'
    },
    {
      command: 'help',
      description: 'Справка по командам'
    },
    {
      command: 'stats',
      description: 'Статистика задач'
    },
    {
      command: 'settings',
      description: 'Настройки уведомлений'
    }
  ],
  
  // Notification settings
  notifications: {
    defaultEnabled: true,
    defaultReminderTime: '09:00',
    maxNotificationsPerDay: 50,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    
    // Message templates
    templates: {
      welcome: {
        text: '👋 Добро пожаловать в Taskly, {first_name}!\n\n📋 Простое управление задачами прямо в Telegram\n\n🚀 Нажмите кнопку ниже, чтобы начать!',
        keyboard: [[{
          text: '📱 Открыть Taskly',
          web_app: { url: '{app_url}' }
        }]]
      },
      
      taskReminder: {
        text: '📋 <b>Напоминание о задаче</b>\n\n<b>{title}</b>\n{due_info}{priority_info}',
        keyboard: [[
          {
            text: '✅ Выполнить',
            callback_data: 'complete_task_{task_id}'
          },
          {
            text: '⏰ Напомнить через час',
            callback_data: 'postpone_task_{task_id}'
          }
        ], [{
          text: '📱 Открыть приложение',
          web_app: { url: '{app_url}' }
        }]]
      },
      
      dailySummary: {
        text: '📊 <b>Ваши задачи на сегодня</b>\n\n{summary_text}',
        keyboard: [[{
          text: '📱 Открыть приложение',
          web_app: { url: '{app_url}' }
        }]]
      },
      
      paymentThankYou: {
        text: '🙏 Спасибо за поддержку, {first_name}!\n\n💫 {tier_title}\nВаша поддержка помогает развивать Taskly!',
        keyboard: [[{
          text: '📱 Открыть приложение',
          web_app: { url: '{app_url}' }
        }]]
      }
    }
  },
  
  // Payment settings (Telegram Stars)
  payments: {
    currency: 'XTR',
    maxTipAmount: 0,
    suggestedTipAmounts: [],
    needName: false,
    needPhoneNumber: false,
    needEmail: false,
    needShippingAddress: false,
    sendPhoneNumberToProvider: false,
    sendEmailToProvider: false,
    isFlexible: false,
    
    // Donation tiers
    tiers: [
      {
        amount: 25,
        title: 'Кофе ☕',
        description: 'Небольшая поддержка',
        emoji: '☕'
      },
      {
        amount: 50,
        title: 'Поддержка 💙',
        description: 'Спасибо за поддержку!',
        emoji: '💙'
      },
      {
        amount: 100,
        title: 'Благодарность ⭐',
        description: 'Большое спасибо!',
        emoji: '⭐'
      },
      {
        amount: 250,
        title: 'Мега спасибо 🚀',
        description: 'Невероятная поддержка!',
        emoji: '🚀'
      }
    ]
  },
  
  // Error messages
  errors: {
    userNotFound: 'Пользователь не найден. Попробуйте выполнить /start',
    taskNotFound: 'Задача не найдена или уже выполнена',
    paymentFailed: 'Не удалось обработать платеж. Попробуйте позже.',
    notificationFailed: 'Не удалось отправить уведомление',
    commandNotFound: 'Команда не найдена. Используйте /help для справки'
  },
  
  // Feature flags
  features: {
    recurringTasks: true,
    notifications: true,
    payments: true,
    dailySummary: true,
    analytics: false
  }
};

// Validation
if (!telegramConfig.botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

// Helper functions
const formatTemplate = (template, variables = {}) => {
  let text = template.text;
  let keyboard = template.keyboard;
  
  // Replace variables in text
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    text = text.replace(new RegExp(placeholder, 'g'), value || '');
  });
  
  // Replace variables in keyboard
  if (keyboard) {
    keyboard = JSON.parse(JSON.stringify(keyboard));
    keyboard.forEach(row => {
      row.forEach(button => {
        if (button.callback_data) {
          Object.entries(variables).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            button.callback_data = button.callback_data.replace(new RegExp(placeholder, 'g'), value || '');
          });
        }
        if (button.web_app?.url) {
          Object.entries(variables).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            button.web_app.url = button.web_app.url.replace(new RegExp(placeholder, 'g'), value || '');
          });
        }
      });
    });
  }
  
  return { text, keyboard };
};

const isQuietHours = (timezone = 'Europe/Moscow') => {
  try {
    const now = new Date();
    const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = timeInTimezone.getHours();
    
    // Quiet hours: 22:00 - 07:00
    return hour >= 22 || hour < 7;
  } catch (error) {
    console.error('Timezone error:', error.message);
    return false;
  }
};

const getTierByAmount = (amount) => {
  return telegramConfig.payments.tiers.find(tier => tier.amount === amount);
};

const validateWebhookUpdate = (update) => {
  if (!update || typeof update !== 'object') {
    return false;
  }
  
  // Check for required fields
  if (!update.update_id) {
    return false;
  }
  
  return true;
};

module.exports = {
  config: telegramConfig,
  formatTemplate,
  isQuietHours,
  getTierByAmount,
  validateWebhookUpdate
};
