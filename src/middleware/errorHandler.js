const logger = require('../utils/logger');
const { NODE_ENV } = require('../config/environment');

// Типы ошибок
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class TelegramError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'TELEGRAM_ERROR');
    this.originalError = originalError;
  }
}

// Основной обработчик ошибок
const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Internal server error';
  let details = error.details || null;

  // Логируем ошибку
  const logData = {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    }
  };

  if (statusCode >= 500) {
    logger.error('Server error:', logData);
  } else {
    logger.warn('Client error:', logData);
  }

  // Специальная обработка для разных типов ошибок
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
  }

  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token expired';
  }

  // Ошибки Supabase
  if (error.code === 'PGRST116') { // JWT expired
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Session expired';
  }

  // В продакшене не показываем внутренние ошибки
  if (NODE_ENV === 'production' && statusCode >= 500 && !error.isOperational) {
    message = 'Internal server error';
    details = null;
  }

  // Формируем ответ
  const response = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(NODE_ENV === 'development' && statusCode >= 500 && { stack: error.stack })
    }
  };

  res.status(statusCode).json(response);
};

// Обработчик для несуществующих маршрутов
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

// Обработчик для неперехваченных исключений
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
};

module.exports = {
  errorHandler,
  notFound,
  handleUncaughtException,
  // Экспортируем классы ошибок
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  TelegramError
};
