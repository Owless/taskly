const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

// Service role client for server-side operations
const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Anonymous client for client-side operations
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function to set user context for RLS
const setUserContext = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required for database operations');
  }
  
  await supabaseService.rpc('set_config', {
    setting_name: 'app.current_user_id',
    setting_value: userId,
    is_local: true
  });
};

// Execute query with user context
const executeWithUserContext = async (userId, queryCallback) => {
  try {
    await setUserContext(userId);
    return await queryCallback(supabaseService);
  } catch (error) {
    console.error('Database operation error:', error);
    throw error;
  }
};

module.exports = {
  supabase: supabaseService,
  supabaseAnon,
  setUserContext,
  executeWithUserContext
};
