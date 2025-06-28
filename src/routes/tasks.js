const express = require('express');
const router = express.Router();

const TaskController = require('../controllers/taskController');
const { authenticateJWT, loadResource, requireOwnership } = require('../middleware/auth');
const { 
  createValidationMiddleware, 
  validateUUID, 
  validatePagination 
} = require('../middleware/validation');
const rateLimit = require('../middleware/rateLimit');
const { schemas } = require('../utils/validators');

// Middleware для валидации
const validateCreateTask = createValidationMiddleware(schemas.createTask);
const validateUpdateTask = createValidationMiddleware(schemas.updateTask);
const validateTaskFilters = createValidationMiddleware(schemas.taskFilters, 'query');

// Middleware для загрузки задачи и проверки прав
const loadTaskWithOwnership = [
  validateUUID('id'),
  loadResource('tasks', 'id'),
  requireOwnership('user_id')
];

/**
 * @route GET /api/tasks
 * @desc Получить список задач пользователя
 * @access Private
 */
router.get('/', 
  authenticateJWT,
  validateTaskFilters,
  validatePagination,
  TaskController.getTasks
);

/**
 * @route POST /api/tasks
 * @desc Создать новую задачу
 * @access Private
 */
router.post('/', 
  authenticateJWT,
  rateLimit.createTask,
  validateCreateTask,
  TaskController.createTask
);

/**
 * @route GET /api/tasks/stats
 * @desc Получить статистику задач
 * @access Private
 */
router.get('/stats', 
  authenticateJWT,
  TaskController.getTaskStats
);

/**
 * @route GET /api/tasks/search
 * @desc Поиск задач
 * @access Private
 */
router.get('/search', 
  authenticateJWT,
  TaskController.searchTasks
);

/**
 * @route POST /api/tasks/bulk
 * @desc Массовые операции с задачами
 * @access Private
 */
router.post('/bulk', 
  authenticateJWT,
  rateLimit.createTask,
  TaskController.bulkActions
);

/**
 * @route GET /api/tasks/:id
 * @desc Получить конкретную задачу
 * @access Private
 */
router.get('/:id', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  TaskController.getTask
);

/**
 * @route PUT /api/tasks/:id
 * @desc Обновить задачу
 * @access Private
 */
router.put('/:id', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  validateUpdateTask,
  TaskController.updateTask
);

/**
 * @route DELETE /api/tasks/:id
 * @desc Удалить задачу
 * @access Private
 */
router.delete('/:id', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  TaskController.deleteTask
);

/**
 * @route PUT /api/tasks/:id/complete
 * @desc Отметить задачу как выполненную
 * @access Private
 */
router.put('/:id/complete', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  TaskController.completeTask
);

/**
 * @route PUT /api/tasks/:id/uncomplete
 * @desc Отметить задачу как невыполненную
 * @access Private
 */
router.put('/:id/uncomplete', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  TaskController.uncompleteTask
);

/**
 * @route POST /api/tasks/:id/duplicate
 * @desc Дублировать задачу
 * @access Private
 */
router.post('/:id/duplicate', 
  authenticateJWT,
  ...loadTaskWithOwnership,
  rateLimit.createTask,
  TaskController.duplicateTask
);

module.exports = router;
