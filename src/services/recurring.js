const { supabase } = require('../config/supabase');
const { addDays, addWeeks, addMonths, isAfter, isSameDay } = require('date-fns');

// Create recurring tasks for today
const createRecurringTasks = async () => {
  try {
    console.log('🔄 Starting recurring tasks job...');

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get all recurring tasks that need to create instances
    const { data: recurringTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_recurring', true)
      .eq('completed', false)
      .not('parent_task_id', 'is', null); // These are template tasks

    if (error) {
      console.error('Failed to get recurring tasks:', error);
      return;
    }

    if (!recurringTasks || recurringTasks.length === 0) {
      console.log('📭 No recurring tasks to process');
      return;
    }

    console.log(`🔍 Found ${recurringTasks.length} recurring tasks to check`);

    let createdCount = 0;

    for (const task of recurringTasks) {
      try {
        const created = await createTaskInstance(task, todayStr);
        if (created) createdCount++;
      } catch (error) {
        console.error(`Failed to create instance for task ${task.id}:`, error.message);
      }
    }

    console.log(`✅ Recurring tasks job completed: ${createdCount} tasks created`);

  } catch (error) {
    console.error('Recurring tasks job error:', error.message);
    throw error;
  }
};

// Create single task instance if needed
const createTaskInstance = async (templateTask, targetDate) => {
  try {
    const {
      id,
      user_id,
      title,
      description,
      due_date,
      due_time,
      priority,
      repeat_type,
      repeat_interval,
      repeat_unit,
      repeat_end_date
    } = templateTask;

    // Check if we should create instance for target date
    const shouldCreate = shouldCreateInstance(
      due_date,
      targetDate,
      repeat_type,
      repeat_interval,
      repeat_unit,
      repeat_end_date
    );

    if (!shouldCreate) {
      return false;
    }

    // Check if instance already exists for this date
    const { data: existingInstance } = await supabase
      .from('tasks')
      .select('id')
      .eq('parent_task_id', id)
      .eq('due_date', targetDate)
      .single();

    if (existingInstance) {
      return false; // Instance already exists
    }

    // Create new task instance
    const { data: newTask, error } = await supabase
      .from('tasks')
      .insert({
        user_id,
        title,
        description,
        due_date: targetDate,
        due_time,
        priority,
        parent_task_id: id,
        is_recurring: false, // Instances are not recurring themselves
        notification_sent: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ Created recurring task instance: "${title}" for ${targetDate}`);
    return true;

  } catch (error) {
    console.error('Create task instance error:', error.message);
    throw error;
  }
};

// Check if we should create instance for specific date
const shouldCreateInstance = (originalDate, targetDate, repeatType, interval, unit, endDate) => {
  const original = new Date(originalDate);
  const target = new Date(targetDate);
  const end = endDate ? new Date(endDate) : null;

  // Check if target date is after end date
  if (end && isAfter(target, end)) {
    return false;
  }

  // Check if target date is before or same as original date
  if (target <= original) {
    return isSameDay(target, original);
  }

  const daysDiff = Math.floor((target - original) / (1000 * 60 * 60 * 24));

  switch (repeatType) {
    case 'daily':
      return daysDiff % interval === 0;

    case 'weekly':
      return daysDiff % (interval * 7) === 0;

    case 'monthly':
      // Check if target date is the same day of month as original
      const monthsDiff = (target.getFullYear() - original.getFullYear()) * 12 + 
                        (target.getMonth() - original.getMonth());
      
      return monthsDiff % interval === 0 && 
             target.getDate() === original.getDate();

    case 'custom':
      switch (unit) {
        case 'days':
          return daysDiff % interval === 0;
        case 'weeks':
          return daysDiff % (interval * 7) === 0;
        case 'months':
          const customMonthsDiff = (target.getFullYear() - original.getFullYear()) * 12 + 
                                  (target.getMonth() - original.getMonth());
          return customMonthsDiff % interval === 0 && 
                 target.getDate() === original.getDate();
        default:
          return false;
      }

    default:
      return false;
  }
};

// Calculate next occurrence date
const calculateNextOccurrence = (baseDate, repeatType, interval, unit) => {
  const base = new Date(baseDate);

  switch (repeatType) {
    case 'daily':
      return addDays(base, interval);

    case 'weekly':
      return addWeeks(base, interval);

    case 'monthly':
      return addMonths(base, interval);

    case 'custom':
      switch (unit) {
        case 'days':
          return addDays(base, interval);
        case 'weeks':
          return addWeeks(base, interval);
        case 'months':
          return addMonths(base, interval);
        default:
          throw new Error('Invalid repeat unit');
      }

    default:
      throw new Error('Invalid repeat type');
  }
};

// Create recurring task template
const createRecurringTask = async (userId, taskData) => {
  try {
    const {
      title,
      description,
      due_date,
      due_time,
      priority,
      repeat_type,
      repeat_interval,
      repeat_unit,
      repeat_end_date
    } = taskData;

    // Create the template task
    const { data: templateTask, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        description,
        due_date,
        due_time,
        priority,
        is_recurring: true,
        repeat_type,
        repeat_interval,
        repeat_unit,
        repeat_end_date,
        parent_task_id: null, // This is a template
        notification_sent: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Create first instance if due date is today or future
    const today = new Date().toISOString().split('T')[0];
    if (due_date >= today) {
      await createTaskInstance(templateTask, due_date);
    }

    console.log(`✅ Recurring task template created: "${title}"`);
    return templateTask;

  } catch (error) {
    console.error('Create recurring task error:', error.message);
    throw error;
  }
};

// Stop recurring task
const stopRecurringTask = async (taskId, userId) => {
  try {
    // Find the template task
    let templateTask;
    
    // Check if this is already a template
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (task.parent_task_id) {
      // This is an instance, get the template
      const { data: template } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task.parent_task_id)
        .single();
      templateTask = template;
    } else {
      templateTask = task;
    }

    if (!templateTask.is_recurring) {
      throw new Error('Task is not recurring');
    }

    // Mark template as completed (stops creating new instances)
    const { error } = await supabase
      .from('tasks')
      .update({
        completed: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', templateTask.id);

    if (error) {
      throw error;
    }

    console.log(`🛑 Recurring task stopped: "${templateTask.title}"`);
    return templateTask;

  } catch (error) {
    console.error('Stop recurring task error:', error.message);
    throw error;
  }
};

// Get recurring task info
const getRecurringTaskInfo = async (taskId, userId) => {
  try {
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw error;
    }

    if (!task.is_recurring && !task.parent_task_id) {
      return { isRecurring: false };
    }

    // Get template task if this is an instance
    let templateTask = task;
    if (task.parent_task_id) {
      const { data: template } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task.parent_task_id)
        .single();
      templateTask = template;
    }

    // Get all instances
    const { data: instances } = await supabase
      .from('tasks')
      .select('id, due_date, completed, completed_at')
      .eq('parent_task_id', templateTask.id)
      .order('due_date', { ascending: true });

    // Calculate next occurrence
    let nextOccurrence = null;
    if (!templateTask.completed) {
      try {
        const lastDueDate = templateTask.due_date;
        nextOccurrence = calculateNextOccurrence(
          lastDueDate,
          templateTask.repeat_type,
          templateTask.repeat_interval,
          templateTask.repeat_unit
        ).toISOString().split('T')[0];

        // Check if next occurrence is past end date
        if (templateTask.repeat_end_date && nextOccurrence > templateTask.repeat_end_date) {
          nextOccurrence = null;
        }
      } catch (error) {
        console.error('Calculate next occurrence error:', error.message);
      }
    }

    return {
      isRecurring: true,
      template: templateTask,
      instances: instances || [],
      nextOccurrence,
      totalInstances: instances?.length || 0,
      completedInstances: instances?.filter(i => i.completed).length || 0
    };

  } catch (error) {
    console.error('Get recurring task info error:', error.message);
    throw error;
  }
};

module.exports = {
  createRecurringTasks,
  createTaskInstance,
  shouldCreateInstance,
  calculateNextOccurrence,
  createRecurringTask,
  stopRecurringTask,
  getRecurringTaskInfo
};
