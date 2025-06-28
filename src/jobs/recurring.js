const recurringService = require('../services/recurring');
const { supabase } = require('../config/supabase');
const { getCurrentDateInTimezone, addDays } = require('../utils/dates');

// Main recurring tasks job - runs daily at midnight
const runRecurringTasksJob = async () => {
  try {
    console.log('🔄 Starting daily recurring tasks job...');
    
    await recurringService.createRecurringTasks();
    
    console.log('✅ Daily recurring tasks job completed');
  } catch (error) {
    console.error('❌ Daily recurring tasks job failed:', error.message);
    throw error;
  }
};

// Create tasks for next few days - runs daily
const runAdvancedRecurringJob = async () => {
  try {
    console.log('🔮 Starting advanced recurring tasks job...');
    
    const today = new Date();
    const nextDays = [];
    
    // Create tasks for next 7 days
    for (let i = 1; i <= 7; i++) {
      const nextDay = addDays(today, i);
      nextDays.push(nextDay.toISOString().split('T')[0]);
    }
    
    let totalCreated = 0;
    
    // Get all active recurring tasks
    const { data: recurringTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_recurring', true)
      .eq('completed', false)
      .is('parent_task_id', null); // Only templates
    
    if (error) {
      console.error('Failed to get recurring tasks:', error);
      return;
    }
    
    if (!recurringTasks || recurringTasks.length === 0) {
      console.log('📭 No recurring tasks found');
      return;
    }
    
    console.log(`🔍 Found ${recurringTasks.length} recurring tasks templates`);
    
    // Process each future date
    for (const targetDate of nextDays) {
      let dayCreated = 0;
      
      for (const task of recurringTasks) {
        try {
          const created = await recurringService.createTaskInstance(task, targetDate);
          if (created) {
            dayCreated++;
            totalCreated++;
          }
        } catch (error) {
          console.error(`Failed to create instance for task ${task.id} on ${targetDate}:`, error.message);
        }
      }
      
      if (dayCreated > 0) {
        console.log(`📅 Created ${dayCreated} tasks for ${targetDate}`);
      }
    }
    
    console.log(`✅ Advanced recurring tasks job completed: ${totalCreated} tasks created for next 7 days`);
    
  } catch (error) {
    console.error('❌ Advanced recurring tasks job failed:', error.message);
    throw error;
  }
};

// Cleanup completed recurring templates - runs weekly
const runCleanupRecurringJob = async () => {
  try {
    console.log('🧹 Starting cleanup recurring tasks job...');
    
    // Find completed recurring templates that are past their end date
    const today = new Date().toISOString().split('T')[0];
    
    const { data: expiredTemplates, error } = await supabase
      .from('tasks')
      .select('id, title, repeat_end_date')
      .eq('is_recurring', true)
      .is('parent_task_id', null)
      .not('repeat_end_date', 'is', null)
      .lt('repeat_end_date', today);
    
    if (error) {
      console.error('Failed to get expired recurring templates:', error);
      return;
    }
    
    if (!expiredTemplates || expiredTemplates.length === 0) {
      console.log('📭 No expired recurring templates found');
      return;
    }
    
    let cleanedCount = 0;
    
    for (const template of expiredTemplates) {
      try {
        // Mark template as completed instead of deleting
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            completed: true,
            completed_at: new Date().toISOString()
          })
          .eq('id', template.id);
        
        if (!updateError) {
          cleanedCount++;
          console.log(`🗂️ Marked expired recurring template as completed: "${template.title}"`);
        }
      } catch (error) {
        console.error(`Failed to cleanup template ${template.id}:`, error.message);
      }
    }
    
    console.log(`✅ Cleanup recurring tasks job completed: ${cleanedCount} templates marked as completed`);
    
  } catch (error) {
    console.error('❌ Cleanup recurring tasks job failed:', error.message);
    throw error;
  }
};

// Archive old recurring instances - runs weekly
const runArchiveRecurringInstancesJob = async () => {
  try {
    console.log('📦 Starting archive recurring instances job...');
    
    // Delete completed recurring instances older than 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const archiveDate = threeMonthsAgo.toISOString();
    
    const { data: oldInstances, error } = await supabase
      .from('tasks')
      .delete()
      .eq('completed', true)
      .not('parent_task_id', 'is', null) // Only instances, not templates
      .lt('completed_at', archiveDate)
      .select('id, title');
    
    if (error) {
      console.error('Failed to archive old recurring instances:', error);
      return;
    }
    
    const archivedCount = oldInstances?.length || 0;
    console.log(`✅ Archive recurring instances job completed: ${archivedCount} old instances archived`);
    
  } catch (error) {
    console.error('❌ Archive recurring instances job failed:', error.message);
    throw error;
  }
};

// Recurring tasks analytics - runs daily
const runRecurringAnalyticsJob = async () => {
  try {
    console.log('📊 Starting recurring tasks analytics job...');
    
    // Get recurring tasks stats
    const { data: recurringStats, error } = await supabase
      .from('tasks')
      .select('is_recurring, repeat_type, completed, parent_task_id')
      .eq('is_recurring', true);
    
    if (error) {
      console.error('Failed to get recurring tasks stats:', error);
      return;
    }
    
    if (!recurringStats || recurringStats.length === 0) {
      console.log('📭 No recurring tasks found for analytics');
      return;
    }
    
    // Calculate analytics
    const analytics = {
      totalTemplates: recurringStats.filter(t => t.parent_task_id === null).length,
      activeTemplates: recurringStats.filter(t => t.parent_task_id === null && !t.completed).length,
      totalInstances: recurringStats.filter(t => t.parent_task_id !== null).length,
      completedInstances: recurringStats.filter(t => t.parent_task_id !== null && t.completed).length,
      byType: {}
    };
    
    // Group by repeat type
    recurringStats.filter(t => t.parent_task_id === null).forEach(task => {
      const type = task.repeat_type || 'unknown';
      analytics.byType[type] = (analytics.byType[type] || 0) + 1;
    });
    
    const completionRate = analytics.totalInstances > 0 
      ? ((analytics.completedInstances / analytics.totalInstances) * 100).toFixed(1)
      : 0;
    
    console.log(`📈 Recurring tasks analytics:
      Templates: ${analytics.activeTemplates}/${analytics.totalTemplates} active
      Instances: ${analytics.totalInstances} total, ${analytics.completedInstances} completed
      Completion Rate: ${completionRate}%
      By Type: ${JSON.stringify(analytics.byType)}
    `);
    
    // Could save to analytics table or send to external service here
    
    console.log('✅ Recurring tasks analytics job completed');
    
  } catch (error) {
    console.error('❌ Recurring tasks analytics job failed:', error.message);
    throw error;
  }
};

// Fix broken recurring tasks - runs weekly
const runFixRecurringTasksJob = async () => {
  try {
    console.log('🔧 Starting fix recurring tasks job...');
    
    let fixedCount = 0;
    
    // Find recurring tasks without proper configuration
    const { data: brokenTasks, error } = await supabase
      .from('tasks')
      .select('id, title, is_recurring, repeat_type, repeat_interval')
      .eq('is_recurring', true)
      .is('parent_task_id', null)
      .or('repeat_type.is.null,repeat_interval.is.null');
    
    if (error) {
      console.error('Failed to get broken recurring tasks:', error);
      return;
    }
    
    if (brokenTasks && brokenTasks.length > 0) {
      for (const task of brokenTasks) {
        try {
          // Fix missing repeat_type and repeat_interval
          const updates = {};
          
          if (!task.repeat_type) {
            updates.repeat_type = 'daily';
          }
          
          if (!task.repeat_interval) {
            updates.repeat_interval = 1;
          }
          
          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from('tasks')
              .update(updates)
              .eq('id', task.id);
            
            if (!updateError) {
              fixedCount++;
              console.log(`🔧 Fixed recurring task: "${task.title}"`);
            }
          }
        } catch (error) {
          console.error(`Failed to fix task ${task.id}:`, error.message);
        }
      }
    }
    
    // Find orphaned instances (instances without templates)
    const { data: orphanedInstances, error: orphanError } = await supabase
      .from('tasks')
      .select('id, title, parent_task_id')
      .not('parent_task_id', 'is', null);
    
    if (!orphanError && orphanedInstances) {
      for (const instance of orphanedInstances) {
        // Check if parent exists
        const { data: parent, error: parentError } = await supabase
          .from('tasks')
          .select('id')
          .eq('id', instance.parent_task_id)
          .single();
        
        if (parentError && parentError.code === 'PGRST116') {
          // Parent doesn't exist, convert instance to regular task
          const { error: convertError } = await supabase
            .from('tasks')
            .update({
              parent_task_id: null,
              is_recurring: false,
              repeat_type: null,
              repeat_interval: null,
              repeat_unit: null,
              repeat_end_date: null
            })
            .eq('id', instance.id);
          
          if (!convertError) {
            fixedCount++;
            console.log(`🔧 Converted orphaned instance to regular task: "${instance.title}"`);
          }
        }
      }
    }
    
    console.log(`✅ Fix recurring tasks job completed: ${fixedCount} issues fixed`);
    
  } catch (error) {
    console.error('❌ Fix recurring tasks job failed:', error.message);
    throw error;
  }
};

// Generate recurring tasks report - runs monthly
const runRecurringReportJob = async () => {
  try {
    console.log('📋 Starting recurring tasks report job...');
    
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get data for last month
    const { data: lastMonthData, error } = await supabase
      .from('tasks')
      .select('user_id, completed, created_at, parent_task_id')
      .not('parent_task_id', 'is', null) // Only instances
      .gte('created_at', lastMonth.toISOString())
      .lt('created_at', thisMonth.toISOString());
    
    if (error) {
      console.error('Failed to get recurring tasks report data:', error);
      return;
    }
    
    if (!lastMonthData || lastMonthData.length === 0) {
      console.log('📭 No recurring task instances found for last month');
      return;
    }
    
    // Calculate report metrics
    const totalInstances = lastMonthData.length;
    const completedInstances = lastMonthData.filter(t => t.completed).length;
    const uniqueUsers = new Set(lastMonthData.map(t => t.user_id)).size;
    const completionRate = ((completedInstances / totalInstances) * 100).toFixed(1);
    
    // Group by user
    const userStats = {};
    lastMonthData.forEach(task => {
      const userId = task.user_id;
      if (!userStats[userId]) {
        userStats[userId] = { total: 0, completed: 0 };
      }
      userStats[userId].total++;
      if (task.completed) {
        userStats[userId].completed++;
      }
    });
    
    const report = {
      period: `${lastMonth.toISOString().split('T')[0]} to ${thisMonth.toISOString().split('T')[0]}`,
      totalInstances,
      completedInstances,
      uniqueUsers,
      completionRate: `${completionRate}%`,
      averageInstancesPerUser: (totalInstances / uniqueUsers).toFixed(1),
      topUsers: Object.entries(userStats)
        .sort(([,a], [,b]) => b.total - a.total)
        .slice(0, 5)
        .map(([userId, stats]) => ({
          userId,
          total: stats.total,
          completed: stats.completed,
          rate: `${((stats.completed / stats.total) * 100).toFixed(1)}%`
        }))
    };
    
    console.log(`📊 Recurring Tasks Monthly Report:
      Period: ${report.period}
      Total Instances: ${report.totalInstances}
      Completed: ${report.completedInstances}
      Users: ${report.uniqueUsers}
      Completion Rate: ${report.completionRate}
      Avg Instances/User: ${report.averageInstancesPerUser}
      Top Users: ${JSON.stringify(report.topUsers, null, 2)}
    `);
    
    // Could save report to database or send via email/Telegram here
    
    console.log('✅ Recurring tasks report job completed');
    
  } catch (error) {
    console.error('❌ Recurring tasks report job failed:', error.message);
    throw error;
  }
};

module.exports = {
  runRecurringTasksJob,
  runAdvancedRecurringJob,
  runCleanupRecurringJob,
  runArchiveRecurringInstancesJob,
  runRecurringAnalyticsJob,
  runFixRecurringTasksJob,
  runRecurringReportJob
};
