const axios = require('axios');
const logger = require('../utils/logger');
const telegramConfig = require('../config/telegram');

class TelegramService {
  constructor() {
    this.client = telegramConfig.createApiClient();
  }

  // Отправить сообщение
  async sendMessage(chatId, text, options = {}) {
    try {
      const params = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'MarkdownV2',
        disable_web_page_preview: options.disable_web_page_preview || true,
        disable_notification: options.disable_notification || false,
        reply_markup: options.reply_markup || null,
        reply_to_message_id: options.reply_to_message_id || null
      };

      const response = await this.client.post('/sendMessage', params);

      if (response.data.ok) {
        logger.telegram('Message sent successfully', {
          chatId,
          messageId: response.data.result.message_id,
          textLength: text.length
        });
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to send message');
      }
    } catch (error) {
      logger.error('Failed to send message', {
        error: error.message,
        chatId,
        textLength: text?.length,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Редактировать сообщение
  async editMessage(chatId, messageId, text, options = {}) {
    try {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options.parse_mode || 'MarkdownV2',
        disable_web_page_preview: options.disable_web_page_preview || true,
        reply_markup: options.reply_markup || null
      };

      const response = await this.client.post('/editMessageText', params);

      if (response.data.ok) {
        logger.telegram('Message edited successfully', {
          chatId,
          messageId,
          textLength: text.length
        });
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to edit message');
      }
    } catch (error) {
      logger.error('Failed to edit message', {
        error: error.message,
        chatId,
        messageId,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Удалить сообщение
  async deleteMessage(chatId, messageId) {
    try {
      const response = await this.client.post('/deleteMessage', {
        chat_id: chatId,
        message_id: messageId
      });

      if (response.data.ok) {
        logger.telegram('Message deleted successfully', {
          chatId,
          messageId
        });
        return true;
      } else {
        throw new Error(response.data.description || 'Failed to delete message');
      }
    } catch (error) {
      logger.error('Failed to delete message', {
        error: error.message,
        chatId,
        messageId,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Ответить на callback query
  async answerCallbackQuery(callbackQueryId, text = null, showAlert = false) {
    try {
      const params = {
        callback_query_id: callbackQueryId,
        text: text || undefined,
        show_alert: showAlert
      };

      const response = await this.client.post('/answerCallbackQuery', params);

      if (response.data.ok) {
        logger.telegram('Callback query answered', {
          callbackQueryId,
          hasText: !!text,
          showAlert
        });
        return true;
      } else {
        throw new Error(response.data.description || 'Failed to answer callback query');
      }
    } catch (error) {
      logger.error('Failed to answer callback query', {
        error: error.message,
        callbackQueryId,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Отправить инвойс
  async sendInvoice(chatId, title, description, payload, prices, options = {}) {
    try {
      const params = {
        chat_id: chatId,
        title,
        description,
        payload,
        provider_token: '', // Для Telegram Stars не нужен
        currency: 'XTR',
        prices,
        max_tip_amount: options.max_tip_amount || 0,
        suggested_tip_amounts: options.suggested_tip_amounts || [],
        start_parameter: options.start_parameter || null,
        provider_data: options.provider_data || null,
        photo_url: options.photo_url || null,
        photo_size: options.photo_size || null,
        photo_width: options.photo_width || null,
        photo_height: options.photo_height || null,
        need_name: options.need_name || false,
        need_phone_number: options.need_phone_number || false,
        need_email: options.need_email || false,
        need_shipping_address: options.need_shipping_address || false,
        send_phone_number_to_provider: options.send_phone_number_to_provider || false,
        send_email_to_provider: options.send_email_to_provider || false,
        is_flexible: options.is_flexible || false,
        disable_notification: options.disable_notification || false,
        protect_content: options.protect_content || false,
        reply_to_message_id: options.reply_to_message_id || null,
        allow_sending_without_reply: options.allow_sending_without_reply || true,
        reply_markup: options.reply_markup || null
      };

      const response = await this.client.post('/sendInvoice', params);

      if (response.data.ok) {
        logger.telegram('Invoice sent successfully', {
          chatId,
          title,
          payload,
          totalAmount: prices.reduce((sum, price) => sum + price.amount, 0)
        });
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to send invoice');
      }
    } catch (error) {
      logger.error('Failed to send invoice', {
        error: error.message,
        chatId,
        title,
        payload,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Ответить на pre-checkout query
  async answerPreCheckoutQuery(preCheckoutQueryId, ok, errorMessage = null) {
    try {
      const params = {
        pre_checkout_query_id: preCheckoutQueryId,
        ok,
        error_message: ok ? undefined : errorMessage
      };

      const response = await this.client.post('/answerPreCheckoutQuery', params);

      if (response.data.ok) {
        logger.telegram('Pre-checkout query answered', {
          preCheckoutQueryId,
          ok,
          errorMessage
        });
        return true;
      } else {
        throw new Error(response.data.description || 'Failed to answer pre-checkout query');
      }
    } catch (error) {
      logger.error('Failed to answer pre-checkout query', {
        error: error.message,
        preCheckoutQueryId,
        ok,
        errorMessage,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Получить информацию о чате
  async getChat(chatId) {
    try {
      const response = await this.client.post('/getChat', {
        chat_id: chatId
      });

      if (response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to get chat');
      }
    } catch (error) {
      logger.error('Failed to get chat', {
        error: error.message,
        chatId,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Получить участника чата
  async getChatMember(chatId, userId) {
    try {
      const response = await this.client.post('/getChatMember', {
        chat_id: chatId,
        user_id: userId
      });

      if (response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(response.data.description || 'Failed to get chat member');
      }
    } catch (error) {
      logger.error('Failed to get chat member', {
        error: error.message,
        chatId,
        userId,
        response: error.response?.data
      });
      throw error;
    }
  }

  // Создать inline клавиатуру
  createInlineKeyboard(buttons) {
    return {
      inline_keyboard: buttons
    };
  }

  // Создать кнопку
  createButton(text, data) {
    if (typeof data === 'string') {
      return { text, callback_data: data };
    } else if (data.url) {
      return { text, url: data.url };
    } else if (data.web_app) {
      return { text, web_app: data.web_app };
    } else if (data.pay) {
      return { text, pay: true };
    }
    return { text, callback_data: data.callback_data || 'none' };
  }

  // Отправить typing action
  async sendChatAction(chatId, action = 'typing') {
    try {
      const response = await this.client.post('/sendChatAction', {
        chat_id: chatId,
        action
      });

      return response.data.ok;
    } catch (error) {
      logger.error('Failed to send chat action', {
        error: error.message,
        chatId,
        action
      });
      return false;
    }
  }

  // Проверить состояние Bot API
  async getMe() {
    try {
      const response = await this.client.post('/getMe');
      return response.data.result;
    } catch (error) {
      logger.error('Failed to get bot info', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }
}

// Создаем singleton экземпляр
const telegramService = new TelegramService();

module.exports = telegramService;
