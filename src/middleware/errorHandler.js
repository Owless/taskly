// src/middleware/errorHandler.js
// Централизованная обработка ошибок

// Кастомный класс для API ошибок
class APIError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Главный обработчик ошибок
const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Внутренняя ошибка сервера';
  let code = error.code || null;
  
  // Логирование ошибки
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    console.error('❌ Ошибка API:', {
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.userId || 'anonymous'
    });
  } else {
    // В продакшене логируем только критические ошибки
    if (statusCode >= 500) {
      console.error('❌ Критическая ошибка:', {
        message: error.message,
        url: req.originalUrl,
        method: req.method,
        userId: req.userId || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Обработка специфичных типов ошибок
  
  // PostgreSQL ошибки
  if (error.code && error.code.startsWith('23')) {
    switch (error.code) {
      case '23505': // Нарушение уникальности
        statusCode = 409;
        message = 'Запись с такими данными уже существует';
        code = 'DUPLICATE_ENTRY';
        break;
      case '23503': // Нарушение внешнего ключа
        statusCode = 400;
        message = 'Ссылка на несуществующую запись';
        code = 'FOREIGN_KEY_VIOLATION';
        break;
      case '23514': // Нарушение проверочного ограничения
        statusCode = 400;
        message = 'Данные не соответствуют требованиям';
        code = 'CHECK_VIOLATION';
        break;
      default:
        statusCode = 400;
        message = 'Ошибка базы данных';
        code = 'DATABASE_ERROR';
    }
  }
  
  // JWT ошибки
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Недействительный токен авторизации';
    code = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Токен авторизации истек';
    code = 'TOKEN_EXPIRED';
  }
  
  // Joi валидационные ошибки
  if (error.name === 'ValidationError' && error.isJoi) {
    statusCode = 400;
    message = 'Ошибка валидации данных';
    code = 'VALIDATION_ERROR';
  }
  
  // Ошибки подключения к базе данных
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    statusCode = 503;
    message = 'Сервис временно недоступен';
    code = 'SERVICE_UNAVAILABLE';
  }
  
  // Ошибки парсинга JSON
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    statusCode = 400;
    message = 'Неверный формат JSON';
    code = 'INVALID_JSON';
  }
  
  // Ошибки размера запроса
  if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Размер запроса слишком большой';
    code = 'PAYLOAD_TOO_LARGE';
  }
  
  // Ошибки таймаута
  if (error.code === 'ETIMEDOUT') {
    statusCode = 408;
    message = 'Время ожидания запроса истекло';
    code = 'REQUEST_TIMEOUT';
  }
  
  // Подготовка ответа
  const errorResponse = {
    error: getErrorName(statusCode),
    message,
    ...(code && { code }),
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  };
  
  // Добавляем дополнительную информацию в development режиме
  if (!isProduction && error.stack) {
    errorResponse.stack = error.stack.split('\n');
  }
  
  // Добавляем детали валидации, если есть
  if (error.details && Array.isArray(error.details)) {
    errorResponse.details = error.details;
  }
  
  res.status(statusCode).json(errorResponse);
};

// Обработчик для 404 ошибок (неизвестные роуты)
const notFoundHandler = (req, res, next) => {
  const error = new APIError(
    `Роут ${req.originalUrl} не найден`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

// Обработчик для неперехваченных исключений
const uncaughtExceptionHandler = (error) => {
  console.error('❌ Неперехваченное исключение:', error);
  
  // Логируем в файл или внешний сервис в продакшене
  if (process.env.NODE_ENV === 'production') {
    // TODO: Отправить в систему мониторинга (Sentry, LogRocket и т.д.)
  }
  
  // Graceful shutdown
  process.exit(1);
};

// Обработчик для неперехваченных Promise отклонений
const unhandledRejectionHandler = (reason, promise) => {
  console.error('❌ Неперехваченное отклонение Promise:', reason);
  
  // Логируем в файл или внешний сервис в продакшене
  if (process.env.NODE_ENV === 'production') {
    // TODO: Отправить в систему мониторинга
  }
  
  // Можно не завершать процесс, но стоит логировать
};

// Получение названия ошибки по статус коду
const getErrorName = (statusCode) => {
  const errorNames = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    413: 'Payload Too Large',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return errorNames[statusCode] || 'Unknown Error';
};

// Middleware для обработки асинхронных ошибок
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Валидация окружения при запуске
const validateEnvironment = () => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Отсутствуют обязательные переменные окружения:', missingVars);
    process.exit(1);
  }
  
  console.log('✅ Все обязательные переменные окружения установлены');
};

// Инициализация глобальных обработчиков ошибок
const initializeGlobalErrorHandlers = () => {
  process.on('uncaughtException', uncaughtExceptionHandler);
  process.on('unhandledRejection', unhandledRejectionHandler);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📊 Получен SIGTERM, выполняем graceful shutdown...');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('📊 Получен SIGINT, выполняем graceful shutdown...');
    process.exit(0);
  });
};

module.exports = {
  APIError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateEnvironment,
  initializeGlobalErrorHandlers
};
