class TasklyApp {
    constructor() {
        this.currentUser = null;
        this.tasks = [];
        this.currentFilter = 'active';
        this.editingTaskId = null;
        this.init();
    }

    async init() {
        // Инициализация Telegram Web App
        this.initTelegramWebApp();
        
        await this.authenticate();
        this.setupEventListeners();
        await this.loadTasks();
        this.render();
        this.startPeriodicSync();
    }

    initTelegramWebApp() {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            // Настройка цветовой схемы
            if (tg.colorScheme === 'dark') {
                document.body.classList.add('dark-theme');
            }
            
            // Настройка главной кнопки
            tg.MainButton.setText('Добавить задачу');
            tg.MainButton.onClick(() => this.addTask());
        }
    }

    async authenticate() {
        try {
            const initData = window.Telegram?.WebApp?.initData || 'user={"id":123456,"first_name":"Test","username":"testuser"}';
            
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData })
            });

            const result = await response.json();
            
            if (result.success) {
                this.currentUser = result.user;
                this.updateUserInfo();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Authentication failed:', error);
            this.showNotification('Ошибка авторизации', 'error');
        }
    }

    updateUserInfo() {
        if (!this.currentUser) return;
        
        const initials = this.getInitials(this.currentUser.first_name, this.currentUser.last_name);
        document.getElementById('userInitials').textContent = initials;
        
        const greeting = this.getGreeting(this.currentUser.first_name);
        document.getElementById('userGreeting').textContent = greeting;
    }

    getInitials(firstName, lastName) {
        const first = firstName?.charAt(0)?.toUpperCase() || '';
        const last = lastName?.charAt(0)?.toUpperCase() || '';
        return first + last || 'U';
    }

    getGreeting(firstName) {
        const hour = new Date().getHours();
        let timeGreeting = 'Привет';
        
        if (hour < 12) timeGreeting = 'Доброе утро';
        else if (hour < 18) timeGreeting = 'Добрый день';
        else timeGreeting = 'Добрый вечер';
        
        return `${timeGreeting}, ${firstName || 'Пользователь'}!`;
    }

    setupEventListeners() {
        // Добавление задач
        const taskInput = document.getElementById('taskTitle');
        const addBtn = document.getElementById('addTaskBtn');
        
        taskInput.addEventListener('input', (e) => {
            const hasText = e.target.value.trim().length > 0;
            addBtn.disabled = !hasText;
            
            // Показываем главную кнопку Telegram
            if (window.Telegram?.WebApp?.MainButton) {
                if (hasText) {
                    window.Telegram.WebApp.MainButton.show();
                } else {
                    window.Telegram.WebApp.MainButton.hide();
                }
            }
        });
        
        taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !addBtn.disabled) {
                this.addTask();
            }
        });
        
        addBtn.addEventListener('click', () => this.addTask());
        
        // Расширенные опции
        document.getElementById('toggleOptions').addEventListener('click', this.toggleExpandedOptions.bind(this));
        
        // Фильтры
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });
        
        // Модальное окно
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());
        document.getElementById('deleteTaskBtn').addEventListener('click', () => this.deleteTaskFromModal());
        
        // Поддержка проекта
        this.setupDonationListeners();
        
        // Клик вне модального окна
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeModal();
            }
        });
    }

    setupDonationListeners() {
        const amountInput = document.getElementById('donationAmount');
        const donateBtn = document.getElementById('donateBtn');
        
        amountInput.addEventListener('input', (e) => {
            const amount = parseInt(e.target.value);
            donateBtn.disabled = !amount || amount < 1 || amount > 2500;
            
            // Убираем выделение с быстрых кнопок
            document.querySelectorAll('.quick-amount').forEach(btn => {
                btn.classList.remove('selected');
            });
        });
        
        donateBtn.addEventListener('click', () => {
            const amount = parseInt(amountInput.value);
            if (amount >= 1 && amount <= 2500) {
                this.donate(amount);
            }
        });
        
        // Быстрые суммы
        document.querySelectorAll('.quick-amount').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = parseInt(e.target.dataset.amount);
                amountInput.value = amount;
                donateBtn.disabled = false;
                
                // Выделяем выбранную кнопку
                document.querySelectorAll('.quick-amount').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
    }

    toggleExpandedOptions() {
        const options = document.getElementById('expandedOptions');
        const button = document.getElementById('toggleOptions');
        
        if (options.style.display === 'none') {
            options.style.display = 'block';
            button.classList.add('expanded');
        } else {
            options.style.display = 'none';
            button.classList.remove('expanded');
        }
    }

    async loadTasks() {
        if (!this.currentUser) return;

        try {
            const response = await fetch(`/api/tasks/${this.currentUser.telegram_id}`);
            const result = await response.json();
            
            if (result.success) {
                this.tasks = result.tasks;
                this.updateStats();
            }
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.showNotification('Ошибка загрузки задач', 'error');
        }
    }

    async addTask() {
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) return;

        const description = document.getElementById('taskDescription').value.trim();
        const priority = document.getElementById('taskPriority').value;
        const dueDate = document.getElementById('taskDueDate').value;

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.currentUser.telegram_id,
                    title,
                    description,
                    priority,
                    dueDate: dueDate || null
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.tasks.unshift(result.task);
                this.clearForm();
                this.render();
                this.updateStats();
                
                this.showNotification('Задача добавлена!', 'success');
                this.hapticFeedback('light');
                
                // Скрываем главную кнопку
                if (window.Telegram?.WebApp?.MainButton) {
                    window.Telegram.WebApp.MainButton.hide();
                }
            }
        } catch (error) {
            console.error('Failed to add task:', error);
            this.showNotification('Ошибка при добавлении задачи', 'error');
        }
    }

    async toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !task.completed })
            });

            const result = await response.json();
            
            if (result.success) {
                task.completed = !task.completed;
                this.render();
                this.updateStats();
                
                const message = task.completed ? 'Задача выполнена!' : 'Задача возвращена в работу';
                this.showNotification(message, 'success');
                this.hapticFeedback('medium');
            }
        } catch (error) {
            console.error('Failed to toggle task:', error);
            this.showNotification('Ошибка при обновлении задачи', 'error');
        }
    }

    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.editingTaskId = taskId;
        
        document.getElementById('editTaskTitle').value = task.title;
        document.getElementById('editTaskDescription').value = task.description || '';
        document.getElementById('editTaskPriority').value = task.priority;
        document.getElementById('editTaskDueDate').value = task.due_date ? 
            new Date(task.due_date).toISOString().slice(0, 16) : '';
        
        document.getElementById('editModal').style.display = 'flex';
    }

    async saveTask() {
        if (!this.editingTaskId) return;

        const title = document.getElementById('editTaskTitle').value.trim();
        if (!title) {
            this.showNotification('Название задачи не может быть пустым', 'error');
            return;
        }

        const description = document.getElementById('editTaskDescription').value.trim();
        const priority = document.getElementById('editTaskPriority').value;
        const dueDate = document.getElementById('editTaskDueDate').value;

        try {
            const response = await fetch(`/api/tasks/${this.editingTaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: description || null,
                    priority,
                    due_date: dueDate || null
                })
            });

            const result = await response.json();
            
            if (result.success) {
                const taskIndex = this.tasks.findIndex(t => t.id === this.editingTaskId);
                if (taskIndex !== -1) {
                    this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...result.task };
                }
                
                this.closeModal();
                this.render();
                this.showNotification('Задача обновлена!', 'success');
                this.hapticFeedback('light');
            }
        } catch (error) {
            console.error('Failed to update task:', error);
            this.showNotification('Ошибка при обновлении задачи', 'error');
        }
    }

    async deleteTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            
            if (result.success) {
                this.tasks = this.tasks.filter(t => t.id !== taskId);
                this.render();
                this.updateStats();
                
                this.showNotification('Задача удалена', 'success');
                this.hapticFeedback('heavy');
            }
        } catch (error) {
            console.error('Failed to delete task:', error);
            this.showNotification('Ошибка при удалении задачи', 'error');
        }
    }

    deleteTaskFromModal() {
        if (this.editingTaskId) {
            this.deleteTask(this.editingTaskId);
            this.closeModal();
        }
    }

    closeModal() {
        document.getElementById('editModal').style.display = 'none';
        this.editingTaskId = null;
    }

    async donate(amount) {
        if (!window.Telegram?.WebApp) {
            this.showNotification('Пожертвования доступны только в Telegram', 'error');
            return;
        }

        try {
            // Отправляем команду боту для создания инвойса
            const chatId = this.currentUser.telegram_id;
            
            // Имитируем отправку команды боту через postEvent
            window.Telegram.WebApp.sendData(JSON.stringify({
                action: 'donate',
                amount: amount
            }));

            this.showNotification(`Создаем платеж на ${amount} ⭐`, 'success');
            
        } catch (error) {
            console.error('Donation error:', error);
            this.showNotification('Ошибка при создании платежа', 'error');
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.render();
    }

    getFilteredTasks() {
        switch (this.currentFilter) {
            case 'active':
                return this.tasks.filter(task => !task.completed);
            case 'completed':
                return this.tasks.filter(task => task.completed);
            default:
                return this.tasks;
        }
    }

    updateStats() {
        const activeTasks = this.tasks.filter(task => !task.completed).length;
        document.getElementById('activeCount').textContent = activeTasks;
    }

    clearForm() {
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('addTaskBtn').disabled = true;
        
        // Скрываем расширенные опции
        document.getElementById('expandedOptions').style.display = 'none';
        document.getElementById('toggleOptions').classList.remove('expanded');
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Сегодня';
        if (days === 1) return 'Завтра';
        if (days === -1) return 'Вчера';
        if (days > 0) return `Через ${days} дн.`;
        return `${Math.abs(days)} дн. назад`;
    }

    formatCreatedDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 1) return 'Только что';
        if (minutes < 60) return `${minutes} мин. назад`;
        if (hours < 24) return `${hours} ч. назад`;
        if (days < 7) return `${days} дн. назад`;
        
        return date.toLocaleDateString('ru-RU', { 
            day: '2-digit', 
            month: '2-digit'
        });
    }

    render() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';

        const filteredTasks = this.getFilteredTasks();
        const tasksContainer = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');

        if (filteredTasks.length === 0) {
            tasksContainer.innerHTML = '';
            emptyState.style.display = 'block';
            
            // Обновляем текст пустого состояния
            const emptyTitle = document.getElementById('emptyTitle');
            const emptySubtitle = document.getElementById('emptySubtitle');
            
            switch (this.currentFilter) {
                case 'active':
                    emptyTitle.textContent = 'Все задачи выполнены! 🎉';
                    emptySubtitle.textContent = 'Время для новых целей';
                    break;
                case 'completed':
                    emptyTitle.textContent = 'Архив пуст';
                    emptySubtitle.textContent = 'Выполненные задачи появятся здесь';
                    break;
                default:
                    emptyTitle.textContent = 'Пока нет задач';
                    emptySubtitle.textContent = 'Добавьте свою первую задачу!';
            }
            
            return;
        }

        emptyState.style.display = 'none';
        tasksContainer.innerHTML = filteredTasks.map(task => this.renderTask(task)).join('');
        
        // Добавляем обработчики событий
        this.attachTaskEventListeners();
    }

    renderTask(task) {
        const priorityText = {
            low: '🟢 Низкий',
            medium: '🟡 Средний',
            high: '🔴 Высокий'
        };

        return `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="task-header">
                    <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}"></div>
                    <div class="task-content">
                        <div class="task-title">${this.escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                        <div class="task-meta">
                            <span class="priority ${task.priority}">${priorityText[task.priority]}</span>
                            ${task.due_date ? `<span class="task-due-date">📅 ${this.formatDate(task.due_date)}</span>` : ''}
                            <span class="task-created">🕐 ${this.formatCreatedDate(task.created_at)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachTaskEventListeners() {
        // Обработчики чекбоксов
        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(e.target.dataset.taskId);
                this.toggleTask(taskId);
            });
        });

        // Обработчики кликов по задачам
        document.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('task-checkbox')) return;
                
                const taskId = parseInt(item.dataset.taskId);
                this.editTask(taskId);
            });
        });
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('notifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    hapticFeedback(type = 'light') {
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    startPeriodicSync() {
        // Синхронизируем данные каждые 30 секунд
        setInterval(() => {
            this.loadTasks();
        }, 30000);
    }
}

// Инициализация приложения
const app = new TasklyApp();

// Глобальные функции для совместимости
window.app = app;
