const { supabase } = require('../config/supabase');
const telegramService = require('./telegram');

// Send scheduled notifications
const sendScheduledNotifications = async () => {
  try {
    console.log('🔔 Starting notification job...');

    // Get tasks that need notifications
    const { data: tasks, error } = await supabase
      .from('notification_queue')
      .select('*');

    if (error) {
      console.error('Failed to get notification queue:', error);
      return;
    }

    if (!tasks || tasks.length === 0) {
      console.log('📭 No notifications to send');
      return;
    }

    console.log(`📬 Found ${tasks.length} notifications to send`);

    let sentCount = 0;
    let errorCount = 0;

    // Process notifications in batches to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (task) => {
        try {
          await sendTaskNotification(task);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send notification for task ${task.id}:`, error.message);
          errorCount++;
        }
      }));

      // Small delay between batches
      if (i + BATCH_SIZE < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Notification job completed: ${sentCount} sent, ${errorCount} errors`);

  } catch (error) {
    console.error('Notification job error:', error.message);
    throw error;
  }
};

// Send notification for specific task
const sendTaskNotification = async (task) => {
  try {
    const { id, telegram_id, title, due_date, due_time, notification_type, priority } = task;

    // Send notification via Telegram
    const message = await telegramService.sendNotification(telegram_id, {
      id,
      title,
      due_date,
      due_time,
      priority
    });

    // Save notification record
    const { error: saveError } = await supabase
      .from('notifications')
      .insert({
        user_id: task.user_id,
        task_id: task.id,
        type: notification_type,
        message: message.text,
        telegram_message_id: message.message_id,
        delivery_status: 'sent'
      });

    if (saveError) {
      console.error('Failed to save notification record:', saveError);
    }

    // Mark task notification as sent
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ notification_sent: true })
      .eq('id', task.id);

    if (updateError) {
      console.error('Failed to update task notification status:', updateError);
    }

    console.log(`📱 Notification sent for task: ${title} (${notification_type})`);

  } catch (error) {
    // Save failed notification
    await supabase
      .from('notifications')
      .insert({
        user_id: task.user_id,
        task_id: task.id,
        type: task.notification_type,
        message: `Failed to send notification: ${error.message}`,
        delivery_status: 'failed'
      });

    throw error;
  }
};

// Send immediate notification
const sendImmediateNotification = async (userId, taskId, type = 'reminder') => {
  try {
    // Get task and user info
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        *,
        users!inner(telegram_id, timezone, settings)
      `)
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (taskError || !task) {
      throw new Error('Task not found');
    }

    // Check if notifications are enabled
    if (!task.users.settings?.notifications) {
      console.log('Notifications disabled for user');
      return;
    }

    await sendTaskNotification({
      id: task.id,
      user_id: userId,
      telegram_id: task.users.telegram_id,
      title: task.title,
      due_date: task.due_date,
      due_time: task.due_time,
      priority: task.priority,
      notification_type: type
    });

  } catch (error) {
    console.error('Send immediate notification error:', error.message);
    throw error;
  }
};

// Send welcome message to new user
const sendWelcomeMessage = async (user) => {
  try {
    const message = `👋 Добро пожаловать в Taskly, ${user.first_name}!\n\n` +
      `📋 Простое управление задачами прямо в Telegram\n\n` +
      `✨ Что вы можете делать:\n` +
      `• Создавать и управлять задачами\n` +
      `• Получать напоминания\n` +
      `• Отслеживать прогресс\n\n` +
      `🚀 Нажмите кнопку ниже, чтобы начать!`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: '📱 Открыть Taskly',
          web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
        }
      ]]
    };

    await telegramService.sendMessage(user.telegram_id, message, {
      reply_markup: keyboard
    });

    console.log(`👋 Welcome message sent to ${user.first_name}`);

  } catch (error) {
    console.error('Send welcome message error:', error.message);
  }
};

// Send daily summary
const sendDailySummary = async (userId) => {
  try {
    // Get user and today's tasks
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_id, first_name, settings')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.settings?.notifications) {
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('title, completed, priority')
      .eq('user_id', userId)
      .eq('due_date', today);

    if (tasksError) {
      console.error('Failed to get daily tasks:', tasksError);
      return;
    }

    if (!tasks || tasks.length === 0) {
      return; // No tasks for today
    }

    const completedTasks = tasks.filter(t => t.completed);
    const pendingTasks = tasks.filter(t => !t.completed);

    let message = `📊 <b>Ваши задачи на сегодня</b>\n\n`;
    
    if (completedTasks.length > 0) {
      message += `✅ <b>Выполнено (${completedTasks.length}):</b>\n`;
      completedTasks.slice(0, 3).forEach(task => {
        message += `• ${task.title}\n`;
      });
      if (completedTasks.length > 3) {
        message += `• и еще ${completedTasks.length - 3}...\n`;
      }
      message += '\n';
    }

    if (pendingTasks.length > 0) {
      message += `⏳ <b>Осталось выполнить (${pendingTasks.length}):</b>\n`;
      pendingTasks.slice(0, 3).forEach(task => {
        const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'low' ? '🟡' : '🔵';
        message += `${priorityEmoji} ${task.title}\n`;
      });
      if (pendingTasks.length > 3) {
        message += `• и еще ${pendingTasks.length - 3}...\n`;
      }
    }

    if (pendingTasks.length === 0) {
      message += `🎉 Все задачи на сегодня выполнены!`;
    }

    const keyboard = {
      inline_keyboard: [[
        {
          text: '📱 Открыть приложение',
          web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
        }
      ]]
    };

    await telegramService.sendMessage(user.telegram_id, message, {
      reply_markup: keyboard
    });

    console.log(`📊 Daily summary sent to ${user.first_name}`);

  } catch (error) {
    console.error('Send daily summary error:', error.message);
  }
};

// Reset notification flags for new day
const resetNotificationFlags = async () => {
  try {
    console.log('🔄 Resetting notification flags...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Reset notification_sent for tasks that were due yesterday
    const { error } = await supabase
      .from('tasks')
      .update({ notification_sent: false })
      .eq('due_date', yesterdayStr)
      .eq('notification_sent', true);

    if (error) {
      console.error('Failed to reset notification flags:', error);
    } else {
      console.log('✅ Notification flags reset');
    }

  } catch (error) {
    console.error('Reset notification flags error:', error.message);
  }
};

// Get notification settings for user
const getNotificationSettings = async (userId) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('settings, timezone')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return {
      enabled: user.settings?.notifications || true,
      reminderTime: user.settings?.reminder_time || '09:00',
      timezone: user.timezone || 'Europe/Moscow'
    };

  } catch (error) {
    console.error('Get notification settings error:', error.message);
    return {
      enabled: true,
      reminderTime: '09:00',
      timezone: 'Europe/Moscow'
    };
  }
};

// Update notification settings
const updateNotificationSettings = async (userId, settings) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        settings: settings
      })
      .eq('id', userId);

    if (error) throw error;

    console.log(`⚙️ Notification settings updated for user ${userId}`);

  } catch (error) {
    console.error('Update notification settings error:', error.message);
    throw error;
  }
};

module.exports = {
  sendScheduledNotifications,
  sendTaskNotification,
  sendImmediateNotification,
  sendWelcomeMessage,
  sendDailySummary,
  resetNotificationFlags,
  getNotificationSettings,
  updateNotificationSettings
};
