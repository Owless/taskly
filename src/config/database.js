// src/config/database.js
// Простое подключение к существующей Supabase базе данных

const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Проверяем наличие необходимых переменных
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceKey || !databaseUrl) {
  console.error('❌ Отсутствуют необходимые переменные окружения для базы данных:');
  console.error('- SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  console.error('- DATABASE_URL:', !!databaseUrl);
  process.exit(1);
}

// Supabase клиент с service role (полные права для backend)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Прямое подключение к PostgreSQL
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // максимум подключений
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Логирование подключений
pool.on('connect', () => {
  console.log('✅ Подключение к Supabase PostgreSQL установлено');
});

pool.on('error', (err) => {
  console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
});

// Основная функция для SQL запросов
const query = async (text, params = []) => {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Логируем только в development режиме
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true') {
      console.log(`🔍 SQL (${duration}ms): ${text.substring(0, 60)}...`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ SQL Error:', {
      query: text.substring(0, 100) + '...',
      error: error.message
    });
    throw error;
  }
};

// Функция для установки контекста пользователя (для Row Level Security)
const setUserContext = async (userId) => {
  if (!userId) return;
  
  try {
    await query('SELECT set_config($1, $2, true)', [
      'app.current_user_id', 
      userId.toString()
    ]);
  } catch (error) {
    console.warn('⚠️ Не удалось установить пользовательский контекст:', error.message);
  }
};

// Проверка здоровья базы данных
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as current_time');
    return {
      status: 'ok',
      timestamp: result.rows[0].current_time,
      connections: pool.totalCount
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
};

// Проверка существования таблиц при запуске
const checkTables = async () => {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'tasks', 'donations', 'notifications')
      ORDER BY table_name;
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['users', 'tasks', 'donations', 'notifications'];
    
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.error('❌ Отсутствуют таблицы:', missingTables);
      console.error('💡 Убедитесь, что SQL схема была применена к базе данных');
      return false;
    }
    
    console.log('✅ Все необходимые таблицы найдены:', existingTables);
    return true;
  } catch (error) {
    console.error('❌ Ошибка проверки таблиц:', error.message);
    return false;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Закрываем подключения к базе данных...');
  await pool.end();
  console.log('✅ Подключения закрыты');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Получен SIGTERM, закрываем подключения...');
  await pool.end();
  process.exit(0);
});

module.exports = {
  supabase,
  pool,
  query,
  setUserContext,
  healthCheck,
  checkTables
};
