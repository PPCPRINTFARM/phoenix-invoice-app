/**
 * API Routes
 * Handles draft orders, invoices, products, and webhook management
 */

const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');
const invoiceService = require('../services/invoice');
const path = require('path');

/**
 * Get draft orders (quotes)
 * Default: Last 30 OPEN quotes, newest first
 */
router.get('/draft-orders', async (req, res, next) => {
  try {
    const { status = 'open', limit = 30 } = req.query;
    
    // Fetch drafts from Shopify (already sorted newest first via order param)
    const result = await shopifyService.getDraftOrders({ status, limit: parseInt(limit) });
    
    const draftOrders = result.draft_orders || [];
    
    res.json({
      success: true,
      count: draftOrders.length,
      draftOrders: draftOrders
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

    // Generate email with Claude API
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let emailBody = '';
    let subject = `Your Phoenix Phase Converter Quote ${orderName}`;
    
    if (anthropicKey) {
      try {
        const axios = require('axios');
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Write a friendly, professional follow-up email for Phoenix Phase Converters.

CUSTOMER: ${customerName}
ORDER NUMBER: ${orderName}
TOTAL: $${totalPrice}
PRODUCTS:
${productList}

INVOICE LINK: ${invoiceUrl}

Write a warm email that:
1. Thanks them for their interest
2. Mentions the specific product(s) they're interested in
3. Highlights key benefits (American-made, 5-year warranty, free shipping, technical support)
4. Includes the invoice link
5. Offers to answer any questions
6. Ends with a friendly sign-off from Glen

Keep it concise (under 200 words). Don't include subject line. Just the email body.`
          }]
        }, {
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          }
        });
        
        emailBody = response.data.content[0].text;
      } catch (aiError) {
        console.log('Claude API error, using template:', aiError.message);
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
      customerName: customerName
    });
  } catch (error) {
    next(error);
  }
});

// Template email fallback
function generateTemplateEmail(name, orderName, total, products, invoiceUrl) {
  const productNames = products.map(p => p.name).join(', ');
  return `Hi ${name},

Thank you for your interest in Phoenix Phase Converters! I wanted to follow up on your quote ${orderName} for ${productNames}.

Your quote total is $${total}.

Here are a few things that make Phoenix Phase Converters stand out:
• American-made quality with a 5-year warranty
• Free shipping to the contiguous USA
• 24/7 technical support included
• CNC and compressor compatible

You can view and pay your invoice here: ${invoiceUrl}

If you have any questions about sizing, installation, or anything else, feel free to reply to this email or give us a call at 1-800-417-6568.

Looking forward to helping you get the power you need!

Best regards,
Glen
Phoenix Phase Converters
1-800-417-6568
support@phoenixphaseconverters.com`;
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
 * Get all products
 */
router.get('/products', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const result = await shopifyService.getProducts({ limit: parseInt(limit) });
    res.json({
      success: true,
      count: (result.products || []).length,
      products: result.products || []
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Search products by title, type, or vendor
 */
router.get('/products/search', async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;
    
    // Fetch all products and filter by search term
    const result = await shopifyService.getProducts({ limit: 250 });
    const products = result.products || [];
    
    let filtered = products;
    if (q) {
      const searchLower = q.toLowerCase();
      filtered = products.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        (p.product_type && p.product_type.toLowerCase().includes(searchLower)) ||
        (p.vendor && p.vendor.toLowerCase().includes(searchLower)) ||
        (p.tags && p.tags.toLowerCase().includes(searchLower))
      );
    }
    
    res.json({
      success: true,
      query: q || '',
      count: filtered.length,
      products: filtered.slice(0, parseInt(limit))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get single product by ID
 */
router.get('/products/:id', async (req, res, next) => {
  try {
    const result = await shopifyService.getProduct(req.params.id);
    res.json({
      success: true,
      product: result.product
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
