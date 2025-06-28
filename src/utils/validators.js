const Joi = require('joi');

// Схемы валидации
const schemas = {
    // Telegram Init Data для аутентификации
    telegramAuth: Joi.object({
        initData: Joi.string().required(),
        hash: Joi.string().optional()
    }),

    // Создание задачи
    createTask: Joi.object({
        title: Joi.string().trim().min(1).max(100).required(),
        description: Joi.string().trim().max(500).optional().allow(''),
        due_date: Joi.date().optional().allow(null),
        due_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
        is_recurring: Joi.boolean().default(false),
        repeat_type: Joi.string().valid('daily', 'weekly', 'monthly', 'custom').optional(),
        repeat_interval: Joi.number().integer().min(1).max(365).optional(),
        repeat_unit: Joi.string().valid('days', 'weeks', 'months').optional(),
        repeat_end_date: Joi.date().optional().allow(null)
    }),

    // Обновление задачи
    updateTask: Joi.object({
        title: Joi.string().trim().min(1).max(100).optional(),
        description: Joi.string().trim().max(500).optional().allow(''),
        due_date: Joi.date().optional().allow(null),
        due_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        priority: Joi.string().valid('low', 'medium', 'high').optional(),
        completed: Joi.boolean().optional(),
        is_recurring: Joi.boolean().optional(),
        repeat_type: Joi.string().valid('daily', 'weekly', 'monthly', 'custom').optional(),
        repeat_interval: Joi.number().integer().min(1).max(365).optional(),
        repeat_unit: Joi.string().valid('days', 'weeks', 'months').optional(),
        repeat_end_date: Joi.date().optional().allow(null)
    }),

    // Фильтры задач
    taskFilters: Joi.object({
        filter: Joi.string().valid('all', 'today', 'tomorrow', 'week', 'overdue', 'no_date').default('all'),
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0)
    }),

    // Настройки пользователя
    userSettings: Joi.object({
        language_code: Joi.string().max(10).optional(),
        timezone: Joi.string().max(50).optional(),
        settings: Joi.object({
            notifications: Joi.boolean().optional(),
            reminder_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional()
        }).optional()
    }),

    // UUID параметр
    uuidParam: Joi.object({
        id: Joi.string().uuid().required()
    }),

    // Telegram webhook
    telegramWebhook: Joi.object({
        message: Joi.object().optional(),
        callback_query: Joi.object().optional(),
        pre_checkout_query: Joi.object().optional(),
        successful_payment: Joi.object().optional()
    }).unknown(true)
};

// Основная функция валидации
const validate = (schema, data) => {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false
    });

    if (error) {
        const validationError = new Error('Validation failed');
        validationError.name = 'ValidationError';
        validationError.details = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type
        }));
        throw validationError;
    }

    return value;
};

// Вспомогательные валидаторы
const validators = {
    // Валидация email
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Валидация телефона
    isValidPhone: (phone) => {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone);
    },

    // Валидация URL
    isValidURL: (url) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Валидация UUID
    isValidUUID: (uuid) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    },

    // Валидация даты
    isValidDate: (dateString) => {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    },

    // Валидация времени (HH:MM)
    isValidTime: (timeString) => {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        return timeRegex.test(timeString);
    },

    // Валидация приоритета задачи
    isValidPriority: (priority) => {
        return ['low', 'medium', 'high'].includes(priority);
    },

    // Валидация Telegram ID
    isValidTelegramId: (id) => {
        return Number.isInteger(id) && id > 0;
    }
};

module.exports = {
    schemas,
    validate,
    validators
};
