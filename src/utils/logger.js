const winston = require('winston');
const { NODE_ENV } = require('../config/environment');

// Создаем форматтер для логов
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Настройки для разных сред
const loggerConfig = {
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: {
    service: 'taskly-backend',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Console транспорт
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
};

// В продакшене добавляем файловые логи
if (NODE_ENV === 'production') {
  loggerConfig.transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  );
}

const logger = winston.createLogger(loggerConfig);

// Обертки для удобства
logger.api = (message, meta = {}) => {
  logger.info(message, { type: 'api', ...meta });
};

logger.telegram = (message, meta = {}) => {
  logger.info(message, { type: 'telegram', ...meta });
};

logger.task = (message, meta = {}) => {
  logger.info(message, { type: 'task', ...meta });
};

logger.notification = (message, meta = {}) => {
  logger.info(message, { type: 'notification', ...meta });
};

logger.donation = (message, meta = {}) => {
  logger.info(message, { type: 'donation', ...meta });
};

module.exports = logger;
