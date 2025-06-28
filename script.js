class TasklyApp {
    constructor() {
        this.currentUser = null;
        this.tasks = [];
        this.currentFilter = 'active';
        this.editingTaskId = null;
        this.settings = {
            timezone: 'auto',
            notificationsEnabled: true,
            soundEnabled: true,
            theme: 'auto'
        };
        this.timeDisplayInterval = null;
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
        await this.loadSettings();
        this.setupEventListeners();
        this.setupLogo();
        await this.loadTasks();
        this.render();
        this.startPeriodicSync();
    }

    isTelegramEnvironment() {
        return window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
    }

    showAccessDenied() {
        document.getElementById('accessDenied').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }

    initTelegramWebApp() {
        const tg = window.Telegram.WebApp;
        if (!tg) return;
        
        tg.ready();
        tg.expand();
        
        // Применяем тему на основе настроек пользователя или системы
        this.applyInitialTheme(tg);
        
        // Отслеживаем изменения темы
        tg.onEvent('themeChanged', () => {
            console.log('Telegram theme changed to:', tg.colorScheme);
            this.applyTheme(tg.colorScheme);
        });
        
        // Дополнительно отслеживаем системные изменения темы
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeQuery.addEventListener('change', (e) => {
                console.log('System theme changed to:', e.matches ? 'dark' : 'light');
                // Применяем только если настройка "авто"
                if (this.settings.theme === 'auto') {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
        
        // Настройка главной кнопки
        tg.MainButton.setText('➕ Добавить задачу');
        tg.MainButton.color = '#007AFF';
        tg.MainButton.onClick(() => this.addTask());
        tg.MainButton.hide();

        // Показываем приложение
        document.getElementById('accessDenied').style.display = 'none';
        document.getElementById('app').style.display = 'block';
    }

    applyInitialTheme(tg) {
        // Определяем тему на основе настроек пользователя
        let themeToApply = 'light';
        
        if (this.settings.theme === 'dark') {
            themeToApply = 'dark';
        } else if (this.settings.theme === 'light') {
            themeToApply = 'light';
        } else {
            // Авто режим - берем из Telegram или системы
            if (tg.colorScheme) {
                themeToApply = tg.colorScheme;
            } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                themeToApply = 'dark';
            }
        }
        
        console.log('Initial theme:', themeToApply);
        this.applyTheme(themeToApply);
    }

    applyTheme(colorScheme) {
        console.log('Applying theme:', colorScheme);
        
        // Определяем тему
        const isDark = colorScheme === 'dark';
        
        // Убираем все классы темы
        document.documentElement.classList.remove('dark-theme', 'light-theme');
        document.body.classList.remove('dark-theme', 'light-theme');
        document.documentElement.removeAttribute('data-theme');
        
        // Принудительно устанавливаем новую тему
        if (isDark) {
            document.documentElement.classList.add('dark-theme');
            document.body.classList.add('dark-theme');
            document.documentElement.setAttribute('data-theme', 'dark');
            console.log('Dark theme applied');
        } else {
            document.documentElement.classList.add('light-theme');
            document.body.classList.add('light-theme');
            document.documentElement.setAttribute('data-theme', 'light');
            console.log('Light theme applied');
        }
        
        // Принудительное обновление стилей
        requestAnimationFrame(() => {
            document.body.style.display = 'none';
            document.body.offsetHeight; // Trigger reflow
            document.body.style.display = '';
        });
    }

    setupLogo() {
        const logoImg = document.getElementById('logoImage');
        const userInitials = document.getElementById('userInitials');
        
        // Используем локальный логотип
        const logoUrl = '/logo2.png';
        
        if (logoImg && userInitials) {
            logoImg.src = logoUrl;
            logoImg.style.display = 'block';
            userInitials.style.display = 'none';
            
            logoImg.onload = () => {
                console.log('Logo loaded successfully');
                logoImg.style.display = 'block';
                userInitials.style.display = 'none';
            };
            
            logoImg.onerror = () => {
                console.log('Logo failed to load, showing icon');
                logoImg.style.display = 'none';
                userInitials.style.display = 'flex';
                userInitials.innerHTML = `
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
            };
        }
    }

    async authenticate() {
        try {
            const initData = window.Telegram.WebApp.initData;
            
            if (!initData) {
                throw new Error('No Telegram data available');
            }
            
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
            this.showAccessDenied();
        }
    }

    updateUserInfo() {
        // Header теперь показывает только логотип приложения
        return;
    }

    getUserTimezone() {
        if (this.settings.timezone === 'auto') {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch (error) {
                return 'Europe/Moscow';
            }
        }
        return this.settings.timezone;
    }

    convertLocalToUTC(localDateTimeString) {
        if (!localDateTimeString) return null;
        
        try {
            const localDate = new Date(localDateTimeString);
            const result = localDate.toISOString();
            
            console.log('Converting local to UTC:', {
                input: localDateTimeString,
                userTimezone: this.getUserTimezone(),
                localDate: localDate.toString(),
                result: result
            });
            
            return result;
        } catch (error) {
            console.error('Date conversion error:', error);
            return new Date(localDateTimeString).toISOString();
        }
    }

    convertUTCToLocal(utcDateString) {
        if (!utcDateString) return '';
        
        try {
            const utcDate = new Date(utcDateString);
            
            const year = utcDate.getFullYear();
            const month = String(utcDate.getMonth() + 1).padStart(2, '0');
            const day = String(utcDate.getDate()).padStart(2, '0');
            const hours = String(utcDate.getHours()).padStart(2, '0');
            const minutes = String(utcDate.getMinutes()).padStart(2, '0');
            
            const result = `${year}-${month}-${day}T${hours}:${minutes}`;
            
            console.log('Converting UTC to local:', {
                input: utcDateString,
                utcDate: utcDate.toString(),
                result: result
            });
            
            return result;
        } catch (error) {
            console.error('UTC conversion error:', error);
            return new Date(utcDateString).toISOString().slice(0, 16);
        }
    }

    async loadSettings() {
        if (!this.currentUser) return;

        try {
            const response = await fetch(`/api/settings/${this.currentUser.telegram_id}`);
            const result = await response.json();
            
            if (result.success && result.settings) {
                this.settings = { ...this.settings, ...result.settings };
                console.log('Loaded settings:', this.settings);
            }
        } catch (error) {
            console.error('Failed to load settings from server:', error);
        }
        
        this.updateSettingsUI();
    }

    async saveSettings() {
        if (!this.currentUser) return;

        try {
            const response = await fetch(`/api/settings/${this.currentUser.telegram_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: this.settings })
            });

            const result = await response.json();
            if (!result.success) {
                console.error('Failed to save settings to server:', result.error);
            }
        } catch (error) {
            console.error('Failed to save settings to server:', error);
        }
    }

    updateSettingsUI() {
        const timezoneSelect = document.getElementById('timezoneSelect');
        const notificationsEnabled = document.getElementById('notificationsEnabled');
        const soundEnabled = document.getElementById('soundEnabled');
        
        if (timezoneSelect) timezoneSelect.value = this.settings.timezone;
        if (notificationsEnabled) notificationsEnabled.checked = this.settings.notificationsEnabled;
        if (soundEnabled) soundEnabled.checked = this.settings.soundEnabled;
        
        this.updateCurrentTime();
    }

    updateCurrentTime() {
        const timezone = this.getUserTimezone();
        const now = new Date();
        
        try {
            const timeString = now.toLocaleString('ru-RU', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            
            const timezoneName = this.getTimezoneDisplayName(timezone);
            const currentTimeElement = document.getElementById('currentTime');
            if (currentTimeElement) {
                currentTimeElement.textContent = `${timeString} (${timezoneName})`;
            }
        } catch (error) {
            const currentTimeElement = document.getElementById('currentTime');
            if (currentTimeElement) {
                currentTimeElement.textContent = 'Неверный часовой пояс';
            }
        }
    }

    getTimezoneDisplayName(timezone) {
        const timezoneNames = {
            'Europe/Kaliningrad': 'Калининград',
            'Europe/Moscow': 'Москва',
            'Europe/Samara': 'Самара',
            'Asia/Yekaterinburg': 'Екатеринбург',
            'Asia/Omsk': 'Омск',
            'Asia/Krasnoyarsk': 'Красноярск',
            'Asia/Irkutsk': 'Иркутск',
            'Asia/Chita': 'Чита',
            'Asia/Vladivostok': 'Владивосток',
            'Asia/Magadan': 'Магадан',
            'Asia/Kamchatka': 'Камчатка',
            'Europe/Kiev': 'Киев',
            'Europe/Minsk': 'Минск',
            'Asia/Almaty': 'Алматы',
            'Asia/Tashkent': 'Ташкент',
            'Asia/Baku': 'Баку',
            'Asia/Yerevan': 'Ереван',
            'Europe/Chisinau': 'Кишинев',
            'Asia/Bishkek': 'Бишкек',
            'Asia/Dushanbe': 'Душанбе'
        };
        
        return timezoneNames[timezone] || timezone;
    }

    setupEventListeners() {
        // Добавление задач
        const taskInput = document.getElementById('taskTitle');
        const addBtn = document.getElementById('addTaskBtn');
        
        if (taskInput && addBtn) {
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
        }
        
        // Расширенные опции
        const toggleOptions = document.getElementById('toggleOptions');
        if (toggleOptions) {
            toggleOptions.addEventListener('click', this.toggleExpandedOptions.bind(this));
        }
        
        // Устанавливаем автоматическое время
        this.setDefaultDateTime();
        
        // Фильтры
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });
        
        // Кнопка настроек
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Модальные окна
        const closeModal = document.getElementById('closeModal');
        const saveTaskBtn = document.getElementById('saveTaskBtn');
        const deleteTaskBtn = document.getElementById('deleteTaskBtn');
        
        if (closeModal) closeModal.addEventListener('click', () => this.closeModal());
        if (saveTaskBtn) saveTaskBtn.addEventListener('click', () => this.saveTask());
        if (deleteTaskBtn) deleteTaskBtn.addEventListener('click', () => this.deleteTaskFromModal());
        
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        
        if (closeSettingsModal) closeSettingsModal.addEventListener('click', () => this.closeSettingsModal());
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', () => this.saveSettingsFromModal());
        
        // Отслеживание изменений в настройках
        const timezoneSelect = document.getElementById('timezoneSelect');
        if (timezoneSelect) {
            timezoneSelect.addEventListener('change', () => {
                this.updateCurrentTime();
            });
        }
        
        // Поддержка проекта
        this.setupDonationListeners();
        
        // Клики вне модальных окон
        const editModal = document.getElementById('editModal');
        const settingsModal = document.getElementById('settingsModal');
        
        if (editModal) {
            editModal.addEventListener('click', (e) => {
                if (e.target.id === 'editModal') this.closeModal();
            });
        }
        
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target.id === 'settingsModal') this.closeSettingsModal();
            });
        }
    }

    setDefaultDateTime() {
        const taskDueDate = document.getElementById('taskDueDate');
        if (!taskDueDate) return;
        
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const dateString = `${year}-${month}-${day}T${hours}:${minutes}`;
        taskDueDate.value = dateString;
    }

    setupDonationListeners() {
        const amountInput = document.getElementById('donationAmount');
        const donateBtn = document.getElementById('donateBtn');
        
        if (!amountInput || !donateBtn) return;
        
        amountInput.addEventListener('input', (e) => {
            const amount = parseInt(e.target.value);
            donateBtn.disabled = !amount || amount < 1 || amount > 2500;
            
            if (amount >= 1 && amount <= 2500) {
                amountInput.classList.remove('error');
            }
        });
        
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
            this.setDonateButtonLoading(true);

            const tg = window.Telegram.WebApp;
            const payload = `donation_${this.currentUser.telegram_id}_${Date.now()}`;
            
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
        
        const donationAmount = document.getElementById('donationAmount');
        const donateBtn = document.getElementById('donateBtn');
        
        if (donationAmount) donationAmount.value = '';
        if (donateBtn) donateBtn.disabled = true;
        
        this.hapticFeedback('medium');
        this.celebratePayment();
    }

    celebratePayment() {
        const supportCard = document.querySelector('.support-card');
        if (supportCard) {
            supportCard.style.transform = 'scale(1.02)';
            supportCard.style.boxShadow = '0 12px 40px rgba(0, 122, 255, 0.4)';
            
            setTimeout(() => {
                supportCard.style.transform = '';
                supportCard.style.boxShadow = '';
            }, 500);
        }
    }

    setDonateButtonLoading(loading) {
        const donateBtn = document.getElementById('donateBtn');
        if (!donateBtn) return;
        
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
            
            const donationAmount = document.getElementById('donationAmount');
            const amount = donationAmount ? parseInt(donationAmount.value) : 0;
            donateBtn.disabled = !amount || amount < 1 || amount > 2500;
        }
    }

    toggleExpandedOptions() {
        const options = document.getElementById('expandedOptions');
        const button = document.getElementById('toggleOptions');
        
        if (!options || !button) return;
        
        if (options.style.display === 'none') {
            options.style.display = 'block';
            button.classList.add('expanded');
        } else {
            options.style.display = 'none';
            button.classList.remove('expanded');
        }
    }

    openSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.style.display = 'flex';
            this.updateSettingsUI();
            
            if (this.timeDisplayInterval) {
                clearInterval(this.timeDisplayInterval);
            }
            
            this.timeDisplayInterval = setInterval(() => {
                this.updateCurrentTime();
            }, 1000);
        }
    }

    closeSettingsModal() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.style.display = 'none';
        }
        
        if (this.timeDisplayInterval) {
            clearInterval(this.timeDisplayInterval);
            this.timeDisplayInterval = null;
        }
    }

    async saveSettingsFromModal() {
        const timezoneSelect = document.getElementById('timezoneSelect');
        const notificationsEnabled = document.getElementById('notificationsEnabled');
        const soundEnabled = document.getElementById('soundEnabled');
        
        if (timezoneSelect) this.settings.timezone = timezoneSelect.value;
        if (notificationsEnabled) this.settings.notificationsEnabled = notificationsEnabled.checked;
        if (soundEnabled) this.settings.soundEnabled = soundEnabled.checked;
        
        await this.saveSettings();
        this.closeSettingsModal();
        this.showNotification('Настройки сохранены! ⚙️', 'success');
        this.hapticFeedback('light');
        
        this.setDefaultDateTime();
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
        const taskTitle = document.getElementById('taskTitle');
        if (!taskTitle) return;
        
        const title = taskTitle.value.trim();
        if (!title) return;

        const taskDescription = document.getElementById('taskDescription');
        const taskDueDate = document.getElementById('taskDueDate');
        
        const description = taskDescription ? taskDescription.value.trim() : '';
        const priority = this.getSelectedPriority('taskPriority');
        const dueDate = taskDueDate ? taskDueDate.value : '';

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: this.currentUser.telegram_id,
                    title,
                    description,
                    priority,
                    dueDate: this.convertLocalToUTC(dueDate)
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
                
                if (window.Telegram?.WebApp?.MainButton) {
                    window.Telegram.WebApp.MainButton.hide();
                }
            }
        } catch (error) {
            console.error('Failed to add task:', error);
            this.showNotification('Ошибка при добавлении задачи', 'error');
        }
    }

    getSelectedPriority(name) {
        const selectedRadio = document.querySelector(`input[name="${name}"]:checked`);
        return selectedRadio ? selectedRadio.value : 'medium';
    }

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
        
        const editTaskTitle = document.getElementById('editTaskTitle');
        const editTaskDescription = document.getElementById('editTaskDescription');
        const editTaskDueDate = document.getElementById('editTaskDueDate');
        const editModal = document.getElementById('editModal');
        
        if (editTaskTitle) editTaskTitle.value = task.title;
        if (editTaskDescription) editTaskDescription.value = task.description || '';
        this.setSelectedPriority('editTaskPriority', task.priority);
        
        if (editTaskDueDate) {
            editTaskDueDate.value = this.convertUTCToLocal(task.due_date);
        }
        
        if (editModal) {
            editModal.style.display = 'flex';
        }
    }

    async saveTask() {
        if (!this.editingTaskId) return;

        const editTaskTitle = document.getElementById('editTaskTitle');
        if (!editTaskTitle) return;
        
        const title = editTaskTitle.value.trim();
        if (!title) {
            this.showNotification('Название задачи не может быть пустым', 'error');
            return;
        }

        const editTaskDescription = document.getElementById('editTaskDescription');
        const editTaskDueDate = document.getElementById('editTaskDueDate');
        
        const description = editTaskDescription ? editTaskDescription.value.trim() : '';
        const priority = this.getSelectedPriority('editTaskPriority');
        const dueDate = editTaskDueDate ? editTaskDueDate.value : '';

        try {
            const response = await fetch(`/api/tasks/${this.editingTaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: description || null,
                    priority,
                    due_date: this.convertLocalToUTC(dueDate)
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
        const editModal = document.getElementById('editModal');
        if (editModal) {
            editModal.style.display = 'none';
        }
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
        const activeCount = document.getElementById('activeCount');
        if (activeCount) {
            activeCount.textContent = activeTasks;
        }
    }

    clearForm() {
        const taskTitle = document.getElementById('taskTitle');
        const taskDescription = document.getElementById('taskDescription');
        const addTaskBtn = document.getElementById('addTaskBtn');
        const expandedOptions = document.getElementById('expandedOptions');
        const toggleOptions = document.getElementById('toggleOptions');
        
        if (taskTitle) taskTitle.value = '';
        if (taskDescription) taskDescription.value = '';
        this.setSelectedPriority('taskPriority', 'medium');
        if (addTaskBtn) addTaskBtn.disabled = true;
        
        this.setDefaultDateTime();
        
        if (expandedOptions) expandedOptions.style.display = 'none';
        if (toggleOptions) toggleOptions.classList.remove('expanded');
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
        const loading = document.getElementById('loading');
        const mainContent = document.getElementById('mainContent');
        
        if (loading) loading.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';

        const filteredTasks = this.getFilteredTasks();
        const tasksContainer = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');

        if (!tasksContainer || !emptyState) return;

        tasksContainer.innerHTML = '';

        if (filteredTasks.length === 0) {
            emptyState.style.display = 'block';
            this.updateEmptyState();
            return;
        }

        emptyState.style.display = 'none';

        if (this.currentFilter === 'active') {
            const timeGroups = this.groupTasksByTime(filteredTasks);
            tasksContainer.innerHTML = timeGroups.map(group => this.renderTaskGroup(group)).join('');
        } else {
            tasksContainer.innerHTML = filteredTasks.map(task => this.renderTask(task)).join('');
        }
        
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
        
        if (!emptyTitle || !emptySubtitle) return;
        
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
        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = parseInt(e.target.dataset.taskId);
                this.toggleTask(taskId);
            });
        });

        document.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('task-checkbox')) return;
                
                const taskId = parseInt(item.dataset.taskId);
                this.editTask(taskId);
            });
        });
    }

    showNotification(message, type = 'success') {
        const notifications = document.getElementById('notifications');
        if (!notifications) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notifications.appendChild(notification);
        
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
