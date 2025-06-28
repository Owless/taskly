const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

// Verify Telegram Web App data
const verifyTelegramWebApp = (telegramInitData) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error('Telegram bot token not configured');
    }

    // Parse init data
    const urlParams = new URLSearchParams(telegramInitData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    // Create data check string
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // Create secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Verify hash
    if (calculatedHash !== hash) {
      throw new Error('Invalid telegram data hash');
    }

    // Check auth date (data should be recent)
    const authDate = parseInt(urlParams.get('auth_date'));
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = currentTime - authDate;

    // Allow 24 hours for auth data to be valid
    if (timeDiff > 86400) {
      throw new Error('Telegram auth data is too old');
    }

    // Parse user data
    const userData = JSON.parse(urlParams.get('user'));
    return userData;

  } catch (error) {
    console.error('Telegram auth verification failed:', error.message);
    throw new Error('Invalid Telegram authentication data');
  }
};

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    // Add user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }

    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Middleware to verify Telegram webhook
const verifyTelegramWebhook = (req, res, next) => {
  try {
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const telegramToken = req.headers['x-telegram-bot-api-secret-token'];

    if (secretToken && secretToken !== telegramToken) {
      console.error('Invalid telegram webhook token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  } catch (error) {
    console.error('Telegram webhook verification failed:', error.message);
    return res.status(401).json({ error: 'Webhook verification failed' });
  }
};

// Generate JWT token for user
const generateToken = (userId, telegramId) => {
  return jwt.sign(
    { 
      userId, 
      telegramId,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

module.exports = {
  authenticateToken,
  verifyTelegramWebApp,
  verifyTelegramWebhook,
  generateToken
};
