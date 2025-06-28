const { executeWithUserContext } = require('../config/supabase');
const telegramService = require('../services/telegram');

// Predefined donation amounts
const DONATION_TIERS = [
  { amount: 25, title: 'Кофе ☕', description: 'Небольшая поддержка' },
  { amount: 50, title: 'Поддержка 💙', description: 'Спасибо за поддержку!' },
  { amount: 100, title: 'Благодарность ⭐', description: 'Большое спасибо!' },
  { amount: 250, title: 'Мега спасибо 🚀', description: 'Невероятная поддержка!' }
];

// Get donation tiers
const getDonationTiers = async (req, res) => {
  try {
    res.json({
      success: true,
      data: DONATION_TIERS
    });
  } catch (error) {
    console.error('Get donation tiers error:', error.message);
    res.status(500).json({
      error: 'Failed to get donation tiers'
    });
  }
};

// Create donation invoice
const createDonation = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount_stars, description } = req.body;
    const user = req.user;

    // Validate amount
    const validTier = DONATION_TIERS.find(tier => tier.amount === amount_stars);
    if (!validTier) {
      return res.status(400).json({
        error: 'Invalid donation amount'
      });
    }

    // Create invoice via Telegram Bot API
    const invoice = await telegramService.createInvoice({
      chatId: user.telegram_id,
      title: validTier.title,
      description: description || validTier.description,
      payload: JSON.stringify({
        userId: userId,
        amount: amount_stars,
        type: 'donation'
      }),
      currency: 'XTR',
      prices: [{
        label: validTier.title,
        amount: amount_stars
      }]
    });

    console.log(`💙 Donation invoice created: ${amount_stars} stars for user ${userId}`);

    res.json({
      success: true,
      data: {
        invoice_url: invoice.invoice_url,
        amount: amount_stars,
        title: validTier.title,
        description: description || validTier.description
      }
    });

  } catch (error) {
    console.error('Create donation error:', error.message);
    
    if (error.message.includes('Telegram API')) {
      return res.status(400).json({
        error: 'Failed to create payment invoice'
      });
    }

    res.status(500).json({
      error: 'Failed to create donation'
    });
  }
};

// Handle successful payment (webhook)
const handlePaymentSuccess = async (paymentData) => {
  try {
    const { telegram_payment_charge_id, total_amount, invoice_payload } = paymentData;
    
    // Parse payload
    const payload = JSON.parse(invoice_payload);
    const { userId, amount, type } = payload;

    if (type !== 'donation') {
      console.log('Payment is not a donation, skipping...');
      return;
    }

    // Save donation to database
    const donation = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('donations')
        .insert({
          user_id: userId,
          telegram_payment_charge_id,
          amount_stars: amount,
          currency: 'XTR',
          status: 'completed',
          paid_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    });

    // Get user info for thank you message
    const { supabase } = require('../config/supabase');
    const { data: user } = await supabase
      .from('users')
      .select('telegram_id, first_name')
      .eq('id', userId)
      .single();

    if (user) {
      // Send thank you message
      const tier = DONATION_TIERS.find(t => t.amount === amount);
      const thankYouMessage = `🙏 Спасибо за поддержку, ${user.first_name}!\n\n` +
        `💫 ${tier?.title || `${amount} звезд`}\n` +
        `Ваша поддержка помогает развивать Taskly!`;

      await telegramService.sendMessage(user.telegram_id, thankYouMessage);
    }

    console.log(`✅ Donation processed: ${amount} stars from user ${userId}`);
    return donation;

  } catch (error) {
    console.error('Handle payment success error:', error.message);
    throw error;
  }
};

// Get user donations history
const getDonations = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0 } = req.query;

    const donations = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('paid_at', { ascending: false })
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (error) throw error;
      return data;
    });

    // Get total donations count and amount
    const totals = await executeWithUserContext(userId, async (supabase) => {
      const { data, error } = await supabase
        .from('donations')
        .select('amount_stars')
        .eq('user_id', userId)
        .eq('status', 'completed');

      if (error) throw error;

      const totalAmount = data.reduce((sum, d) => sum + d.amount_stars, 0);
      return {
        totalCount: data.length,
        totalAmount
      };
    });

    res.json({
      success: true,
      data: {
        donations,
        totals,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totals.totalCount > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get donations error:', error.message);
    res.status(500).json({
      error: 'Failed to get donations'
    });
  }
};

// Get donation statistics
const getDonationStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await executeWithUserContext(userId, async (supabase) => {
      // Get user's total donations
      const { data: userDonations, error: userError } = await supabase
        .from('donations')
        .select('amount_stars, paid_at')
        .eq('user_id', userId)
        .eq('status', 'completed');

      if (userError) throw userError;

      // Get global statistics (without user context)
      const { data: globalStats, error: globalError } = await supabase
        .from('donations')
        .select('amount_stars')
        .eq('status', 'completed');

      if (globalError) throw globalError;

      const userTotal = userDonations.reduce((sum, d) => sum + d.amount_stars, 0);
      const globalTotal = globalStats.reduce((sum, d) => sum + d.amount_stars, 0);
      const totalDonors = new Set(globalStats.map(d => d.user_id)).size;

      return {
        user: {
          totalAmount: userTotal,
          donationsCount: userDonations.length,
          firstDonation: userDonations.length > 0 ? userDonations[userDonations.length - 1].paid_at : null,
          lastDonation: userDonations.length > 0 ? userDonations[0].paid_at : null
        },
        global: {
          totalAmount: globalTotal,
          totalDonors,
          averageDonation: globalStats.length > 0 ? Math.round(globalTotal / globalStats.length) : 0
        }
      };
    });

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get donation stats error:', error.message);
    res.status(500).json({
      error: 'Failed to get donation statistics'
    });
  }
};

module.exports = {
  getDonationTiers,
  createDonation,
  handlePaymentSuccess,
  getDonations,
  getDonationStats
};
