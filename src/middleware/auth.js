const jwt = require('jsonwebtoken');
const { JWT } = require('../config/environment');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');
const database = require('../config/database');
const logger = require('../utils/logger');

// Генерация JWT токена
const generateToken = (payload) => {
  return jwt.sign(payload, JWT.SECRET, {
    expiresIn: JWT.EXPIRE,
    issuer: 'taskly-backend',
    audience: 'taskly-miniapp'
  });
};

// Верификация JWT токена
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT.SECRET, {
      issuer: 'taskly-backend',
      audience: 'taskly-miniapp'
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid token');
    }
    throw error;
  }
};

// Middleware для проверки аутентификации
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization header required');
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    // Получаем пользователя из базы данных
    const supabase = database.getClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      throw new AuthenticationError('User not found');
    }

    // Устанавливаем контекст пользователя для RLS
    await database.setUserContext(user.id);

    // Добавляем пользователя в запрос
    req.user = user;
    req.token = decoded;

    next();
  } catch (error) {
    next(error);
  }
};

// Опциональная аутентификация (для публичных эндпоинтов)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      const supabase = database.getClient();
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .single();

      if (!error && user) {
        await database.setUserContext(user.id);
        req.user = user;
        req.token = decoded;
      }
    }

    next();
  } catch (error) {
    // Игнорируем ошибки в опциональной аутентификации
    next();
  }
};

// Проверка прав администратора
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError());
  }

  // Проверяем, является ли пользователь администратором
  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
  if (adminTelegramId && req.user.telegram_id.toString() === adminTelegramId) {
    req.isAdmin = true;
    return next();
  }

  next(new AuthorizationError('Admin access required'));
};

// Проверка владения ресурсом
const requireOwnership = (resourceField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    // Ресурс должен быть добавлен в req предыдущими middleware
    const resource = req.resource;
    if (!resource) {
      return next(new Error('Resource not found in request'));
    }

    if (resource[resourceField] !== req.user.id) {
      return next(new AuthorizationError('Access denied to this resource'));
    }

    next();
  };
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  optionalAuth,
  requireAdmin,
  requireOwnership
};
