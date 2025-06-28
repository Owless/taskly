// src/app.js
// Главный файл приложения Taskly Backend

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Импорт конфигураций и middleware
const { checkTables, healthCheck } = require('./config/database');
const { initializeBot } = require('./config/telegram');
const { errorHandler, notFoundHandler, validateEnvironment, initializeGlobalErrorHandlers } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Валидация переменных окружения
validateEnvironment();

// Инициализация глобальных обработчиков ошибок
initializeGlobalErrorHandlers();

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

// Санитизация входных данных
app.use(sanitizeInput);

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
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      tasks: '/api/tasks',
      users: '/api/users',
      webhook: '/webhook'
    }
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
// API роуты
// =====================================

// Аутентификация
app.use('/api/auth', require('./routes/auth'));

// Задачи
app.use('/api/tasks', require('./routes/tasks'));

// Пользователи
app.use('/api/users', require('./routes/users'));

// Webhook для Telegram (пока заглушка)
app.use('/webhook', (req, res) => {
  res.json({
    message: 'Webhook endpoint - coming soon',
    endpoint: req.originalUrl
  });
});

// =====================================
// Обработка ошибок
// =====================================

// 404 handler для неизвестных роутов
app.use(notFoundHandler);

// Главный обработчик ошибок
app.use(errorHandler);

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
    const server = app.listen(PORT, () => {
      console.log('✅ Taskly Backend успешно запущен!');
      console.log(`📡 Сервер слушает порт: ${PORT}`);
      console.log(`🌍 Окружение: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n📝 Доступные API endpoints:');
        console.log('  GET    / - Информация о сервисе');
        console.log('  GET    /health - Проверка состояния');
        console.log('\n🔐 Аутентификация:');
        console.log('  POST   /api/auth/login - Вход через Telegram');
        console.log('  POST   /api/auth/refresh - Обновление токена');
        console.log('  GET    /api/auth/me - Информация о пользователе');
        console.log('\n📝 Задачи:');
        console.log('  GET    /api/tasks - Получить задачи');
        console.log('  POST   /api/tasks - Создать задачу');
        console.log('  GET    /api/tasks/:id - Получить задачу');
        console.log('  PUT    /api/tasks/:id - Обновить задачу');
        console.log('  DELETE /api/tasks/:id - Удалить задачу');
        console.log('  POST   /api/tasks/:id/complete - Выполнить задачу');
        console.log('  GET    /api/tasks/stats - Статистика задач');
        console.log('\n👤 Пользователи:');
        console.log('  GET    /api/users/profile - Профиль пользователя');
        console.log('  PUT    /api/users/profile - Обновить профиль');
        console.log('  GET    /api/users/settings - Настройки');
        console.log('  PUT    /api/users/settings - Обновить настройки');
        console.log('  GET    /api/users/stats - Статистика пользователя');
        console.log('  DELETE /api/users/account - Удалить аккаунт');
        console.log('  POST   /api/users/export - Экспорт данных');
        console.log('\n🤖 Telegram Bot команды:');
        console.log('  /start - Приветствие и запуск приложения');
        console.log('  /help - Справка по использованию');
        console.log('  /stats - Статистика задач');
        console.log('  /settings - Настройки уведомлений');
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n🔄 Получен сигнал ${signal}, завершаем работу сервера...`);
      
      server.close(() => {
        console.log('📡 HTTP сервер остановлен');
        
        // Здесь можно добавить cleanup других ресурсов
        // например, закрытие подключений к базе данных
        
        console.log('✅ Сервер корректно остановлен');
        process.exit(0);
      });
      
      // Принудительная остановка через 30 секунд
      setTimeout(() => {
        console.error('❌ Принудительная остановка сервера');
        process.exit(1);
      }, 30000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

// Запускаем сервер
startServer();

module.exports = app;
