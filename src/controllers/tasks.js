const { executeWithUserContext } = require('../config/supabase');

// Get user tasks with filtering
const getTasks = async (req, res) => {
  try {
    const userId = req.userId;
    const { filter = 'all', limit = 50, offset = 0 } = req.query;

    const tasks = await executeWithUserContext(userId, async (supabase) => {
      // Use the database function for better performance
      const { data, error } = await supabase
        .rpc('get_user_tasks', {
          p_user_id: userId,
          p_filter: filter,
          p_limit: limit
        });

      if (error) throw error;
      return data;
    });

    // Get total count for pagination
    const totalCount = await executeWithUserContext(userId, async (supabase) => {
      let query = supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('completed', false);

      // Apply same filters as in get_user_tasks function
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      switch (filter) {
        case 'today':
          query = query.eq('due_date', today);
          break;
        case 'tomorrow':
          query = query.eq('due_date', tomorrow);
          break;
        case 'week':
          query = query.lte('due_date', nextWeek);
          break;
        case 'overdue':
          query = query.lt('due_date', today);
          break;
        case 'no_date':
          query = query.is('due_date', null);
          break;
      }

      const { count, error } = await query;
      if (error) throw error;
      return count;
    });

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get tasks error:', error.message);
    res.status(500).json({
      error: 'Failed to get tasks'
    });
  }
};

// Get single task
const getTask = async (req, res) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    const task = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Task not found');
        }
        throw error;
      }

      return data;
    });

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Get task error:', error.message);
    
    if (error.message === 'Task not found') {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    res.status(500).json({
      error: 'Failed to get task'
    });
  }
};

// Create new task
const createTask = async (req, res) => {
  try {
    const userId = req.userId;
    const taskData = req.body;

    const task = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...taskData,
          user_id: userId
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    console.log(`✅ Task created: "${task.title}" for user ${userId}`);

    res.status(201).json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Create task error:', error.message);
    res.status(500).json({
      error: 'Failed to create task'
    });
  }
};

// Update task
const updateTask = async (req, res) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;
    const updates = req.body;

    // Handle completion status
    if (updates.completed !== undefined) {
      updates.completed_at = updates.completed ? new Date().toISOString() : null;
      updates.notification_sent = false; // Reset notification flag
    }

    const task = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Task not found');
        }
        throw error;
      }

      return data;
    });

    console.log(`✅ Task updated: "${task.title}" for user ${userId}`);

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Update task error:', error.message);
    
    if (error.message === 'Task not found') {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    res.status(500).json({
      error: 'Failed to update task'
    });
  }
};

// Delete task
const deleteTask = async (req, res) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    await executeWithUserContext(userId, async (supabase) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', userId);

      if (error) throw error;
    });

    console.log(`✅ Task deleted: ${taskId} for user ${userId}`);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    console.error('Delete task error:', error.message);
    res.status(500).json({
      error: 'Failed to delete task'
    });
  }
};

// Get user statistics
const getStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('user_task_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || {
        user_id: userId,
        total_tasks: 0,
        completed_tasks: 0,
        active_tasks: 0,
        today_tasks: 0,
        overdue_tasks: 0,
        completion_rate: 0
      };
    });

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get stats error:', error.message);
    res.status(500).json({
      error: 'Failed to get statistics'
    });
  }
};

// Toggle task completion
const toggleTask = async (req, res) => {
  try {
    const userId = req.userId;
    const { taskId } = req.params;

    const task = await executeWithUserContext(userId, async (supabase) => {
      // First get current task
      const { data: currentTask, error: getError } = await supabase
        .from('tasks')
        .select('completed')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (getError) {
        if (getError.code === 'PGRST116') {
          throw new Error('Task not found');
        }
        throw getError;
      }

      // Toggle completion
      const newCompleted = !currentTask.completed;
      const updates = {
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        notification_sent: false
      };

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    console.log(`✅ Task toggled: "${task.title}" -> ${task.completed ? 'completed' : 'active'}`);

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Toggle task error:', error.message);
    
    if (error.message === 'Task not found') {
      return res.status(404).json({
        error: 'Task not found'
      });
    }

    res.status(500).json({
      error: 'Failed to toggle task'
    });
  }
};

module.exports = {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getStats,
  toggleTask
};
