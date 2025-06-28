const express = require('express');
const router = express.Router();

const UserController = require('../controllers/userController');
const { authenticateJWT } = require('../middleware/auth');
const { 
  createValidationMiddleware, 
  validatePagination 
} = require('../middleware/validation');
const rateLimit = require('../middleware/rateLimit');
const { userSettingsSchema } = require('../utils/validators');

// Middleware для валидации
const validateUserSettings = createValidationMiddleware(userSettingsSchema);

/**
 * @route GET /api/users/profile
 * @desc Получить профиль пользователя
 * @access Private
 */
router.get('/profile', 
  authenticateJWT,
  UserController.getProfile
);

/**
 * @route PUT /api/users/profile
 * @desc Обновить профиль пользователя
 * @access Private
 */
router.put('/profile', 
  authenticateJWT,
  UserController.updateProfile
);

/**
 * @route GET /api/users/settings
 * @desc Получить настройки пользователя
 * @access Private
 */
router.get('/settings', 
  authenticateJWT,
  UserController.getSettings
);

/**
 * @route PUT /api/users/settings
 * @desc Обновить настройки пользователя
 * @access Private
 */
router.put('/settings', 
  authenticateJWT,
  validateUserSettings,
  UserController.updateSettings
);

/**
 * @route GET /api/users/stats
 * @desc Получить статистику пользователя
 * @access Private
 */
router.get('/stats', 
  authenticateJWT,
  UserController.getStats
);

/**
 * @route GET /api/users/donations
 * @desc Получить историю пожертвований
 * @access Private
 */
router.get('/donations', 
  authenticateJWT,
  validatePagination,
  UserController.getDonationHistory
);

/**
 * @route GET /api/users/export
 * @desc Экспорт данных пользователя
 * @access Private
 */
router.get('/export', 
  authenticateJWT,
  rateLimit.auth,
  UserController.exportData
);

/**
 * @route DELETE /api/users/account
 * @desc Удалить аккаунт пользователя
 * @access Private
 */
router.delete('/account', 
  authenticateJWT,
  rateLimit.auth,
  UserController.deleteAccount
);

/**
 * @route GET /api/users/timezones
 * @desc Получить список доступных часовых поясов
 * @access Private
 */
router.get('/timezones', 
  authenticateJWT,
  UserController.getTimezones
);

/**
 * @route GET /api/users/languages
 * @desc Получить список доступных языков
 * @access Private
 */
router.get('/languages', 
  authenticateJWT,
  UserController.getLanguages
);

/**
 * @route POST /api/users/activity
 * @desc Обновить активность пользователя
 * @access Private
 */
router.post('/activity', 
  authenticateJWT,
  UserController.updateActivity
);

module.exports = router;
