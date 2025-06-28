require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase клиент
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(express.json());
app.use(express.static('.'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Авторизация пользователя
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    // В продакшене нужно валидировать initData
    const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
    
    // Проверяем или создаем пользователя
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', userData.id)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    let user = existingUser;
    
    if (!existingUser) {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: userData.id,
          username: userData.username,
          first_name: userData.first_name,
          last_name: userData.last_name
        })
        .select()
        .single();

      if (insertError) throw insertError;
      user = newUser;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Получить задачи пользователя
app.get('/api/tasks/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        users!inner(telegram_id)
      `)
      .eq('users.telegram_id', telegramId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Создать задачу
app.post('/api/tasks', async (req, res) => {
  try {
    const { telegramId, title, description, priority, dueDate } = req.body;
    
    // Получаем user_id по telegram_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError) throw userError;

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title,
        description,
        priority: priority || 'medium',
        due_date: dueDate || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Обновить задачу
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const { data: task, error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Удалить задачу
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Taskly server running on port ${PORT}`);
});
