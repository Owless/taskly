const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../config/environment');
const logger = require('../utils/logger');

// Основной rate limiter
const createRateLimit = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || RATE_LIMIT.WINDOW_MS,
    max: options.max || RATE_LIMIT.MAX_REQUESTS,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Кастомный ключ для идентификации пользователя
    keyGenerator: (req) => {
      // Используем Telegram ID если доступен
      if (req.user?.telegram_id) {
        return `user_${req.user.telegram_id}`;
      }
      // Иначе IP адрес
      return req.ip;
    },
    // Обработчик превышения лимита
    onLimitReached: (req, res, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        telegramId: req.user?.telegram_id,
        url: req.url,
        method: req.method
      });
    }
  });
};

// Разные лимиты для разных эндпоинтов
const rateLimiters = {
  // Общий лимит для API
  general: createRateLimit(),

  // Строгий лимит для аутентификации
  auth: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 10 // 10 попыток
  }),

  // Лимит для создания задач
  createTask: createRateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 20 // 20 задач в минуту
  }),

  // Лимит для пожертвований
  donation: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 5 // 5 попыток в час
  }),

  // Лимит для webhook (более строгий)
  webhook: createRateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 100, // 100 запросов в минуту
    keyGenerator: (req) => req.ip // Только по IP
  })
};

module.exports = rateLimiters.general;
module.exports.auth = rateLimiters.auth;
module.exports.createTask = rateLimiters.createTask;
module.exports.donation = rateLimiters.donation;
module.exports.webhook = rateLimiters.webhook;
