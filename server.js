const app = require('./app');
const cron = require('node-cron');
const notificationService = require('./src/services/notifications');
const recurringService = require('./src/services/recurring');

const PORT = process.env.PORT || 3000;

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Taskly Backend running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  }
});

// Cron jobs setup
if (process.env.NODE_ENV !== 'test') {
  console.log('⏰ Setting up cron jobs...');
  
  // Notifications - every hour from 9 AM to 9 PM
  cron.schedule('0 9-21 * * *', async () => {
    try {
      console.log('📱 Running notification job...');
      await notificationService.sendScheduledNotifications();
    } catch (error) {
      console.error('❌ Notification job error:', error.message);
    }
  }, {
    timezone: 'Europe/Moscow'
  });
  
  // Recurring tasks - daily at 00:05
  cron.schedule('5 0 * * *', async () => {
    try {
      console.log('🔄 Running recurring tasks job...');
      await recurringService.createRecurringTasks();
    } catch (error) {
      console.error('❌ Recurring tasks job error:', error.message);
    }
  }, {
    timezone: 'Europe/Moscow'
  });
  
  // Cleanup old data - weekly on Sunday at 02:00
  cron.schedule('0 2 * * 0', async () => {
    try {
      console.log('🧹 Running cleanup job...');
      // Call cleanup function from database
    } catch (error) {
      console.error('❌ Cleanup job error:', error.message);
    }
  }, {
    timezone: 'Europe/Moscow'
  });
  
  console.log('✅ Cron jobs initialized');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err.message);
  console.error(err.stack);
  
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;
