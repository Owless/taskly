// src/app.js
// Главный файл приложения Taskly Backend

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Импорт конфигураций
const { checkTables, healthCheck } = require('./config/database');
const { initializeBot } = require('./config/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================
// Middleware
// =====================================

// Безопасность
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем для Telegram Mini App
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  message: {
    error: 'Too Many Requests',
    message: 'Слишком много запросов, попробуйте позже'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Парсинг JSON
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Сохраняем raw body для Telegram webhook
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));

// Логирование запросов в development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path} - ${req.ip}`);
    next();
  });
}

// =====================================
// Базовые роуты
// =====================================

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: 'Taskly Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    
    res.json({
      status: 'ok',
      service: 'Taskly Backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbHealth
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// =====================================
// API роуты (пока заглушки)
// =====================================

// Аутентификация
app.use('/api/auth', (req, res, next) => {
  // Временная заглушка
  res.json({
    message: 'Auth endpoint - coming soon',
    endpoint: req.originalUrl
  });
});

// Задачи
app.use('/api/tasks', (req, res, next) => {
  // Временная заглушка
  res.json({
    message: 'Tasks endpoint - coming soon',
    endpoint: req.originalUrl
  });
});

// Пользователи
app.use('/api/users', (req, res, next) => {
  // Временная заглушка
  res.json({
    message: 'Users endpoint - coming soon',
    endpoint: req.originalUrl
  });
});

// Webhook для Telegram
app.use('/webhook', (req, res, next) => {
  // Временная заглушка
  res.json({
    message: 'Webhook endpoint - coming soon',
    endpoint: req.originalUrl
  });
});

// =====================================
// Обработка ошибок
// =====================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Запрашиваемый ресурс не найден',
    path: req.originalUrl
  });
});

// Общий error handler
app.use((error, req, res, next) => {
  console.error('❌ Необработанная ошибка:', error);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? error.message : 'Внутренняя ошибка сервера',
    ...(isDevelopment && { stack: error.stack })
  });
});

// =====================================
// Инициализация и запуск
// =====================================

const startServer = async () => {
  try {
    console.log('🚀 Запуск Taskly Backend...');
    
    // Проверяем подключение к базе данных
    console.log('📊 Проверка базы данных...');
    const tablesExist = await checkTables();
    
    if (!tablesExist) {
      console.error('❌ Проблема с базой данных. Сервер не запущен.');
      process.exit(1);
    }
    
    // Инициализируем Telegram бота
    console.log('🤖 Инициализация Telegram бота...');
    const botInitialized = await initializeBot();
    
    if (!botInitialized) {
      console.warn('⚠️ Не удалось инициализировать Telegram бота');
    }
    
    // Запускаем сервер
    app.listen(PORT, () => {
      console.log('✅ Taskly Backend успешно запущен!');
      console.log(`📡 Сервер слушает порт: ${PORT}`);
      console.log(`🌍 Окружение: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n📝 Доступные endpoints:');
        console.log('  GET  / - Главная страница');
        console.log('  GET  /health - Проверка состояния');
        console.log('  POST /api/auth/* - Аутентификация (скоро)');
        console.log('  *    /api/tasks/* - Управление задачами (скоро)');
        console.log('  *    /api/users/* - Управление пользователями (скоро)');
        console.log('  POST /webhook/* - Telegram webhook (скоро)');
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n🔄 Получен сигнал ${signal}, завершаем работу...`);
  
  // Здесь можно добавить cleanup код
  
  console.log('✅ Сервер остановлен');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Запускаем сервер
startServer();

module.exports = app;
