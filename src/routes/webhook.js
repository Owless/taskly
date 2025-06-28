const express = require('express');
const router = express.Router();

const WebhookController = require('../controllers/webhookController');
const { requireAdmin, authenticateJWT } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

/**
 * @route POST /webhook/telegram
 * @desc Основной webhook для Telegram Bot API
 * @access Public (вызывается Telegram)
 */
router.post('/telegram', 
  rateLimit.webhook,
  WebhookController.handleTelegramWebhook
);

/**
 * @route GET /webhook/health
 * @desc Health check для webhook
 * @access Public
 */
router.get('/health', 
  WebhookController.healthCheck
);

/**
 * @route GET /webhook/stats
 * @desc Статистика webhook (админ)
 * @access Admin
 */
router.get('/stats', 
  authenticateJWT,
  requireAdmin,
  WebhookController.getWebhookStats
);

module.exports = router;
