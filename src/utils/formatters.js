const { EMOJIS, TASK_PRIORITIES } = require('../config/constants');
const { formatDate, getRelativeDate, formatDateTime } = require('./dateHelpers');

// Форматирование задачи для отображения в Telegram
const formatTaskForTelegram = (task, options = {}) => {
  const { showDescription = true, showDate = true, showPriority = true, compact = false } = options;
  
  let text = '';
  
  // Иконка статуса
  if (task.completed) {
    text += `${EMOJIS.COMPLETED} `;
  } else if (task.status === 'overdue') {
    text += `${EMOJIS.OVERDUE} `;
  } else {
    text += `${EMOJIS.PENDING} `;
  }
  
  // Приоритет
  if (showPriority && !compact) {
    const priorityEmoji = getPriorityEmoji(task.priority);
    text += `${priorityEmoji} `;
  }
  
  // Заголовок
  text += `*${escapeMarkdown(task.title)}*`;
  
  // Описание
  if (showDescription && task.description && !compact) {
    text += `\n_${escapeMarkdown(task.description)}_`;
  }
  
  // Дата
  if (showDate && task.due_date) {
    const dateEmoji = getDateEmoji(task.status);
    const dateText = getRelativeDate(task.due_date);
    text += `\n${dateEmoji} ${dateText}`;
    
    if (task.due_time) {
      text += ` в ${task.due_time}`;
    }
  }
  
  // Повторяющаяся задача
  if (task.is_recurring && !compact) {
    text += `\n🔄 Повторяется`;
  }
  
  return text;
};

// Форматирование списка задач
const formatTaskList = (tasks, options = {}) => {
  const { title = '', compact = false, maxTasks = 10 } = options;
  
  if (!tasks || tasks.length === 0) {
    return `${EMOJIS.INFO} Задач нет`;
  }
  
  let text = '';
  
  if (title) {
    text += `*${escapeMarkdown(title)}*\n\n`;
  }
  
  const displayTasks = tasks.slice(0, maxTasks);
  
  displayTasks.forEach((task, index) => {
    text += `${index + 1}\\. ${formatTaskForTelegram(task, { compact })}`;
    if (index < displayTasks.length - 1) {
      text += '\n\n';
    }
  });
  
  if (tasks.length > maxTasks) {
    text += `\n\n${EMOJIS.INFO} И еще ${tasks.length - maxTasks} задач`;
  }
  
  return text;
};

// Форматирование статистики пользователя
const formatUserStats = (stats, user) => {
  let text = `${EMOJIS.STATS} *Ваша статистика*\n\n`;
  
  text += `📋 Всего задач: *${stats.total_tasks || 0}*\n`;
  text += `${EMOJIS.COMPLETED} Выполнено: *${stats.completed_tasks || 0}*\n`;
  text += `${EMOJIS.PENDING} Активных: *${stats.active_tasks || 0}*\n`;
  
  if (stats.today_tasks > 0) {
    text += `${EMOJIS.TODAY} На сегодня: *${stats.today_tasks}*\n`;
  }
  
  if (stats.overdue_tasks > 0) {
    text += `${EMOJIS.OVERDUE} Просрочено: *${stats.overdue_tasks}*\n`;
  }
  
  if (stats.completion_rate !== undefined) {
    text += `\n📈 Процент выполнения: *${stats.completion_rate}%*\n`;
  }
  
  if (user.total_donated > 0) {
    text += `\n${EMOJIS.HEART} Поддержано проект: *${user.total_donated}* ${EMOJIS.STAR}\n`;
  }
  
  return text;
};

// Форматирование уведомления о задаче
const formatTaskNotification = (task, type) => {
  let text = '';
  let emoji = '';
  
  switch (type) {
    case 'due_today':
      emoji = EMOJIS.TODAY;
      text = `${emoji} *Напоминание*\n\nНа сегодня запланирована задача:\n\n`;
      break;
    case 'due_tomorrow':
      emoji = EMOJIS.TOMORROW;
      text = `${emoji} *Завтра*\n\nНе забудьте про задачу:\n\n`;
      break;
    case 'overdue':
      emoji = EMOJIS.OVERDUE;
      text = `${emoji} *Просрочено*\n\nВы пропустили задачу:\n\n`;
      break;
    default:
      emoji = EMOJIS.REMINDER;
      text = `${emoji} *Напоминание*\n\n`;
  }
  
  text += formatTaskForTelegram(task, { compact: true });
  
  return text;
};

// Форматирование ежедневной сводки
const formatDailySummary = (todayTasks, overdueTasks, stats) => {
  let text = `${EMOJIS.CALENDAR} *Сводка на сегодня*\n\n`;
  
  if (todayTasks.length > 0) {
    text += `${EMOJIS.TODAY} *На сегодня (${todayTasks.length}):*\n`;
    todayTasks.forEach((task, index) => {
      const priorityEmoji = getPriorityEmoji(task.priority);
      text += `${index + 1}\\. ${priorityEmoji} ${escapeMarkdown(task.title)}\n`;
    });
    text += '\n';
  }
  
  if (overdueTasks.length > 0) {
    text += `${EMOJIS.OVERDUE} *Просрочено (${overdueTasks.length}):*\n`;
    overdueTasks.slice(0, 3).forEach((task, index) => {
      text += `${index + 1}\\. ${escapeMarkdown(task.title)}\n`;
    });
    if (overdueTasks.length > 3) {
      text += `И еще ${overdueTasks.length - 3} задач\\.\\.\\.\n`;
    }
    text += '\n';
  }
  
  if (todayTasks.length === 0 && overdueTasks.length === 0) {
    text += `${EMOJIS.PARTY} Отлично\\! На сегодня задач нет\\.\n`;
  }
  
  text += `📊 Всего активных задач: *${stats.active_tasks || 0}*`;
  
  return text;
};

// Получить эмодзи приоритета
const getPriorityEmoji = (priority) => {
  switch (priority) {
    case TASK_PRIORITIES.HIGH:
      return EMOJIS.PRIORITY_HIGH;
    case TASK_PRIORITIES.MEDIUM:
      return EMOJIS.PRIORITY_MEDIUM;
    case TASK_PRIORITIES.LOW:
      return EMOJIS.PRIORITY_LOW;
    default:
      return EMOJIS.PRIORITY_MEDIUM;
  }
};

// Получить эмодзи даты
const getDateEmoji = (status) => {
  switch (status) {
    case 'due_today':
      return EMOJIS.TODAY;
    case 'due_tomorrow':
      return EMOJIS.TOMORROW;
    case 'overdue':
      return EMOJIS.OVERDUE;
    default:
      return EMOJIS.CALENDAR;
  }
};

// Экранирование символов для Markdown
const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
};

// Форматирование суммы пожертвования
const formatDonationAmount = (amount) => {
  if (amount === 1) {
    return `${amount} звезда`;
  } else if (amount >= 2 && amount <= 4) {
    return `${amount} звезды`;
  } else {
    return `${amount} звезд`;
  }
};

// Форматирование сообщения о пожертвовании
const formatDonationMessage = (amount, description = '') => {
  let text = `${EMOJIS.HEART} *Поддержка проекта*\n\n`;
  text += `Сумма: *${formatDonationAmount(amount)}* ${EMOJIS.STAR}\n`;
  
  if (description) {
    text += `Сообщение: _${escapeMarkdown(description)}_\n`;
  }
  
  text += `\n${EMOJIS.INFO} Спасибо за поддержку\\! Это помогает развивать проект\\.`;
  
  return text;
};

// Форматирование времени выполнения
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

// Форматирование размера файла
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

module.exports = {
  formatTaskForTelegram,
  formatTaskList,
  formatUserStats,
  formatTaskNotification,
  formatDailySummary,
  formatDonationMessage,
  formatDonationAmount,
  getPriorityEmoji,
  getDateEmoji,
  escapeMarkdown,
  formatDuration,
  formatFileSize
};
