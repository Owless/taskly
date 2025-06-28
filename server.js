require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase клиенты
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

// Webhook для бота
const WEBHOOK_URL = `${process.env.APP_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;

app.use(express.json());
app.use(express.static('.'));

// Настройка webhook для бота
async function setupWebhook() {
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log('Webhook установлен:', WEBHOOK_URL);
  } catch (error) {
    console.error('Ошибка установки webhook:', error);
  }
}

// Webhook обработчик для бота
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Команды бота
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';
  
  const welcomeMessage = `
🎯 *Добро пожаловать в Taskly!*

Привет, ${firstName}! Я помогу тебе управлять задачами прямо в Telegram.

📱 *Открыть приложение* - нажми кнопку ниже
📋 *Возможности:*
- Создавать и управлять задачами
- Устанавливать приоритеты
- Отмечать выполненные дела
- Фильтровать по статусу

💡 *Команды:*
/help - помощь
/donate - поддержать проект

Давай начнем! 🚀
  `;

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
        { text: '💫 Поддержать', callback_data: 'donate' }
      ]
    ]
  };

  await bot.sendMessage(chatId, welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
📖 *Справка по Taskly*

🎯 *Основные функции:*
- ✅ Создание задач с описанием
- 🎨 Установка приоритетов (низкий/средний/высокий)
- 📅 Установка сроков выполнения
- 🔄 Отметка выполненных задач
- 🔍 Фильтрация задач

📱 *Как пользоваться:*
1. Нажми "Открыть Taskly" 
2. Введи название задачи
3. Добавь описание (опционально)
4. Выбери приоритет
5. Установи срок (опционально)
6. Нажми "Добавить задачу"

🔧 *Управление:*
- Нажми на чекбокс чтобы отметить выполненную
- Используй фильтры: Все/Активные/Выполненные
- Кнопка "Удалить" для удаления задачи

💫 *Поддержать проект:* /donate

Остались вопросы? Пиши @your_support_username
  `;

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

  await bot.sendMessage(chatId, helpMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

bot.onText(/\/donate/, async (msg) => {
  await showDonateOptions(msg.chat.id);
});

// Обработка callback кнопок
bot.on('callback_query', async (callbackQuery) => {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;

  await bot.answerCallbackQuery(callbackQuery.id);

  switch (data) {
    case 'help':
      await bot.sendMessage(chatId, '📖 Используй команду /help для подробной справки');
      break;
    
    case 'donate':
      await showDonateOptions(chatId);
      break;
    
    case 'donate_1':
      await createInvoice(chatId, 1, '🌟 Поддержка проекта');
      break;
    
    case 'donate_5':
      await createInvoice(chatId, 5, '⭐ Спасибо за поддержку!');
      break;
    
    case 'donate_10':
      await createInvoice(chatId, 10, '🌟 Ты великолепен!');
      break;
    
    case 'donate_custom':
      await bot.sendMessage(chatId, '💫 Введи сумму Stars для пожертвования (от 1 до 2500):');
      // Устанавливаем флаг ожидания суммы
      userStates.set(chatId, 'waiting_donation_amount');
      break;
  }
});

// Состояния пользователей
const userStates = new Map();

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userState = userStates.get(chatId);

  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) return;

  if (userState === 'waiting_donation_amount' && msg.text) {
    const amount = parseInt(msg.text);
    
    if (isNaN(amount) || amount < 1 || amount > 2500) {
      await bot.sendMessage(chatId, '❌ Введи корректную сумму от 1 до 2500 Stars');
      return;
    }

    userStates.delete(chatId);
    await createInvoice(chatId, amount, `💫 Поддержка на ${amount} Stars`);
  }
});

// Показать варианты пожертвований
async function showDonateOptions(chatId) {
  const donateMessage = `
💫 *Поддержать Taskly*

Спасибо, что хочешь поддержать развитие проекта! 

🌟 *Выбери сумму или введи свою:*

Все средства идут на развитие и улучшение приложения.
  `;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '1 ⭐', callback_data: 'donate_1' },
        { text: '5 ⭐', callback_data: 'donate_5' },
        { text: '10 ⭐', callback_data: 'donate_10' }
      ],
      [
        { text: '💫 Другая сумма', callback_data: 'donate_custom' }
      ],
      [
        {
          text: '📱 Открыть приложение',
          web_app: { url: process.env.APP_URL }
        }
      ]
    ]
  };

  await bot.sendMessage(chatId, donateMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Создание инвойса для Telegram Stars
async function createInvoice(chatId, amount, description) {
  try {
    const invoice = {
      chat_id: chatId,
      title: 'Поддержка Taskly',
      description: description,
      payload: `donation_${chatId}_${Date.now()}`,
      currency: 'XTR', // Telegram Stars
      prices: [{ label: 'Поддержка', amount: amount }]
    };

    await bot.sendInvoice(invoice);
  } catch (error) {
    console.error('Ошибка создания инвойса:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при создании платежа. Попробуй позже.');
  }
}

// Обработка успешных платежей
bot.on('successful_payment', async (msg) => {
  const { successful_payment } = msg;
  const chatId = msg.chat.id;
  const amount = successful_payment.total_amount;
  const firstName = msg.from.first_name || 'Друг';

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
        payload: successful_payment.invoice_payload,
        telegram_payment_charge_id: successful_payment.telegram_payment_charge_id,
        provider_payment_charge_id: successful_payment.provider_payment_charge_id
      });
  } catch (error) {
    console.error('Ошибка сохранения донации:', error);
  }

  const thankMessage = `
🎉 *Спасибо за поддержку!*

${firstName}, ты потрясающий! Твое пожертвование в ${amount} ⭐ очень важно для развития проекта.

🚀 Благодаря таким людям как ты, Taskly становится лучше!

💪 Продолжай эффективно управлять своими задачами!
  `;

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

  await bot.sendMessage(chatId, thankMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Обработка отмененных платежей
bot.on('pre_checkout_query', async (preCheckoutQuery) => {
  // Всегда подтверждаем платежи
  await bot.answerPreCheckoutQuery(preCheckoutQuery.id, true);
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoints (твой существующий код)
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    let userData;
    try {
      if (initData.includes('user=')) {
        const userDataString = initData.split('user=')[1].split('&')[0];
        userData = JSON.parse(decodeURIComponent(userDataString));
      } else {
        userData = {
          id: 123456,
          first_name: "Test User",
          username: "testuser"
        };
      }
    } catch (parseError) {
      userData = {
        id: Date.now(),
        first_name: "Test User",
        username: "testuser"
      };
    }

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
          last_name: userData.last_name || null
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

// Остальные API endpoints (tasks) - твой существующий код
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
        title,
        description: description || null,
        priority: priority || 'medium',
        due_date: dueDate || null
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

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`Taskly server running on port ${PORT}`);
  await setupWebhook();
});
