// src/routes/auth.js
// Роуты для аутентификации

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, findUserByTelegramId, createUser } = require('../config/database');

const router = express.Router();

// Проверка подписи Telegram WebApp данных
const verifyTelegramWebAppData = (initData) => {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN не установлен');
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      throw new Error('Hash отсутствует в данных');
    }
    
    urlParams.delete('hash');

    // Создаем строку для проверки
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Создаем секретный ключ
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    // Вычисляем hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return hash === calculatedHash;
  } catch (error) {
    console.error('❌ Ошибка проверки Telegram данных:', error);
    return false;
  }
};

// Парсинг пользовательских данных из initData
const parseUserFromInitData = (initData) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const userJson = urlParams.get('user');
    
    if (!userJson) {
      throw new Error('Пользовательские данные отсутствуют');
    }
    
    const userData = JSON.parse(decodeURIComponent(userJson));
    
    return {
      telegram_id: userData.id,
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      telegram_username: userData.username || null,
      language_code: userData.language_code || 'ru'
    };
  } catch (error) {
    console.error('❌ Ошибка парсинга пользовательских данных:', error);
    return null;
  }
};

// Создание JWT токена
const createJWTToken = (user) => {
  const payload = {
    userId: user.id,
    telegramId: user.telegram_id,
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Данные инициализации Telegram отсутствуют'
      });
    }

    // Проверяем подпись данных Telegram
    const isValid = verifyTelegramWebAppData(initData);
    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Неверная подпись данных Telegram'
      });
    }

    // Парсим данные пользователя
    const telegramUserData = parseUserFromInitData(initData);
    if (!telegramUserData) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Некорректные данные пользователя'
      });
    }

    // Ищем существующего пользователя
    let user = await findUserByTelegramId(telegramUserData.telegram_id);
    
    if (!user || user.length === 0) {
      // Создаем нового пользователя
      console.log(`➕ Создание нового пользователя: ${telegramUserData.first_name} (${telegramUserData.telegram_id})`);
      
      const newUserData = {
        ...telegramUserData,
        settings: {
          notifications: true,
          reminder_time: '09:00'
        }
      };
      
      const createdUsers = await createUser(newUserData);
      user = createdUsers[0];
    } else {
      user = user[0];
      
      // Обновляем данные пользователя (имя, username могут измениться)
      await query(`
        UPDATE users 
        SET 
          first_name = $1,
          last_name = $2,
          telegram_username = $3,
          language_code = $4,
          updated_at = NOW()
        WHERE id = $5
      `, [
        telegramUserData.first_name,
        telegramUserData.last_name,
        telegramUserData.telegram_username,
        telegramUserData.language_code,
        user.id
      ]);
      
      console.log(`👤 Авторизация существующего пользователя: ${user.first_name} (${user.telegram_id})`);
    }

    // Создаем JWT токен
    const token = createJWTToken(user);

    // Возвращаем успешный ответ
    res.json({
      success: true,
      message: 'Авторизация успешна',
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        telegram_username: user.telegram_username,
        language_code: user.language_code,
        settings: user.settings,
        total_donated: user.total_donated || 0,
        created_at: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('❌ Ошибка авторизации:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка сервера при авторизации'
    });
  }
});

// POST /api/auth/refresh - обновление токена
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Токен авторизации отсутствует'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
      
      // Ищем пользователя
      const users = await query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
      
      if (!users.rows || users.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Пользователь не найден'
        });
      }

      const user = users.rows[0];
      
      // Создаем новый токен
      const newToken = createJWTToken(user);

      res.json({
        success: true,
        token: newToken,
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          first_name: user.first_name,
          last_name: user.last_name,
          telegram_username: user.telegram_username,
          language_code: user.language_code,
          settings: user.settings
        }
      });

    } catch (jwtError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный токен'
      });
    }

  } catch (error) {
    console.error('❌ Ошибка обновления токена:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка сервера при обновлении токена'
    });
  }
});

// GET /api/auth/me - получение информации о текущем пользователе
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Токен авторизации отсутствует'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Ищем пользователя
      const users = await query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
      
      if (!users.rows || users.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Пользователь не найден'
        });
      }

      const user = users.rows[0];

      res.json({
        success: true,
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          first_name: user.first_name,
          last_name: user.last_name,
          telegram_username: user.telegram_username,
          language_code: user.language_code,
          timezone: user.timezone,
          settings: user.settings,
          total_donated: user.total_donated || 0,
          created_at: user.created_at
        }
      });

    } catch (jwtError) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный токен'
      });
    }

  } catch (error) {
    console.error('❌ Ошибка получения данных пользователя:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка сервера'
    });
  }
});

module.exports = router;
