const User = require('../models/User');
const Task = require('../models/Task');
const telegramService = require('./telegramService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const { 
  formatTaskList, 
  formatUserStats, 
  formatTaskForTelegram,
  escapeMarkdown 
} = require('../utils/formatters');
const { BOT_COMMANDS, EMOJIS, CALLBACK_PREFIXES } = require('../config/constants');
const { getCurrentDate } = require('../utils/dateHelpers');

class TelegramHandlers {
  // Обработка текстовых сообщений
  static async handleMessage(message) {
    try {
      const { from, text, chat } = message;
      
      // Игнорируем группы и каналы
      if (chat.type !== 'private') {
        return;
      }

      // Находим пользователя
      const user = await User.findByTelegramId(from.id);
      
      if (!user && !text?.startsWith('/start')) {
        await telegramService.sendMessage(
          from.id,
          `${EMOJIS.INFO} Для начала работы нажмите /start`
        );
        return;
      }

      // Обрабатываем команды
      if (text?.startsWith('/')) {
        await TelegramHandlers.handleCommand(message, user);
        return;
      }

      // Обрабатываем обычный текст как создание задачи
      if (user && text?.trim()) {
        await TelegramHandlers.handleQuickTaskCreation(message, user);
        return;
      }

    } catch (error) {
      logger.error('Failed to handle message', {
        error: error.message,
        messageId: message.message_id,
        fromId: message.from.id
      });

      await telegramService.sendMessage(
        message.from.id,
        `${EMOJIS.ERROR} Произошла ошибка при обработке сообщения`
      );
    }
  }

  // Обработка команд
  static async handleCommand(message, user) {
    const { from, text } = message;
    const command = text.split(' ')[0].toLowerCase();
    const args = text.split(' ').slice(1);

    try {
      switch (command) {
        case BOT_COMMANDS.START:
          await TelegramHandlers.handleStartCommand(from, args, user);
          break;

        case BOT_COMMANDS.HELP:
          await TelegramHandlers.handleHelpCommand(from);
          break;

        case BOT_COMMANDS.TODAY:
          await TelegramHandlers.handleTodayCommand(from, user);
          break;

        case BOT_COMMANDS.ADD:
          await TelegramHandlers.handleAddCommand(from, args, user);
          break;

        case BOT_COMMANDS.SETTINGS:
          await TelegramHandlers.handleSettingsCommand(from, user);
          break;

        case BOT_COMMANDS.STATS:
          await TelegramHandlers.handleStatsCommand(from, user);
          break;

        case BOT_COMMANDS.SUPPORT:
          await TelegramHandlers.handleSupportCommand(from);
          break;

        default:
          await telegramService.sendMessage(
            from.id,
            `${EMOJIS.WARNING} Неизвестная команда\\. Используйте /help для получения списка команд\\.`
          );
      }
    } catch (error) {
      logger.error('Failed to handle command', {
        error: error.message,
        command,
        fromId: from.id
      });

      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.ERROR} Ошибка при выполнении команды`
      );
    }
  }

  // Команда /start
  static async handleStartCommand(from, args, user) {
    let welcomeMessage;
    
    if (!user) {
      // Новый пользователь
      welcomeMessage = `${EMOJIS.ROCKET} *Добро пожаловать в Taskly\\!*

${EMOJIS.INFO} Это минималистичный менеджер задач прямо в Telegram\\.

*Что умеет Taskly:*
- Создавать и управлять задачами
- Напоминать о важных делах
- Отслеживать прогресс
- Работать полностью в Telegram

*Начните прямо сейчас:*
- Напишите название задачи
- Или используйте команду /add
- Откройте мини\\-приложение для полного функционала

Нажмите кнопку ниже, чтобы открыть приложение 👇`;
    } else {
      // Существующий пользователь
      const stats = await user.getStats();
      welcomeMessage = `${EMOJIS.PARTY} *С возвращением, ${escapeMarkdown(user.first_name)}\\!*

📊 *Ваша статистика:*
- Всего задач: *${stats.total_tasks}*
- Выполнено: *${stats.completed_tasks}*
- Активных: *${stats.active_tasks}*

Откройте приложение для управления задачами 👇`;
    }

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('🚀 Открыть Taskly', { 
        web_app: { url: process.env.APP_URL } 
      })],
      [telegramService.createButton('📋 Задачи на сегодня', 'today_tasks')],
      [telegramService.createButton('❓ Помощь', 'help')]
    ]);

    await telegramService.sendMessage(from.id, welcomeMessage, {
      reply_markup: keyboard
    });
  }

  // Команда /help
  static async handleHelpCommand(from) {
    const helpMessage = `${EMOJIS.INFO} *Помощь по Taskly*

*Основные команды:*
/start \\- Главное меню
/today \\- Задачи на сегодня
/add <название> \\- Добавить задачу
/stats \\- Статистика
/settings \\- Настройки
/help \\- Эта справка

*Быстрое создание задач:*
Просто напишите текст \\- он станет новой задачей\\!

*Мини\\-приложение:*
Для полного функционала используйте кнопку "Открыть Taskly"

*Поддержка проекта:*
/support \\- Информация о донатах`;

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('🚀 Открыть приложение', { 
        web_app: { url: process.env.APP_URL } 
      })]
    ]);

    await telegramService.sendMessage(from.id, helpMessage, {
      reply_markup: keyboard
    });
  }

  // Команда /today
  static async handleTodayCommand(from, user) {
    if (!user) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.WARNING} Сначала нажмите /start для регистрации`
      );
      return;
    }

    const today = getCurrentDate(user.timezone);
    const { tasks } = await Task.findByUser(user.id, {
      status: 'today',
      limit: 10
    });

    let message;
    if (tasks.length === 0) {
      message = `${EMOJIS.PARTY} *Задач на сегодня нет\\!*

Отличный день для отдыха или планирования новых дел\\.`;
    } else {
      message = formatTaskList(tasks, {
        title: `📅 Задачи на сегодня (${tasks.length})`,
        compact: true
      });
    }

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('➕ Добавить задачу', 'add_task')],
      [telegramService.createButton('🚀 Открыть приложение', { 
        web_app: { url: process.env.APP_URL } 
      })]
    ]);

    await telegramService.sendMessage(from.id, message, {
      reply_markup: keyboard
    });
  }

  // Команда /add
  static async handleAddCommand(from, args, user) {
    if (!user) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.WARNING} Сначала нажмите /start для регистрации`
      );
      return;
    }

    const taskTitle = args.join(' ').trim();
    
    if (!taskTitle) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.INFO} *Использование:* /add <название задачи>

*Пример:* /add Купить молоко

Или просто напишите текст без команды \\- он станет задачей\\!`
      );
      return;
    }

    try {
      const task = await Task.create({
        title: taskTitle,
        priority: 'medium'
      }, user.id);

      const message = `${EMOJIS.SUCCESS} *Задача создана\\!*

${formatTaskForTelegram(task, { compact: true })}`;

      const keyboard = telegramService.createInlineKeyboard([
        [
          telegramService.createButton('✅ Выполнить', `${CALLBACK_PREFIXES.TASK_COMPLETE}${task.id}`),
          telegramService.createButton('✏️ Редактировать', `${CALLBACK_PREFIXES.TASK_EDIT}${task.id}`)
        ],
        [telegramService.createButton('📋 Все задачи', 'all_tasks')]
      ]);

      await telegramService.sendMessage(from.id, message, {
        reply_markup: keyboard
      });

    } catch (error) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.ERROR} Не удалось создать задачу\\. Попробуйте еще раз\\.`
      );
    }
  }

  // Команда /stats
  static async handleStatsCommand(from, user) {
    if (!user) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.WARNING} Сначала нажмите /start для регистрации`
      );
      return;
    }

    const stats = await user.getStats();
    const message = formatUserStats(stats, user);

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('📊 Подробная статистика', { 
        web_app: { url: `${process.env.APP_URL}#/stats` } 
      })]
    ]);

    await telegramService.sendMessage(from.id, message, {
      reply_markup: keyboard
    });
  }

  // Команда /settings
  static async handleSettingsCommand(from, user) {
    if (!user) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.WARNING} Сначала нажмите /start для регистрации`
      );
      return;
    }

    const settings = user.settings;
    const message = `${EMOJIS.SETTINGS} *Настройки*

🔔 Уведомления: ${settings.notifications ? 'Включены' : 'Выключены'}
⏰ Время напоминаний: ${settings.reminder_time}
🌍 Часовой пояс: ${user.timezone}
🌐 Язык: ${user.language_code}

Для изменения настроек откройте приложение\\.`;

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('⚙️ Открыть настройки', { 
        web_app: { url: `${process.env.APP_URL}#/settings` } 
      })]
    ]);

    await telegramService.sendMessage(from.id, message, {
      reply_markup: keyboard
    });
  }

  // Команда /support
  static async handleSupportCommand(from) {
    const message = `${EMOJIS.HEART} *Поддержка проекта*

Taskly развивается благодаря вашей поддержке\\!

*Как помочь проекту:*
- ${EMOJIS.STAR} Поддержать Telegram Stars
- 🔄 Рассказать друзьям
- 💡 Предложить идеи

*Ваши донаты помогают:*
- Оплачивать серверы
- Добавлять новые функции
- Улучшать производительность

Спасибо за использование Taskly\\! ${EMOJIS.ROCKET}`;

    const keyboard = telegramService.createInlineKeyboard([
      [telegramService.createButton('💙 Поддержать проект', { 
        web_app: { url: `${process.env.APP_URL}#/donate` } 
      })]
    ]);

    await telegramService.sendMessage(from.id, message, {
      reply_markup: keyboard
    });
  }

  // Быстрое создание задачи из текста
  static async handleQuickTaskCreation(message, user) {
    const { from, text } = message;
    const taskTitle = text.trim();

    if (taskTitle.length > 100) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.WARNING} Название задачи слишком длинное \\(максимум 100 символов\\)`
      );
      return;
    }

    try {
      const task = await Task.create({
        title: taskTitle,
        priority: 'medium'
      }, user.id);

      const responseMessage = `${EMOJIS.SUCCESS} *Задача создана\\!*

${formatTaskForTelegram(task, { compact: true })}`;

      const keyboard = telegramService.createInlineKeyboard([
        [
          telegramService.createButton('✅ Выполнить', `${CALLBACK_PREFIXES.TASK_COMPLETE}${task.id}`),
          telegramService.createButton('📝 Подробнее', `${CALLBACK_PREFIXES.TASK_EDIT}${task.id}`)
        ]
      ]);

      await telegramService.sendMessage(from.id, responseMessage, {
        reply_markup: keyboard
      });

    } catch (error) {
      await telegramService.sendMessage(
        from.id,
        `${EMOJIS.ERROR} Не удалось создать задачу\\. Попробуйте еще раз\\.`
      );
    }
  }

  // Обработка callback query
  static async handleCallbackQuery(callbackQuery) {
    try {
      const { from, data, message } = callbackQuery;
      
      // Находим пользователя
      const user = await User.findByTelegramId(from.id);
      if (!user) {
        await telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Пользователь не найден. Нажмите /start',
          true
        );
        return;
      }

      // Обрабатываем разные типы callback'ов
      if (data.startsWith(CALLBACK_PREFIXES.TASK_COMPLETE)) {
        await TelegramHandlers.handleTaskComplete(callbackQuery, user);
      } else if (data.startsWith(CALLBACK_PREFIXES.TASK_DELETE)) {
        await TelegramHandlers.handleTaskDelete(callbackQuery, user);
      } else if (data === 'today_tasks') {
        await TelegramHandlers.handleTodayCommand(from, user);
        await telegramService.answerCallbackQuery(callbackQuery.id);
      } else if (data === 'help') {
        await TelegramHandlers.handleHelpCommand(from);
        await telegramService.answerCallbackQuery(callbackQuery.id);
      } else {
        await telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Функция в разработке',
          false
        );
      }

    } catch (error) {
      logger.error('Failed to handle callback query', {
        error: error.message,
        callbackQueryId: callbackQuery.id,
        fromId: callbackQuery.from.id,
        data: callbackQuery.data
      });

      await telegramService.answerCallbackQuery(
        callbackQuery.id,
        'Произошла ошибка',
        true
      );
    }
  }

  // Отметить задачу как выполненную
  static async handleTaskComplete(callbackQuery, user) {
    const taskId = callbackQuery.data.replace(CALLBACK_PREFIXES.TASK_COMPLETE, '');
    
    try {
      const task = await Task.findById(taskId, user.id);
      
      if (!task) {
        await telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Задача не найдена',
          true
        );
        return;
      }

      if (task.completed) {
        await telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Задача уже выполнена',
          false
        );
        return;
      }

      await task.markCompleted();

      const updatedMessage = `${EMOJIS.COMPLETED} *Задача выполнена\\!*

~~${escapeMarkdown(task.title)}~~

${EMOJIS.PARTY} Отличная работа\\!`;

      await telegramService.editMessage(
        callbackQuery.message.chat.id,
        callbackQuery.message.message_id,
        updatedMessage
      );

      await telegramService.answerCallbackQuery(
        callbackQuery.id,
        '✅ Задача выполнена!',
        false
      );

    } catch (error) {
      await telegramService.answerCallbackQuery(
        callbackQuery.id,
        'Ошибка при выполнении задачи',
        true
      );
    }
  }

  // Удалить задачу
  static async handleTaskDelete(callbackQuery, user) {
    const taskId = callbackQuery.data.replace(CALLBACK_PREFIXES.TASK_DELETE, '');
    
    try {
      const task = await Task.findById(taskId, user.id);
      
      if (!task) {
        await telegramService.answerCallbackQuery(
          callbackQuery.id,
          'Задача не найдена',
          true
        );
        return;
      }

      await task.delete();

      await telegramService.editMessage(
        callbackQuery.message.chat.id,
        callbackQuery.message.message_id,
        `${EMOJIS.SUCCESS} Задача "${escapeMarkdown(task.title)}" удалена\\.`
      );

      await telegramService.answerCallbackQuery(
        callbackQuery.id,
        '🗑️ Задача удалена',
        false
      );

    } catch (error) {
      await telegramService.answerCallbackQuery(
        callbackQuery.id,
        'Ошибка при удалении задачи',
        true
      );
    }
  }

  // Обработка изменений в чате
  static async handleChatMemberUpdate(chatMemberUpdate) {
    try {
      const { from, new_chat_member } = chatMemberUpdate;
      
      // Логируем блокировку/разблокировку бота
      if (new_chat_member.status === 'kicked') {
        logger.info('Bot was blocked by user', {
          userId: from.id,
          username: from.username
        });
      } else if (new_chat_member.status === 'member') {
        logger.info('Bot was unblocked by user', {
          userId: from.id,
          username: from.username
        });
      }

    } catch (error) {
      logger.error('Failed to handle chat member update', {
        error: error.message,
        update: chatMemberUpdate
      });
    }
  }

  // Отправить сообщение благодарности за донат
  static async sendThankYouMessage(chatId, amount) {
    try {
      const message = `${EMOJIS.PARTY} *Спасибо за поддержку\\!*

Вы поддержали проект на *${amount}* ${amount === 1 ? 'звезду' : amount <= 4 ? 'звезды' : 'звезд'} ${EMOJIS.STAR}

Ваша поддержка очень важна для развития Taskly\\!

${EMOJIS.HEART} Благодаря таким пользователям как вы, мы можем:
- Улучшать функциональность
- Добавлять новые возможности
- Поддерживать стабильную работу

${EMOJIS.ROCKET} Продолжайте пользоваться Taskly и достигать своих целей\\!`;

      await telegramService.sendMessage(chatId, message);

    } catch (error) {
      logger.error('Failed to send thank you message', {
        error: error.message,
        chatId,
        amount
      });
    }
  }

  // Универсальный метод отправки сообщения (для внешнего использования)
  static async sendMessage(chatId, text, options = {}) {
    return await telegramService.sendMessage(chatId, text, options);
  }

  // Универсальный метод ответа на pre-checkout
  static async answerPreCheckoutQuery(preCheckoutQueryId, ok, errorMessage = null) {
    return await telegramService.answerPreCheckoutQuery(preCheckoutQueryId, ok, errorMessage);
  }
}

module.exports = TelegramHandlers;
