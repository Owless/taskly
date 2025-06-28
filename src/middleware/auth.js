const jwt = require('jsonwebtoken');
const { JWT } = require('../config/environment');
const { AuthenticationError, AuthorizationError } = require('./errorHandler');
const { validateTelegramWebAppData } = require('../utils/telegramAuth');
const database = require('../config/database');
const logger = require('../utils/logger');

// Генерация JWT токена
const generateToken = (payload, options = {}) => {
  const tokenPayload = {
    userId: payload.userId,
    telegramId: payload.telegramId,
    iat: Math.floor(Date.now() / 1000),
    ...payload
  };

  return jwt.sign(tokenPayload, JWT.SECRET, {
    expiresIn: options.expiresIn || JWT.EXPIRE,
    issuer: 'taskly-backend',
    audience: 'taskly-miniapp',
    subject: payload.userId.toString()
  });
};

// Верификация JWT токена
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT.SECRET, {
      issuer: 'taskly-backend',
      audience: 'taskly-miniapp'
    });

    // Проверяем обязательные поля
    if (!decoded.userId || !decoded.telegramId) {
      throw new AuthenticationError('Invalid token payload');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid token format');
    } else if (error.name === 'NotBeforeError') {
      throw new AuthenticationError('Token not active yet');
    }
    throw error;
  }
};

// Middleware для Telegram WebApp аутентификации
const authenticateTelegramWebApp = async (req, res, next) => {
  try {
    // Извлекаем initData из заголовков или тела запроса
    const initData = 
      req.headers['x-telegram-init-data'] ||
      req.body?.initData ||
      req.query?.initData;

    if (!initData) {
      throw new AuthenticationError('Telegram initData required');
    }

    // Валидируем данные Telegram
    const validation = validateTelegramWebAppData(initData);
    
    if (!validation.isValid) {
      throw new AuthenticationError(`Invalid Telegram data: ${validation.error}`);
    }

    const telegramUser = validation.user;

    // Ищем или создаем пользователя в базе данных
    const supabase = database.getClient();
    
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      logger.error('Database error during user lookup', { error, telegramId: telegramUser.id });
      throw new Error('Database error');
    }

    // Создаем пользователя если не существует
    if (!user) {
      const newUser = {
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        language_code: telegramUser.language_code || 'ru'
      };

      const { data: createdUser, error: createError } = await supabase
        .from('users')
        .insert([newUser])
        .select()
        .single();

      if (createError) {
        logger.error('Failed to create user', { error: createError, telegramUser });
        throw new Error('Failed to create user account');
      }

      user = createdUser;
      logger.info('New user created', { userId: user.id, telegramId: user.telegram_id });
    } else {
      // Обновляем данные пользователя если изменились
      const updates = {};
      
      if (user.telegram_username !== telegramUser.username) {
        updates.telegram_username = telegramUser.username;
      }
      if (user.first_name !== telegramUser.first_name) {
        updates.first_name = telegramUser.first_name;
      }
      if (user.last_name !== telegramUser.last_name) {
        updates.last_name = telegramUser.last_name;
      }
      if (user.language_code !== telegramUser.language_code) {
        updates.language_code = telegramUser.language_code;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id);

        if (updateError) {
          logger.warn('Failed to update user data', { error: updateError, userId: user.id });
        } else {
          Object.assign(user, updates);
          logger.info('User data updated', { userId: user.id, updates });
        }
      }
    }

    // Устанавливаем контекст пользователя для RLS
    await database.setUserContext(user.id);

    // Генерируем JWT токен
    const token = generateToken({
      userId: user.id,
      telegramId: user.telegram_id
    });

    // Добавляем данные в запрос
    req.user = user;
    req.telegramData = validation;
    req.authToken = token;

    next();
  } catch (error) {
    logger.warn('Telegram WebApp authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next(error);
  }
};

// Middleware для JWT аутентификации
const authenticateJWT = async (req, res, next) => {
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

    // Проверяем, что Telegram ID совпадает
    if (user.telegram_id !== decoded.telegramId) {
      throw new AuthenticationError('Token telegram_id mismatch');
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

// Опциональная аутентификация
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await authenticateJWT(req, res, next);
    } else {
      next();
    }
  } catch (error) {
    // Игнорируем ошибки в опциональной аутентификации
    logger.debug('Optional auth failed', { error: error.message });
    next();
  }
};

// Проверка прав администратора
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError());
  }

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

// Middleware для извлечения ресурса по ID
const loadResource = (table, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[idParam];
      
      if (!resourceId) {
        return next(new Error(`Parameter ${idParam} is required`));
      }

      const supabase = database.getClient();
      const { data: resource, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', resourceId)
        .single();

      if (error || !resource) {
        const notFoundError = new Error('Resource not found');
        notFoundError.statusCode = 404;
        return next(notFoundError);
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  generateToken,
  verifyToken,
  authenticateTelegramWebApp,
  authenticateJWT,
  optionalAuth,
  requireAdmin,
  requireOwnership,
  loadResource
};
