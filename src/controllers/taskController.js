const Task = require('../models/Task');
const User = require('../models/User');
const logger = require('../utils/logger');
const { 
  createTaskSchema, 
  updateTaskSchema, 
  taskFiltersSchema, 
  validate 
} = require('../utils/validators');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { LIMITS } = require('../config/constants');

class TaskController {
  // Получить список задач пользователя
  static async getTasks(req, res, next) {
    try {
      // Валидируем и устанавливаем значения по умолчанию для фильтров
      const filters = validate(taskFiltersSchema, req.query);
      
      const result = await Task.findByUser(req.user.id, filters);

      logger.info('Tasks retrieved', {
        userId: req.user.id,
        filters,
        count: result.tasks.length,
        total: result.total
      });

      res.json({
        success: true,
        data: {
          tasks: result.tasks.map(task => task.toJSON()),
          pagination: {
            total: result.total,
            limit: filters.limit,
            offset: filters.offset,
            hasMore: result.hasMore
          }
        }
      });

    } catch (error) {
      logger.error('Get tasks failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }

  // Получить конкретную задачу
  static async getTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Получаем связанные задачи для повторяющихся
      let relatedTasks = [];
      if (task.is_recurring) {
        relatedTasks = await task.getRelatedTasks();
      }

      res.json({
        success: true,
        data: {
          task: task.toJSON(),
          relatedTasks: relatedTasks.map(t => t.toJSON())
        }
      });

    } catch (error) {
      logger.error('Get task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Создать новую задачу
  static async createTask(req, res, next) {
    try {
      // Проверяем лимит задач пользователя
      const userStats = await req.user.getStats();
      if (userStats.active_tasks >= LIMITS.MAX_TASKS_PER_USER) {
        throw new ValidationError(`Maximum ${LIMITS.MAX_TASKS_PER_USER} tasks allowed`);
      }

      // Валидируем данные задачи
      const taskData = validate(createTaskSchema, req.body);
      
      // Создаем задачу
      const task = await Task.create(taskData, req.user.id);

      logger.info('Task created', {
        taskId: task.id,
        userId: req.user.id,
        title: task.title,
        isRecurring: task.is_recurring
      });

      res.status(201).json({
        success: true,
        data: {
          task: task.toJSON()
        },
        message: 'Task created successfully'
      });

    } catch (error) {
      logger.error('Create task failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Обновить задачу
  static async updateTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Валидируем обновления
      const updates = validate(updateTaskSchema, req.body);
      
      // Обновляем задачу
      await task.update(updates);

      logger.info('Task updated', {
        taskId: task.id,
        userId: req.user.id,
        updates: Object.keys(updates)
      });

      res.json({
        success: true,
        data: {
          task: task.toJSON()
        },
        message: 'Task updated successfully'
      });

    } catch (error) {
      logger.error('Update task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }

  // Удалить задачу
  static async deleteTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      await task.delete();

      logger.info('Task deleted', {
        taskId: task.id,
        userId: req.user.id,
        title: task.title
      });

      res.json({
        success: true,
        message: 'Task deleted successfully'
      });

    } catch (error) {
      logger.error('Delete task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Отметить задачу как выполненную
  static async completeTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      if (task.completed) {
        throw new ValidationError('Task is already completed');
      }

      await task.markCompleted();

      logger.info('Task completed', {
        taskId: task.id,
        userId: req.user.id,
        title: task.title,
        wasRecurring: task.is_recurring
      });

      res.json({
        success: true,
        data: {
          task: task.toJSON()
        },
        message: 'Task completed successfully'
      });

    } catch (error) {
      logger.error('Complete task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Отметить задачу как невыполненную
  static async uncompleteTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      if (!task.completed) {
        throw new ValidationError('Task is not completed');
      }

      await task.markIncomplete();

      logger.info('Task marked as incomplete', {
        taskId: task.id,
        userId: req.user.id,
        title: task.title
      });

      res.json({
        success: true,
        data: {
          task: task.toJSON()
        },
        message: 'Task marked as incomplete'
      });

    } catch (error) {
      logger.error('Uncomplete task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Дублировать задачу
  static async duplicateTask(req, res, next) {
    try {
      const { id } = req.params;
      
      const task = await Task.findById(id, req.user.id);
      
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      // Проверяем лимит задач
      const userStats = await req.user.getStats();
      if (userStats.active_tasks >= LIMITS.MAX_TASKS_PER_USER) {
        throw new ValidationError(`Maximum ${LIMITS.MAX_TASKS_PER_USER} tasks allowed`);
      }

      const duplicate = await task.duplicate();

      logger.info('Task duplicated', {
        originalId: task.id,
        duplicateId: duplicate.id,
        userId: req.user.id,
        title: task.title
      });

      res.status(201).json({
        success: true,
        data: {
          task: duplicate.toJSON()
        },
        message: 'Task duplicated successfully'
      });

    } catch (error) {
      logger.error('Duplicate task failed', {
        error: error.message,
        taskId: req.params.id,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Получить статистику задач пользователя
  static async getTaskStats(req, res, next) {
    try {
      const stats = await req.user.getStats();

      // Дополнительная статистика
      const activeTasks = await req.user.getActiveTasks(5);
      
      res.json({
        success: true,
        data: {
          stats,
          recentTasks: activeTasks.map(task => task.toJSON())
        }
      });

    } catch (error) {
      logger.error('Get task stats failed', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  }

  // Поиск задач
  static async searchTasks(req, res, next) {
    try {
      const { q: query, limit = 20 } = req.query;

      if (!query || query.trim().length < 2) {
        throw new ValidationError('Search query must be at least 2 characters');
      }

      const filters = {
        search: query.trim(),
        limit: Math.min(parseInt(limit), 50),
        status: 'all'
      };

      const result = await Task.findByUser(req.user.id, filters);

      logger.info('Tasks searched', {
        userId: req.user.id,
        query,
        resultsCount: result.tasks.length
      });

      res.json({
        success: true,
        data: {
          tasks: result.tasks.map(task => task.toJSON()),
          query,
          total: result.total
        }
      });

    } catch (error) {
      logger.error('Search tasks failed', {
        error: error.message,
        userId: req.user?.id,
        query: req.query
      });
      next(error);
    }
  }

  // Массовые операции с задачами
  static async bulkActions(req, res, next) {
    try {
      const { action, taskIds } = req.body;

      if (!action || !Array.isArray(taskIds) || taskIds.length === 0) {
        throw new ValidationError('Action and taskIds array are required');
      }

      if (taskIds.length > 50) {
        throw new ValidationError('Maximum 50 tasks can be processed at once');
      }

      const allowedActions = ['complete', 'delete', 'mark_incomplete'];
      if (!allowedActions.includes(action)) {
        throw new ValidationError(`Invalid action. Allowed: ${allowedActions.join(', ')}`);
      }

      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (const taskId of taskIds) {
        try {
          const task = await Task.findById(taskId, req.user.id);
          
          if (!task) {
            results.failed++;
            results.errors.push({ taskId, error: 'Task not found' });
            continue;
          }

          switch (action) {
            case 'complete':
              if (!task.completed) {
                await task.markCompleted();
              }
              break;
            case 'delete':
              await task.delete();
              break;
            case 'mark_incomplete':
              if (task.completed) {
                await task.markIncomplete();
              }
              break;
          }

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ taskId, error: error.message });
        }
      }

      logger.info('Bulk action performed', {
        userId: req.user.id,
        action,
        taskIds: taskIds.length,
        success: results.success,
        failed: results.failed
      });

      res.json({
        success: true,
        data: results,
        message: `Bulk ${action} completed. ${results.success} successful, ${results.failed} failed.`
      });

    } catch (error) {
      logger.error('Bulk actions failed', {
        error: error.message,
        userId: req.user?.id,
        body: req.body
      });
      next(error);
    }
  }
}

module.exports = TaskController;
