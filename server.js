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

// Состояния пользователей
const userStates = new Map();

app.use(express.json());
app.use(express.static('.'));

// Настройка webhook для бота
async function setupWebhook() {
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log('✅ Webhook установлен:', WEBHOOK_URL);
  } catch (error) {
    console.error('❌ Ошибка установки webhook:', error);
  }
}

// Проверка прав бота
async function checkBotPermissions() {
  try {
    const botInfo = await bot.getMe();
    console.log('🤖 Bot info:', botInfo.username);
    
    if (botInfo.can_receive_payments) {
      console.log('✅ Bot can receive payments');
    } else {
      console.log('❌ Bot cannot receive payments - check BotFather settings');
    }
  } catch (error) {
    console.error('Error checking bot:', error);
  }
}

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

// API для создания инвойса для пожертвований
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!telegramId || !amount || amount < 1 || amount > 2500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Некорректные параметры' 
      });
    }

    console.log(`Creating invoice for ${amount} stars to user ${telegramId}`);
    
    // Создаем инвойс через Bot API
    const invoice = await bot.sendInvoice(
      telegramId,                                    // chat_id
      'Поддержка Taskly',                          // title
      `Поддержка разработки приложения - ${amount} ⭐`, // description
      `donation_${telegramId}_${Date.now()}`,       // payload
      '',                                           // provider_token (пустой для Stars)
      'XTR',                                       // currency
      [{ label: `${amount} Stars`, amount: amount }], // prices
      {
        max_tip_amount: 0,
        suggested_tip_amounts: [],
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
        send_phone_number_to_provider: false,
        send_email_to_provider: false,
        is_flexible: false
      }
    );
    
    console.log(`✅ Invoice created successfully for ${amount} stars`);
    
    res.json({ 
      success: true, 
      message: `Создан платеж на ${amount} ⭐`,
      invoice_message_id: invoice.message_id
    });
    
  } catch (error) {
    console.error('❌ Invoice creation error:', error);
    
    let errorMessage = 'Не удалось создать платеж';
    
    if (error.code === 400) {
      errorMessage = 'Некорректная сумма для платежа';
    } else if (error.code === 403) {
      errorMessage = 'Пользователь заблокировал бота';
    }
    
    res.status(400).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// Команды бота (ваш существующий код)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'друг';
  
  const welcomeMessage = `🎯 *Добро пожаловать в Taskly!*

Привет, ${firstName}! Я помогу тебе управлять задачами прямо в Telegram.

📱 *Открыть приложение* - нажми кнопку ниже
📋 *Возможности:*
- Создавать и управлять задачами
- Устанавливать приоритеты
- Отмечать выполненные дела
- Фильтровать по статусу

💡 *Команды:*
/help - помощь

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
        { text: '❓ Помощь', callback_data: 'help' }
      ]
    ]
  };

  try {
    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Start command error:', error);
  }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `📖 *Справка по Taskly*

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

// Обработка pre-checkout запросов
bot.on('pre_checkout_query', async (preCheckoutQuery) => {
  try {
    console.log('Pre-checkout query received:', preCheckoutQuery.id);
    await bot.answerPreCheckoutQuery(preCheckoutQuery.id, true);
  } catch (error) {
    console.error('Pre-checkout query error:', error);
    try {
      await bot.answerPreCheckoutQuery(preCheckoutQuery.id, false, 'Ошибка обработки платежа');
    } catch (answerError) {
      console.error('Error answering pre-checkout query:', answerError);
    }
  }
});

// Обработка успешных платежей
bot.on('successful_payment', async (msg) => {
  const { successful_payment } = msg;
  const chatId = msg.chat.id;
  const amount = successful_payment.total_amount;
  const firstName = msg.from.first_name || 'Друг';

  console.log(`✅ Successful payment: ${amount} stars from user ${chatId}`);

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
    
    console.log('✅ Donation logged to database');
  } catch (error) {
    console.error('❌ Error saving donation:', error);
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

// Обработка ошибок бота
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('Telegram webhook error:', error);
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Авторизация (ваш существующий код)
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    let userData;
    try {
      if (initData && initData.includes('user=')) {
        const userDataString = initData.split('user=')[1].split('&')[0];
        userData = JSON.parse(decodeURIComponent(userDataString));
      } else {
        // Фоллбэк для тестирования
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

// Остальные API endpoints для задач (ваш существующий код)
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
  console.log(`🚀 Taskly server running on port ${PORT}`);
  console.log(`📱 App URL: ${process.env.APP_URL}`);
  
  await checkBotPermissions();
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
