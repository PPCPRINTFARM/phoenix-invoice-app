/**
 * API Routes
 * Handles draft orders, invoices, and webhook management
 */

const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');
const invoiceService = require('../services/invoice');
const path = require('path');

/**
 * Get all draft orders (quotes)
 */
router.get('/draft-orders', async (req, res, next) => {
  try {
    const { status = 'any', limit = 250 } = req.query;
    const result = await shopifyService.getDraftOrders({ status, limit });
    
    // Sort by created_at descending (newest first)
    const sortedDraftOrders = (result.draft_orders || []).sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    res.json({
      success: true,
      count: sortedDraftOrders.length,
      draftOrders: sortedDraftOrders
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single draft order
 */
router.get('/draft-orders/:id', async (req, res, next) => {
  try {
    const result = await shopifyService.getDraftOrder(req.params.id);
    res.json({
      success: true,
      draftOrder: result.draft_order
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Convert draft order to invoice
 */
router.post('/draft-orders/:id/create-invoice', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sendEmail = false, completeOrder = false } = req.body;

    // Get draft order
    const draftResult = await shopifyService.getDraftOrder(id);
    const draftOrder = draftResult.draft_order;

    if (!draftOrder) {
      return res.status(404).json({
        success: false,
        error: 'Draft order not found'
      });
    }

    // Convert to invoice data
    const invoiceData = invoiceService.draftOrderToInvoice(draftOrder);

    // Fetch product images from Shopify products API
    for (const item of invoiceData.lineItems) {
      if (!item.image && item.productId) {
        try {
          const productResult = await shopifyService.getProduct(item.productId);
          if (productResult.product?.image?.src) {
            item.image = productResult.product.image.src;
          } else if (productResult.product?.images?.[0]?.src) {
            item.image = productResult.product.images[0].src;
          }
        } catch (err) {
          console.log(`Could not fetch product image for ${item.productId}:`, err.message);
        }
      }
    }

    // Generate PDF
    const pdfResult = await invoiceService.generatePDF(invoiceData);

    // Optionally complete the draft order (convert to real order)
    let order = null;
    if (completeOrder) {
      const orderResult = await shopifyService.completeDraftOrder(id, true);
      order = orderResult.draft_order;
      
      // Store invoice metadata on the order
      if (order?.order_id) {
        await shopifyService.createOrderMetafield(order.order_id, {
          invoiceNumber: invoiceData.invoiceNumber,
          createdAt: invoiceData.createdAt,
          pdfFile: pdfResult.filename
        });
      }
    }

    // Optionally send invoice email via Shopify
    if (sendEmail) {
      const customerEmail = draftOrder.customer?.email || draftOrder.email;
      if (customerEmail) {
        await shopifyService.sendDraftOrderInvoice(id, {
          to: customerEmail,
          subject: `Invoice ${invoiceData.invoiceNumber} from ${process.env.COMPANY_NAME}`,
          message: `Please find your invoice attached. Invoice #: ${invoiceData.invoiceNumber}. Total: $${invoiceData.total.toFixed(2)}`
        });
      }
    }

    res.json({
      success: true,
      invoice: invoiceData,
      pdf: {
        filename: pdfResult.filename,
        downloadUrl: `/api/invoices/${invoiceData.invoiceNumber}/download`
      },
      order: order,
      emailSent: sendEmail
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate personalized email for a draft order
 */
router.post('/draft-orders/:id/generate-email', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get draft order
    const draftResult = await shopifyService.getDraftOrder(id);
    const draftOrder = draftResult.draft_order;

    if (!draftOrder) {
      return res.status(404).json({
        success: false,
        error: 'Draft order not found'
      });
    }

    const customerName = draftOrder.customer?.first_name 
      ? `${draftOrder.customer.first_name} ${draftOrder.customer.last_name || ''}`.trim()
      : draftOrder.billing_address?.name || 'Valued Customer';
    
    const customerEmail = draftOrder.customer?.email || draftOrder.email || '';
    const customerPhone = draftOrder.customer?.phone || draftOrder.billing_address?.phone || draftOrder.shipping_address?.phone || '';
    const orderName = draftOrder.name || `#${draftOrder.id}`;
    const totalPrice = parseFloat(draftOrder.total_price || 0).toFixed(2);
    const invoiceUrl = draftOrder.invoice_url || '';
    
    // Get product details
    const products = (draftOrder.line_items || []).map(item => ({
      name: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price).toFixed(2)
    }));
    
    const productList = products.map(p => `- ${p.name} (Qty: ${p.quantity}) - $${p.price}`).join('\n');
    const productNames = products.map(p => p.name).join(', ');

    // Try to get CallRail transcript for this customer
    let callTranscript = '';
    let callSummary = '';
    const callrailApiKey = process.env.CALLRAIL_API_KEY || '7de6f836a1feee75ce41493f8e9b64af';
    const callrailAccountId = process.env.CALLRAIL_ACCOUNT_ID || '906309465';
    
    if (customerPhone) {
      try {
        const axios = require('axios');
        // Clean phone number for search
        const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
        
        const callResponse = await axios.get(
          `https://api.callrail.com/v3/a/${callrailAccountId}/calls.json?search=${cleanPhone}&per_page=5&sort=start_time&order=desc`,
          {
            headers: {
              'Authorization': `Token token="${callrailApiKey}"`
            }
          }
        );
        
        if (callResponse.data.calls && callResponse.data.calls.length > 0) {
          const recentCall = callResponse.data.calls[0];
          if (recentCall.transcription) {
            callTranscript = recentCall.transcription;
            console.log('Found CallRail transcript for', cleanPhone);
          }
          if (recentCall.summary) {
            callSummary = recentCall.summary;
          }
        }
      } catch (callErr) {
        console.log('CallRail lookup error:', callErr.message);
      }
    }

    // Generate email with OpenAI GPT-4
    const openaiKey = process.env.OPENAI_API_KEY;
    let emailBody = '';
    let subject = `Your Phoenix Phase Converter Quote ${orderName}`;
    
    if (openaiKey) {
      try {
        const axios = require('axios');
        
        const systemPrompt = `You are Glen Floreancig, Founder of Phoenix Phase Converters. You write detailed, consultative follow-up emails that:

1. Reference the actual phone conversation when available
2. Explain the technical "why" behind your recommendations
3. Educate the customer about their power situation
4. Include relevant product links and resources
5. Are warm but professional - like talking to a neighbor who needs help

Key facts about Phoenix Phase Converters:
- LIFETIME WARRANTY against defects (not 5-year)
- American-made/built in Phoenix, Arizona
- Free shipping to contiguous USA
- 24/7 technical support included
- Patented technologies (US 5969957, US 9484844)

Always end with this signature format:
Best regards,

Glen Floreancig
Founder | Phoenix Phase Converters

📞 800-417-6568
🌐 PhoenixPhaseConverters.com`;

        let userPrompt = `Write a follow-up email for this quote:

CUSTOMER: ${customerName}
ORDER NUMBER: ${orderName}
TOTAL: $${totalPrice}
PRODUCTS:
${productList}

INVOICE/QUOTE LINK: ${invoiceUrl}`;

        if (callTranscript) {
          userPrompt += `

CALL TRANSCRIPT (reference specific details from this conversation):
${callTranscript.substring(0, 3000)}`;
        } else if (callSummary) {
          userPrompt += `

CALL SUMMARY:
${callSummary}`;
        }

        userPrompt += `

Write a detailed, consultative email that:
1. Thanks them for calling Phoenix Phase Converters
2. References specific details from our conversation if available
3. Explains why this product is right for their application
4. Highlights the LIFETIME WARRANTY and American-made quality
5. Includes the quote link
6. Offers to answer any questions about sizing or installation
7. Uses the full signature format

Make it educational and helpful, not salesy. Match the tone of a knowledgeable expert helping a customer solve their power problem.`;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o',
          max_tokens: 1500,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        emailBody = response.data.choices[0].message.content;
      } catch (aiError) {
        console.log('OpenAI API error, using template:', aiError.message);
        emailBody = generateTemplateEmail(customerName, orderName, totalPrice, products, invoiceUrl);
      }
    } else {
      emailBody = generateTemplateEmail(customerName, orderName, totalPrice, products, invoiceUrl);
    }

    res.json({
      success: true,
      to: customerEmail,
      subject: subject,
      body: emailBody,
      orderName: orderName,
      customerName: customerName,
      hasTranscript: !!callTranscript
    });
  } catch (error) {
    next(error);
  }
});

// Template email fallback
function generateTemplateEmail(name, orderName, total, products, invoiceUrl) {
  const productNames = products.map(p => p.name).join(', ');
  return `Hi ${name},

Thank you for calling Phoenix Phase Converters! I wanted to follow up on our conversation and send over your quote for the ${productNames}.

Your quote total is $${total}, which includes free shipping anywhere in the contiguous USA.

A few things that set Phoenix Phase Converters apart:

• LIFETIME WARRANTY against any manufacturing defects
• American-made right here in Phoenix, Arizona
• 24/7 technical support included with every unit
• Patented technologies for reduced inrush current and better voltage balance

You can view and complete your order here: ${invoiceUrl}

If you have any questions about sizing, installation, or anything else, feel free to reply to this email or give us a call. We're happy to help make sure you get the right solution for your application.

Best regards,

Glen Floreancig
Founder | Phoenix Phase Converters

📞 800-417-6568
🌐 PhoenixPhaseConverters.com`;
}

/**
 * Batch convert multiple draft orders to invoices
 */
router.post('/draft-orders/batch-invoice', async (req, res, next) => {
  try {
    const { draftOrderIds, sendEmails = false, completeOrders = false } = req.body;

    if (!draftOrderIds || !Array.isArray(draftOrderIds)) {
      return res.status(400).json({
        success: false,
        error: 'draftOrderIds array is required'
      });
    }

    const results = [];
    
    for (const id of draftOrderIds) {
      try {
        const draftResult = await shopifyService.getDraftOrder(id);
        const draftOrder = draftResult.draft_order;

        if (!draftOrder) {
          results.push({ id, success: false, error: 'Not found' });
          continue;
        }

        const invoiceData = invoiceService.draftOrderToInvoice(draftOrder);
        const pdfResult = await invoiceService.generatePDF(invoiceData);

        if (completeOrders) {
          await shopifyService.completeDraftOrder(id, true);
        }

        if (sendEmails && (draftOrder.customer?.email || draftOrder.email)) {
          await shopifyService.sendDraftOrderInvoice(id);
        }

        results.push({
          id,
          success: true,
          invoiceNumber: invoiceData.invoiceNumber,
          total: invoiceData.total
        });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Send invoice email for existing draft order
 */
router.post('/draft-orders/:id/send-invoice', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { to, subject, message } = req.body;

    const result = await shopifyService.sendDraftOrderInvoice(id, {
      to,
      subject,
      message
    });

    res.json({
      success: true,
      result: result.draft_order_invoice
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List all generated invoices
 */
router.get('/invoices', (req, res) => {
  const invoices = invoiceService.listInvoices();
  res.json({
    success: true,
    count: invoices.length,
    invoices
  });
});

/**
 * Download invoice PDF
 */
router.get('/invoices/:invoiceNumber/download', (req, res, next) => {
  try {
    const filepath = invoiceService.getInvoice(req.params.invoiceNumber);
    
    if (!filepath) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    res.download(filepath);
  } catch (error) {
    next(error);
  }
});

/**
 * Get orders
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { status = 'any', limit = 50 } = req.query;
    const result = await shopifyService.getOrders({ status, limit });
    
    res.json({
      success: true,
      count: result.orders?.length || 0,
      orders: result.orders || []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get webhook status
 */
router.get('/webhooks', async (req, res, next) => {
  try {
    const result = await shopifyService.getWebhooks();
    res.json({
      success: true,
      webhooks: result.webhooks || []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Register webhooks
 */
router.post('/webhooks/register', async (req, res, next) => {
  try {
    const results = await shopifyService.registerWebhooks();
    res.json({
      success: true,
      results
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a webhook
 */
router.delete('/webhooks/:id', async (req, res, next) => {
  try {
    await shopifyService.deleteWebhook(req.params.id);
    res.json({
      success: true,
      message: 'Webhook deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Search customers
 */
router.get('/customers/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const result = await shopifyService.searchCustomers(q);
    res.json({
      success: true,
      customers: result.customers || []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Dashboard stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [draftOrders, orders, invoices] = await Promise.all([
      shopifyService.getDraftOrders({ status: 'open', limit: 250 }),
      shopifyService.getOrders({ status: 'any', limit: 250 }),
      Promise.resolve(invoiceService.listInvoices())
    ]);

    const openQuotes = draftOrders.draft_orders || [];
    const allOrders = orders.orders || [];

    const totalQuoteValue = openQuotes.reduce((sum, q) => 
      sum + parseFloat(q.total_price || 0), 0
    );

    const recentOrders = allOrders.filter(o => {
      const created = new Date(o.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return created >= thirtyDaysAgo;
    });

    const monthlyRevenue = recentOrders.reduce((sum, o) => 
      sum + parseFloat(o.total_price || 0), 0
    );

    res.json({
      success: true,
      stats: {
        openQuotes: openQuotes.length,
        totalQuoteValue,
        invoicesGenerated: invoices.length,
        recentOrders: recentOrders.length,
        monthlyRevenue
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
