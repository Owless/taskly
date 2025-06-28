const { validate } = require('../utils/validators');
const { ValidationError } = require('./errorHandler');
const logger = require('../utils/logger');

// Создание middleware для валидации
const createValidationMiddleware = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      let dataToValidate;
      
      switch (source) {
        case 'body':
          dataToValidate = req.body;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'params':
          dataToValidate = req.params;
          break;
        case 'headers':
          dataToValidate = req.headers;
          break;
        default:
          dataToValidate = req.body;
      }

      const validatedData = validate(schema, dataToValidate);
      
      // Заменяем исходные данные валидированными
      switch (source) {
        case 'body':
          req.body = validatedData;
          break;
        case 'query':
          req.query = validatedData;
          break;
        case 'params':
          req.params = validatedData;
          break;
        default:
          req.body = validatedData;
      }

      next();
    } catch (error) {
      if (error.name === 'ValidationError') {
        logger.warn('Validation failed', {
          source,
          errors: error.details,
          userId: req.user?.id,
          ip: req.ip
        });
        
        next(new ValidationError(error.message, error.details));
      } else {
        next(error);
      }
    }
  };
};

// Middleware для валидации UUID параметров
const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const value = req.params[paramName];
    
    if (!value) {
      return next(new ValidationError(`Parameter ${paramName} is required`));
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      return next(new ValidationError(`Invalid ${paramName} format`));
    }

    next();
  };
};

// Middleware для валидации пагинации
const validatePagination = (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (page < 1) {
      throw new ValidationError('Page must be greater than 0');
    }

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    req.pagination = {
      page,
      limit,
      offset: (page - 1) * limit
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Валидация Content-Type для JSON запросов
const requireJSON = (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (!req.is('application/json')) {
      return next(new ValidationError('Content-Type must be application/json'));
    }
  }
  next();
};

// Валидация размера тела запроса
const validateBodySize = (maxSize = '1mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        return next(new ValidationError(`Request body too large. Max size: ${maxSize}`));
      }
    }
    
    next();
  };
};

// Помощник для парсинга размера
const parseSize = (size) => {
  if (typeof size === 'number') return size;
  
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  
  if (!match) {
    throw new Error('Invalid size format');
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
};

module.exports = {
  createValidationMiddleware,
  validateUUID,
  validatePagination,
  requireJSON,
  validateBodySize
};
