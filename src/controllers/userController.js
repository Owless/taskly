const User = require('../models/User');
const Task = require('../models/Task');
const Donation = require('../models/Donation');
const logger = require('../utils/logger');
const { 
  userSettingsSchema, 
  validate 
} = require('../utils/validators');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { TIMEZONES, LANGUAGES } = require('../config/constants');

class UserController {
  // Получить профиль пользователя
  static async getProfile(req, res, next) {
    try {
      const user = req.user;
      const stats = await user.getStats();

      res.json({
        success: true,
        data: {
          user: user.toJSON(),
          stats
        }
      });

    } catch (error) {
      logger.error('Get profile failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Обновить профиль пользователя
  static async updateProfile(req, res, next) {
    try {
      const { first_name, last_name, timezone, language_code } = req.body;
      
      const updates = {};

      // Валидируем и обновляем имя
      if (first_name !== undefined) {
        if (!first_name || first_name.trim().length === 0) {
          throw new ValidationError('First name cannot be empty');
        }
        updates.first_name = first_name.trim();
      }

      // Валидируем и обновляем фамилию
      if (last_name !== undefined) {
        updates.last_name = last_name ? last_name.trim() : null;
      }

      // Валидируем часовой пояс
      if (timezone !== undefined) {
        if (!TIMEZONES[timezone]) {
          throw new ValidationError('Invalid timezone');
        }
        updates.timezone = timezone;
      }

      // Валидируем язык
      if (language_code !== undefined) {
        if (!LANGUAGES[language_code]) {
          throw new ValidationError('Invalid language code');
        }
        updates.language_code = language_code;
      }

      if (Object.keys(updates).length === 0) {
        throw new ValidationError('No valid updates provided');
      }

      await req.user.update(updates);

      logger.info('Profile updated', {
        userId: req.user.id,
        updates: Object.keys(updates)
      });

      res.json({
        success: true,
        data: {
          user: req.user.toJSON()
        },
        message: 'Profile updated successfully'
      });

    } catch (error) {
      logger.error('Update profile failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Получить настройки пользователя
  static async getSettings(req, res, next) {
    try {
      const user = req.user;

      res.json({
        success: true,
        data: {
          settings: user.settings,
          availableTimezones: TIMEZONES,
          availableLanguages: LANGUAGES
        }
      });

    } catch (error) {
      logger.error('Get settings failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Обновить настройки пользователя
  static async updateSettings(req, res, next) {
    try {
      // Валидируем настройки
      const newSettings = validate(userSettingsSchema, req.body);
      
      await req.user.updateSettings(newSettings);

      logger.info('Settings updated', {
        userId: req.user.id,
        settings: Object.keys(newSettings)
      });

      res.json({
        success: true,
        data: {
          settings: req.user.settings
        },
        message: 'Settings updated successfully'
      });

    } catch (error) {
      logger.error('Update settings failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Получить детальную статистику пользователя
  static async getStats(req, res, next) {
    try {
      const user = req.user;
      
      // Основная статистика задач
      const taskStats = await user.getStats();
      
      // Статистика пожертвований
      const donationStats = await Donation.getStats(user.id);
      
      // Недавние активности
      const recentTasks = await user.getActiveTasks(5);
      
      // Статистика за последние 30 дней
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { tasks: recentTasksCount } = await Task.findByUser(user.id, {
        limit: 1000,
        status: 'completed'
      });

      const completedLast30Days = recentTasksCount.filter(task => 
        new Date(task.completed_at) > thirtyDaysAgo
      ).length;

      res.json({
        success: true,
        data: {
          user: user.toJSON(),
          taskStats: {
            ...taskStats,
            completedLast30Days
          },
          donationStats,
          recentTasks: recentTasks.map(task => task.toJSON()),
          accountAge: Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
        }
      });

    } catch (error) {
      logger.error('Get stats failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Получить историю донатов пользователя
  static async getDonationHistory(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const options = {
        limit: Math.min(parseInt(limit), 100),
        offset: (parseInt(page) - 1) * parseInt(limit)
      };

      const result = await Donation.findByUser(req.user.id, options);

      res.json({
        success: true,
        data: {
          donations: result.donations.map(donation => donation.toJSON()),
          pagination: {
            total: result.total,
            page: parseInt(page),
            limit: parseInt(limit),
            hasMore: result.hasMore
          }
        }
      });

    } catch (error) {
      logger.error('Get donation history failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }

  // Экспорт данных пользователя
  static async exportData(req, res, next) {
    try {
      const user = req.user;
      
      // Получаем все задачи пользователя
      const { tasks } = await Task.findByUser(user.id, { 
        limit: 10000, 
        status: 'all' 
      });

      // Получаем историю донатов
      const { donations } = await Donation.findByUser(user.id, { 
        limit: 1000 
      });

      // Получаем статистику
      const stats = await user.getStats();

      const exportData = {
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          first_name: user.first_name,
          last_name: user.last_name,
          language_code: user.language_code,
          timezone: user.timezone,
          settings: user.settings,
          created_at: user.created_at
        },
        tasks: tasks.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          due_time: task.due_time,
          priority: task.priority,
          completed: task.completed,
          completed_at: task.completed_at,
          is_recurring: task.is_recurring,
          repeat_type: task.repeat_type,
          created_at: task.created_at
        })),
        donations: donations.map(donation => ({
          id: donation.id,
          amount_stars: donation.amount_stars,
          status: donation.status,
          description: donation.description,
          created_at: donation.created_at,
          paid_at: donation.paid_at
        })),
        stats,
        exportedAt: new Date().toISOString()
      };

      logger.info('User data exported', {
        userId: user.id,
        tasksCount: tasks.length,
        donationsCount: donations.length
      });

      res.json({
        success: true,
        data: exportData,
        message: 'Data exported successfully'
      });

    } catch (error) {
      logger.error('Export data failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Удалить аккаунт пользователя
  static async deleteAccount(req, res, next) {
    try {
      const { confirmation } = req.body;

      if (confirmation !== 'DELETE_MY_ACCOUNT') {
        throw new ValidationError('Please confirm account deletion by typing "DELETE_MY_ACCOUNT"');
      }

      const user = req.user;
      
      // Получаем статистику перед удалением для логирования
      const stats = await user.getStats();

      await user.delete();

      logger.info('User account deleted', {
        userId: user.id,
        telegramId: user.telegram_id,
        tasksCount: stats.total_tasks,
        donationsTotal: user.total_donated,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Account deleted successfully. All your data has been removed.'
      });

    } catch (error) {
      logger.error('Delete account failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Получить список доступных часовых поясов
  static async getTimezones(req, res, next) {
    try {
      res.json({
        success: true,
        data: {
          timezones: TIMEZONES,
          current: req.user.timezone
        }
      });

    } catch (error) {
      logger.error('Get timezones failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Получить список доступных языков
  static async getLanguages(req, res, next) {
    try {
      res.json({
        success: true,
        data: {
          languages: LANGUAGES,
          current: req.user.language_code
        }
      });

    } catch (error) {
      logger.error('Get languages failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Обновить последнюю активность пользователя
  static async updateActivity(req, res, next) {
    try {
      // Обновляем updated_at для отслеживания активности
      await req.user.update({ updated_at: new Date().toISOString() });

      res.json({
        success: true,
        message: 'Activity updated'
      });

    } catch (error) {
      logger.error('Update activity failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = UserController;
