const express = require('express');
const router = express.Router();

// Middleware
const { authenticateToken } = require('../middleware/auth');
const { validate, validateParams, schemas } = require('../middleware/validation');

// Controllers
const authController = require('../controllers/auth');
const tasksController = require('../controllers/tasks');
const donationsController = require('../controllers/donations');
const notificationsController = require('../controllers/notifications');

// Auth routes (no authentication required)
router.post('/auth/login', authController.authenticateUser);

// Protected routes (authentication required)
router.use(authenticateToken);

// ===== AUTH ROUTES =====
router.get('/auth/me', authController.getCurrentUser);
router.post('/auth/refresh', authController.refreshToken);

// ===== TASK ROUTES =====
// Get tasks with filtering
router.get('/tasks', 
  validate(schemas.task.filter, 'query'),
  tasksController.getTasks
);

// Get single task
router.get('/tasks/:taskId', 
  validateParams.taskId,
  tasksController.getTask
);

// Create new task
router.post('/tasks', 
  validate(schemas.task.create),
  tasksController.createTask
);

// Update task
router.put('/tasks/:taskId', 
  validateParams.taskId,
  validate(schemas.task.update),
  tasksController.updateTask
);

// Toggle task completion
router.patch('/tasks/:taskId/toggle', 
  validateParams.taskId,
  tasksController.toggleTask
);

// Delete task
router.delete('/tasks/:taskId', 
  validateParams.taskId,
  tasksController.deleteTask
);

// Get user statistics
router.get('/tasks/stats', tasksController.getStats);

// ===== DONATION ROUTES =====
// Get donation tiers
router.get('/donations/tiers', donationsController.getDonationTiers);

// Create donation
router.post('/donations', 
  validate(schemas.donation.create),
  donationsController.createDonation
);

// Get user donations
router.get('/donations', donationsController.getDonations);

// Get donation statistics
router.get('/donations/stats', donationsController.getDonationStats);

// ===== NOTIFICATION ROUTES =====
// Get notification settings
router.get('/notifications/settings', notificationsController.getSettings);

// Update notification settings
router.put('/notifications/settings', 
  validate(schemas.user.updateSettings),
  notificationsController.updateSettings
);

// Send test notification
router.post('/notifications/test', notificationsController.sendTestNotification);

// Get notification history
router.get('/notifications/history', notificationsController.getHistory);

// ===== USER ROUTES =====
// Update user settings
router.put('/user/settings', 
  validate(schemas.user.updateSettings),
  async (req, res) => {
    try {
      const userId = req.userId;
      const updates = req.body;

      const { supabase } = require('../config/supabase');
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });

    } catch (error) {
      console.error('Update user settings error:', error.message);
      res.status(500).json({
        error: 'Failed to update settings'
      });
    }
  }
);

// Get user profile
router.get('/user/profile', async (req, res) => {
  try {
    const user = req.user;
    
    // Get additional stats
    const { supabase } = require('../config/supabase');
    const { data: stats } = await supabase
      .from('user_task_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          telegram_username: user.telegram_username,
          first_name: user.first_name,
          last_name: user.last_name,
          language_code: user.language_code,
          timezone: user.timezone,
          settings: user.settings,
          total_donated: user.total_donated,
          created_at: user.created_at
        },
        stats: stats || {
          total_tasks: 0,
          completed_tasks: 0,
          active_tasks: 0,
          today_tasks: 0,
          overdue_tasks: 0,
          completion_rate: 0
        }
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error.message);
    res.status(500).json({
      error: 'Failed to get user profile'
    });
  }
});

// ===== RECURRING TASKS ROUTES =====
const recurringService = require('../services/recurring');

// Get recurring task info
router.get('/tasks/:taskId/recurring', 
  validateParams.taskId,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.userId;

      const info = await recurringService.getRecurringTaskInfo(taskId, userId);

      res.json({
        success: true,
        data: info
      });

    } catch (error) {
      console.error('Get recurring task info error:', error.message);
      res.status(500).json({
        error: 'Failed to get recurring task info'
      });
    }
  }
);

// Stop recurring task
router.post('/tasks/:taskId/stop-recurring', 
  validateParams.taskId,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.userId;

      const task = await recurringService.stopRecurringTask(taskId, userId);

      res.json({
        success: true,
        data: task,
        message: 'Recurring task stopped successfully'
      });

    } catch (error) {
      console.error('Stop recurring task error:', error.message);
      res.status(500).json({
        error: 'Failed to stop recurring task'
      });
    }
  }
);

// ===== UTILITY ROUTES =====
// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    user_id: req.userId
  });
});

// Get app info
router.get('/info', async (req, res) => {
  try {
    const telegramService = require('../services/telegram');
    const botInfo = await telegramService.getBotInfo();

    res.json({
      success: true,
      data: {
        app: {
          name: 'Taskly',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        },
        bot: {
          username: botInfo.username,
          first_name: botInfo.first_name
        },
        features: {
          recurring_tasks: true,
          notifications: true,
          donations: true
        }
      }
    });

  } catch (error) {
    console.error('Get app info error:', error.message);
    res.status(500).json({
      error: 'Failed to get app info'
    });
  }
});

module.exports = router;
