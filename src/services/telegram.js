const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Send message to user
const sendMessage = async (chatId, text, options = {}) => {
  try {
    const response = await axios.post(`${API_BASE}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });

    return response.data.result;
  } catch (error) {
    console.error('Telegram sendMessage error:', error.response?.data || error.message);
    throw new Error('Failed to send Telegram message');
  }
};

// Create invoice for Telegram Stars
const createInvoice = async (invoiceData) => {
  try {
    const { chatId, title, description, payload, currency, prices } = invoiceData;

    const response = await axios.post(`${API_BASE}/sendInvoice`, {
      chat_id: chatId,
      title,
      description,
      payload,
      provider_token: '', // Empty for Telegram Stars
      currency,
      prices,
      max_tip_amount: 0,
      suggested_tip_amounts: [],
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false,
      send_phone_number_to_provider: false,
      send_email_to_provider: false,
      is_flexible: false
    });

    return response.data.result;
  } catch (error) {
    console.error('Telegram createInvoice error:', error.response?.data || error.message);
    throw new Error('Telegram API error: Failed to create invoice');
  }
};

// Set webhook
const setWebhook = async (webhookUrl, secretToken = null) => {
  try {
    const response = await axios.post(`${API_BASE}/setWebhook`, {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: [
        'message',
        'callback_query',
        'pre_checkout_query',
        'successful_payment'
      ],
      drop_pending_updates: true
    });

    if (response.data.ok) {
      console.log('✅ Telegram webhook set successfully');
      return response.data.result;
    } else {
      throw new Error(response.data.description);
    }
  } catch (error) {
    console.error('Telegram setWebhook error:', error.response?.data || error.message);
    throw new Error('Failed to set Telegram webhook');
  }
};

// Get webhook info
const getWebhookInfo = async () => {
  try {
    const response = await axios.get(`${API_BASE}/getWebhookInfo`);
    return response.data.result;
  } catch (error) {
    console.error('Telegram getWebhookInfo error:', error.response?.data || error.message);
    throw new Error('Failed to get webhook info');
  }
};

// Delete webhook
const deleteWebhook = async () => {
  try {
    const response = await axios.post(`${API_BASE}/deleteWebhook`, {
      drop_pending_updates: true
    });

    if (response.data.ok) {
      console.log('✅ Telegram webhook deleted');
      return response.data.result;
    } else {
      throw new Error(response.data.description);
    }
  } catch (error) {
    console.error('Telegram deleteWebhook error:', error.response?.data || error.message);
    throw new Error('Failed to delete Telegram webhook');
  }
};

// Answer pre-checkout query
const answerPreCheckoutQuery = async (preCheckoutQueryId, ok = true, errorMessage = null) => {
  try {
    const response = await axios.post(`${API_BASE}/answerPreCheckoutQuery`, {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage
    });

    return response.data.result;
  } catch (error) {
    console.error('Telegram answerPreCheckoutQuery error:', error.response?.data || error.message);
    throw new Error('Failed to answer pre-checkout query');
  }
};

// Send notification with inline keyboard
const sendNotification = async (chatId, task) => {
  try {
    const { title, due_date, due_time, priority, id } = task;
    
    let message = `📋 <b>Напоминание о задаче</b>\n\n`;
    message += `<b>${title}</b>\n`;
    
    if (due_date) {
      const date = new Date(due_date).toLocaleDateString('ru-RU');
      message += `📅 Срок: ${date}`;
      if (due_time) {
        message += ` в ${due_time}`;
      }
      message += '\n';
    }

    if (priority && priority !== 'medium') {
      const priorityEmoji = priority === 'high' ? '🔴' : '🟡';
      const priorityText = priority === 'high' ? 'Высокий' : 'Низкий';
      message += `${priorityEmoji} Приоритет: ${priorityText}\n`;
    }

    const keyboard = {
      inline_keyboard: [[
        {
          text: '✅ Выполнить',
          callback_data: `complete_task_${id}`
        },
        {
          text: '⏰ Напомнить через час',
          callback_data: `postpone_task_${id}`
        }
      ], [
        {
          text: '📱 Открыть приложение',
          web_app: { url: process.env.FRONTEND_URL || 'https://your-app.com' }
        }
      ]]
    };

    return await sendMessage(chatId, message, {
      reply_markup: keyboard
    });

  } catch (error) {
    console.error('Send notification error:', error.message);
    throw error;
  }
};

// Get bot info
const getBotInfo = async () => {
  try {
    const response = await axios.get(`${API_BASE}/getMe`);
    return response.data.result;
  } catch (error) {
    console.error('Get bot info error:', error.response?.data || error.message);
    throw new Error('Failed to get bot info');
  }
};

// Send typing action
const sendTyping = async (chatId) => {
  try {
    await axios.post(`${API_BASE}/sendChatAction`, {
      chat_id: chatId,
      action: 'typing'
    });
  } catch (error) {
    console.error('Send typing error:', error.response?.data || error.message);
  }
};

// Edit message
const editMessage = async (chatId, messageId, text, options = {}) => {
  try {
    const response = await axios.post(`${API_BASE}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...options
    });

    return response.data.result;
  } catch (error) {
    console.error('Edit message error:', error.response?.data || error.message);
    throw new Error('Failed to edit message');
  }
};

// Delete message
const deleteMessage = async (chatId, messageId) => {
  try {
    await axios.post(`${API_BASE}/deleteMessage`, {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (error) {
    console.error('Delete message error:', error.response?.data || error.message);
  }
};

module.exports = {
  sendMessage,
  createInvoice,
  setWebhook,
  getWebhookInfo,
  deleteWebhook,
  answerPreCheckoutQuery,
  sendNotification,
  getBotInfo,
  sendTyping,
  editMessage,
  deleteMessage
};
