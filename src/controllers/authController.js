const { generateToken } = require('../middleware/auth');
const { validateTelegramWebAppData } = require('../utils/telegramAuth');
const User = require('../models/User');
const logger = require('../utils/logger');
const { AuthenticationError, ValidationError } = require('../middleware/errorHandler');

class AuthController {
  // Аутентификация через Telegram WebApp
  static async telegramLogin(req, res, next) {
    try {
      const { initData } = req.body;

      if (!initData) {
        throw new ValidationError('initData is required');
      }

      // Валидируем данные Telegram
      const validation = validateTelegramWebAppData(initData);
      
      if (!validation.isValid) {
        throw new AuthenticationError(`Invalid Telegram data: ${validation.error}`);
      }

      const telegramUser = validation.user;

      // Находим или создаем пользователя
      let user = await User.findByTelegramId(telegramUser.id);
      
      if (!user) {
        user = await User.create({
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          language_code: telegramUser.language_code || 'ru'
        });

        logger.info('New user registered via Telegram WebApp', {
          userId: user.id,
          telegramId: user.telegram_id,
          username: user.telegram_username
        });
      } else {
        // Обновляем данные пользователя
        await user.updateTelegramData(telegramUser);
        
        logger.info('User logged in via Telegram WebApp', {
          userId: user.id,
          telegramId: user.telegram_id
        });
      }

      // Генерируем JWT токен
      const token = generateToken({
        userId: user.id,
        telegramId: user.telegram_id
      });

      // Получаем статистику пользователя
      const stats = await user.getStats();

      res.json({
        success: true,
        data: {
          user: user.toJSON(),
          token,
          stats,
          isNewUser: user.isNewUser()
        },
        message: user.isNewUser() ? 'Welcome to Taskly!' : 'Welcome back!'
      });

    } catch (error) {
      logger.error('Telegram login failed', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next(error);
    }
  }

  // Обновление токена
  static async refreshToken(req, res, next) {
    try {
      // Пользователь уже аутентифицирован через middleware
      const user = req.user;

      // Генерируем новый токен
      const newToken = generateToken({
        userId: user.id,
        telegramId: user.telegram_id
      });

      logger.info('Token refreshed', {
        userId: user.id,
        telegramId: user.telegram_id
      });

      res.json({
        success: true,
        data: {
          token: newToken,
          user: user.toJSON()
        },
        message: 'Token refreshed successfully'
      });

    } catch (error) {
      logger.error('Token refresh failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Выход из системы (опциональная функция)
  static async logout(req, res, next) {
    try {
      // В JWT нет server-side session, поэтому просто логируем
      logger.info('User logged out', {
        userId: req.user?.id,
        telegramId: req.user?.telegram_id
      });

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Проверка текущего пользователя
  static async me(req, res, next) {
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
      logger.error('Get current user failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Удаление аккаунта пользователя
  static async deleteAccount(req, res, next) {
    try {
      const user = req.user;
      const { confirmation } = req.body;

      // Требуем подтверждения
      if (confirmation !== 'DELETE_MY_ACCOUNT') {
        throw new ValidationError('Account deletion requires confirmation');
      }

      // Удаляем пользователя (cascade удалит все связанные данные)
      await user.delete();

      logger.info('User account deleted', {
        userId: user.id,
        telegramId: user.telegram_id,
        ip: req.ip
      });

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      logger.error('Account deletion failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Проверка статуса аутентификации
  static async checkAuth(req, res, next) {
    try {
      // Если middleware пропустил запрос, значит пользователь аутентифицирован
      res.json({
        success: true,
        data: {
          authenticated: true,
          user: req.user.toJSON()
        }
      });

    } catch (error) {
      logger.error('Auth check failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = AuthController;
