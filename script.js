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
        
        // Отслеживаем изменения темы
        tg.onEvent('themeChanged', () => {
            if (tg.colorScheme === 'dark') {
                document.documentElement.classList.add('dark-theme');
            } else {
                document.documentElement.classList.remove('dark-theme');
            }
        });
        
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
        
        // Устанавливаем автоматическое время
        this.setDefaultDateTime();
        
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

    setDefaultDateTime() {
        const now = new Date();
        now.setHours(now.getHours() + 1); // На час вперед
        now.setMinutes(0); // Округляем до часа
        
        const dateString = now.toISOString().slice(0, 16);
        document.getElementById('taskDueDate').value = dateString;
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

            const tg = window.Telegram.WebApp;
            
            // Генерируем уникальный payload
            const payload = `donation_${this.currentUser.telegram_id}_${Date.now()}`;
            
            // Создаем инвойс через наш API
            const response = await fetch('/api/create-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amount,
                    payload: payload,
                    userId: this.currentUser.telegram_id
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Ошибка создания платежа');
            }

            console.log('Opening invoice in Telegram...');
            
            // Открываем инвойс ВНУТРИ Telegram приложения
            tg.openInvoice(result.invoiceLink, (status) => {
                console.log('Payment status:', status);
                
                if (status === 'paid') {
                    this.handlePaymentSuccess(amount);
                } else if (status === 'cancelled') {
                    this.showNotification('Платеж отменен', 'error');
                } else if (status === 'failed') {
                    this.showNotification('Ошибка платежа', 'error');
                } else if (status === 'pending') {
                    this.showNotification('Платеж обрабатывается...', 'success');
                }
            });
            
        } catch (error) {
            console.error('Donation error:', error);
            this.showNotification(error.message || 'Ошибка при создании платежа', 'error');
        } finally {
            this.setDonateButtonLoading(false);
        }
    }

    handlePaymentSuccess(amount) {
        this.showNotification(`Спасибо за поддержку! ${amount} ⭐`, 'success');
        
        // Очищаем форму
        document.getElementById('donationAmount').value = '';
        document.getElementById('donateBtn').disabled = true;
        
        // Haptic feedback
        this.hapticFeedback('medium');
        
        // Можно добавить конфетти или другие эффекты
        this.celebratePayment();
    }

    celebratePayment() {
        // Простая анимация благодарности
        const supportCard = document.querySelector('.support-card');
        supportCard.style.transform = 'scale(1.02)';
        supportCard.style.boxShadow = '0 12px 40px rgba(0, 122, 255, 0.4)';
        
        setTimeout(() => {
            supportCard.style.transform = '';
            supportCard.style.boxShadow = '';
        }, 500);
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
                Создание...
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
        const priority = this.getSelectedPriority('taskPriority');
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

    // Получаем выбранный приоритет из радио-кнопок
    getSelectedPriority(name) {
        const selectedRadio = document.querySelector(`input[name="${name}"]:checked`);
        return selectedRadio ? selectedRadio.value : 'medium';
    }

    // Устанавливаем выбранный приоритет
    setSelectedPriority(name, value) {
        const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
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
                if (task.completed) {
                    task.completed_at = new Date().toISOString();
                } else {
                    task.completed_at = null;
                }
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
        this.setSelectedPriority('editTaskPriority', task.priority);
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
        const priority = this.getSelectedPriority('editTaskPriority');
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

    groupTasksByTime(tasks) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const groups = {
            overdue: { name: '🔴 Просрочено', tasks: [] },
            today: { name: '🔥 Сегодня', tasks: [] },
            tomorrow: { name: '⭐ Завтра', tasks: [] },
            week: { name: '📅 На неделе', tasks: [] },
            future: { name: '📋 Позже', tasks: [] },
            noDate: { name: '📝 Без срока', tasks: [] }
        };

        tasks.forEach(task => {
            if (!task.due_date) {
                groups.noDate.tasks.push(task);
                return;
            }

            const dueDate = new Date(task.due_date);
            const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

            if (dueDateOnly < today) {
                groups.overdue.tasks.push(task);
            } else if (dueDateOnly.getTime() === today.getTime()) {
                groups.today.tasks.push(task);
            } else if (dueDateOnly.getTime() === tomorrow.getTime()) {
                groups.tomorrow.tasks.push(task);
            } else if (dueDateOnly <= nextWeek) {
                groups.week.tasks.push(task);
            } else {
                groups.future.tasks.push(task);
            }
        });

        return Object.entries(groups)
            .filter(([key, group]) => group.tasks.length > 0)
            .map(([key, group]) => ({ key, ...group }));
    }

    updateStats() {
        const activeTasks = this.tasks.filter(task => !task.completed).length;
        document.getElementById('activeCount').textContent = activeTasks;
    }

    clearForm() {
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        this.setSelectedPriority('taskPriority', 'medium');
        document.getElementById('addTaskBtn').disabled = true;
        
        // Устанавливаем новое время по умолчанию
        this.setDefaultDateTime();
        
        // Скрываем расширенные опции
        document.getElementById('expandedOptions').style.display = 'none';
        document.getElementById('toggleOptions').classList.remove('expanded');
    }

    formatDueDate(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dueDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const timeString = date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        if (dueDateOnly < today) {
            const daysDiff = Math.ceil((today - dueDateOnly) / (1000 * 60 * 60 * 24));
            return `${daysDiff} дн. назад в ${timeString}`;
        } else if (dueDateOnly.getTime() === today.getTime()) {
            return `Сегодня в ${timeString}`;
        } else if (dueDateOnly.getTime() === tomorrow.getTime()) {
            return `Завтра в ${timeString}`;
        } else {
            const daysDiff = Math.ceil((dueDateOnly - today) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) {
                return `Через ${daysDiff} дн. в ${timeString}`;
            } else {
                return `${date.toLocaleDateString('ru-RU')} в ${timeString}`;
            }
        }
    }

    render() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';

        const filteredTasks = this.getFilteredTasks();
        const tasksContainer = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');

        // Очищаем контейнеры
        tasksContainer.innerHTML = '';

        if (filteredTasks.length === 0) {
            emptyState.style.display = 'block';
            this.updateEmptyState();
            return;
        }

        emptyState.style.display = 'none';

        if (this.currentFilter === 'active') {
            // Группируем активные задачи по времени
            const timeGroups = this.groupTasksByTime(filteredTasks);
            tasksContainer.innerHTML = timeGroups.map(group => this.renderTaskGroup(group)).join('');
        } else {
            // Показываем обычный список для completed и all
            tasksContainer.innerHTML = filteredTasks.map(task => this.renderTask(task)).join('');
        }
        
        // Добавляем обработчики событий
        this.attachTaskEventListeners();
    }

    renderTaskGroup(group) {
        return `
            <div class="task-group">
                <div class="task-group-header">
                    <h3 class="task-group-title">${group.name}</h3>
                    <span class="task-group-count">${group.tasks.length}</span>
                </div>
                <div class="task-group-list">
                    ${group.tasks.map(task => this.renderTask(task)).join('')}
                </div>
            </div>
        `;
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
                            ${task.due_date ? `<span class="task-due-date">⏰ ${this.formatDueDate(task.due_date)}</span>` : ''}
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
