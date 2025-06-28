const express = require('express');
const router = express.Router();

const DonationController = require('../controllers/donationController');
const { authenticateJWT, requireAdmin, loadResource, requireOwnership } = require('../middleware/auth');
const { 
  createValidationMiddleware, 
  validateUUID, 
  validatePagination 
} = require('../middleware/validation');
const rateLimit = require('../middleware/rateLimit');
const { donationSchema } = require('../utils/validators');

// Middleware для валидации
const validateDonation = createValidationMiddleware(donationSchema);

// Middleware для загрузки пожертвования с проверкой прав
const loadDonationWithOwnership = [
  validateUUID('id'),
  loadResource('donations', 'id'),
  requireOwnership('user_id')
];

/**
 * @route GET /api/donations/presets
 * @desc Получить предустановленные суммы
 * @access Private
 */
router.get('/presets', 
  authenticateJWT,
  DonationController.getPresets
);

/**
 * @route POST /api/donations/invoice
 * @desc Создать инвойс для пожертвования
 * @access Private
 */
router.post('/invoice', 
  authenticateJWT,
  rateLimit.donation,
  validateDonation,
  DonationController.createInvoice
);

/**
 * @route POST /api/donations/pre-checkout
 * @desc Обработать pre-checkout запрос
 * @access Public (вызывается Telegram)
 */
router.post('/pre-checkout', 
  DonationController.handlePreCheckout
);

/**
 * @route POST /api/donations/successful-payment
 * @desc Обработать успешный платеж
 * @access Public (вызывается Telegram)
 */
router.post('/successful-payment', 
  DonationController.handleSuccessfulPayment
);

/**
 * @route GET /api/donations
 * @desc Получить историю пожертвований пользователя
 * @access Private
 */
router.get('/', 
  authenticateJWT,
  validatePagination,
  DonationController.getUserDonations
);

/**
 * @route GET /api/donations/stats
 * @desc Получить статистику пожертвований пользователя
 * @access Private
 */
router.get('/stats', 
  authenticateJWT,
  DonationController.getUserDonationStats
);

/**
 * @route GET /api/donations/admin/stats
 * @desc Получить общую статистику пожертвований (админ)
 * @access Admin
 */
router.get('/admin/stats', 
  authenticateJWT,
  requireAdmin,
  DonationController.getAllDonationStats
);

/**
 * @route GET /api/donations/admin/top-donors
 * @desc Получить топ спонсоров (админ)
 * @access Admin
 */
router.get('/admin/top-donors', 
  authenticateJWT,
  requireAdmin,
  DonationController.getTopDonors
);

/**
 * @route GET /api/donations/:id
 * @desc Получить конкретное пожертвование
 * @access Private
 */
router.get('/:id', 
  authenticateJWT,
  ...loadDonationWithOwnership,
  DonationController.getDonation
);

module.exports = router;
