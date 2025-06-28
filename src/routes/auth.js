const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/authController');
const { authenticateJWT } = require('../middleware/auth');
const { createValidationMiddleware } = require('../middleware/validation');
const rateLimit = require('../middleware/rateLimit');
const { telegramInitDataSchema } = require('../utils/validators');

// Валидация для Telegram login
const validateTelegramLogin = createValidationMiddleware(
  telegramInitDataSchema.keys({
    initData: telegramInitDataSchema.extract('initData').required()
  })
);

/**
 * @route POST /api/auth/telegram-login
 * @desc Аутентификация через Telegram WebApp
 * @access Public
 */
router.post('/telegram-login', 
  rateLimit.auth,
  validateTelegramLogin,
  AuthController.telegramLogin
);

/**
 * @route POST /api/auth/refresh-token
 * @desc Обновление JWT токена
 * @access Private
 */
router.post('/refresh-token', 
  authenticateJWT,
  AuthController.refreshToken
);

/**
 * @route POST /api/auth/logout
 * @desc Выход из системы
 * @access Private
 */
router.post('/logout', 
  authenticateJWT,
  AuthController.logout
);

/**
 * @route GET /api/auth/me
 * @desc Получить информацию о текущем пользователе
 * @access Private
 */
router.get('/me', 
  authenticateJWT,
  AuthController.me
);

/**
 * @route GET /api/auth/check
 * @desc Проверить статус аутентификации
 * @access Private
 */
router.get('/check', 
  authenticateJWT,
  AuthController.checkAuth
);

/**
 * @route DELETE /api/auth/account
 * @desc Удалить аккаунт пользователя
 * @access Private
 */
router.delete('/account', 
  authenticateJWT,
  rateLimit.auth,
  AuthController.deleteAccount
);

module.exports = router;
