const { createClient } = require('@supabase/supabase-js');
const { SUPABASE } = require('./environment');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.supabase = null;
    this.isConnected = false;
  }

  // Инициализация подключения
  async connect() {
    try {
      // Создаем клиент Supabase
      this.supabase = createClient(
        SUPABASE.URL,
        SUPABASE.SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );

      // Проверяем подключение
      const { data, error } = await this.supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error) {
        throw error;
      }

      this.isConnected = true;
      logger.info('✅ Supabase connected successfully');
      
      return this.supabase;
    } catch (error) {
      logger.error('❌ Failed to connect to Supabase:', error);
      throw error;
    }
  }

  // Получить клиент
  getClient() {
    if (!this.supabase) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.supabase;
  }

  // Установить RLS контекст для пользователя
  async setUserContext(userId) {
    if (!userId) return;
    
    try {
      await this.supabase.rpc('set_config', {
        setting_name: 'app.current_user_id',
        setting_value: userId,
        is_local: true
      });
    } catch (error) {
      logger.warn('Failed to set user context:', error);
    }
  }

  // Проверка здоровья базы данных
  async healthCheck() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('count')
        .limit(1);

      return {
        status: error ? 'error' : 'healthy',
        error: error?.message,
        connected: !error
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        connected: false
      };
    }
  }

  // Получить статистику базы данных
  async getStats() {
    try {
      const [usersResult, tasksResult, donationsResult] = await Promise.all([
        this.supabase.from('users').select('count'),
        this.supabase.from('tasks').select('count'),
        this.supabase.from('donations').select('count')
      ]);

      return {
        users: usersResult.count || 0,
        tasks: tasksResult.count || 0,
        donations: donationsResult.count || 0
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      return { users: 0, tasks: 0, donations: 0 };
    }
  }
}

// Создаем singleton экземпляр
const database = new Database();

module.exports = database;
