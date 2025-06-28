const database = require('../config/database');
const logger = require('../utils/logger');
const { 
  TASK_PRIORITIES, 
  REPEAT_TYPES, 
  REPEAT_UNITS,
  LIMITS 
} = require('../config/constants');
const { 
  getNextRecurringDate, 
  isOverdue, 
  isDueToday, 
  isDueTomorrow,
  getCurrentDate 
} = require('../utils/dateHelpers');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class Task {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  // Создать новую задачу
  static async create(taskData, userId) {
    try {
      const supabase = database.getClient();
      
      const newTask = {
        user_id: userId,
        title: taskData.title.trim(),
        description: taskData.description?.trim() || null,
        due_date: taskData.due_date || null,
        due_time: taskData.due_time || null,
        priority: taskData.priority || TASK_PRIORITIES.MEDIUM,
        is_recurring: taskData.is_recurring || false,
        repeat_type: taskData.repeat_type || null,
        repeat_interval: taskData.repeat_interval || null,
        repeat_unit: taskData.repeat_unit || null,
        repeat_end_date: taskData.repeat_end_date || null,
        parent_task_id: taskData.parent_task_id || null
      };

      // Валидация повторяющейся задачи
      if (newTask.is_recurring && !newTask.repeat_type) {
        throw new ValidationError('repeat_type is required for recurring tasks');
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask])
        .select()
        .single();

      if (error) {
        logger.error('Failed to create task', { error, taskData, userId });
        throw error;
      }

      logger.info('Task created successfully', { 
        taskId: data.id, 
        userId,
        title: data.title 
      });

      return new Task(data);
    } catch (error) {
      if (error.code === '23514') { // check_violation
        throw new ValidationError('Invalid task data');
      }
      throw error;
    }
  }

  // Найти задачу по ID
  static async findById(taskId, userId = null) {
    try {
      const supabase = database.getClient();
      
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return new Task(data);
    } catch (error) {
      logger.error('Failed to find task by ID', { error, taskId, userId });
      throw error;
    }
  }

  // Получить задачи пользователя с фильтрацией
  static async findByUser(userId, filters = {}) {
    try {
      const {
        status = 'all',
        priority = null,
        search = '',
        limit = LIMITS.TASKS_PER_PAGE,
        offset = 0,
        sort_by = 'due_date',
        sort_order = 'asc'
      } = filters;

      const supabase = database.getClient();
      
      let query = supabase
        .from('tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Фильтр по статусу
      switch (status) {
        case 'today':
          query = query
            .eq('completed', false)
            .eq('due_date', getCurrentDate());
          break;
        case 'tomorrow':
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          query = query
            .eq('completed', false)
            .eq('due_date', tomorrow.toISOString().split('T')[0]);
          break;
        case 'week':
          const weekEnd = new Date();
          weekEnd.setDate(weekEnd.getDate() + 7);
          query = query
            .eq('completed', false)
            .gte('due_date', getCurrentDate())
            .lte('due_date', weekEnd.toISOString().split('T')[0]);
          break;
        case 'overdue':
          query = query
            .eq('completed', false)
            .lt('due_date', getCurrentDate());
          break;
        case 'no_date':
          query = query
            .eq('completed', false)
            .is('due_date', null);
          break;
        case 'completed':
          query = query.eq('completed', true);
          break;
        default: // 'all'
          query = query.eq('completed', false);
      }

      // Фильтр по приоритету
      if (priority && Object.values(TASK_PRIORITIES).includes(priority)) {
        query = query.eq('priority', priority);
      }

      // Поиск по тексту
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }

      // Сортировка
      const validSortFields = ['due_date', 'priority', 'created_at', 'title'];
      if (validSortFields.includes(sort_by)) {
        const ascending = sort_order === 'asc';
        
        if (sort_by === 'due_date') {
          // Специальная логика для сортировки по дате
          query = query.order('due_date', { ascending, nullsFirst: !ascending });
        } else if (sort_by === 'priority') {
          // Сортировка по приоритету (high -> medium -> low)
          query = query.order('priority', { ascending: !ascending });
        } else {
          query = query.order(sort_by, { ascending });
        }
      }

      const { data, error, count } = await query
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      // Добавляем статус для каждой задачи
      const tasksWithStatus = (data || []).map(taskData => {
        const task = new Task(taskData);
        task.status = task.getStatus();
        return task;
      });

      return {
        tasks: tasksWithStatus,
        total: count || 0,
        hasMore: count > offset + limit
      };
    } catch (error) {
      logger.error('Failed to find tasks by user', { error, userId, filters });
      throw error;
    }
  }

  // Обновить задачу
  async update(updates) {
    try {
      const supabase = database.getClient();
      
      // Фильтруем только разрешенные поля
      const allowedFields = [
        'title', 'description', 'due_date', 'due_time', 'priority',
        'is_recurring', 'repeat_type', 'repeat_interval', 'repeat_unit', 'repeat_end_date'
      ];
      
      const filteredUpdates = {};
      allowedFields.forEach(field => {
        if (updates.hasOwnProperty(field)) {
          filteredUpdates[field] = updates[field];
        }
      });

      if (Object.keys(filteredUpdates).length === 0) {
        return this;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(filteredUpdates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);
      
      logger.info('Task updated successfully', { 
        taskId: this.id, 
        updates: Object.keys(filteredUpdates)
      });

      return this;
    } catch (error) {
      logger.error('Failed to update task', { error, taskId: this.id, updates });
      throw error;
    }
  }

  // Отметить задачу как выполненную
  async markCompleted() {
    try {
      const supabase = database.getClient();
      
      const updates = {
        completed: true,
        completed_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);

      logger.info('Task marked as completed', { taskId: this.id });

      // Создаем следующий экземпляр для повторяющихся задач
      if (this.is_recurring) {
        await this.createNextRecurringInstance();
      }

      return this;
    } catch (error) {
      logger.error('Failed to mark task as completed', { error, taskId: this.id });
      throw error;
    }
  }

  // Отметить задачу как невыполненную
  async markIncomplete() {
    try {
      const supabase = database.getClient();
      
      const updates = {
        completed: false,
        completed_at: null
      };

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', this.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      Object.assign(this, data);

      logger.info('Task marked as incomplete', { taskId: this.id });

      return this;
    } catch (error) {
      logger.error('Failed to mark task as incomplete', { error, taskId: this.id });
      throw error;
    }
  }

  // Удалить задачу
  async delete() {
    try {
      const supabase = database.getClient();
      
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw error;
      }

      logger.info('Task deleted successfully', { taskId: this.id });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete task', { error, taskId: this.id });
      throw error;
    }
  }

  // Создать следующий экземпляр повторяющейся задачи
  async createNextRecurringInstance() {
    try {
      if (!this.is_recurring || !this.due_date) {
        return null;
      }

      const nextDate = getNextRecurringDate(
        this.due_date,
        this.repeat_type,
        this.repeat_interval,
        this.repeat_unit
      );

      if (!nextDate) {
        return null;
      }

      // Проверяем, не превышает ли дата окончания
      if (this.repeat_end_date && nextDate > new Date(this.repeat_end_date)) {
        return null;
      }

      const nextTask = await Task.create({
        title: this.title,
        description: this.description,
        due_date: nextDate.toISOString().split('T')[0],
        due_time: this.due_time,
        priority: this.priority,
        is_recurring: this.is_recurring,
        repeat_type: this.repeat_type,
        repeat_interval: this.repeat_interval,
        repeat_unit: this.repeat_unit,
        repeat_end_date: this.repeat_end_date,
        parent_task_id: this.parent_task_id || this.id
      }, this.user_id);

      logger.info('Next recurring task instance created', {
        originalTaskId: this.id,
        nextTaskId: nextTask.id,
        nextDate: nextDate.toISOString()
      });

      return nextTask;
    } catch (error) {
      logger.error('Failed to create next recurring instance', {
        error,
        taskId: this.id
      });
      throw error;
    }
  }

  // Получить статус задачи
  getStatus(timezone = 'Europe/Moscow') {
    if (this.completed) {
      return 'completed';
    }

    if (!this.due_date) {
      return 'no_date';
    }

    if (isOverdue(this.due_date, timezone)) {
      return 'overdue';
    }

    if (isDueToday(this.due_date, timezone)) {
      return 'due_today';
    }

    if (isDueTomorrow(this.due_date, timezone)) {
      return 'due_tomorrow';
    }

    const dueDate = new Date(this.due_date);
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return 'due_this_week';
    }

    return 'upcoming';
  }

  // Дублировать задачу
  async duplicate(userId = null) {
    try {
      const targetUserId = userId || this.user_id;
      
      const duplicateData = {
        title: `${this.title} (копия)`,
        description: this.description,
        due_date: this.due_date,
        due_time: this.due_time,
        priority: this.priority,
        is_recurring: false // Копии не наследуют повторение
      };

      const duplicate = await Task.create(duplicateData, targetUserId);
      
      logger.info('Task duplicated', {
        originalId: this.id,
        duplicateId: duplicate.id,
        targetUserId
      });

      return duplicate;
    } catch (error) {
      logger.error('Failed to duplicate task', { error, taskId: this.id });
      throw error;
    }
  }

  // Получить связанные задачи (для повторяющихся)
  async getRelatedTasks() {
    try {
      const supabase = database.getClient();
      
      const parentId = this.parent_task_id || this.id;
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .or(`id.eq.${parentId},parent_task_id.eq.${parentId}`)
        .order('due_date', { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []).map(taskData => new Task(taskData));
    } catch (error) {
      logger.error('Failed to get related tasks', { error, taskId: this.id });
      throw error;
    }
  }

  // Проверить, нужно ли отправить уведомление
  shouldSendNotification(timezone = 'Europe/Moscow') {
    if (this.completed || this.notification_sent) {
      return false;
    }

    const status = this.getStatus(timezone);
    return ['overdue', 'due_today', 'due_tomorrow'].includes(status);
  }

  // Отметить уведомление как отправленное
  async markNotificationSent() {
    try {
      const supabase = database.getClient();
      
      const { error } = await supabase
        .from('tasks')
        .update({ notification_sent: true })
        .eq('id', this.id);

      if (error) {
        throw error;
      }

      this.notification_sent = true;
      return this;
    } catch (error) {
      logger.error('Failed to mark notification sent', { error, taskId: this.id });
      throw error;
    }
  }

  // Преобразовать в JSON для API
  toJSON() {
    return {
      ...this,
      status: this.getStatus()
    };
  }

  // Проверить права доступа
  canBeAccessedBy(userId) {
    return this.user_id === userId;
  }
}

module.exports = Task;
