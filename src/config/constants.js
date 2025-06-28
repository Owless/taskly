// Приоритеты задач
const TASK_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Типы повторения задач
const REPEAT_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  CUSTOM: 'custom'
};

// Единицы повторения
const REPEAT_UNITS = {
  DAYS: 'days',
  WEEKS: 'weeks',
  MONTHS: 'months'
};

// Статусы задач (для фронтенда)
const TASK_STATUS = {
  NO_DATE: 'no_date',
  OVERDUE: 'overdue',
  DUE_TODAY: 'due_today',
  DUE_TOMORROW: 'due_tomorrow',
  DUE_THIS_WEEK: 'due_this_week',
  UPCOMING: 'upcoming'
};

// Типы уведомлений
const NOTIFICATION_TYPES = {
  DUE_TODAY: 'due_today',
  DUE_TOMORROW: 'due_tomorrow',
  OVERDUE: 'overdue',
  REMINDER: 'reminder',
  DAILY_SUMMARY: 'daily_summary'
};

// Статусы доставки уведомлений
const DELIVERY_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

// Статусы пожертвований
const DONATION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

// Предустановленные суммы пожертвований (в звездах)
const DONATION_PRESETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

// Лимиты
const LIMITS = {
  TASK_TITLE_MAX_LENGTH: 100,
  TASK_DESCRIPTION_MAX_LENGTH: 500,
  TASKS_PER_PAGE: 20,
  MAX_TASKS_PER_USER: 1000,
  MIN_DONATION_AMOUNT: 1,
  MAX_DONATION_AMOUNT: 2500,
  REPEAT_INTERVAL_MIN: 1,
  REPEAT_INTERVAL_MAX: 365
};

// Настройки по умолчанию для пользователей
const DEFAULT_USER_SETTINGS = {
  notifications: true,
  reminder_time: '09:00',
  timezone: 'Europe/Moscow',
  language: 'ru',
  daily_summary: true,
  overdue_reminders: true
};

// Команды бота
const BOT_COMMANDS = {
  START: '/start',
  HELP: '/help',
  TODAY: '/today',
  ADD: '/add',
  DONE: '/done',
  SETTINGS: '/settings',
  STATS: '/stats',
  SUPPORT: '/support'
};

// Callback data префиксы
const CALLBACK_PREFIXES = {
  TASK_COMPLETE: 'task_complete_',
  TASK_DELETE: 'task_delete_',
  TASK_EDIT: 'task_edit_',
  DONATION: 'donation_',
  SETTING: 'setting_',
  FILTER: 'filter_'
};

// Эмодзи
const EMOJIS = {
  // Приоритеты
  PRIORITY_HIGH: '🔴',
  PRIORITY_MEDIUM: '🟡',
  PRIORITY_LOW: '🟢',
  
  // Статусы
  COMPLETED: '✅',
  PENDING: '⏳',
  OVERDUE: '🔥',
  
  // Даты
  TODAY: '📅',
  TOMORROW: '📆',
  CALENDAR: '🗓️',
  
  // Действия
  ADD: '➕',
  DELETE: '🗑️',
  EDIT: '✏️',
  SETTINGS: '⚙️',
  STATS: '📊',
  
  // Пожертвования
  STAR: '⭐',
  HEART: '💙',
  MONEY: '💰',
  
  // Общие
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  ROCKET: '🚀',
  PARTY: '🎉'
};

// Временные зоны (популярные)
const TIMEZONES = {
  'Europe/Moscow': 'Москва (UTC+3)',
  'Europe/Berlin': 'Берлин (UTC+1)',
  'Europe/London': 'Лондон (UTC+0)',
  'America/New_York': 'Нью-Йорк (UTC-5)',
  'America/Los_Angeles': 'Лос-Анджелес (UTC-8)',
  'Asia/Dubai': 'Дубай (UTC+4)',
  'Asia/Almaty': 'Алматы (UTC+6)',
  'Asia/Tokyo': 'Токио (UTC+9)'
};

// Языки
const LANGUAGES = {
  'ru': 'Русский',
  'en': 'English',
};

module.exports = {
  TASK_PRIORITIES,
  REPEAT_TYPES,
  REPEAT_UNITS,
  TASK_STATUS,
  NOTIFICATION_TYPES,
  DELIVERY_STATUS,
  DONATION_STATUS,
  DONATION_PRESETS,
  LIMITS,
  DEFAULT_USER_SETTINGS,
  BOT_COMMANDS,
  CALLBACK_PREFIXES,
  EMOJIS,
  TIMEZONES,
  LANGUAGES
};
