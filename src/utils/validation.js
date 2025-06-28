const { isValidDate, isValidTime } = require('./dates');

// Text validation
const isValidTaskTitle = (title) => {
  if (!title || typeof title !== 'string') return false;
  
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed.length <= 100;
};

const isValidTaskDescription = (description) => {
  if (!description) return true; // Optional field
  if (typeof description !== 'string') return false;
  
  return description.length <= 500;
};

// Priority validation
const isValidPriority = (priority) => {
  const validPriorities = ['low', 'medium', 'high'];
  return validPriorities.includes(priority);
};

// Recurring task validation
const isValidRepeatType = (repeatType) => {
  const validTypes = ['daily', 'weekly', 'monthly', 'custom'];
  return validTypes.includes(repeatType);
};

const isValidRepeatUnit = (unit) => {
  const validUnits = ['days', 'weeks', 'months'];
  return validUnits.includes(unit);
};

const isValidRepeatInterval = (interval) => {
  return Number.isInteger(interval) && interval >= 1 && interval <= 365;
};

const validateRecurringConfig = (config) => {
  const { is_recurring, repeat_type, repeat_interval, repeat_unit } = config;
  
  if (!is_recurring) return { valid: true };
  
  const errors = [];
  
  if (!repeat_type || !isValidRepeatType(repeat_type)) {
    errors.push('Invalid repeat type');
  }
  
  if (!repeat_interval || !isValidRepeatInterval(repeat_interval)) {
    errors.push('Invalid repeat interval');
  }
  
  if (repeat_type === 'custom' && (!repeat_unit || !isValidRepeatUnit(repeat_unit))) {
    errors.push('Invalid repeat unit for custom type');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Telegram validation
const isValidTelegramId = (telegramId) => {
  return Number.isInteger(telegramId) && telegramId > 0;
};

const isValidTelegramUsername = (username) => {
  if (!username) return true; // Optional
  
  // Telegram username rules: 5-32 chars, alphanumeric + underscore, no consecutive underscores
  const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
  const noConsecutiveUnderscores = !username.includes('__');
  
  return usernameRegex.test(username) && noConsecutiveUnderscores;
};

// Date and time validation
const validateTaskDates = (due_date, due_time, repeat_end_date) => {
  const errors = [];
  
  // Validate due_date
  if (due_date && !isValidDate(due_date)) {
    errors.push('Invalid due date format');
  }
  
  // Validate due_time
  if (due_time && !isValidTime(due_time)) {
    errors.push('Invalid due time format');
  }
  
  // Validate repeat_end_date
  if (repeat_end_date) {
    if (!isValidDate(repeat_end_date)) {
      errors.push('Invalid repeat end date format');
    } else if (due_date && new Date(repeat_end_date) < new Date(due_date)) {
      errors.push('Repeat end date must be after due date');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Donation validation
const isValidDonationAmount = (amount) => {
  const validAmounts = [25, 50, 100, 250];
  return Number.isInteger(amount) && validAmounts.includes(amount);
};

const isValidStarsAmount = (amount) => {
  return Number.isInteger(amount) && amount >= 1 && amount <= 2500;
};

// User settings validation
const isValidLanguageCode = (code) => {
  if (!code) return true; // Optional
  
  // ISO 639-1 language codes (2 letters)
  const languageRegex = /^[a-z]{2}$/;
  return languageRegex.test(code);
};

const isValidTimezone = (timezone) => {
  if (!timezone) return true; // Optional
  
  try {
    // Try to create a date with the timezone
    const testDate = new Date();
    testDate.toLocaleString('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

const validateNotificationSettings = (settings) => {
  const errors = [];
  
  if (settings.notifications !== undefined && typeof settings.notifications !== 'boolean') {
    errors.push('Notifications setting must be boolean');
  }
  
  if (settings.reminder_time && !isValidTime(settings.reminder_time)) {
    errors.push('Invalid reminder time format');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// UUID validation
const isValidUUID = (uuid) => {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Email validation (for future features)
const isValidEmail = (email) => {
  if (!email) return true; // Optional
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// URL validation
const isValidUrl = (url) => {
  if (!url) return false;
  
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

// Sanitization functions
const sanitizeString = (str, maxLength = null) => {
  if (!str || typeof str !== 'string') return '';
  
  let sanitized = str.trim();
  
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[<>]/g, '');
  
  return sanitized;
};

const sanitizeTaskTitle = (title) => {
  return sanitizeString(title, 100);
};

const sanitizeTaskDescription = (description) => {
  return sanitizeString(description, 500);
};

// Complete task validation
const validateTask = (taskData) => {
  const errors = [];
  
  // Title validation
  if (!isValidTaskTitle(taskData.title)) {
    errors.push('Title is required and must be 1-100 characters');
  }
  
  // Description validation
  if (!isValidTaskDescription(taskData.description)) {
    errors.push('Description must be less than 500 characters');
  }
  
  // Priority validation
  if (taskData.priority && !isValidPriority(taskData.priority)) {
    errors.push('Priority must be: low, medium, or high');
  }
  
  // Date validation
  const dateValidation = validateTaskDates(
    taskData.due_date,
    taskData.due_time,
    taskData.repeat_end_date
  );
  
  if (!dateValidation.valid) {
    errors.push(...dateValidation.errors);
  }
  
  // Recurring validation
  if (taskData.is_recurring) {
    const recurringValidation = validateRecurringConfig(taskData);
    if (!recurringValidation.valid) {
      errors.push(...recurringValidation.errors);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Complete user validation
const validateUser = (userData) => {
  const errors = [];
  
  // Telegram ID validation
  if (!isValidTelegramId(userData.telegram_id)) {
    errors.push('Valid Telegram ID is required');
  }
  
  // Username validation
  if (!isValidTelegramUsername(userData.telegram_username)) {
    errors.push('Invalid Telegram username format');
  }
  
  // Language code validation
  if (!isValidLanguageCode(userData.language_code)) {
    errors.push('Invalid language code');
  }
  
  // Timezone validation
  if (!isValidTimezone(userData.timezone)) {
    errors.push('Invalid timezone');
  }
  
  // Settings validation
  if (userData.settings) {
    const settingsValidation = validateNotificationSettings(userData.settings);
    if (!settingsValidation.valid) {
      errors.push(...settingsValidation.errors);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Filter validation
const isValidTaskFilter = (filter) => {
  const validFilters = ['all', 'today', 'tomorrow', 'week', 'overdue', 'no_date'];
  return validFilters.includes(filter);
};

const isValidNotificationType = (type) => {
  const validTypes = ['due_today', 'due_tomorrow', 'overdue', 'reminder'];
  return validTypes.includes(type);
};

// Pagination validation
const validatePagination = (limit, offset) => {
  const errors = [];
  
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push('Limit must be between 1 and 100');
    }
  }
  
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) {
      errors.push('Offset must be 0 or greater');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Export all validation functions
module.exports = {
  // Text validation
  isValidTaskTitle,
  isValidTaskDescription,
  sanitizeString,
  sanitizeTaskTitle,
  sanitizeTaskDescription,
  
  // Task validation
  isValidPriority,
  validateTask,
  validateTaskDates,
  
  // Recurring tasks
  isValidRepeatType,
  isValidRepeatUnit,
  isValidRepeatInterval,
  validateRecurringConfig,
  
  // User validation
  isValidTelegramId,
  isValidTelegramUsername,
  isValidLanguageCode,
  isValidTimezone,
  validateNotificationSettings,
  validateUser,
  
  // Donations
  isValidDonationAmount,
  isValidStarsAmount,
  
  // General validation
  isValidUUID,
  isValidEmail,
  isValidUrl,
  isValidTaskFilter,
  isValidNotificationType,
  validatePagination
};
