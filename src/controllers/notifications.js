const { executeWithUserContext } = require('../config/supabase');
const notificationsService = require('../services/notifications');

// Get notification settings
const getSettings = async (req, res) => {
  try {
    const userId = req.userId;
    
    const settings = await notificationsService.getNotificationSettings(userId);
    
    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get notification settings error:', error.message);
    res.status(500).json({
      error: 'Failed to get notification settings'
    });
  }
};

// Update notification settings
const updateSettings = async (req, res) => {
  try {
    const userId = req.userId;
    const updates = req.body;

    // Get current user settings
    const { supabase } = require('../config/supabase');
    const { data: user, error: getUserError } = await supabase
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    if (getUserError) {
      throw getUserError;
    }

    // Merge settings
    const currentSettings = user.settings || {};
    const newSettings = {
      ...currentSettings,
      ...updates.settings
    };

    // Update user settings
    await notificationsService.updateNotificationSettings(userId, newSettings);

    // Also update other user fields if provided
    const userUpdates = {};
    if (updates.language_code) userUpdates.language_code = updates.language_code;
    if (updates.timezone) userUpdates.timezone = updates.timezone;

    if (Object.keys(userUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', userId);

      if (updateError) {
        console.error('Update user fields error:', updateError);
      }
    }

    res.json({
      success: true,
      message: 'Notification settings updated successfully'
    });

  } catch (error) {
    console.error('Update notification settings error:', error.message);
    res.status(500).json({
      error: 'Failed to update notification settings'
    });
  }
};

// Send test notification
const sendTestNotification = async (req, res) => {
  try {
    const userId = req.userId;
    const user = req.user;

    // Check if notifications are enabled
    if (!user.settings?.notifications) {
      return res.status(400).json({
        error: 'Notifications are disabled'
      });
    }

    // Create a test task for notification
    const testTask = {
      id: 'test',
      user_id: userId,
      telegram_id: user.telegram_id,
      title: 'Тестовое уведомление 🧪',
      due_date: new Date().toISOString().split('T')[0],
      due_time: new Date().toTimeString().slice(0, 5),
      priority: 'medium',
      notification_type: 'reminder'
    };

    await notificationsService.sendTaskNotification(testTask);

    res.json({
      success: true,
      message: 'Test notification sent successfully'
    });

  } catch (error) {
    console.error('Send test notification error:', error.message);
    res.status(500).json({
      error: 'Failed to send test notification'
    });
  }
};

// Get notification history
const getHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0, type } = req.query;

    const notifications = await executeWithUserContext(userId, async (supabase) => {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          tasks(title, due_date)
        `)
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    });

    // Get total count
    const totalCount = await executeWithUserContext(userId, async (supabase) => {
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (type) {
        query = query.eq('type', type);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count;
    });

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get notification history error:', error.message);
    res.status(500).json({
      error: 'Failed to get notification history'
    });
  }
};

// Mark notifications as read (future feature)
const markAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        error: 'Notification IDs array is required'
      });
    }

    await executeWithUserContext(userId, async (supabase) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('id', notificationIds);

      if (error) throw error;
    });

    res.json({
      success: true,
      message: 'Notifications marked as read'
    });

  } catch (error) {
    console.error('Mark notifications as read error:', error.message);
    res.status(500).json({
      error: 'Failed to mark notifications as read'
    });
  }
};

// Get notification statistics
const getStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await executeWithUserContext(userId, async (supabase) => {
      // Get notification counts by type
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('type, delivery_status, sent_at')
        .eq('user_id', userId);

      if (error) throw error;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(todayStart);
      monthStart.setMonth(monthStart.getMonth() - 1);

      const stats = {
        total: notifications.length,
        byType: {},
        byStatus: {},
        today: 0,
        thisWeek: 0,
        thisMonth: 0
      };

      notifications.forEach(notification => {
        // By type
        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
        
        // By status
        stats.byStatus[notification.delivery_status] = (stats.byStatus[notification.delivery_status] || 0) + 1;
        
        // By time period
        const sentAt = new Date(notification.sent_at);
        if (sentAt >= todayStart) stats.today++;
        if (sentAt >= weekStart) stats.thisWeek++;
        if (sentAt >= monthStart) stats.thisMonth++;
      });

      return stats;
    });

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get notification stats error:', error.message);
    res.status(500).json({
      error: 'Failed to get notification statistics'
    });
  }
};

// Delete notification history
const deleteHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const { olderThan } = req.query; // ISO date string

    let deleteBefore = new Date();
    deleteBefore.setMonth(deleteBefore.getMonth() - 1); // Default: 1 month old

    if (olderThan) {
      deleteBefore = new Date(olderThan);
    }

    const deletedCount = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .lt('sent_at', deleteBefore.toISOString())
        .select('id');

      if (error) throw error;
      return data?.length || 0;
    });

    res.json({
      success: true,
      message: `Deleted ${deletedCount} old notifications`,
      deletedCount
    });

  } catch (error) {
    console.error('Delete notification history error:', error.message);
    res.status(500).json({
      error: 'Failed to delete notification history'
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  sendTestNotification,
  getHistory,
  markAsRead,
  getStats,
  deleteHistory
};
