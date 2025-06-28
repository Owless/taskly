const { format, parseISO, isValid, addDays, addWeeks, addMonths, startOfDay, endOfDay, differenceInDays, isSameDay, isAfter, isBefore, isToday, isTomorrow, isYesterday } = require('date-fns');
const { ru } = require('date-fns/locale');

// Timezone utilities
const getDateInTimezone = (date, timezone = 'Europe/Moscow') => {
  try {
    if (!date) return null;
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return null;
    
    return new Date(dateObj.toLocaleString('en-US', { timeZone: timezone }));
  } catch (error) {
    console.error('Get date in timezone error:', error.message);
    return null;
  }
};

const getCurrentDateInTimezone = (timezone = 'Europe/Moscow') => {
  try {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  } catch (error) {
    console.error('Get current date in timezone error:', error.message);
    return new Date();
  }
};

const formatDateForUser = (date, timezone = 'Europe/Moscow', formatString = 'dd.MM.yyyy') => {
  try {
    if (!date) return '';
    
    const dateInTimezone = getDateInTimezone(date, timezone);
    if (!dateInTimezone) return '';
    
    return format(dateInTimezone, formatString, { locale: ru });
  } catch (error) {
    console.error('Format date for user error:', error.message);
    return '';
  }
};

const formatTimeForUser = (time) => {
  try {
    if (!time) return '';
    
    // Time is in HH:MM format
    if (typeof time === 'string' && time.match(/^\d{2}:\d{2}$/)) {
      return time;
    }
    
    // Convert Date to time string
    if (time instanceof Date) {
      return format(time, 'HH:mm');
    }
    
    return '';
  } catch (error) {
    console.error('Format time for user error:', error.message);
    return '';
  }
};

// Date status utilities
const getDateStatus = (date, timezone = 'Europe/Moscow') => {
  try {
    if (!date) return 'no_date';
    
    const taskDate = getDateInTimezone(date, timezone);
    const today = getCurrentDateInTimezone(timezone);
    
    if (!taskDate) return 'invalid';
    
    if (isToday(taskDate)) return 'today';
    if (isTomorrow(taskDate)) return 'tomorrow';
    if (isYesterday(taskDate)) return 'yesterday';
    if (isBefore(taskDate, startOfDay(today))) return 'overdue';
    
    const daysDiff = differenceInDays(taskDate, today);
    if (daysDiff <= 7) return 'this_week';
    if (daysDiff <= 30) return 'this_month';
    
    return 'future';
  } catch (error) {
    console.error('Get date status error:', error.message);
    return 'invalid';
  }
};

const getDateStatusText = (date, timezone = 'Europe/Moscow') => {
  const status = getDateStatus(date, timezone);
  
  const statusTexts = {
    no_date: '',
    invalid: '❌ Неверная дата',
    today: '📅 Сегодня',
    tomorrow: '📅 Завтра',
    yesterday: '📅 Вчера',
    overdue: '⚠️ Просрочено',
    this_week: '📅 На этой неделе',
    this_month: '📅 В этом месяце',
    future: '📅 ' + formatDateForUser(date, timezone)
  };
  
  return statusTexts[status] || '';
};

// Recurring task utilities
const calculateNextOccurrence = (baseDate, repeatType, interval = 1, unit = null) => {
  try {
    const base = typeof baseDate === 'string' ? parseISO(baseDate) : baseDate;
    if (!isValid(base)) throw new Error('Invalid base date');
    
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
            throw new Error('Invalid repeat unit for custom type');
        }
        
      default:
        throw new Error('Invalid repeat type');
    }
  } catch (error) {
    console.error('Calculate next occurrence error:', error.message);
    throw error;
  }
};

const shouldCreateRecurringInstance = (originalDate, targetDate, repeatType, interval = 1, unit = null, endDate = null) => {
  try {
    const original = typeof originalDate === 'string' ? parseISO(originalDate) : originalDate;
    const target = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
    const end = endDate ? (typeof endDate === 'string' ? parseISO(endDate) : endDate) : null;
    
    if (!isValid(original) || !isValid(target)) return false;
    
    // Check if target is after end date
    if (end && isAfter(target, end)) return false;
    
    // Check if target is before original
    if (isBefore(target, original)) return false;
    
    // If same day as original, always create
    if (isSameDay(target, original)) return true;
    
    const daysDiff = differenceInDays(target, original);
    
    switch (repeatType) {
      case 'daily':
        return daysDiff % interval === 0;
        
      case 'weekly':
        return daysDiff % (interval * 7) === 0;
        
      case 'monthly':
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
  } catch (error) {
    console.error('Should create recurring instance error:', error.message);
    return false;
  }
};

// Date range utilities
const getDateRange = (filter, timezone = 'Europe/Moscow') => {
  try {
    const today = startOfDay(getCurrentDateInTimezone(timezone));
    
    switch (filter) {
      case 'today':
        return {
          start: today,
          end: endOfDay(today)
        };
        
      case 'tomorrow':
        const tomorrow = addDays(today, 1);
        return {
          start: tomorrow,
          end: endOfDay(tomorrow)
        };
        
      case 'week':
        return {
          start: today,
          end: endOfDay(addDays(today, 7))
        };
        
      case 'month':
        return {
          start: today,
          end: endOfDay(addDays(today, 30))
        };
        
      case 'overdue':
        return {
          start: null,
          end: addDays(today, -1)
        };
        
      default:
        return { start: null, end: null };
    }
  } catch (error) {
    console.error('Get date range error:', error.message);
    return { start: null, end: null };
  }
};

// Validation utilities
const isValidDate = (date) => {
  try {
    if (!date) return false;
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isValid(dateObj);
  } catch (error) {
    return false;
  }
};

const isValidTime = (time) => {
  try {
    if (!time) return false;
    
    // Check HH:MM format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  } catch (error) {
    return false;
  }
};

const parseDate = (dateString) => {
  try {
    if (!dateString) return null;
    
    // Try ISO format first
    let date = parseISO(dateString);
    if (isValid(date)) return date;
    
    // Try other formats
    const formats = [
      'yyyy-MM-dd',
      'dd.MM.yyyy',
      'dd/MM/yyyy',
      'MM/dd/yyyy'
    ];
    
    for (const formatStr of formats) {
      try {
        date = parse(dateString, formatStr, new Date());
        if (isValid(date)) return date;
      } catch (e) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Parse date error:', error.message);
    return null;
  }
};

// Helper for notification timing
const getNotificationTime = (reminderTime = '09:00', timezone = 'Europe/Moscow') => {
  try {
    const [hours, minutes] = reminderTime.split(':').map(Number);
    const today = getCurrentDateInTimezone(timezone);
    
    const notificationTime = new Date(today);
    notificationTime.setHours(hours, minutes, 0, 0);
    
    return notificationTime;
  } catch (error) {
    console.error('Get notification time error:', error.message);
    return null;
  }
};

const shouldSendNotificationNow = (reminderTime = '09:00', timezone = 'Europe/Moscow') => {
  try {
    const now = getCurrentDateInTimezone(timezone);
    const notificationTime = getNotificationTime(reminderTime, timezone);
    
    if (!notificationTime) return false;
    
    // Send if current time is within 15 minutes of reminder time
    const timeDiff = Math.abs(now.getTime() - notificationTime.getTime());
    const fifteenMinutes = 15 * 60 * 1000;
    
    return timeDiff <= fifteenMinutes;
  } catch (error) {
    console.error('Should send notification now error:', error.message);
    return false;
  }
};

module.exports = {
  // Timezone utilities
  getDateInTimezone,
  getCurrentDateInTimezone,
  formatDateForUser,
  formatTimeForUser,
  
  // Date status
  getDateStatus,
  getDateStatusText,
  
  // Recurring tasks
  calculateNextOccurrence,
  shouldCreateRecurringInstance,
  
  // Date ranges
  getDateRange,
  
  // Validation
  isValidDate,
  isValidTime,
  parseDate,
  
  // Notifications
  getNotificationTime,
  shouldSendNotificationNow,
  
  // Re-export date-fns functions for convenience
  addDays,
  addWeeks,
  addMonths,
  startOfDay,
  endOfDay,
  differenceInDays,
  isSameDay,
  isAfter,
  isBefore,
  isToday,
  isTomorrow,
  isYesterday,
  format,
  parseISO,
  isValid
};
