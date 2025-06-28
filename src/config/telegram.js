// src/config/telegram.js
// Конфигурация Telegram Bot API

const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен');
  process.exit(1);
}

// Создаем экземпляр бота
let bot;

if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
  // В продакшене используем webhook
  bot = new TelegramBot(BOT_TOKEN);
  console.log('🤖 Telegram Bot инициализирован с webhook режимом');
} else {
  // В разработке используем polling
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log('🤖 Telegram Bot инициализирован с polling режимом');
}

// Настройка webhook для продакшена
const setupWebhook = async () => {
  if (process.env.NODE_ENV !== 'production' || !WEBHOOK_URL) {
    return;
  }

  try {
    const webhookUrl = `${WEBHOOK_URL}/telegram`;
    await bot.setWebHook(webhookUrl);
    console.log('✅ Webhook установлен:', webhookUrl);
  } catch (error) {
    console.error('❌ Ошибка установки webhook:', error.message);
  }
};

// Функция для проверки данных Telegram WebApp
const verifyTelegramWebAppData = (initData) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      throw new Error('Hash отсутствует');
    }
    
    urlParams.delete('hash');
    
    // Создаем строку для проверки
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Создаем секретный ключ
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();
    
    // Вычисляем hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return hash === calculatedHash;
  } catch (error) {
    console.error('❌ Ошибка проверки Telegram данных:', error.message);
    return false;
  }
};

// Функция для парсинга пользовательских данных из initData
const parseUserFromInitData = (initData) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const userJson = urlParams.get('user');
    
    if (!userJson) {
      throw new Error('Пользовательские данные отсутствуют');
    }
    
    const userData = JSON.parse(decodeURIComponent(userJson));
    
    return {
      telegram_id: userData.id,
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      telegram_username: userData.username || null,
      language_code: userData.language_code || 'ru'
    };
  } catch (error) {
    console.error('❌ Ошибка парсинга пользовательских данных:', error.message);
    return null;
  }
};

// Функция для отправки сообщения пользователю
const sendMessage = async (chatId, text, options = {}) => {
  try {
    const defaultOptions = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    };
    
    const result = await bot.sendMessage(chatId, text, defaultOptions);
    return result;
  } catch (error) {
    console.error(`❌ Ошибка отправки сообщения пользователю ${chatId}:`, error.message);
    throw error;
  }
};

// Функция для отправки уведомления с интерактивными кнопками
const sendNotification = async (chatId, text, inlineKeyboard = []) => {
  try {
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    };
    
    return await bot.sendMessage(chatId, text, options);
  } catch (error) {
    console.error(`❌ Ошибка отправки уведомления пользователю ${chatId}:`, error.message);
    throw error;
  }
};

// Основные команды бота
const botCommands = [
  {
    command: 'start',
    description: 'Запустить Taskly'
  },
  {
    command: 'help',
    description: 'Помощь по использованию'
  },
  {
    command: 'stats',
    description: 'Статистика задач'
  },
  {
    command: 'settings',
    description: 'Настройки уведомлений'
  }
];

// Установка команд бота
const setupBotCommands = async () => {
  try {
    await bot.setMyCommands(botCommands);
    console.log('✅ Команды бота установлены');
  } catch (error) {
    console.error('❌ Ошибка установки команд бота:', error.message);
  }
};

// Инициализация бота
const initializeBot = async () => {
  try {
    // Получаем информацию о боте
    const botInfo = await bot.getMe();
    console.log(`✅ Бот инициализирован: @${botInfo.username}`);
    
    // Устанавливаем команды
    await setupBotCommands();
    
    // Устанавливаем webhook если нужно
    await setupWebhook();
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации бота:', error.message);
    return false;
  }
};

module.exports = {
  bot,
  verifyTelegramWebAppData,
  parseUserFromInitData,
  sendMessage,
  sendNotification,
  initializeBot,
  botCommands
};
