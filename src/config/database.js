// src/config/database.js
// Подключение к Supabase только через переменные окружения

const { createClient } = require('@supabase/supabase-js');

// Получаем переменные окружения
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Проверяем обязательные переменные
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL не установлен в переменных окружения');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY не установлен в переменных окружения');
  process.exit(1);
}

console.log('✅ Переменные окружения Supabase загружены');

// Создаем Supabase клиент с service role для полного доступа
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Основная функция для работы с базой данных
const query = async (tableName, operation, data = null, filters = null) => {
  const start = Date.now();
  
  try {
    let queryBuilder = supabase.from(tableName);
    
    switch (operation) {
      case 'select':
        queryBuilder = queryBuilder.select(data || '*');
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            queryBuilder = queryBuilder.eq(key, value);
          });
        }
        break;
        
      case 'insert':
        queryBuilder = queryBuilder.insert(data);
        break;
        
      case 'update':
        queryBuilder = queryBuilder.update(data);
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            queryBuilder = queryBuilder.eq(key, value);
          });
        }
        break;
        
      case 'delete':
        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            queryBuilder = queryBuilder.eq(key, value);
          });
        }
        queryBuilder = queryBuilder.delete();
        break;
        
      default:
        throw new Error(`Неподдерживаемая операция: ${operation}`);
    }
    
    const { data: result, error } = await queryBuilder;
    
    if (error) {
      throw error;
    }
    
    const duration = Date.now() - start;
    
    // Логируем в development
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true') {
      console.log(`🔍 Supabase ${operation} on ${tableName} (${duration}ms)`);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Ошибка Supabase запроса:', {
      table: tableName,
      operation,
      error: error.message
    });
    throw error;
  }
};

// Вспомогательные функции для частых операций
const findUserByTelegramId = async (telegramId) => {
  return await query('users', 'select', '*', { telegram_id: telegramId });
};

const createUser = async (userData) => {
  return await query('users', 'insert', userData);
};

const getUserTasks = async (userId, filters = {}) => {
  const queryFilters = { user_id: userId, ...filters };
  return await query('tasks', 'select', '*', queryFilters);
};

const createTask = async (taskData) => {
  return await query('tasks', 'insert', taskData);
};

const updateTask = async (taskId, updateData) => {
  return await query('tasks', 'update', updateData, { id: taskId });
};

const deleteTask = async (taskId) => {
  return await query('tasks', 'delete', null, { id: taskId });
};

// Функция для установки контекста пользователя (для RLS)
const setUserContext = async (userId) => {
  if (!userId) return;
  
  try {
    // Используем Supabase RPC для установки контекста
    const { error } = await supabase.rpc('set_config', {
      setting_name: 'app.current_user_id',
      setting_value: userId.toString(),
      is_local: true
    });
    
    if (error) {
      console.warn('⚠️ Не удалось установить пользовательский контекст:', error.message);
    }
  } catch (error) {
    console.warn('⚠️ Ошибка установки контекста:', error.message);
  }
};

// Проверка состояния подключения
const healthCheck = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      supabase_url: supabaseUrl
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};

// Проверка существования таблиц
const checkTables = async () => {
  try {
    const requiredTables = ['users', 'tasks', 'donations', 'notifications'];
    const results = [];
    
    for (const table of requiredTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.error(`❌ Таблица ${table} недоступна:`, error.message);
          results.push({ table, exists: false, error: error.message });
        } else {
          results.push({ table, exists: true });
        }
      } catch (err) {
        results.push({ table, exists: false, error: err.message });
      }
    }
    
    const missingTables = results.filter(r => !r.exists);
    
    if (missingTables.length > 0) {
      console.error('❌ Отсутствуют или недоступны таблицы:', 
        missingTables.map(t => t.table).join(', '));
      return false;
    }
    
    console.log('✅ Все необходимые таблицы доступны:', 
      results.map(r => r.table).join(', '));
    return true;
    
  } catch (error) {
    console.error('❌ Ошибка проверки таблиц:', error.message);
    return false;
  }
};

module.exports = {
  supabase,
  query,
  findUserByTelegramId,
  createUser,
  getUserTasks,
  createTask,
  updateTask,
  deleteTask,
  setUserContext,
  healthCheck,
  checkTables
};
