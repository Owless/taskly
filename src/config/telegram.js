const axios = require('axios');
const { TELEGRAM, NODE_ENV } = require('./environment');
const logger = require('../utils/logger');

class TelegramConfig {
  constructor() {
    this.botToken = TELEGRAM.BOT_TOKEN;
    this.webhookUrl = TELEGRAM.WEBHOOK_URL;
    this.webhookSecret = TELEGRAM.WEBHOOK_SECRET;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // Создать HTTP клиент для Telegram API с retry логикой
  createApiClient() {
    const client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000, // 30 секунд
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Taskly-Bot/1.0'
      }
    });

    // Добавляем retry логику
    client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = { count: 0 };
        }

        const shouldRetry = 
          config.retry.count < this.maxRetries &&
          (error.response?.status >= 500 || error.code === 'ECONNABORTED');

        if (shouldRetry) {
          config.retry.count++;
          
          logger.warn('Retrying Telegram API request', {
            attempt: config.retry.count,
            maxRetries: this.maxRetries,
            error: error.message,
            url: config.url
          });

          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelay * config.retry.count)
          );

          return client(config);
        }

        return Promise.reject(error);
      }
    );

    return client;
  }

  // Установить webhook с правильной конфигурацией
  async setWebhook() {
    try {
      const client = this.createApiClient();
      
      const webhookConfig = {
        url: this.webhookUrl,
        secret_token: this.webhookSecret,
        allowed_updates: [
          'message',
          'callback_query',
          'pre_checkout_query',
          'successful_payment',
          'my_chat_member'
        ],
        drop_pending_updates: NODE_ENV === 'production', // Только в продакшене
        max_connections: NODE_ENV === 'production' ? 100 : 40
      };

      const response = await client.post('/setWebhook', webhookConfig);

      if (response.data.ok) {
        logger.info('✅ Telegram webhook configured successfully', {
          url: this.webhookUrl,
          allowedUpdates: webhookConfig.allowed_updates,
          maxConnections: webhookConfig.max_connections
        });
      } else {
        throw new Error(response.data.description || 'Unknown error');
      }

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to set Telegram webhook', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Удалить webhook
  async deleteWebhook() {
    try {
      const client = this.createApiClient();
      const response = await client.post('/deleteWebhook', {
        drop_pending_updates: true
      });

      if (response.data.ok) {
        logger.info('✅ Telegram webhook deleted');
      } else {
        throw new Error(response.data.description);
      }

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to delete webhook', error);
      throw error;
    }
  }

  // Получить информацию о webhook
  async getWebhookInfo() {
    try {
      const client = this.createApiClient();
      const response = await client.post('/getWebhookInfo');
      
      const info = response.data.result;
      
      logger.info('Webhook info retrieved', {
        url: info.url,
        hasCustomCertificate: info.has_custom_certificate,
        pendingUpdateCount: info.pending_update_count,
        lastErrorDate: info.last_error_date,
        lastErrorMessage: info.last_error_message,
        maxConnections: info.max_connections
      });
      
      return info;
    } catch (error) {
      logger.error('Failed to get webhook info', error);
      throw error;
    }
  }

  // Получить информацию о боте
  async getBotInfo() {
    try {
      const client = this.createApiClient();
      const response = await client.post('/getMe');
      
      if (response.data.ok) {
        const botInfo = response.data.result;
        logger.info('🤖 Bot information retrieved', {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name,
          canJoinGroups: botInfo.can_join_groups,
          canReadAllGroupMessages: botInfo.can_read_all_group_messages,
          supportsInlineQueries: botInfo.supports_inline_queries
        });
        return botInfo;
      } else {
        throw new Error(response.data.description);
      }
    } catch (error) {
      logger.error('Failed to get bot info', error);
      throw error;
    }
  }

  // Проверка здоровья Telegram API
  async healthCheck() {
    try {
      const startTime = Date.now();
      const client = this.createApiClient();
      const response = await client.post('/getMe');
      const responseTime = Date.now() - startTime;
      
      const isHealthy = response.data.ok;
      
      return {
        status: isHealthy ? 'healthy' : 'error',
        connected: isHealthy,
        responseTime,
        botInfo: isHealthy ? response.data.result : null,
        error: isHealthy ? null : response.data.description
      };
    } catch (error) {
      return {
        status: 'error',
        connected: false,
        responseTime: null,
        botInfo: null,
        error: error.message
      };
    }
  }

  // Установить команды бота
  async setMyCommands() {
    try {
      const commands = [
        { command: 'start', description: 'Запустить бота' },
        { command: 'help', description: 'Помощь по использованию' },
        { command: 'today', description: 'Задачи на сегодня' },
        { command: 'add', description: 'Добавить задачу' },
        { command: 'settings', description: 'Настройки' },
        { command: 'stats', description: 'Статистика' }
      ];

      const client = this.createApiClient();
      const response = await client.post('/setMyCommands', { commands });

      if (response.data.ok) {
        logger.info('✅ Bot commands set successfully', { commands });
      } else {
        throw new Error(response.data.description);
      }

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to set bot commands', error);
      throw error;
    }
  }
}

module.exports = new TelegramConfig();
