const { supabase } = require('../config/supabase');
const { verifyTelegramWebApp, generateToken } = require('../middleware/auth');

// Authenticate user via Telegram Web App
const authenticateUser = async (req, res) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({
        error: 'Telegram init data is required'
      });
    }

    // Verify Telegram data
    const telegramUser = verifyTelegramWebApp(initData);

    // Find or create user
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error code
      console.error('Database error:', error);
      return res.status(500).json({
        error: 'Database error during authentication'
      });
    }

    // Create new user if doesn't exist
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          language_code: telegramUser.language_code || 'ru',
          settings: {
            notifications: true,
            reminder_time: '09:00'
          }
        })
        .select()
        .single();

      if (createError) {
        console.error('User creation error:', createError);
        return res.status(500).json({
          error: 'Failed to create user'
        });
      }

      user = newUser;
      console.log(`✅ New user created: ${user.first_name} (${user.telegram_id})`);
    } else {
      // Update user info if changed
      const updates = {};
      if (user.telegram_username !== telegramUser.username) {
        updates.telegram_username = telegramUser.username;
      }
      if (user.first_name !== telegramUser.first_name) {
        updates.first_name = telegramUser.first_name;
      }
      if (user.last_name !== telegramUser.last_name) {
        updates.last_name = telegramUser.last_name;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id);

        if (updateError) {
          console.error('User update error:', updateError);
        } else {
          console.log(`✅ User updated: ${user.first_name} (${user.telegram_id})`);
          Object.assign(user, updates);
        }
      }
    }

    // Generate JWT token
    const token = generateToken(user.id, user.telegram_id);

    // Remove sensitive data
    const { settings, ...userPublic } = user;
    
    res.json({
      success: true,
      token,
      user: {
        ...userPublic,
        settings: settings || { notifications: true, reminder_time: '09:00' }
      }
    });

  } catch (error) {
    console.error('Authentication error:', error.message);
    
    if (error.message.includes('Invalid Telegram')) {
      return res.status(401).json({
        error: 'Invalid Telegram authentication data'
      });
    }

    res.status(500).json({
      error: 'Authentication failed'
    });
  }
};

// Get current user info
const getCurrentUser = async (req, res) => {
  try {
    // User is already available from auth middleware
    const { settings, ...userPublic } = req.user;
    
    res.json({
      success: true,
      user: {
        ...userPublic,
        settings: settings || { notifications: true, reminder_time: '09:00' }
      }
    });
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({
      error: 'Failed to get user info'
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const user = req.user;
    
    // Generate new token
    const token = generateToken(user.id, user.telegram_id);
    
    res.json({
      success: true,
      token
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    res.status(500).json({
      error: 'Failed to refresh token'
    });
  }
};

module.exports = {
  authenticateUser,
  getCurrentUser,
  refreshToken
};
