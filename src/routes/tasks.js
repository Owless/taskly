// src/routes/tasks.js
// API роуты для управления задачами

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateTask, validateTaskUpdate } = require('../middleware/validation');
const { query } = require('../config/database');

const router = express.Router();

// Применяем аутентификацию ко всем роутам
router.use(authenticateToken);

// GET /api/tasks - получить задачи пользователя
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      filter = 'all', 
      limit = 50, 
      offset = 0,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    let whereClause = 'WHERE user_id = $1';
    let params = [userId];
    let paramIndex = 2;

    // Применяем фильтры
    switch (filter) {
      case 'today':
        whereClause += ` AND due_date = CURRENT_DATE AND completed = FALSE`;
        break;
      case 'tomorrow':
        whereClause += ` AND due_date = CURRENT_DATE + 1 AND completed = FALSE`;
        break;
      case 'week':
        whereClause += ` AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND completed = FALSE`;
        break;
      case 'overdue':
        whereClause += ` AND due_date < CURRENT_DATE AND completed = FALSE`;
        break;
      case 'completed':
        whereClause += ` AND completed = TRUE`;
        break;
      case 'no_date':
        whereClause += ` AND due_date IS NULL AND completed = FALSE`;
        break;
      case 'active':
        whereClause += ` AND completed = FALSE`;
        break;
      // 'all' - без дополнительных условий
    }

    // Валидация сортировки
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title', 'completed_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const tasksQuery = `
      SELECT 
        id,
        title,
        description,
        due_date,
        due_time,
        priority,
        completed,
        completed_at,
        is_recurring,
        repeat_type,
        repeat_interval,
        repeat_unit,
        repeat_end_date,
        parent_task_id,
        created_at,
        updated_at
      FROM tasks
      ${whereClause}
      ORDER BY 
        CASE WHEN completed = FALSE AND due_date < CURRENT_DATE THEN 0 ELSE 1 END,
        ${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await query(tasksQuery, params);
    const tasks = result.rows || [];

    // Получаем общее количество задач для пагинации
    const countQuery = `SELECT COUNT(*) as total FROM tasks ${whereClause}`;
    const countResult = await query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0]?.total || 0);

    res.json({
      success: true,
      tasks,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения задач:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении задач'
    });
  }
});

// GET /api/tasks/stats - получить статистику задач
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
        ROUND(
          CASE 
            WHEN COUNT(*) > 0 THEN
              COUNT(*) FILTER (WHERE completed = TRUE)::NUMERIC / COUNT(*) * 100
            ELSE 0
          END, 1
        ) as completion_rate
      FROM tasks 
      WHERE user_id = $1
    `;

    const result = await query(statsQuery, [userId]);
    const stats = result.rows[0];

    res.json({
      success: true,
      stats: {
        total: parseInt(stats.total_tasks),
        completed: parseInt(stats.completed_tasks),
        active: parseInt(stats.active_tasks),
        today: parseInt(stats.today_tasks),
        overdue: parseInt(stats.overdue_tasks),
        completionRate: parseFloat(stats.completion_rate)
      }
    });

  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении статистики'
    });
  }
});

// GET /api/tasks/:id - получить конкретную задачу
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Задача не найдена'
      });
    }

    res.json({
      success: true,
      task: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Ошибка получения задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при получении задачи'
    });
  }
});

// POST /api/tasks - создать новую задачу
router.post('/', validateTask, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      title,
      description,
      due_date,
      due_time,
      priority = 'medium',
      is_recurring = false,
      repeat_type,
      repeat_interval,
      repeat_unit,
      repeat_end_date
    } = req.body;

    const insertQuery = `
      INSERT INTO tasks (
        user_id, title, description, due_date, due_time, priority,
        is_recurring, repeat_type, repeat_interval, repeat_unit, repeat_end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const params = [
      userId,
      title.trim(),
      description ? description.trim() : null,
      due_date || null,
      due_time || null,
      priority,
      is_recurring,
      is_recurring ? repeat_type : null,
      is_recurring ? repeat_interval : null,
      is_recurring ? repeat_unit : null,
      is_recurring ? repeat_end_date : null
    ];

    const result = await query(insertQuery, params);
    const newTask = result.rows[0];

    console.log(`➕ Создана новая задача: "${title}" пользователем ${req.user.first_name}`);

    res.status(201).json({
      success: true,
      message: 'Задача создана успешно',
      task: newTask
    });

  } catch (error) {
    console.error('❌ Ошибка создания задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при создании задачи'
    });
  }
});

// PUT /api/tasks/:id - обновить задачу
router.put('/:id', validateTaskUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const updateData = req.body;

    // Проверяем существование задачи
    const existingTask = await query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!existingTask.rows || existingTask.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Задача не найдена'
      });
    }

    // Строим динамический запрос обновления
    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
      'title', 'description', 'due_date', 'due_time', 'priority',
      'is_recurring', 'repeat_type', 'repeat_interval', 'repeat_unit', 'repeat_end_date'
    ];

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
    
    // Добавляем условия WHERE
    params.push(id, userId);
    
    const updateQuery = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await query(updateQuery, params);
    const updatedTask = result.rows[0];

    console.log(`✏️ Обновлена задача: "${updatedTask.title}" пользователем ${req.user.first_name}`);

    res.json({
      success: true,
      message: 'Задача обновлена успешно',
      task: updatedTask
    });

  } catch (error) {
    console.error('❌ Ошибка обновления задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при обновлении задачи'
    });
  }
});

// POST /api/tasks/:id/complete - отметить задачу как выполненную
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Проверяем существование задачи
    const existingTask = await query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!existingTask.rows || existingTask.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Задача не найдена'
      });
    }

    const task = existingTask.rows[0];

    if (task.completed) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Задача уже выполнена'
      });
    }

    // Отмечаем задачу как выполненную
    const updateQuery = `
      UPDATE tasks 
      SET 
        completed = TRUE, 
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await query(updateQuery, [id, userId]);
    const completedTask = result.rows[0];

    // Если это повторяющаяся задача, создаем следующий экземпляр
    if (task.is_recurring && task.repeat_type) {
      await createNextRecurringTask(task);
    }

    console.log(`✅ Выполнена задача: "${completedTask.title}" пользователем ${req.user.first_name}`);

    res.json({
      success: true,
      message: 'Задача отмечена как выполненная',
      task: completedTask
    });

  } catch (error) {
    console.error('❌ Ошибка выполнения задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при выполнении задачи'
    });
  }
});

// POST /api/tasks/:id/uncomplete - отменить выполнение задачи
router.post('/:id/uncomplete', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const updateQuery = `
      UPDATE tasks 
      SET 
        completed = FALSE, 
        completed_at = NULL,
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND completed = TRUE
      RETURNING *
    `;

    const result = await query(updateQuery, [id, userId]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Выполненная задача не найдена'
      });
    }

    const task = result.rows[0];

    console.log(`↩️ Отменено выполнение задачи: "${task.title}" пользователем ${req.user.first_name}`);

    res.json({
      success: true,
      message: 'Выполнение задачи отменено',
      task
    });

  } catch (error) {
    console.error('❌ Ошибка отмены выполнения задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при отмене выполнения задачи'
    });
  }
});

// DELETE /api/tasks/:id - удалить задачу
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Сначала получаем информацию о задаче для логирования
    const taskResult = await query(
      'SELECT title FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!taskResult.rows || taskResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Задача не найдена'
      });
    }

    const taskTitle = taskResult.rows[0].title;

    // Удаляем задачу
    const deleteResult = await query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    console.log(`🗑️ Удалена задача: "${taskTitle}" пользователем ${req.user.first_name}`);

    res.json({
      success: true,
      message: 'Задача удалена успешно'
    });

  } catch (error) {
    console.error('❌ Ошибка удаления задачи:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ошибка при удалении задачи'
    });
  }
});

// Функция создания следующей повторяющейся задачи
async function createNextRecurringTask(parentTask) {
  try {
    if (!parentTask.due_date || !parentTask.repeat_type) {
      return;
    }

    const currentDate = new Date(parentTask.due_date);
    let nextDate = new Date(currentDate);

    // Вычисляем следующую дату
    switch (parentTask.repeat_type) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + (parentTask.repeat_interval || 1));
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + ((parentTask.repeat_interval || 1) * 7));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + (parentTask.repeat_interval || 1));
        break;
      default:
        return;
    }

    // Проверяем, не превышает ли дата окончания повторений
    if (parentTask.repeat_end_date) {
      const endDate = new Date(parentTask.repeat_end_date);
      if (nextDate > endDate) {
        return; // Не создаем задачу после даты окончания
      }
    }

    // Создаем новую задачу
    const insertQuery = `
      INSERT INTO tasks (
        user_id, title, description, due_date, due_time, priority,
        is_recurring, repeat_type, repeat_interval, repeat_unit, repeat_end_date,
        parent_task_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    const params = [
      parentTask.user_id,
      parentTask.title,
      parentTask.description,
      nextDate.toISOString().split('T')[0], // YYYY-MM-DD
      parentTask.due_time,
      parentTask.priority,
      parentTask.is_recurring,
      parentTask.repeat_type,
      parentTask.repeat_interval,
      parentTask.repeat_unit,
      parentTask.repeat_end_date,
      parentTask.parent_task_id || parentTask.id
    ];

    await query(insertQuery, params);
    console.log(`🔄 Создана следующая повторяющаяся задача: "${parentTask.title}"`);

  } catch (error) {
    console.error('❌ Ошибка создания повторяющейся задачи:', error);
  }
}

module.exports = router;
