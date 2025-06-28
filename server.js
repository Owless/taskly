require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
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

app.use(express.json());
app.use(express.static('.'));

// API для получения токена бота (для создания платежей)
app.get('/api/bot-token', (req, res) => {
  res.json({ token: process.env.TELEGRAM_BOT_TOKEN });
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

🔧 *Управление:*
- Нажми на чекбокс чтобы отметить выполненную
- Используй фильтры: Активные/Все/Архив
- Нажми на задачу для редактирования

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
        provider_payment_charge_id: successful_payment.provider_payment_charge_id,
        status: 'completed'
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
    
    // Если отмечаем как выполненную, добавляем completed_at
    if (updates.completed && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    } else if (!updates.completed) {
      updates.completed_at = null;
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
