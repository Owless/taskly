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

// Команда /start
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
- Архив по месяцам

💡 *Команды:*
/help - помощь
/donate - поддержать проект

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
        { text: '💙 Поддержать', callback_data: 'donate' }
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
- 📁 Архив задач по месяцам

📱 *Как пользоваться:*
1. Нажми "Открыть Taskly" 
2. Введи название задачи
3. Добавь описание (опционально)
4. Выбери приоритет
5. Установи срок (опционально)
6. Нажми "Добавить задачу"

🔧 *Управление:*
- Кнопка "Выполнить" справа от задачи
- Клик по задаче для редактирования
- Фильтр "Архив" показывает выполненные задачи по месяцам

💙 *Поддержать проект:* /donate

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

// Команда /donate
bot.onText(/\/donate/, async (msg) => {
  await showDonateOptions(msg.chat.id);
});

// Показать варианты пожертвований
async function showDonateOptions(chatId) {
  const donateMessage = `💙 *Поддержать Taskly*

Спасибо, что хочешь поддержать развитие проекта! 

⭐ *Выбери сумму или введи свою:*

Все средства идут на развитие и улучшение приложения.`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '1 ⭐', callback_data: 'donate_1' },
        { text: '5 ⭐', callback_data: 'donate_5' },
        { text: '10 ⭐', callback_data: 'donate_10' }
      ],
      [
        { text: '25 ⭐', callback_data: 'donate_25' },
        { text: '50 ⭐', callback_data: 'donate_50' }
      ],
      [
        { text: '💙 Другая сумма', callback_data: 'donate_custom' }
      ],
      [
        {
          text: '📱 Открыть приложение',
          web_app: { url: process.env.APP_URL }
        }
      ]
    ]
  };

  try {
    await bot.sendMessage(chatId, donateMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Show donate options error:', error);
  }
}

// Создание инвойса для Telegram Stars
async function createInvoice(chatId, amount, description) {
  try {
    console.log(`Creating invoice for ${amount} stars to user ${chatId}`);
    
    await bot.sendInvoice(
      chatId,                                    
      'Поддержка Taskly',                       
      description,                              
      `donation_${chatId}_${Date.now()}`,       
      '',                                       
      'XTR',                                   
      [{ label: `${amount} Stars`, amount: amount }], 
      {
        max_tip_amount: 0,
        suggested_tip_amounts: []
      }
    );
    
    console.log(`✅ Invoice created successfully for ${amount} stars`);
    
  } catch (error) {
    console.error('❌ Invoice creation error:', error);
    
    let errorMessage = '❌ Не удалось создать платеж.';
    
    if (error.code === 400) {
      errorMessage = '❌ Некорректная сумма. Попробуй от 1 до 2500 звезд.';
    } else if (error.code === 401) {
      errorMessage = '❌ Проблема с настройками бота. Обратись к администратору.';
    }
    
    try {
      await bot.sendMessage(chatId, errorMessage);
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
}

// Обработка callback кнопок
bot.on('callback_query', async (callbackQuery) => {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;

  try {
    await bot.answerCallbackQuery(callbackQuery.id);

    switch (data) {
      case 'help':
        await bot.sendMessage(chatId, '📖 Используй команду /help для подробной справки');
        break;
      
      case 'donate':
        await showDonateOptions(chatId);
        break;
      
      case 'donate_1':
        await createInvoice(chatId, 1, '💙 Поддержка проекта - 1 звезда');
        break;
      
      case 'donate_5':
        await createInvoice(chatId, 5, '💙 Спасибо за поддержку - 5 звезд!');
        break;
      
      case 'donate_10':
        await createInvoice(chatId, 10, '💙 Ты великолепен - 10 звезд!');
        break;
      
      case 'donate_25':
        await createInvoice(chatId, 25, '💙 Потрясающая поддержка - 25 звезд!');
        break;
      
      case 'donate_50':
        await createInvoice(chatId, 50, '💙 Невероятная поддержка - 50 звезд!');
        break;
      
      case 'donate_custom':
        await bot.sendMessage(chatId, 
          '💙 Введи сумму Stars для пожертвования (от 1 до 2500):\n\n' +
          'Например: 25'
        );
        userStates.set(chatId, 'waiting_donation_amount');
        break;
    }
  } catch (error) {
    console.error('Callback query error:', error);
    try {
      await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуй еще раз.');
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }
  }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userState = userStates.get(chatId);

  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) return;

  if (userState === 'waiting_donation_amount' && msg.text) {
    const amount = parseInt(msg.text.trim());
    
    if (isNaN(amount) || amount < 1 || amount > 2500) {
      try {
        await bot.sendMessage(chatId, 
          '❌ Введи корректную сумму от 1 до 2500 Stars\n\n' +
          'Например: 15'
        );
      } catch (error) {
        console.error('Error sending validation message:', error);
      }
      return;
    }

    userStates.delete(chatId);
    await createInvoice(chatId, amount, `💙 Поддержка на ${amount} Stars`);
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

💙 Благодаря таким людям как ты, Taskly становится лучше!

🚀 Продолжай эффективно управлять своими задачами!`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.APP_URL }
        }
      ],
      [
        { text: '💙 Поддержать еще', callback_data: 'donate' }
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

// API: Создание платежа из приложения
app.post('/api/create-payment', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!telegramId || !amount || amount < 1 || amount > 2500) {
      return res.status(400).json({ 
        success: false, 
        error: 'Некорректные параметры платежа' 
      });
    }

    // Создаем инвойс через бота
    await createInvoice(telegramId, amount, `💙 Поддержка Taskly - ${amount} Stars`);
    
    res.json({ success: true, message: 'Платеж создан' });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Авторизация (убираем тестового пользователя)
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData || !initData.includes('user=')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Доступ только через Telegram' 
      });
    }

    let userData;
    try {
      const userDataString = initData.split('user=')[1].split('&')[0];
      userData = JSON.parse(decodeURIComponent(userDataString));
    } catch (parseError) {
      return res.status(401).json({ 
        success: false, 
        error: 'Некорректные данные авторизации' 
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

// Остальные API endpoints (без изменений)
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
