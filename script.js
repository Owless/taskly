class TasklyApp {
    constructor() {
        this.currentUser = null;
        this.tasks = [];
        this.currentFilter = 'active';
        this.editingTaskId = null;
        this.init();
    }

    async init() {
        // Проверяем, что мы в Telegram
        if (!this.isTelegramEnvironment()) {
            this.showAccessDenied();
            return;
        }

        this.initTelegramWebApp();
        await this.authenticate();
        this.setupEventListeners();
        await this.loadTasks();
        this.render();
        this.startPeriodicSync();
    }

    isTelegramEnvironment() {
        // Проверяем наличие Telegram WebApp API
        return window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
    }

    showAccessDenied() {
        document.getElementById('accessDenied').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }

    initTelegramWebApp() {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        
        // Настройка цветовой схемы
        if (tg.colorScheme === 'dark') {
            document.documentElement.classList.add('dark-theme');
        }
        
        // Настройка главной кнопки
        tg.MainButton.setText('➕ Добавить задачу');
        tg.MainButton.color = '#007AFF';
        tg.MainButton.onClick(() => this.addTask());
        
        // Скрываем кнопку изначально
        tg.MainButton.hide();

        // Показываем приложение
        document.getElementById('accessDenied').style.display = 'none';
        document.getElementById('app').style.display = 'block';
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
            
            // Показываем/скрываем главную кнопку Telegram
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
            
            // Очищаем ошибки при вводе
            if (amount >= 1 && amount <= 2500) {
                amountInput.classList.remove('error');
            }
        });
        
        // Валидация при потере фокуса
        amountInput.addEventListener('blur', (e) => {
            const amount = parseInt(e.target.value);
            if (e.target.value && (amount < 1 || amount > 2500)) {
                e.target.classList.add('error');
                this.showNotification('Сумма должна быть от 1 до 2500 звезд', 'error');
            }
        });
        
        donateBtn.addEventListener('click', () => {
            const amount = parseInt(amountInput.value);
            if (amount >= 1 && amount <= 2500) {
                this.donate(amount);
            }
        });
    }

    async donate(amount) {
        if (!window.Telegram?.WebApp) {
            this.showNotification('Платежи доступны только в Telegram', 'error');
            return;
        }

        try {
            // Показываем загрузку
            this.setDonateButtonLoading(true);

            // Получаем данные для создания инвойса
            const response = await fetch('/api/create-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.currentUser.telegram_id,
                    amount: amount
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            // Создаем инвойс через Telegram WebApp API
            const tg = window.Telegram.WebApp;
            
            this.showNotification('Открываем форму оплаты...', 'success');

            // Используем Telegram WebApp для показа инвойса
            tg.openInvoice(result.invoiceData.payload, (status) => {
                this.handlePaymentResult(status, amount, result.invoiceData.payload);
            });

        } catch (error) {
            console.error('Donation error:', error);
            this.showNotification(error.message || 'Ошибка при создании платежа', 'error');
        } finally {
            this.setDonateButtonLoading(false);
        }
    }

    handlePaymentResult(status, amount, payload) {
        console.log('Payment result:', status);

        switch (status) {
            case 'paid':
                this.onPaymentSuccess(amount, payload);
                break;
            case 'cancelled':
                this.showNotification('Платеж отменен', 'error');
                break;
            case 'failed':
                this.showNotification('Ошибка при оплате', 'error');
                break;
            case 'pending':
                this.showNotification('Платеж в обработке...', 'success');
                break;
            default:
                this.showNotification('Неизвестный статус платежа', 'error');
        }
    }

    async onPaymentSuccess(amount, payload) {
        try {
            // Валидируем платеж на сервере
            const response = await fetch('/api/validate-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.currentUser.telegram_id,
                    amount: amount,
                    payload: payload
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`Спасибо за поддержку! ${amount} ⭐`, 'success');
                
                // Очищаем форму
                document.getElementById('donationAmount').value = '';
                document.getElementById('donateBtn').disabled = true;
                
                // Haptic feedback
                this.hapticFeedback('heavy');
                
                // Показываем конфетти (если доступно)
                if (window.Telegram?.WebApp?.showPopup) {
                    window.Telegram.WebApp.showPopup({
                        title: 'Спасибо! 🎉',
                        message: `Ваше пожертвование в ${amount} ⭐ очень важно для развития проекта!`,
                        buttons: [{ type: 'ok', text: 'Отлично!' }]
                    });
                }
                
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Payment validation error:', error);
            this.showNotification('Ошибка валидации платежа', 'error');
        }
    }

    setDonateButtonLoading(loading) {
        const donateBtn = document.getElementById('donateBtn');
        
        if (loading) {
            donateBtn.classList.add('loading');
            donateBtn.disabled = true;
            donateBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                    <path d="M12 1v6m0 10v6m11-7h-6M6 12H0" stroke="currentColor" stroke-width="2"/>
                </svg>
                Обработка...
            `;
            
        } else {
            donateBtn.classList.remove('loading');
            donateBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"/>
                </svg>
                Поддержать
            `;
            
            // Проверяем, нужно ли снова активировать кнопку
            const amount = parseInt(document.getElementById('donationAmount').value);
            donateBtn.disabled = !amount || amount < 1 || amount > 2500;
        }
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
                
                this.showNotification('Задача добавлена! ✅', 'success');
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
                this.showNotification('Задача обновлена! ✏️', 'success');
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
                
                this.showNotification('Задача удалена 🗑️', 'success');
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
            const date = new Date(task.completed ? task.updated_at : task.created_at);
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
        
        return Object.entries(groups)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, value]) => ({
                key,
                ...value
            }));
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
        const archiveContainer = document.getElementById('archiveList');
        const emptyState = document.getElementById('emptyState');

        // Очищаем контейнеры
        tasksContainer.innerHTML = '';
        archiveContainer.innerHTML = '';

        if (filteredTasks.length === 0) {
            emptyState.style.display = 'block';
            this.updateEmptyState();
            return;
        }

        emptyState.style.display = 'none';

        if (this.currentFilter === 'completed') {
            // Показываем архив по месяцам
            const monthGroups = this.groupTasksByMonth(filteredTasks);
            archiveContainer.innerHTML = monthGroups.map(group => this.renderArchiveMonth(group)).join('');
            this.attachArchiveEventListeners();
        } else {
            // Показываем обычный список
            tasksContainer.innerHTML = filteredTasks.map(task => this.renderTask(task)).join('');
        }
        
        // Добавляем обработчики событий
        this.attachTaskEventListeners();
    }

    renderArchiveMonth(group) {
        return `
            <div class="archive-month" data-month="${group.key}">
                <div class="archive-month-header">
                    <div class="archive-month-title">${group.name}</div>
                    <div class="archive-month-count">${group.tasks.length}</div>
                    <div class="archive-month-chevron">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </div>
                </div>
                <div class="archive-month-tasks">
                    ${group.tasks.map(task => this.renderTask(task)).join('')}
                </div>
            </div>
        `;
    }

    attachArchiveEventListeners() {
        document.querySelectorAll('.archive-month-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const monthContainer = e.target.closest('.archive-month');
                monthContainer.classList.toggle('expanded');
            });
        });
    }

    updateEmptyState() {
        const emptyTitle = document.getElementById('emptyTitle');
        const emptySubtitle = document.getElementById('emptySubtitle');
        
        switch (this.currentFilter) {
            case 'active':
                emptyTitle.textContent = 'Все задачи выполнены! 🎉';
                emptySubtitle.textContent = 'Время для новых целей';
                break;
            case 'completed':
                emptyTitle.textContent = 'Архив пуст 📁';
                emptySubtitle.textContent = 'Выполненные задачи появятся здесь';
                break;
            default:
                emptyTitle.textContent = 'Пока нет задач 📝';
                emptySubtitle.textContent = 'Добавьте свою первую задачу!';
        }
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
                    <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}"></div>
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
        // Синхронизируем данные каждые 30 секунд
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadTasks();
            }
        }, 30000);
    }
}

// Инициализация приложения
const app = new TasklyApp();

// Глобальные функции для совместимости
window.app = app;
