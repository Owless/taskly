const database = require('../config/database');
const logger = require('../utils/logger');
const { DEFAULT_USER_SETTINGS } = require('../config/constants');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class User {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  // Создать нового пользователя
  static async create(userData) {
    try {
      const supabase = database.getClient();
      
      const newUser = {
        telegram_id: userData.telegram_id,
        telegram_username: userData.telegram_username || null,
        first_name: userData.first_name,
        last_name: userData.last_name || null,
        language_code: userData.language_code || 'ru',
        timezone: userData.timezone || 'Europe/Moscow',
        settings: userData.settings || DEFAULT_USER_SETTINGS
      };

      const { data, error } = await supabase
        .from('users')
        .insert([newUser])
        .select()
        .single();

      if (error) {
        logger.error('Failed to create user', { error, userData });
        throw error;
      }

      logger.info('User created successfully', { 
        userId: data.id, 
        telegramId: data.telegram_id 
      });

      return new User(data);
    } catch (error) {
      if (error.code === '23505') { // unique_violation
        throw new ValidationError('User with this Telegram ID already exists');
      }
      throw error;
    }
  }

  // Найти пользователя по ID
  static async findById(userId) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new User(data);
    } catch (error) {
      logger.error('Failed to find user by ID', { error, userId });
      throw error;
    }
  }

  // Найти пользователя по Telegram ID
  static async findByTelegramId(telegramId) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new User(data);
    } catch (error) {
      logger.error('Failed to find user by Telegram ID', { error, telegramId });
      throw error;
    }
  }

  // Найти или создать пользователя
  static async findOrCreate(telegramUserData) {
    try {
      let user = await User.findByTelegramId(telegramUserData.id);
      
      if (!user) {
        user = await User.create({
          telegram_id: telegramUserData.id,
          telegram_username: telegramUserData.username,
          first_name: telegramUserData.first_name,
          last_name: telegramUserData.last_name,
          language_code: telegramUserData.language_code
        });
      } else {
        // Обновляем данные пользователя если изменились
        await user.updateTelegramData(telegramUserData);
      }

      return user;
    } catch (error) {
      logger.error('Failed to find or create user', { error, telegramUserData });
      throw error;
    }
  }

  // Обновить данные пользователя
  async update(updates) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);
      
      logger.info('User updated successfully', { 
        userId: this.id, 
        updates: Object.keys(updates) 
      });

      return this;
    } catch (error) {
      logger.error('Failed to update user', { error, userId: this.id, updates });
      throw error;
    }
  }

  // Обновить данные Telegram
  async updateTelegramData(telegramUserData) {
    const updates = {};
    
    if (this.telegram_username !== telegramUserData.username) {
      updates.telegram_username = telegramUserData.username;
    }
    if (this.first_name !== telegramUserData.first_name) {
      updates.first_name = telegramUserData.first_name;
    }
    if (this.last_name !== telegramUserData.last_name) {
      updates.last_name = telegramUserData.last_name;
    }
    if (this.language_code !== telegramUserData.language_code) {
      updates.language_code = telegramUserData.language_code;
    }

    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }

    return this;
  }

  // Обновить настройки пользователя
  async updateSettings(newSettings) {
    try {
      const currentSettings = this.settings || DEFAULT_USER_SETTINGS;
      const updatedSettings = { ...currentSettings, ...newSettings };

      await this.update({ settings: updatedSettings });
      
      return this.settings;
    } catch (error) {
      logger.error('Failed to update user settings', { 
        error, 
        userId: this.id, 
        newSettings 
      });
      throw error;
    }
  }

  // Получить настройку пользователя
  getSetting(key, defaultValue = null) {
    return this.settings?.[key] ?? defaultValue;
  }

  // Получить статистику пользователя
  async getStats() {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('user_task_stats')
        .select('*')
        .eq('user_id', this.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || {
        total_tasks: 0,
        completed_tasks: 0,
        active_tasks: 0,
        today_tasks: 0,
        overdue_tasks: 0,
        completion_rate: 0
      };
    } catch (error) {
      logger.error('Failed to get user stats', { error, userId: this.id });
      throw error;
    }
  }

  // Получить активные задачи пользователя
  async getActiveTasks(limit = 10) {
    try {
      const supabase = database.getClient();
      
      const { data, error } = await supabase
        .from('active_tasks')
        .select('*')
        .eq('user_id', this.id)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error('Failed to get active tasks', { error, userId: this.id });
      throw error;
    }
  }

  // Удалить пользователя
  async delete() {
    try {
      const supabase = database.getClient();
      
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw error;
      }

      logger.info('User deleted successfully', { userId: this.id });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete user', { error, userId: this.id });
      throw error;
    }
  }

  // Получить список всех пользователей (для админа)
  static async findAll(options = {}) {
    try {
      const { limit = 50, offset = 0, search = '' } = options;
      const supabase = database.getClient();
      
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,telegram_username.ilike.%${search}%`);
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return {
        users: (data || []).map(userData => new User(userData)),
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find all users', { error, options });
      throw error;
    }
  }

  // Проверить, является ли пользователь новым (регистрация в последние 24 часа)
  isNewUser() {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return new Date(this.created_at) > dayAgo;
  }

  // Получить полное имя пользователя
  getFullName() {
    if (this.last_name) {
      return `${this.first_name} ${this.last_name}`;
    }
    return this.first_name;
  }

  // Получить отображаемое имя (username или имя)
  getDisplayName() {
    return this.telegram_username || this.getFullName();
  }

  // Преобразовать в JSON для API ответа
  toJSON() {
    const {
      password_hash, // Исключаем приватные поля
      ...publicData
    } = this;

    return {
      ...publicData,
      display_name: this.getDisplayName(),
      full_name: this.getFullName(),
      is_new_user: this.isNewUser()
    };
  }

  // Проверить права доступа
  canAccessResource(resource) {
    return resource.user_id === this.id;
  }

  // Проверить, является ли пользователем администратором
  isAdmin() {
    const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
    return adminTelegramId && this.telegram_id.toString() === adminTelegramId;
  }
}

module.exports = User;
