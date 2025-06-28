const Joi = require('joi');
const { TASK_PRIORITIES, REPEAT_TYPES, REPEAT_UNITS, LIMITS } = require('../config/constants');

// Валидация создания задачи
const createTaskSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(LIMITS.TASK_TITLE_MAX_LENGTH)
    .required()
    .messages({
      'string.empty': 'Название задачи не может быть пустым',
      'string.max': `Название задачи не может быть длиннее ${LIMITS.TASK_TITLE_MAX_LENGTH} символов`
    }),

  description: Joi.string()
    .trim()
    .max(LIMITS.TASK_DESCRIPTION_MAX_LENGTH)
    .allow('')
    .optional()
    .messages({
      'string.max': `Описание не может быть длиннее ${LIMITS.TASK_DESCRIPTION_MAX_LENGTH} символов`
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
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .allow(null)
    .messages({
      'string.pattern.base': 'Время должно быть в формате HH:MM'
    }),

  priority: Joi.string()
    .valid(...Object.values(TASK_PRIORITIES))
    .default(TASK_PRIORITIES.MEDIUM),

  is_recurring: Joi.boolean().default(false),

  repeat_type: Joi.string()
    .valid(...Object.values(REPEAT_TYPES))
    .when('is_recurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),

  repeat_interval: Joi.number()
    .integer()
    .min(LIMITS.REPEAT_INTERVAL_MIN)
    .max(LIMITS.REPEAT_INTERVAL_MAX)
    .default(1)
    .when('is_recurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),

  repeat_unit: Joi.string()
    .valid(...Object.values(REPEAT_UNITS))
    .when('repeat_type', {
      is: REPEAT_TYPES.CUSTOM,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),

  repeat_end_date: Joi.date()
    .iso()
    .min(Joi.ref('due_date'))
    .optional()
    .allow(null)
    .when('is_recurring', {
      is: true,
      then: Joi.optional(),
      otherwise: Joi.forbidden()
    })
});

// Валидация обновления задачи
const updateTaskSchema = createTaskSchema.fork(
  ['title'],
  (schema) => schema.optional()
);

// Валидация фильтров задач
const taskFiltersSchema = Joi.object({
  status: Joi.string()
    .valid('all', 'today', 'tomorrow', 'week', 'overdue', 'no_date', 'completed')
    .default('all'),

  priority: Joi.string()
    .valid(...Object.values(TASK_PRIORITIES))
    .optional(),

  search: Joi.string()
    .trim()
    .max(100)
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(LIMITS.TASKS_PER_PAGE),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0),

  sort_by: Joi.string()
    .valid('due_date', 'priority', 'created_at', 'title')
    .default('due_date'),

  sort_order: Joi.string()
    .valid('asc', 'desc')
    .default('asc')
});

// Валидация настроек пользователя
const userSettingsSchema = Joi.object({
  notifications: Joi.boolean().default(true),
  reminder_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .default('09:00'),
  timezone: Joi.string().default('Europe/Moscow'),
  language: Joi.string()
    .valid('ru', 'en', 'uk')
    .default('ru'),
  daily_summary: Joi.boolean().default(true),
  overdue_reminders: Joi.boolean().default(true)
});

// Валидация пожертвования
const donationSchema = Joi.object({
  amount_stars: Joi.number()
    .integer()
    .min(LIMITS.MIN_DONATION_AMOUNT)
    .max(LIMITS.MAX_DONATION_AMOUNT)
    .required()
    .messages({
      'number.min': `Минимальная сумма: ${LIMITS.MIN_DONATION_AMOUNT} звезда`,
      'number.max': `Максимальная сумма: ${LIMITS.MAX_DONATION_AMOUNT} звезд`
    }),

  description: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow('')
});

// Валидация Telegram WebApp initData
const telegramInitDataSchema = Joi.object({
  user: Joi.object({
    id: Joi.number().required(),
    first_name: Joi.string().required(),
    last_name: Joi.string().optional(),
    username: Joi.string().optional(),
    language_code: Joi.string().optional()
  }).required(),
  
  auth_date: Joi.number().required(),
  hash: Joi.string().required()
}).unknown(true); // Разрешаем дополнительные поля

// Общие валидаторы
const validators = {
  // UUID валидация
  uuid: Joi.string().uuid().required(),

  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  // Telegram ID
  telegramId: Joi.number().integer().positive().required(),

  // Дата в формате YYYY-MM-DD
  dateString: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),

  // Время в формате HH:MM
  timeString: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
};

// Функция для валидации данных
const validate = (schema, data, options = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options
  });

  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));

    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';
    validationError.details = details;
    throw validationError;
  }

  return value;
};

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  taskFiltersSchema,
  userSettingsSchema,
  donationSchema,
  telegramInitDataSchema,
  validators,
  validate
};
