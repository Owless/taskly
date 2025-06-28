const crypto = require('crypto');
const { TELEGRAM } = require('../config/environment');
const logger = require('./logger');

/**
 * Валидация initData от Telegram WebApp (ПРОДАКШН ВЕРСИЯ)
 * Следует официальной документации Telegram WebApp
 */
const validateTelegramWebAppData = (initData) => {
  try {
    if (!initData || typeof initData !== 'string') {
      throw new Error('initData is required and must be a string');
    }

    // Парсим строку initData
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      throw new Error('Hash parameter is missing');
    }
    
    // Удаляем hash из параметров для проверки
    urlParams.delete('hash');
    
    // Создаем строку для проверки подписи
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Создаем секретный ключ согласно документации Telegram
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(TELEGRAM.BOT_TOKEN)
      .digest();
    
    // Вычисляем ожидаемый hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Сравниваем hash'и (защита от timing attacks)
    if (!crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'))) {
      throw new Error('Data integrity check failed');
    }
    
    // Проверяем время авторизации (не старше 24 часов)
    const authDate = parseInt(urlParams.get('auth_date'));
    if (isNaN(authDate)) {
      throw new Error('Invalid auth_date parameter');
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 часа в секундах
    
    if (currentTime - authDate > maxAge) {
      throw new Error('Data is expired (older than 24 hours)');
    }
    
    // Парсим и валидируем данные пользователя
    const userDataString = urlParams.get('user');
    if (!userDataString) {
      throw new Error('User data parameter is missing');
    }
    
    let userData;
    try {
      userData = JSON.parse(userDataString);
    } catch (parseError) {
      throw new Error('Invalid user data format');
    }
    
    // Валидируем структуру данных пользователя
    if (!userData.id || typeof userData.id !== 'number') {
      throw new Error('Invalid user ID');
    }
    
    if (!userData.first_name || typeof userData.first_name !== 'string') {
      throw new Error('Invalid user first_name');
    }
    
    logger.info('Telegram WebApp data validated successfully', {
      userId: userData.id,
      authDate: new Date(authDate * 1000).toISOString()
    });
    
    return {
      isValid: true,
      user: {
        id: userData.id,
        first_name: userData.first_name.trim(),
        last_name: userData.last_name?.trim() || null,
        username: userData.username?.trim() || null,
        language_code: userData.language_code || 'en',
        is_premium: userData.is_premium || false
      },
      authDate: authDate,
      raw: initData
    };
    
  } catch (error) {
    logger.warn('Telegram WebApp data validation failed', {
      error: error.message,
      initDataLength: initData?.length || 0
    });
    
    return {
      isValid: false,
      error: error.message,
      user: null,
      authDate: null
    };
  }
};

/**
 * Валидация webhook данных от Telegram Bot API
 */
const validateTelegramWebhook = (body, secretToken) => {
  try {
    const receivedToken = body?.secret_token;
    
    if (!receivedToken) {
      throw new Error('Secret token is missing');
    }
    
    // Используем timing-safe сравнение
    if (!crypto.timingSafeEqual(
      Buffer.from(receivedToken, 'utf8'),
      Buffer.from(secretToken, 'utf8')
    )) {
      throw new Error('Invalid secret token');
    }
    
    return { isValid: true };
    
  } catch (error) {
    logger.warn('Telegram webhook validation failed', {
      error: error.message
    });
    
    return {
      isValid: false,
      error: error.message
    };
  }
};

/**
 * Извлечение и валидация initData из заголовков
 */
const extractInitDataFromRequest = (req) => {
  // Проверяем разные возможные источники initData
  const initData = 
    req.headers['x-telegram-init-data'] ||
    req.body?.initData ||
    req.query?.initData;
    
  if (!initData) {
    throw new Error('Telegram initData not found in request');
  }
  
  return initData;
};

/**
 * Middleware для валидации Telegram WebApp запросов
 */
const validateTelegramRequest = (req, res, next) => {
  try {
    const initData = extractInitDataFromRequest(req);
    const validation = validateTelegramWebAppData(initData);
    
    if (!validation.isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TELEGRAM_DATA',
          message: 'Invalid Telegram WebApp data',
          details: validation.error
        }
      });
    }
    
    // Добавляем данные Telegram в запрос
    req.telegramData = validation;
    next();
    
  } catch (error) {
    logger.error('Telegram request validation error', {
      error: error.message,
      url: req.url,
      method: req.method
    });
    
    res.status(400).json({
      success: false,
      error: {
        code: 'TELEGRAM_VALIDATION_ERROR',
        message: error.message
      }
    });
  }
};

module.exports = {
  validateTelegramWebAppData,
  validateTelegramWebhook,
  extractInitDataFromRequest,
  validateTelegramRequest
};
