const { REPEAT_TYPES, REPEAT_UNITS } = require('../config/constants');

// Получить текущую дату в часовом поясе пользователя
const getCurrentDate = (timezone = 'Europe/Moscow') => {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
};

// Получить текущее время в часовом поясе пользователя
const getCurrentTime = (timezone = 'Europe/Moscow') => {
  return new Date().toLocaleTimeString('en-GB', { 
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Получить дату в часовом поясе пользователя
const getDateInTimezone = (date, timezone = 'Europe/Moscow') => {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: timezone });
};

// Парсинг даты из строки
const parseDate = (dateString) => {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

// Форматирование даты для отображения
const formatDate = (date, locale = 'ru-RU') => {
  if (!date) return null;
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Форматирование даты и времени
const formatDateTime = (date, time, locale = 'ru-RU') => {
  const dateStr = formatDate(date, locale);
  if (!time) return dateStr;
  
  return `${dateStr} в ${time}`;
};

// Получить относительную дату (сегодня, завтра, вчера)
const getRelativeDate = (date, timezone = 'Europe/Moscow') => {
  if (!date) return null;
  
  const today = getCurrentDate(timezone);
  const targetDate = getDateInTimezone(date, timezone);
  
  const todayObj = new Date(today);
  const targetObj = new Date(targetDate);
  const diffTime = targetObj.getTime() - todayObj.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  if (diffDays > 1 && diffDays <= 7) return `через ${diffDays} дней`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} дней назад`;
  
  return formatDate(date);
};

// Проверить, просрочена ли задача
const isOverdue = (dueDate, timezone = 'Europe/Moscow') => {
  if (!dueDate) return false;
  
  const today = getCurrentDate(timezone);
  const taskDate = getDateInTimezone(dueDate, timezone);
  
  return new Date(taskDate) < new Date(today);
};

// Проверить, выполняется ли задача сегодня
const isDueToday = (dueDate, timezone = 'Europe/Moscow') => {
  if (!dueDate) return false;
  
  const today = getCurrentDate(timezone);
  const taskDate = getDateInTimezone(dueDate, timezone);
  
  return taskDate === today;
};

// Проверить, выполняется ли задача завтра
const isDueTomorrow = (dueDate, timezone = 'Europe/Moscow') => {
  if (!dueDate) return false;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getDateInTimezone(tomorrow, timezone);
  const taskDate = getDateInTimezone(dueDate, timezone);
  
  return taskDate === tomorrowStr;
};

// Добавить дни к дате
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Добавить недели к дате
const addWeeks = (date, weeks) => {
  return addDays(date, weeks * 7);
};

// Добавить месяцы к дате
const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

// Вычислить следующую дату для повторяющейся задачи
const getNextRecurringDate = (currentDate, repeatType, repeatInterval = 1, repeatUnit = null) => {
  if (!currentDate) return null;
  
  const date = new Date(currentDate);
  
  switch (repeatType) {
    case REPEAT_TYPES.DAILY:
      return addDays(date, repeatInterval);
      
    case REPEAT_TYPES.WEEKLY:
      return addWeeks(date, repeatInterval);
      
    case REPEAT_TYPES.MONTHLY:
      return addMonths(date, repeatInterval);
      
    case REPEAT_TYPES.CUSTOM:
      switch (repeatUnit) {
        case REPEAT_UNITS.DAYS:
          return addDays(date, repeatInterval);
        case REPEAT_UNITS.WEEKS:
          return addWeeks(date, repeatInterval);
        case REPEAT_UNITS.MONTHS:
          return addMonths(date, repeatInterval);
        default:
          return null;
      }
      
    default:
      return null;
  }
};

// Получить все даты до окончания серии
const getRecurringDates = (startDate, endDate, repeatType, repeatInterval = 1, repeatUnit = null, maxCount = 100) => {
  const dates = [];
  let currentDate = new Date(startDate);
  const endDateObj = endDate ? new Date(endDate) : null;
  let count = 0;
  
  while (count < maxCount) {
    if (endDateObj && currentDate > endDateObj) break;
    
    dates.push(new Date(currentDate));
    
    const nextDate = getNextRecurringDate(currentDate, repeatType, repeatInterval, repeatUnit);
    if (!nextDate) break;
    
    currentDate = nextDate;
    count++;
  }
  
  return dates;
};

// Проверить, нужно ли создавать следующий экземпляр задачи
const shouldCreateNextInstance = (lastDate, repeatType, repeatInterval = 1, repeatUnit = null, timezone = 'Europe/Moscow') => {
  if (!lastDate) return false;
  
  const nextDate = getNextRecurringDate(lastDate, repeatType, repeatInterval, repeatUnit);
  if (!nextDate) return false;
  
  const today = getCurrentDate(timezone);
  const nextDateStr = getDateInTimezone(nextDate, timezone);
  
  // Создаем экземпляр, если следующая дата уже наступила
  return new Date(nextDateStr) <= new Date(today);
};

// Получить начало и конец дня в UTC
const getDayBounds = (date, timezone = 'Europe/Moscow') => {
  const dateStr = typeof date === 'string' ? date : getDateInTimezone(date, timezone);
  
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  
  return { startOfDay, endOfDay };
};

// Получить начало и конец недели
const getWeekBounds = (date = new Date(), timezone = 'Europe/Moscow') => {
  const currentDate = new Date(getDateInTimezone(date, timezone));
  const dayOfWeek = currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  return {
    startOfWeek: getDateInTimezone(startOfWeek, timezone),
    endOfWeek: getDateInTimezone(endOfWeek, timezone)
  };
};

// Валидация времени
const isValidTime = (timeString) => {
  if (!timeString) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);
};

// Объединить дату и время в ISO строку
const combineDateAndTime = (date, time, timezone = 'Europe/Moscow') => {
  if (!date) return null;
  
  const dateStr = typeof date === 'string' ? date : getDateInTimezone(date, timezone);
  const timeStr = time || '00:00';
  
  return `${dateStr}T${timeStr}:00`;
};

module.exports = {
  getCurrentDate,
  getCurrentTime,
  getDateInTimezone,
  parseDate,
  formatDate,
  formatDateTime,
  getRelativeDate,
  isOverdue,
  isDueToday,
  isDueTomorrow,
  addDays,
  addWeeks,
  addMonths,
  getNextRecurringDate,
  getRecurringDates,
  shouldCreateNextInstance,
  getDayBounds,
  getWeekBounds,
  isValidTime,
  combineDateAndTime
};
