const dotenv = require('dotenv');
const Joi = require('joi');

// Загружаем переменные окружения
dotenv.config();

// Схема валидации переменных окружения
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(3000),
  
  // Supabase
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  
  // Telegram
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_WEBHOOK_URL: Joi.string().uri().required(),
  TELEGRAM_WEBHOOK_SECRET: Joi.string().min(10).required(),
  
  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRE: Joi.string().default('7d'),
  
  // App
  APP_URL: Joi.string().uri().required(),
  ADMIN_TELEGRAM_ID: Joi.number().optional(),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 минут
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),
  
  // Notifications
  NOTIFICATION_BATCH_SIZE: Joi.number().default(50),
  NOTIFICATION_INTERVAL_MINUTES: Joi.number().default(15),
}).unknown();

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  NODE_ENV: env.NODE_ENV,
  PORT: env.PORT,
  
  // Supabase
  SUPABASE: {
    URL: env.SUPABASE_URL,
    ANON_KEY: env.SUPABASE_ANON_KEY,
    SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  
  // Telegram
  TELEGRAM: {
    BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    WEBHOOK_URL: env.TELEGRAM_WEBHOOK_URL,
    WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
  },
  
  // JWT
  JWT: {
    SECRET: env.JWT_SECRET,
    EXPIRE: env.JWT_EXPIRE,
  },
  
  // App
  APP_URL: env.APP_URL,
  ADMIN_TELEGRAM_ID: env.ADMIN_TELEGRAM_ID,
  
  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
    MAX_REQUESTS: env.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Notifications
  NOTIFICATIONS: {
    BATCH_SIZE: env.NOTIFICATION_BATCH_SIZE,
    INTERVAL_MINUTES: env.NOTIFICATION_INTERVAL_MINUTES,
  },
  
  // Полезные проверки
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
};
