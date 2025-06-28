require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase клиенты
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

app.use(express.json());
app.use(express.static('.'));

// Система уведомлений
class NotificationSystem {
  constructor() {
    this.setupCronJobs();
  }

  setupCronJobs() {
    // Проверяем каждые 30 минут
    cron.schedule('*/30 * * * *', () => {
      this.checkUpcomingTasks();
      this.checkOverdueTasks();
    });

    console.log('📢 Notification system started');
  }

  async checkUpcomingTasks() {
    try {
      const now = new Date();
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

      // Находим задачи, которые должны быть выполнены в течение 3 часов
      const { data: tasks, error } = await supabaseAdmin
        .from('tasks')
        .select(`
          *,
          users (telegram_id, first_name, settings)
        `)
        .eq('completed', false)
        .not('due_date', 'is', null)
        .gte('due_date', now.toISOString())
        .lte('due_date', threeHoursLater.toISOString())
        .is('notified_upcoming', null);

      if (error) throw error;

      for (const task of tasks || []) {
        await this.sendUpcomingNotification(task);
        
        // Отмечаем, что уведомление было отправлено
        await supabaseAdmin
          .from('tasks')
          .update({ notified_upcoming: true })
          .eq('id', task.id);
      }

      if (tasks?.length > 0) {
        console.log(`📅 Sent ${tasks.length} upcoming task notifications`);
      }
    } catch (error) {
      console.error('Error checking upcoming tasks:', error);
    }
  }

  async checkOverdueTasks() {
    try {
      const now = new Date();

      // Находим просроченные задачи
      const { data: tasks, error } = await supabaseAdmin
        .from('tasks')
        .select(`
          *,
          users (telegram_id, first_name, settings)
        `)
        .eq('completed', false)
        .not('due_date', 'is', null)
        .lt('due_date', now.toISOString())
        .is('notified_overdue', null);

      if (error) throw error;

      for (const task of tasks || []) {
        await this.sendOverdueNotification(task);
        
        // Отмечаем, что уведомление было отправлено
        await supabaseAdmin
          .from('tasks')
          .update({ notified_overdue: true })
          .eq('id', task.id);
      }

      if (tasks?.length > 0) {
        console.log(`⏰ Sent ${tasks.length} overdue task notifications`);
      }
    } catch (error) {
      console.error('Error checking overdue tasks:', error);
    }
  }

  async sendUpcomingNotification(task) {
    const user = task.users;
    
    // Проверяем настройки уведомлений пользователя
    if (!user.settings?.notificationsEnabled) {
      return;
    }

    const dueDate = new Date(task.due_date);
    const timeString = dueDate.toLocaleString('ru-RU', {
      timeZone: user.settings?.timezone === 'auto' ? 'Europe/Moscow' : user.settings?.timezone || 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });

    const message = `⏰ *Напоминание о задаче*

📝 *${task.title}*
${task.description ? `\n💭 ${task.description}` : ''}

🕐 Срок выполнения: *${timeString}*
⚡ Приоритет: ${this.getPriorityEmoji(task.priority)}

Время выполнить задачу! 💪`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Выполнить',
            callback_data: `complete_${task.id}`
          },
          {
            text: '📱 Открыть приложение',
            web_app: { url: process.env.APP_URL }
          }
        ]
      ]
    };

    try {
      await bot.sendMessage(user.telegram_id, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error(`Failed to send upcoming notification to ${user.telegram_id}:`, error);
    }
  }

  async sendOverdueNotification(task) {
    const user = task.users;
    
    if (!user.settings?.notificationsEnabled) {
      return;
    }

    const dueDate = new Date(task.due_date);
    const now = new Date();
    const overdueDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

    const message = `🚨 *Просроченная задача*

📝 *${task.title}*
${task.description ? `\n💭 ${task.description}` : ''}

⏰ Просрочена на: *${overdueDays > 0 ? `${overdueDays} дн.` : 'несколько часов'}*
⚡ Приоритет: ${this.getPriorityEmoji(task.priority)}

Не забудьте выполнить! 🎯`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Выполнить',
            callback_data: `complete_${task.id}`
          },
          {
            text: '📱 Открыть приложение',
            web_app: { url: process.env.APP_URL }
          }
        ]
      ]
    };

    try {
      await bot.sendMessage(user.telegram_id, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error(`Failed to send overdue notification to ${user.telegram_id}:`, error);
    }
  }

  getPriorityEmoji(priority) {
    switch (priority) {
      case 'high': return '🔴 Высокий';
      case 'medium': return '🟡 Средний';
      case 'low': return '🟢 Низкий';
      default: return '🟡 Средний';
    }
  }
}

// Инициализируем систему уведомлений
const notificationSystem = new NotificationSystem();

// API для создания инвойса
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { amount, payload, userId } = req.body;
    
    if (!amount || amount < 1 || amount > 2500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Некорректная сумма' 
      });
    }

    const invoiceParams = {
      title: 'Поддержка Taskly',
      description: `Поддержка разработки приложения Taskly`,
      payload: payload,
      provider_token: '',
      currency: 'XTR',
      prices: JSON.stringify([{ 
        label: `${amount} Stars`, 
        amount: amount 
      }]),
      start_parameter: 'donation',
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false,
      send_phone_number_to_provider: false,
      send_email_to_provider: false,
      is_flexible: false
    };

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceParams)
    });

    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.description || 'Ошибка создания инвойса');
    }
    
    // Сохраняем информацию о платеже
    try {
      await supabaseAdmin
        .from('pending_donations')
        .insert({
          telegram_id: userId,
          amount: amount,
          payload: payload,
          status: 'pending'
        });
    } catch (dbError) {
      console.error('Error saving pending donation:', dbError);
    }
    
    res.json({ 
      success: true, 
      invoiceLink: result.result 
    });
    
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message || 'Ошибка создания платежа' 
    });
  }
});

// Webhook обработчик для бота
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.sendStatus(500);
  }
});

// Команды бота
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';
  
  const welcomeMessage = `🎯 *Добро пожаловать в Taskly!*

Привет, ${firstName}! Я помогу тебе управлять задачами прямо в Telegram.

📱 *Открыть приложение* - нажми кнопку ниже
📋 *Возможности:*
- Создавать и управлять задачами
- Устанавливать приоритеты и сроки
- Отмечать выполненные дела
- Группировка по времени выполнения
- Настройка часового пояса
- Умные уведомления о сроках

💡 *Команды:*
/help - помощь
/notifications - настройки уведомлений

Давай начнем! 🚀`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.APP_URL }
        }
      ],
      [
        { text: '❓ Помощь', callback_data: 'help' },
        { text: '🔔 Уведомления', callback_data: 'notifications' }
      ]
    ]
  };

  try {
    // Отправляем с логотипом если есть
    if (process.env.LOGO_IMAGE_URL) {
      await bot.sendPhoto(chatId, process.env.LOGO_IMAGE_URL, {
        caption: welcomeMessage,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  } catch (error) {
    console.error('Start command error:', error);
    try {
      await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (fallbackError) {
      console.error('Fallback start command error:', fallbackError);
    }
  }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `📖 *Справка по Taskly*

🎯 *Основные функции:*
- ✅ Создание задач с описанием
- 🎨 Установка приоритетов (низкий/средний/высокий)
- ⏰ Установка сроков выполнения
- 🔄 Отметка выполненных задач
- 📊 Группировка по времени

📱 *Группировка задач:*
🔴 Просрочено - задачи с истекшим сроком
🔥 Сегодня - задачи на сегодня
⭐ Завтра - задачи на завтра
📅 На неделе - задачи на ближайшие 7 дней
📋 Позже - задачи на будущее
📝 Без срока - задачи без установленного срока

🔔 *Уведомления:*
- Напоминание за 3 часа до срока
- Уведомление о просроченных задачах
- Настройка через шестеренку в приложении

🔧 *Управление:*
- Нажми на чекбокс чтобы отметить выполненную
- Используй фильтры: Активные/Все/Архив
- Нажми на задачу для редактирования
- Используй шестеренку для настроек

Остались вопросы? Пиши разработчику`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.APP_URL }
        }
      ]
    ]
  };

  try {
    await bot.sendMessage(chatId, helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Help command error:', error);
  }
});

// Обработка callback кнопок
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  if (data === 'help') {
    const helpMessage = `📖 *Справка по Taskly*

🎯 *Основные функции:*
- ✅ Создание задач с описанием
- 🎨 Установка приоритетов
- ⏰ Установка сроков выполнения
- 🔔 Умные уведомления

🔧 *Управление:*
- Нажми на чекбокс чтобы отметить выполненную
- Используй фильтры: Активные/Все/Архив
- Нажми на задачу для редактирования
- Используй шестеренку для настроек`;

    try {
      await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Help callback error:', error);
    }
  } 
  else if (data === 'notifications') {
    // Получаем настройки пользователя
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('settings')
        .eq('telegram_id', userId)
        .single();

      const notificationsEnabled = user?.settings?.notificationsEnabled ?? true;
      const soundEnabled = user?.settings?.soundEnabled ?? true;

      const notifMessage = `🔔 *Настройки уведомлений*

Текущие настройки:
${notificationsEnabled ? '✅' : '❌'} Уведомления включены
${soundEnabled ? '✅' : '❌'} Звуковые уведомления

📢 *Типы уведомлений:*
• За 3 часа до срока выполнения
• О просроченных задачах

Изменить настройки можно в приложении через шестеренку ⚙️`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '📱 Открыть настройки',
              web_app: { url: process.env.APP_URL }
            }
          ]
        ]
      };

      await bot.sendMessage(chatId, notifMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Notifications callback error:', error);
    }
  }
  else if (data.startsWith('complete_')) {
    // Выполнение задачи через кнопку в уведомлении
    const taskId = data.replace('complete_', '');
    
    try {
      const { error } = await supabaseAdmin
        .from('tasks')
        .update({ 
          completed: true, 
          completed_at: new Date().toISOString() 
        })
        .eq('id', taskId);

      if (error) throw error;

      await bot.sendMessage(chatId, '✅ Задача отмечена как выполненная!', {
        reply_to_message_id: message.message_id
      });
    } catch (error) {
      console.error('Task completion error:', error);
      await bot.sendMessage(chatId, '❌ Ошибка при выполнении задачи');
    }
  }
});

// Обработка успешных платежей
bot.on('successful_payment', async (msg) => {
  const { successful_payment } = msg;
  const chatId = msg.chat.id;
  const amount = successful_payment.total_amount;
  const firstName = msg.from.first_name || 'Друг';
  const payload = successful_payment.invoice_payload;

  console.log(`✅ Successful payment: ${amount} stars from user ${chatId}, payload: ${payload}`);

  // Логируем платеж в Supabase
  try {
    await supabaseAdmin
      .from('donations')
      .insert({
        telegram_id: msg.from.id,
        username: msg.from.username,
        first_name: msg.from.first_name,
        amount: amount,
        currency: 'XTR',
        payload: payload,
        telegram_payment_charge_id: successful_payment.telegram_payment_charge_id,
        provider_payment_charge_id: successful_payment.provider_payment_charge_id,
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    
    // Обновляем статус pending donation
    await supabaseAdmin
      .from('pending_donations')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('payload', payload);
      
  } catch (error) {
    console.error('Error saving donation:', error);
  }

  const thankMessage = `🎉 *Спасибо за поддержку!*

${firstName}, ты потрясающий! Твое пожертвование в ${amount} ⭐ очень важно для развития проекта.

🚀 Благодаря таким людям как ты, Taskly становится лучше!

💪 Продолжай эффективно управлять своими задачами!`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.APP_URL }
        }
      ]
    ]
  };

  try {
    await bot.sendMessage(chatId, thankMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error sending thank you message:', error);
  }
});

// Обработка предварительных запросов платежей
bot.on('pre_checkout_query', async (preCheckoutQuery) => {
  console.log('Pre-checkout query received:', preCheckoutQuery);
  
  try {
    await bot.answerPreCheckoutQuery(preCheckoutQuery.id, true);
    console.log('✅ Pre-checkout query approved');
  } catch (error) {
    console.error('❌ Error answering pre-checkout query:', error);
    await bot.answerPreCheckoutQuery(preCheckoutQuery.id, false, {
      error_message: 'Ошибка обработки платежа. Попробуйте еще раз.'
    });
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Авторизация
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    let userData;
    try {
      if (initData && initData.includes('user=')) {
        const userDataString = initData.split('user=')[1].split('&')[0];
        userData = JSON.parse(decodeURIComponent(userDataString));
      } else {
        throw new Error('No user data in initData');
      }
    } catch (parseError) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверные данные авторизации' 
      });
    }

    console.log('User auth:', userData.id);

    const { data: existingUser, error: selectError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('telegram_id', userData.id)
      .maybeSingle();

    let user = existingUser;
    
    if (!existingUser) {
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          telegram_id: userData.id,
          username: userData.username || null,
          first_name: userData.first_name || null,
          last_name: userData.last_name || null,
          settings: {
            timezone: 'auto',
            notificationsEnabled: true,
            soundEnabled: true
          }
        })
        .select()
        .single();

      if (insertError) throw insertError;
      user = newUser;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// API: Настройки пользователя
app.get('/api/settings/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('settings')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      return res.json({ success: true, settings: null });
    }

    res.json({ success: true, settings: user.settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/settings/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { settings } = req.body;
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({ 
        settings: settings,
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, settings: user.settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// API endpoints для задач
app.get('/api/tasks/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError) {
      return res.json({ success: true, tasks: [] });
    }

    const { data: tasks, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, tasks: tasks || [] });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { telegramId, title, description, priority, dueDate } = req.body;
    
    // Валидация ограничений
    if (!title || title.length > 100) {
      return res.status(400).json({ 
        success: false, 
        error: 'Название задачи должно быть от 1 до 100 символов' 
      });
    }
    
    if (description && description.length > 500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Описание не должно превышать 500 символов' 
      });
    }
    
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError) throw userError;

    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        user_id: user.id,
        title: title.trim(),
        description: description ? description.trim() : null,
        priority: priority || 'medium',
        due_date: dueDate || null, // Дата уже в UTC
        notified_upcoming: null,
        notified_overdue: null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Валидация ограничений при обновлении
    if (updates.title && (updates.title.length === 0 || updates.title.length > 100)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Название задачи должно быть от 1 до 100 символов' 
      });
    }
    
    if (updates.description && updates.description.length > 500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Описание не должно превышать 500 символов' 
      });
    }
    
    // Если отмечаем как выполненную, добавляем completed_at в UTC
    if (updates.completed && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    } else if (updates.completed === false) {
      updates.completed_at = null;
    }
    
    // Обрезаем пробелы
    if (updates.title) {
      updates.title = updates.title.trim();
    }
    if (updates.description) {
      updates.description = updates.description.trim();
    }
    
    // При изменении due_date сбрасываем флаги уведомлений
    if (updates.due_date !== undefined) {
      updates.notified_upcoming = null;
      updates.notified_overdue = null;
    }
    
    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Настройка webhook для бота
async function setupWebhook() {
  try {
    const webhookUrl = `${process.env.APP_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
    await bot.setWebHook(webhookUrl);
    console.log('✅ Webhook установлен:', webhookUrl);
  } catch (error) {
    console.error('❌ Ошибка установки webhook:', error);
  }
}

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`🚀 Taskly server running on port ${PORT}`);
  console.log(`📱 App URL: ${process.env.APP_URL}`);
  
  if (process.env.LOGO_IMAGE_URL) {
    console.log(`🖼️ Logo image URL: ${process.env.LOGO_IMAGE_URL}`);
  }
  
  await setupWebhook();
  
  console.log('✅ Server ready!');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  
  try {
    await bot.deleteWebHook();
    console.log('✅ Webhook deleted');
  } catch (error) {
    console.error('Error deleting webhook:', error);
  }
  
  process.exit(0);
});
