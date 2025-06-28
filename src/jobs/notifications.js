const notificationsService = require('../services/notifications');
const { supabase } = require('../config/supabase');
const { getCurrentDateInTimezone, shouldSendNotificationNow } = require('../utils/dates');

// Main notification job - runs every hour
const runNotificationJob = async () => {
  try {
    console.log('🔔 Starting hourly notification job...');
    
    await notificationsService.sendScheduledNotifications();
    
    console.log('✅ Hourly notification job completed');
  } catch (error) {
    console.error('❌ Hourly notification job failed:', error.message);
    throw error;
  }
};

// Morning summary job - runs once a day
const runMorningSummaryJob = async () => {
  try {
    console.log('🌅 Starting morning summary job...');
    
    // Get all users with notifications enabled
    const { data: users, error } = await supabase
      .from('users')
      .select('id, telegram_id, first_name, timezone, settings')
      .eq('settings->>notifications', 'true');
    
    if (error) {
      console.error('Failed to get users for morning summary:', error);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('📭 No users found for morning summary');
      return;
    }
    
    let sentCount = 0;
    
    // Send morning summary to each user in their timezone
    for (const user of users) {
      try {
        const reminderTime = user.settings?.reminder_time || '09:00';
        const timezone = user.timezone || 'Europe/Moscow';
        
        // Check if it's the right time for this user
        if (shouldSendNotificationNow(reminderTime, timezone)) {
          await notificationsService.sendDailySummary(user.id);
          sentCount++;
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Failed to send morning summary to user ${user.id}:`, error.message);
      }
    }
    
    console.log(`✅ Morning summary job completed: ${sentCount} summaries sent`);
    
  } catch (error) {
    console.error('❌ Morning summary job failed:', error.message);
    throw error;
  }
};

// Evening reminder job - runs in the evening
const runEveningReminderJob = async () => {
  try {
    console.log('🌆 Starting evening reminder job...');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get users with incomplete tasks for today
    const { data: usersWithTasks, error } = await supabase
      .from('tasks')
      .select(`
        user_id,
        users!inner(telegram_id, first_name, timezone, settings)
      `)
      .eq('due_date', today)
      .eq('completed', false)
      .eq('users.settings->>notifications', 'true');
    
    if (error) {
      console.error('Failed to get users with tasks for evening reminder:', error);
      return;
    }
    
    if (!usersWithTasks || usersWithTasks.length === 0) {
      console.log('📭 No users with incomplete tasks found');
      return;
    }
    
    // Group by user
    const userTasksMap = new Map();
    usersWithTasks.forEach(task => {
      const userId = task.user_id;
      if (!userTasksMap.has(userId)) {
        userTasksMap.set(userId, {
          user: task.users,
          taskCount: 0
        });
      }
      userTasksMap.get(userId).taskCount++;
    });
    
    let sentCount = 0;
    
    // Send evening reminders
    for (const [userId, data] of userTasksMap) {
      try {
        const { user, taskCount } = data;
        
        const message = `🌆 <b>Вечернее напоминание</b>\n\n` +
          `У вас осталось ${taskCount} незавершенных задач на сегодня.\n\n` +
          `💡 Завершите их сейчас или перенесите на завтра!`;
        
        const telegramService = require('../services/telegram');
        
        const keyboard = {
          inline_keyboard: [[{
            text: '📱 Открыть приложение',
            web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
          }]]
        };
        
        await telegramService.sendMessage(user.telegram_id, message, {
          reply_markup: keyboard
        });
        
        sentCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Failed to send evening reminder to user ${userId}:`, error.message);
      }
    }
    
    console.log(`✅ Evening reminder job completed: ${sentCount} reminders sent`);
    
  } catch (error) {
    console.error('❌ Evening reminder job failed:', error.message);
    throw error;
  }
};

// Reset notification flags job - runs daily at midnight
const runResetNotificationFlagsJob = async () => {
  try {
    console.log('🔄 Starting reset notification flags job...');
    
    await notificationsService.resetNotificationFlags();
    
    console.log('✅ Reset notification flags job completed');
    
  } catch (error) {
    console.error('❌ Reset notification flags job failed:', error.message);
    throw error;
  }
};

// Cleanup old notifications - runs weekly
const runCleanupNotificationsJob = async () => {
  try {
    console.log('🧹 Starting cleanup notifications job...');
    
    // Delete notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: deletedNotifications, error } = await supabase
      .from('notifications')
      .delete()
      .lt('sent_at', thirtyDaysAgo.toISOString())
      .select('id');
    
    if (error) {
      console.error('Failed to cleanup old notifications:', error);
      return;
    }
    
    const deletedCount = deletedNotifications?.length || 0;
    console.log(`✅ Cleanup notifications job completed: ${deletedCount} old notifications deleted`);
    
  } catch (error) {
    console.error('❌ Cleanup notifications job failed:', error.message);
    throw error;
  }
};

// Check notification delivery status
const runNotificationStatusCheckJob = async () => {
  try {
    console.log('📊 Starting notification status check job...');
    
    // Get notifications sent in last hour with 'sent' status
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    const { data: recentNotifications, error } = await supabase
      .from('notifications')
      .select('id, telegram_message_id, delivery_status')
      .gte('sent_at', oneHourAgo.toISOString())
      .eq('delivery_status', 'sent')
      .not('telegram_message_id', 'is', null);
    
    if (error) {
      console.error('Failed to get recent notifications:', error);
      return;
    }
    
    if (!recentNotifications || recentNotifications.length === 0) {
      console.log('📭 No recent notifications to check');
      return;
    }
    
    // For now, we assume all sent notifications are delivered
    // In the future, this could check with Telegram API for delivery status
    
    let updatedCount = 0;
    
    for (const notification of recentNotifications) {
      try {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ delivery_status: 'delivered' })
          .eq('id', notification.id);
        
        if (!updateError) {
          updatedCount++;
        }
      } catch (error) {
        console.error(`Failed to update notification ${notification.id}:`, error.message);
      }
    }
    
    console.log(`✅ Notification status check completed: ${updatedCount} notifications updated`);
    
  } catch (error) {
    console.error('❌ Notification status check job failed:', error.message);
    throw error;
  }
};

// Notification analytics job - runs daily
const runNotificationAnalyticsJob = async () => {
  try {
    console.log('📈 Starting notification analytics job...');
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Get yesterday's notification stats
    const { data: yesterdayStats, error } = await supabase
      .from('notifications')
      .select('delivery_status, type')
      .gte('sent_at', yesterdayStr)
      .lt('sent_at', today);
    
    if (error) {
      console.error('Failed to get notification stats:', error);
      return;
    }
    
    if (!yesterdayStats || yesterdayStats.length === 0) {
      console.log('📭 No notifications found for yesterday');
      return;
    }
    
    // Calculate stats
    const stats = {
      total: yesterdayStats.length,
      sent: yesterdayStats.filter(n => n.delivery_status === 'sent').length,
      delivered: yesterdayStats.filter(n => n.delivery_status === 'delivered').length,
      failed: yesterdayStats.filter(n => n.delivery_status === 'failed').length,
      byType: {}
    };
    
    yesterdayStats.forEach(notification => {
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
    });
    
    const deliveryRate = stats.total > 0 ? ((stats.delivered / stats.total) * 100).toFixed(1) : 0;
    
    console.log(`📊 Yesterday's notification stats:
      Total: ${stats.total}
      Sent: ${stats.sent}
      Delivered: ${stats.delivered}
      Failed: ${stats.failed}
      Delivery Rate: ${deliveryRate}%
      By Type: ${JSON.stringify(stats.byType)}
    `);
    
    // Could save to analytics table or send to external service here
    
    console.log('✅ Notification analytics job completed');
    
  } catch (error) {
    console.error('❌ Notification analytics job failed:', error.message);
    throw error;
  }
};

module.exports = {
  runNotificationJob,
  runMorningSummaryJob,
  runEveningReminderJob,
  runResetNotificationFlagsJob,
  runCleanupNotificationsJob,
  runNotificationStatusCheckJob,
  runNotificationAnalyticsJob
};
