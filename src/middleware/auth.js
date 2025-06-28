// src/middleware/auth.js
// Middleware для проверки JWT токенов

const jwt = require('jsonwebtoken');
const { query, setUserContext } = require('../config/database');

// Middleware для проверки авторизации
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Токен авторизации отсутствует'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      // Проверяем JWT токен
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Ищем пользователя в базе данных
      const result = await query(
        'SELECT id, telegram_id, first_name, last_name, telegram_username, language_code, timezone, settings FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (!result.rows || result.rows.length === 0) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Пользователь не найден'
        });
      }

      const user = result.rows[0];
      
      // Добавляем пользователя в объект запроса
      req.user = user;
      req.userId = user.id;
      req.telegramId = user.telegram_id;
      
      // Устанавливаем контекст пользователя для RLS
      await setUserContext(user.id);
      
      next();
      
    } catch (jwtError) {
      console.error('❌ Ошибка проверки JWT:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Токен истек',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный токен'
      });
    }

  } catch (error) {
    console.error('❌ Ошибка middleware авторизации:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка сервера при проверке авторизации'
    });
  }
};

// Опциональная авторизация (не выдает ошибку если токен отсутствует)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Если токена нет, просто продолжаем без пользователя
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const result = await query(
        'SELECT id, telegram_id, first_name, last_name, telegram_username, language_code, timezone, settings FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (result.rows && result.rows.length > 0) {
        const user = result.rows[0];
        req.user = user;
        req.userId = user.id;
        req.telegramId = user.telegram_id;
        
        await setUserContext(user.id);
      }
      
    } catch (jwtError) {
      // Игнорируем ошибки JWT при опциональной авторизации
      console.warn('⚠️ Ошибка опциональной авторизации:', jwtError.message);
    }

    next();
    
  } catch (error) {
    console.error('❌ Ошибка опциональной авторизации:', error);
    // При ошибке продолжаем без авторизации
    next();
  }
};

// Middleware для проверки прав администратора (если понадобится)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Требуется авторизация'
    });
  }

  // Проверяем, является ли пользователь администратором
  // Можно добавить поле is_admin в таблицу users или проверять по telegram_id
  const adminTelegramIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim()));
  
  if (!adminTelegramIds.includes(req.user.telegram_id)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Недостаточно прав'
    });
  }

  next();
};

// Middleware для rate limiting по пользователю
const createUserRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.userId;
    
    if (!userId) {
      return next(); // Если пользователь не авторизован, пропускаем rate limiting
    }
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Получаем запросы пользователя
    let userRequests = requests.get(userId) || [];
    
    // Фильтруем запросы в текущем окне
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Слишком много запросов, попробуйте позже',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Добавляем текущий запрос
    userRequests.push(now);
    requests.set(userId, userRequests);
    
    // Очистка старых записей
    if (Math.random() < 0.01) { // 1% вероятность очистки
      for (const [key, timestamps] of requests.entries()) {
        const filtered = timestamps.filter(t => t > windowStart);
        if (filtered.length === 0) {
          requests.delete(key);
        } else {
          requests.set(key, filtered);
        }
      }
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  createUserRateLimit
};
