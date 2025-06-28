// src/routes/users.js
// API роуты для управления пользователями

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateUserProfile, validateUserSettings } = require('../middleware/validation');
const { query } = require('../config/database');

const router = express.Router();

// Применяем аутентификацию ко всем роутам
router.use(authenticateToken);

// GET /api/users/profile - получить профиль пользователя
router.get('/profile', async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(`
      SELECT 
        id,
        telegram_id,
        telegram_username,
        first_name,
        last_name,
        language_code,
        timezone,
        settings,
        total_donated,
        created_at,
        updated_at
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        telegram_username: user.telegram_username,
        first_name: user.first_name,
        last_name: user.last_name,
        language_code: user.language_code,
        timezone: user.timezone,
        settings: user.settings,
        total_donated: user.total_donated || 0,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения профиля:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении профиля'
    });
  }
});

// PUT /api/users/profile - обновить профиль пользователя
router.put('/profile', validateUserProfile, async (req, res) => {
  try {
    const userId = req.userId;
    const updateData = req.body;

    // Строим динамический запрос обновления
    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = ['first_name', 'last_name', 'language_code', 'timezone'];

    for (const field of allowedFields) {
      if (updateData.hasOwnProperty(field)) {
        updateFields.push(`${field} = $${paramIndex}`);
        params.push(updateData[field]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Нет данных для обновления'
      });
    }

    // Добавляем updated_at
    updateFields.push(`updated_at = NOW()`);
    
    // Добавляем условие WHERE
    params.push(userId);
    
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING 
        id, telegram_id, telegram_username, first_name, last_name, 
        language_code, timezone, settings, total_donated, 
        created_at, updated_at
    `;

    const result = await query(updateQuery, params);
    const updatedUser = result.rows[0];

    console.log(`👤 Обновлен профиль пользователя: ${updatedUser.first_name} (${updatedUser.telegram_id})`);

    res.json({
      success: true,
      message: 'Профиль обновлен успешно',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Ошибка обновления профиля:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при обновлении профиля'
    });
  }
});

// GET /api/users/settings - получить настройки пользователя
router.get('/settings', async (req, res) => {
  try {
    const userId = req.userId;

    const result = await query(
      'SELECT settings, timezone FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      settings: {
        ...user.settings,
        timezone: user.timezone
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения настроек:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении настроек'
    });
  }
});

// PUT /api/users/settings - обновить настройки пользователя
router.put('/settings', validateUserSettings, async (req, res) => {
  try {
    const userId = req.userId;
    const { notifications, reminder_time } = req.body;

    // Получаем текущие настройки
    const currentResult = await query(
      'SELECT settings FROM users WHERE id = $1',
      [userId]
    );

    if (!currentResult.rows || currentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    const currentSettings = currentResult.rows[0].settings || {};

    // Обновляем настройки
    const newSettings = {
      ...currentSettings,
      ...(notifications !== undefined && { notifications }),
      ...(reminder_time !== undefined && { reminder_time })
    };

    const updateQuery = `
      UPDATE users 
      SET 
        settings = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING settings, timezone
    `;

    const result = await query(updateQuery, [JSON.stringify(newSettings), userId]);
    const updatedUser = result.rows[0];

    console.log(`⚙️ Обновлены настройки пользователя: ${req.user.first_name} (${req.user.telegram_id})`);

    res.json({
      success: true,
      message: 'Настройки обновлены успешно',
      settings: {
        ...updatedUser.settings,
        timezone: updatedUser.timezone
      }
    });

  } catch (error) {
    console.error('❌ Ошибка обновления настроек:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при обновлении настроек'
    });
  }
});

// GET /api/users/stats - получить статистику пользователя
router.get('/stats', async (req, res) => {
  try {
    const userId = req.userId;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE completed = TRUE) as completed_tasks,
        COUNT(*) FILTER (WHERE completed = FALSE) as active_tasks,
        COUNT(*) FILTER (WHERE due_date = CURRENT_DATE AND completed = FALSE) as today_tasks,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND completed = FALSE) as overdue_tasks,
        COUNT(*) FILTER (WHERE is_recurring = TRUE) as recurring_tasks,
        COUNT(*) FILTER (WHERE priority = 'high' AND completed = FALSE) as high_priority_tasks,
        ROUND(
          CASE 
            WHEN COUNT(*) > 0 THEN
              COUNT(*) FILTER (WHERE completed = TRUE)::NUMERIC / COUNT(*) * 100
            ELSE 0
          END, 1
        ) as completion_rate,
        COALESCE(MAX(completed_at), NULL) as last_completed_task,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as tasks_this_week,
        COUNT(*) FILTER (WHERE completed_at >= CURRENT_DATE - INTERVAL '7 days') as completed_this_week
      FROM tasks 
      WHERE user_id = $1
    `;

    const result = await query(statsQuery, [userId]);
    const stats = result.rows[0];

    // Получаем информацию о пользователе
    const userResult = await query(
      'SELECT created_at, total_donated FROM users WHERE id = $1',
      [userId]
    );
    
    const user = userResult.rows[0];
    const daysSinceJoined = Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      stats: {
        tasks: {
          total: parseInt(stats.total_tasks),
          completed: parseInt(stats.completed_tasks),
          active: parseInt(stats.active_tasks),
          today: parseInt(stats.today_tasks),
          overdue: parseInt(stats.overdue_tasks),
          recurring: parseInt(stats.recurring_tasks),
          highPriority: parseInt(stats.high_priority_tasks)
        },
        performance: {
          completionRate: parseFloat(stats.completion_rate),
          tasksThisWeek: parseInt(stats.tasks_this_week),
          completedThisWeek: parseInt(stats.completed_this_week),
          lastCompletedTask: stats.last_completed_task
        },
        account: {
          daysSinceJoined,
          totalDonated: user.total_donated || 0,
          joinedAt: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения статистики пользователя:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении статистики'
    });
  }
});

// DELETE /api/users/account - удалить аккаунт пользователя
router.delete('/account', async (req, res) => {
  try {
    const userId = req.userId;

    // Получаем информацию о пользователе для логирования
    const userResult = await query(
      'SELECT first_name, telegram_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    const user = userResult.rows[0];

    // Удаляем пользователя (каскадное удаление удалит все связанные данные)
    await query('DELETE FROM users WHERE id = $1', [userId]);

    console.log(`🗑️ Удален аккаунт пользователя: ${user.first_name} (${user.telegram_id})`);

    res.json({
      success: true,
      message: 'Аккаунт успешно удален'
    });

  } catch (error) {
    console.error('❌ Ошибка удаления аккаунта:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при удалении аккаунта'
    });
  }
});

// POST /api/users/export - экспортировать данные пользователя
router.post('/export', async (req, res) => {
  try {
    const userId = req.userId;

    // Получаем все данные пользователя
    const userResult = await query(`
      SELECT 
        telegram_id, telegram_username, first_name, last_name,
        language_code, timezone, settings, created_at
      FROM users WHERE id = $1
    `, [userId]);

    const tasksResult = await query(`
      SELECT 
        title, description, due_date, due_time, priority,
        completed, completed_at, is_recurring, repeat_type,
        repeat_interval, repeat_unit, created_at
      FROM tasks WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    const exportData = {
      user: userResult.rows[0],
      tasks: tasksResult.rows || [],
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    console.log(`📤 Экспорт данных пользователя: ${req.user.first_name} (${req.user.telegram_id})`);

    res.json({
      success: true,
      message: 'Данные экспортированы успешно',
      data: exportData
    });

  } catch (error) {
    console.error('❌ Ошибка экспорта данных:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при экспорте данных'
    });
  }
});

module.exports = router;
