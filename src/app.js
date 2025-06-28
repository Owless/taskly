const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { PORT, NODE_ENV, APP_URL } = require('./config/environment');
const logger = require('./utils/logger');
const database = require('./config/database');
const telegramConfig = require('./config/telegram');

// Middleware - Исправленный импорт с деструктуризацией
const { errorHandler } = require('./middleware/errorHandler');
const rateLimit = require('./middleware/rateLimit');

// Routes
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');
const donationRoutes = require('./routes/donations');
const webhookRoutes = require('./routes/webhook');

// Services
const cronService = require('./services/cronService');

class App {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Для Telegram Mini App
      crossOriginEmbedderPolicy: false
    }));

    // CORS настройки для Telegram Mini App
    this.app.use(cors({
      origin: [
        'https://web.telegram.org',
        APP_URL,
        /\.telegram\.org$/,
        ...(NODE_ENV === 'development' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
    }));

    // Сжатие ответов
    this.app.use(compression());

    // Парсинг JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Логирование запросов
    if (NODE_ENV !== 'production') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim(), { type: 'http' })
        }
      }));
    }

    // Rate limiting
    this.app.use('/api', rateLimit);

    // Health check (без rate limiting)
    this.app.get('/health', this.healthCheck.bind(this));
  }

  setupRoutes() {
    // API Routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/tasks', taskRoutes);
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/donations', donationRoutes);
    
    // Webhook (без rate limiting для надежности)
    this.app.use('/webhook', webhookRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Taskly Backend API',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        }
      });
    });
  }

  setupErrorHandling() {
    // Теперь errorHandler - это функция, а не объект
    this.app.use(errorHandler);
  }

  async healthCheck(req, res) {
    try {
      // Проверяем состояние всех сервисов
      const [dbHealth, telegramHealth] = await Promise.all([
        database.healthCheck(),
        telegramConfig.healthCheck()
      ]);

      const isHealthy = dbHealth.connected && telegramHealth.connected;

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          database: dbHealth,
          telegram: telegramHealth
        },
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async start() {
    try {
      // Подключаемся к базе данных
      await database.connect();

      // Получаем информацию о боте
      await telegramConfig.getBotInfo();

      // Устанавливаем webhook в продакшене
      if (NODE_ENV === 'production') {
        await telegramConfig.setWebhook();
      }

      // Запускаем cron задачи
      cronService.start();

      // Запускаем сервер
      this.server = this.app.listen(PORT, () => {
        logger.info(`🚀 Taskly Backend started on port ${PORT}`);
        logger.info(`🌍 Environment: ${NODE_ENV}`);
        logger.info(`📱 Mini App URL: ${APP_URL}`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`📴 ${signal} received. Starting graceful shutdown...`);

      // Останавливаем сервер
      if (this.server) {
        this.server.close(() => {
          logger.info('✅ HTTP server closed');
        });
      }

      // Останавливаем cron задачи
      cronService.stop();

      // Даем время завершить текущие операции
      setTimeout(() => {
        logger.info('👋 Graceful shutdown completed');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Создаем и запускаем приложение
const app = new App();

if (require.main === module) {
  app.start();
}

module.exports = app;
