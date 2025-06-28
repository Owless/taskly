class TasklyApp {
    constructor() {
        this.currentUser = null;
        this.tasks = [];
        this.currentFilter = 'active';
        this.editingTaskId = null;
        this.archiveExpanded = new Set();
        this.init();
    }

    async init() {
        // Проверка доступа через Telegram
        if (!this.checkTelegramAccess()) {
            document.getElementById('accessDenied').style.display = 'flex';
            return;
        }

        this.initTelegramWebApp();
        
        try {
            await this.authenticate();
            this.setupEventListeners();
            await this.loadTasks();
            this.render();
            this.startPeriodicSync();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification('Ошибка инициализации приложения', 'error');
        }
    }

    checkTelegramAccess() {
        // Проверяем наличие Telegram WebApp API
        if (!window.Telegram?.WebApp) {
            return false;
        }

        // Проверяем наличие initData
        const initData = window.Telegram.WebApp.initData;
        if (!initData || !initData.includes('user=')) {
            return false;
        }

        return true;
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
            tg.MainButton.color = '#007AFF';
            tg.MainButton.onClick(() => this.addTask());
        }
    }

    async authenticate() {
        try {
            const initData = window.Telegram.WebApp.initData;
            
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
            throw error;
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
            btn.addEventListener('click', (e) => this.setFilter(e.target.closest('.filter-btn').dataset.filter));
        });
        
        // Модальное окно
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());
        document.getElementById('deleteTaskBtn').addEventListener('click', () => this.deleteTaskFromModal());
        
        // Поддержка проекта
        this.setupDonationListeners();
        
        // Закрытие модального окна по backdrop
        document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
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
                task.updated_at = new Date().toISOString();
                this.render();
                this.updateStats();
                
                const message = task.completed ? 'Задача выполнена! 🎉' : 'Задача возвращена в работу';
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
        if (!this.currentUser) {
            this.showNotification('Ошибка авторизации', 'error');
            return;
        }

        try {
            const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.currentUser.telegram_id,
                    amount: amount
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification(`Создаем платеж на ${amount} ⭐`, 'success');
            } else {
                throw new Error(result.error);
            }
            
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

    groupTasksByMonth(tasks) {
        const groups = {};
        
        tasks.forEach(task => {
            const date = new Date(task.updated_at || task.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleDateString('ru-RU', { 
                year: 'numeric', 
                month: 'long' 
            });
            
            if (!groups[monthKey]) {
                groups[monthKey] = {
                    name: monthName,
                    tasks: []
                };
            }
            
            groups[monthKey].tasks.push(task);
        });
        
        // Сортируем месяцы по убыванию
        return Object.keys(groups)
            .sort((a, b) => b.localeCompare(a))
            .map(key => groups[key]);
    }

    updateStats() {
        const activeTasks = this.tasks.filter(task => !task.completed).length;
        const completedTasks = this.tasks.filter(task => task.completed).length;
        
        document.getElementById('activeCount').textContent = activeTasks;
        document.getElementById('completedCount').textContent = completedTasks;
    }

    clearForm() {
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('addTaskBtn').disabled = true;
        
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

        if (this.currentFilter === 'completed') {
            this.renderArchive();
        } else {
            this.renderTasks();
        }
    }

    renderTasks() {
        document.getElementById('archiveSection').style.display = 'none';
        document.querySelector('.tasks-section').style.display = 'block';

        const filteredTasks = this.getFilteredTasks();
        const tasksContainer = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');

        if (filteredTasks.length === 0) {
            tasksContainer.innerHTML = '';
            emptyState.style.display = 'block';
            this.updateEmptyStateText();
            return;
        }

        emptyState.style.display = 'none';
        tasksContainer.innerHTML = filteredTasks.map(task => this.renderTask(task)).join('');
        this.attachTaskEventListeners();
    }

    renderArchive() {
        document.querySelector('.tasks-section').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
        
        const archiveSection = document.getElementById('archiveSection');
        const archiveList = document.getElementById('archiveList');
        
        archiveSection.style.display = 'block';

        const completedTasks = this.tasks.filter(task => task.completed);
        
        if (completedTasks.length === 0) {
            archiveList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-illustration">
                        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                            <circle cx="60" cy="60" r="50" fill="var(--surface-tertiary)"/>
                            <path d="M40 60h40M60 40v40" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                    </div>
                    <h3>Архив пуст</h3>
                    <p>Выполненные задачи появятся здесь</p>
                </div>
            `;
            return;
        }

        const monthGroups = this.groupTasksByMonth(completedTasks);
        
        archiveList.innerHTML = monthGroups.map(group => `
            <div class="archive-month">
                <div class="month-header" onclick="app.toggleMonth('${group.name}')">
                    <span class="month-title">${group.name}</span>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="month-count">${group.tasks.length}</span>
                        <svg class="expand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                </div>
                <div class="month-tasks ${this.archiveExpanded.has(group.name) ? 'expanded' : ''}" 
                     style="display: ${this.archiveExpanded.has(group.name) ? 'block' : 'none'}">
                    <div class="tasks-list">
                        ${group.tasks.map(task => this.renderTask(task)).join('')}
                    </div>
                </div>
            </div>
        `).join('');

        this.attachTaskEventListeners();
        this.attachArchiveEventListeners();
    }

    toggleMonth(monthName) {
        if (this.archiveExpanded.has(monthName)) {
            this.archiveExpanded.delete(monthName);
        } else {
            this.archiveExpanded.add(monthName);
        }
        this.renderArchive();
    }

    attachArchiveEventListeners() {
        document.querySelectorAll('.month-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                const monthTitle = header.querySelector('.month-title').textContent;
                this.toggleMonth(monthTitle);
            });
        });
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
                    <div class="task-content">
                        <div class="task-title">${this.escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                        <div class="task-meta">
                            <span class="priority ${task.priority}">${priorityText[task.priority]}</span>
                            ${task.due_date ? `<span class="task-due-date">📅 ${this.formatDate(task.due_date)}</span>` : ''}
                            <span class="task-created">🕐 ${this.formatCreatedDate(task.created_at)}</span>
                        </div>
                    </div>
                    <button class="complete-btn ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        ${task.completed ? 'Выполнено' : 'Выполнить'}
                    </button>
                </div>
            </div>
        `;
    }

    attachTaskEventListeners() {
        // Обработчики кнопок выполнения
        document.querySelectorAll('.complete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(e.target.closest('.complete-btn').dataset.taskId);
                this.toggleTask(taskId);
            });
        });

        // Обработчики кликов по задачам
        document.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.complete-btn')) return;
                
                const taskId = parseInt(item.dataset.taskId);
                this.editTask(taskId);
            });
        });
    }

    updateEmptyStateText() {
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
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('notifications').appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
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
        setInterval(() => {
            this.loadTasks();
        }, 30000);
    }
}

// Инициализация приложения
const app = new TasklyApp();
window.app = app;
