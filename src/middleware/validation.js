const Joi = require('joi');

// Task validation schemas
const taskSchemas = {
  create: Joi.object({
    title: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'Название задачи не может быть пустым',
        'string.max': 'Название задачи не может быть длиннее 100 символов',
        'any.required': 'Название задачи обязательно'
      }),
    
    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .optional()
      .messages({
        'string.max': 'Описание не может быть длиннее 500 символов'
      }),
    
    due_date: Joi.date()
      .iso()
      .min('now')
      .optional()
      .allow(null)
      .messages({
        'date.min': 'Дата выполнения не может быть в прошлом'
      }),
    
    due_time: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .allow(null)
      .messages({
        'string.pattern.base': 'Время должно быть в формате HH:MM'
      }),
    
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .default('medium')
      .messages({
        'any.only': 'Приоритет должен быть: low, medium или high'
      }),
    
    is_recurring: Joi.boolean()
      .default(false),
    
    repeat_type: Joi.string()
      .valid('daily', 'weekly', 'monthly', 'custom')
      .when('is_recurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'any.only': 'Тип повторения должен быть: daily, weekly, monthly или custom'
      }),
    
    repeat_interval: Joi.number()
      .integer()
      .min(1)
      .max(365)
      .default(1)
      .when('is_recurring', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    
    repeat_unit: Joi.string()
      .valid('days', 'weeks', 'months')
      .when('repeat_type', {
        is: 'custom',
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    
    repeat_end_date: Joi.date()
      .iso()
      .min(Joi.ref('due_date'))
      .optional()
      .allow(null)
      .messages({
        'date.min': 'Дата окончания повторения должна быть после даты выполнения'
      })
  }),

  update: Joi.object({
    title: Joi.string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .messages({
        'string.empty': 'Название задачи не может быть пустым',
        'string.max': 'Название задачи не может быть длиннее 100 символов'
      }),
    
    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .optional()
      .messages({
        'string.max': 'Описание не может быть длиннее 500 символов'
      }),
    
    due_date: Joi.date()
      .iso()
      .optional()
      .allow(null),
    
    due_time: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .allow(null)
      .messages({
        'string.pattern.base': 'Время должно быть в формате HH:MM'
      }),
    
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .optional(),
    
    completed: Joi.boolean()
      .optional()
  }),

  filter: Joi.object({
    filter: Joi.string()
      .valid('all', 'today', 'tomorrow', 'week', 'overdue', 'no_date')
      .default('all'),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(50),
    
    offset: Joi.number()
      .integer()
      .min(0)
      .default(0)
  })
};

// User validation schemas
const userSchemas = {
  updateSettings: Joi.object({
    language_code: Joi.string()
      .length(2)
      .optional(),
    
    timezone: Joi.string()
      .max(50)
      .optional(),
    
    settings: Joi.object({
      notifications: Joi.boolean().optional(),
      reminder_time: Joi.string()
        .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .optional()
    }).optional()
  })
};

// Donation validation schemas
const donationSchemas = {
  create: Joi.object({
    amount_stars: Joi.number()
      .integer()
      .min(1)
      .max(2500)
      .required()
      .messages({
        'number.min': 'Минимальная сумма пожертвования 1 звезда',
        'number.max': 'Максимальная сумма пожертвования 2500 звезд'
      }),
    
    description: Joi.string()
      .trim()
      .max(200)
      .optional()
      .allow('')
  })
};

// Generic validation middleware
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      errors: {
        wrap: {
          label: ''
        }
      }
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req[property] = value;
    next();
  };
};

// Common parameter validation
const validateParams = {
  taskId: (req, res, next) => {
    const schema = Joi.object({
      taskId: Joi.string().uuid().required()
    });

    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Invalid task ID format'
      });
    }

    req.params = value;
    next();
  },

  userId: (req, res, next) => {
    const schema = Joi.object({
      userId: Joi.string().uuid().required()
    });

    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Invalid user ID format'
      });
    }

    req.params = value;
    next();
  }
};

module.exports = {
  validate,
  validateParams,
  schemas: {
    task: taskSchemas,
    user: userSchemas,
    donation: donationSchemas
  }
};
