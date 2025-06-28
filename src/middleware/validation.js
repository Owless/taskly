// src/middleware/validation.js
// Middleware для валидации входных данных

const Joi = require('joi');

// Схемы валидации
const schemas = {
  // Валидация создания задачи
  createTask: Joi.object({
    title: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'Название задачи не может быть пустым',
        'string.min': 'Название задачи должно содержать хотя бы 1 символ',
        'string.max': 'Название задачи не может превышать 100 символов',
        'any.required': 'Название задачи обязательно'
      }),
    
    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .allow(null)
      .messages({
        'string.max': 'Описание не может превышать 500 символов'
      }),
    
    due_date: Joi.date()
      .iso()
      .allow(null)
      .messages({
        'date.format': 'Неверный формат даты'
      }),
    
    due_time: Joi.string()
      .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .allow(null)
      .messages({
        'string.pattern.base': 'Неверный формат времени (ожидается HH:MM)'
      }),
    
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .default('medium')
      .messages({
        'any.only': 'Приоритет может быть только low, medium или high'
      }),
    
    is_recurring: Joi.boolean()
      .default(false),
    
    repeat_type: Joi.string()
      .valid('daily', 'weekly', 'monthly')
      .when('is_recurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
      .messages({
        'any.only': 'Тип повторения может быть только daily, weekly или monthly',
        'any.required': 'Тип повторения обязателен для повторяющихся задач'
      }),
    
    repeat_interval: Joi.number()
      .integer()
      .min(1)
      .max(365)
      .when('is_recurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
      .messages({
        'number.base': 'Интервал повторения должен быть числом',
        'number.integer': 'Интервал повторения должен быть целым числом',
        'number.min': 'Интервал повторения должен быть больше 0',
        'number.max': 'Интервал повторения не может превышать 365'
      }),
    
    repeat_end_date: Joi.date()
      .iso()
      .min('now')
      .when('is_recurring', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.forbidden()
      })
      .messages({
        'date.format': 'Неверный формат даты окончания',
        'date.min': 'Дата окончания не может быть в прошлом'
      })
  }),

  // Валидация обновления задачи
  updateTask: Joi.object({
    title: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .messages({
        'string.empty': 'Название задачи не может быть пустым',
        'string.min': 'Название задачи должно содержать хотя бы 1 символ',
        'string.max': 'Название задачи не может превышать 100 символов'
      }),
    
    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .allow(null)
      .messages({
        'string.max': 'Описание не может превышать 500 символов'
      }),
    
    due_date: Joi.date()
      .iso()
      .allow(null)
      .messages({
        'date.format': 'Неверный формат даты'
      }),
    
    due_time: Joi.string()
      .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .allow(null)
      .messages({
        'string.pattern.base': 'Неверный формат времени (ожидается HH:MM)'
      }),
    
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .messages({
        'any.only': 'Приоритет может быть только low, medium или high'
      })
  }).min(1).messages({
    'object.min': 'Необходимо указать хотя бы одно поле для обновления'
  }),

  // Валидация настроек пользователя
  userSettings: Joi.object({
    notifications: Joi.boolean()
      .messages({
        'boolean.base': 'Настройка уведомлений должна быть true или false'
      }),
    
    reminder_time: Joi.string()
      .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .messages({
        'string.pattern.base': 'Неверный формат времени напоминания (ожидается HH:MM)'
      })
  }).min(1).messages({
    'object.min': 'Необходимо указать хотя бы одну настройку'
  }),

  // Валидация профиля пользователя
  userProfile: Joi.object({
    first_name: Joi.string()
      .trim()
      .min(1)
      .max(255)
      .messages({
        'string.empty': 'Имя не может быть пустым',
        'string.min': 'Имя должно содержать хотя бы 1 символ',
        'string.max': 'Имя не может превышать 255 символов'
      }),
    
    last_name: Joi.string()
      .trim()
      .max(255)
      .allow('')
      .allow(null)
      .messages({
        'string.max': 'Фамилия не может превышать 255 символов'
      }),
    
    language_code: Joi.string()
      .valid('ru', 'en', 'uk')
      .messages({
        'any.only': 'Код языка может быть только ru, en или uk'
      }),
    
    timezone: Joi.string()
      .max(50)
      .messages({
        'string.max': 'Часовой пояс не может превышать 50 символов'
      })
  }).min(1).messages({
    'object.min': 'Необходимо указать хотя бы одно поле для обновления'
  })
};

// Универсальная функция валидации
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Ошибка валидации данных',
        details: errorMessages
      });
    }

    // Заменяем req.body на валидированные данные
    req.body = value;
    next();
  };
};

// Валидация query параметров
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Ошибка валидации параметров запроса',
        details: errorMessages
      });
    }

    req.query = value;
    next();
  };
};

// Валидация UUID параметров
const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    
    const uuidSchema = Joi.string().guid({ version: 'uuidv4' }).required();
    const { error } = uuidSchema.validate(uuid);

    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Неверный формат ${paramName}`
      });
    }

    next();
  };
};

// Специализированные middleware
const validateTask = validate(schemas.createTask);
const validateTaskUpdate = validate(schemas.updateTask);
const validateUserSettings = validate(schemas.userSettings);
const validateUserProfile = validate(schemas.userProfile);

// Валидация фильтров задач
const validateTasksQuery = validateQuery(
  Joi.object({
    filter: Joi.string()
      .valid('all', 'today', 'tomorrow', 'week', 'overdue', 'completed', 'active', 'no_date')
      .default('all'),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(50),
    
    offset: Joi.number()
      .integer()
      .min(0)
      .default(0),
    
    sort: Joi.string()
      .valid('created_at', 'due_date', 'priority', 'title', 'completed_at')
      .default('created_at'),
    
    order: Joi.string()
      .valid('ASC', 'DESC', 'asc', 'desc')
      .default('DESC')
  })
);

// Функция для проверки существования обязательных полей
const requireFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    for (const field of fields) {
      if (!req.body || req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'Отсутствуют обязательные поля',
        missingFields
      });
    }
    
    next();
  };
};

// Функция для санитизации HTML (защита от XSS)
const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) {
    sanitizeObject(req.body);
  }

  next();
};

module.exports = {
  validate,
  validateQuery,
  validateUUID,
  validateTask,
  validateTaskUpdate,
  validateUserSettings,
  validateUserProfile,
  validateTasksQuery,
  requireFields,
  sanitizeInput,
  schemas
};
