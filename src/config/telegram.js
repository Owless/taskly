const axios = require('axios');
const { TELEGRAM } = require('./environment');
const logger = require('../utils/logger');

class TelegramConfig {
  constructor() {
    this.botToken = TELEGRAM.BOT_TOKEN;
    this.webhookUrl = TELEGRAM.WEBHOOK_URL;
    this.webhookSecret = TELEGRAM.WEBHOOK_SECRET;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  // Создать HTTP клиент для Telegram API
  createApiClient() {
    return axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Установить webhook
  async setWebhook() {
    try {
      const client = this.createApiClient();
      
      const response = await client.post('/setWebhook', {
        url: this.webhookUrl,
        secret_token: this.webhookSecret,
        allowed_updates: [
          'message',
          'callback_query',
          'pre_checkout_query',
          'successful_payment'
        ],
        drop_pending_updates: true
      });

      if (response.data.ok) {
        logger.info('✅ Telegram webhook set successfully');
        logger.info(`📡 Webhook URL: ${this.webhookUrl}`);
      } else {
        throw new Error(response.data.description);
      }

      return response.data;
    } catch (error) {
      logger.error('❌ Failed to set Telegram webhook:', error.message);
      throw error;
    }
  }

  // Получить информацию о webhook
  async getWebhookInfo() {
    try {
      const client = this.createApiClient();
      const response = await client.post('/getWebhookInfo');
      
      return response.data.result;
    } catch (error) {
      logger.error('Failed to get webhook info:', error);
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
        logger.info(`🤖 Bot info: @${botInfo.username} (${botInfo.first_name})`);
        return botInfo;
      } else {
        throw new Error(response.data.description);
      }
    } catch (error) {
      logger.error('Failed to get bot info:', error);
      throw error;
    }
  }

  // Проверка здоровья Telegram API
  async healthCheck() {
    try {
      const client = this.createApiClient();
      const response = await client.post('/getMe');
      
      return {
        status: response.data.ok ? 'healthy' : 'error',
        connected: response.data.ok,
        botInfo: response.data.result
      };
    } catch (error) {
      return {
        status: 'error',
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = new TelegramConfig();
