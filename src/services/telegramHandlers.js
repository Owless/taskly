// src/services/telegramHandlers.js
// Обработчики команд Telegram бота

const { bot } = require('../config/telegram');
const { findUserByTelegramId, createUser } = require('../config/database');

// Приветственное сообщение с кнопкой запуска приложения
const handleStartCommand = async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  try {
    console.log(`👤 Пользователь ${user.first_name} (${user.id}) запустил бота`);
    
    // Проверяем, есть ли пользователь в базе
    let dbUser = await findUserByTelegramId(user.id);
    
    // Если пользователя нет, создаем его
    if (!dbUser || dbUser.length === 0) {
      const newUser = {
        telegram_id: user.id,
        telegram_username: user.username || null,
        first_name: user.first_name,
        last_name: user.last_name || null,
        language_code: user.language_code || 'ru'
      };
      
      await createUser(newUser);
      console.log(`✅ Создан новый пользователь: ${user.first_name}`);
    }
    
    const welcomeMessage = `
🎉 *Добро пожаловать в Taskly!*

📋 Простой и удобный менеджер задач прямо в Telegram

✨ *Что умеет Taskly:*
• Создавать и управлять задачами
• Устанавливать напоминания
• Отслеживать прогресс
• Повторяющиеся задачи

🚀 Нажмите кнопку ниже, чтобы открыть приложение!
    `;
    
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📱 Открыть Taskly',
              web_app: {
                url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
              }
            }
          ],
          [
            {
              text: '📊 Статистика',
              callback_data: 'stats'
            },
            {
              text: '⚙️ Настройки',
              callback_data: 'settings'
            }
          ],
          [
            {
              text: '❓ Помощь',
              callback_data: 'help'
            }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, welcomeMessage, options);
    
  } catch (error) {
    console.error('❌ Ошибка обработки команды /start:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Обработка команды помощи
const handleHelpCommand = async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
📖 *Помощь по Taskly*

🎯 *Основные команды:*
/start - Запустить приложение
/help - Показать эту справку
/stats - Статистика задач
/settings - Настройки уведомлений

📱 *Как пользоваться:*
1. Нажмите "Открыть Taskly" для доступа к приложению
2. Создавайте задачи прямо в удобном интерфейсе
3. Получайте напоминания в нужное время

💡 *Возможности:*
• Задачи с датами и приоритетами
• Повторяющиеся задачи
• Умные уведомления
• Статистика выполнения

❓ Есть вопросы? Просто напишите @support
  `;
  
  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть приложение',
            web_app: {
              url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
            }
          }
        ]
      ]
    }
  };
  
  await bot.sendMessage(chatId, helpMessage, options);
};

// Обработка команды статистики
const handleStatsCommand = async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // Здесь будет логика получения статистики из базы
    // Пока заглушка
    const statsMessage = `
📊 *Ваша статистика*

📝 Всего задач: 0
✅ Выполнено: 0
⏰ Активных: 0
🔥 Просрочено: 0

📈 Прогресс: 0%

🎯 Создайте первую задачу в приложении!
    `;
    
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📱 Открыть приложение',
              web_app: {
                url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
              }
            }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, statsMessage, options);
    
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    await bot.sendMessage(chatId, '❌ Не удалось получить статистику. Попробуйте позже.');
  }
};

// Обработка команды настроек
const handleSettingsCommand = async (msg) => {
  const chatId = msg.chat.id;
  
  const settingsMessage = `
⚙️ *Настройки уведомлений*

🔔 Уведомления: включены
⏰ Время напоминаний: 09:00
🌍 Часовой пояс: Europe/Moscow

💡 Полные настройки доступны в приложении
  `;
  
  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔔 Включить уведомления',
            callback_data: 'toggle_notifications'
          }
        ],
        [
          {
            text: '⚙️ Настройки в приложении',
            web_app: {
              url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
            }
          }
        ]
      ]
    }
  };
  
  await bot.sendMessage(chatId, settingsMessage, options);
};

// Обработка callback кнопок
const handleCallbackQuery = async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  
  try {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    switch (data) {
      case 'stats':
        await handleStatsCommand({ chat: { id: chatId }, from: callbackQuery.from });
        break;
        
      case 'settings':
        await handleSettingsCommand({ chat: { id: chatId } });
        break;
        
      case 'help':
        await handleHelpCommand({ chat: { id: chatId } });
        break;
        
      case 'toggle_notifications':
        await bot.editMessageText(
          '✅ Настройки уведомлений обновлены!\n\n💡 Полные настройки доступны в приложении.',
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📱 Открыть приложение',
                    web_app: {
                      url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
                    }
                  }
                ]
              ]
            }
          }
        );
        break;
        
      default:
        await bot.sendMessage(chatId, '❓ Неизвестная команда');
    }
    
  } catch (error) {
    console.error('❌ Ошибка обработки callback:', error);
  }
};

// Обработка обычных сообщений
const handleTextMessage = async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Если сообщение не команда, предлагаем использовать приложение
  if (!text.startsWith('/')) {
    const response = `
💬 Привет! Я бот Taskly для управления задачами.

📱 Для создания и управления задачами используйте приложение - так намного удобнее!

💡 Или используйте команды:
/start - Главное меню
/help - Справка
/stats - Статистика
    `;
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📱 Открыть Taskly',
              web_app: {
                url: process.env.FRONTEND_URL || 'https://your-app.vercel.app'
              }
            }
          ]
        ]
      }
    };
    
    await bot.sendMessage(chatId, response, options);
  }
};

// Инициализация обработчиков
const initializeHandlers = () => {
  console.log('🔧 Инициализация обработчиков команд бота...');
  
  // Команды
  bot.onText(/\/start/, handleStartCommand);
  bot.onText(/\/help/, handleHelpCommand);
  bot.onText(/\/stats/, handleStatsCommand);
  bot.onText(/\/settings/, handleSettingsCommand);
  
  // Callback кнопки
  bot.on('callback_query', handleCallbackQuery);
  
  // Обычные сообщения
  bot.on('text', handleTextMessage);
  
  // Обработка ошибок
  bot.on('polling_error', (error) => {
    console.error('❌ Ошибка polling бота:', error);
  });
  
  console.log('✅ Обработчики команд бота инициализированы');
};

module.exports = {
  initializeHandlers,
  handleStartCommand,
  handleHelpCommand,
  handleStatsCommand,
  handleSettingsCommand
};
