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
 * Product Database - Links, Manuals, Videos
 */
const productDatabase = {
  // Product page URLs
  productUrls: {
    // NL Models (230V to 230V)
    'GP3NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/3-hp-rotary-phase-converter-gp3nl-single-phase-to-three-phase',
    'GP5NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/5-hp-rotary-phase-converter-gp5nl-single-phase-to-three-phase',
    'GP7NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/7-5-hp-rotary-phase-converter-gp7nl-single-phase-to-three-phase',
    'GP10NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/10-hp-rotary-phase-converter-gp10nl-single-phase-to-three-phase',
    'GP15NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/15-hp-rotary-phase-converter-gp15nl-single-phase-to-three-phase',
    'GP20NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/20-hp-rotary-phase-converter-gp20nl-single-phase-to-three-phase',
    'GP25NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/25-hp-rotary-phase-converter-gp25nl-single-phase-to-three-phase',
    'GP30NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/30-hp-rotary-phase-converter-gp30nl-single-phase-to-three-phase',
    'GP40NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/40-hp-rotary-phase-converter-gp40nl-single-phase-to-three-phase-converter',
    'GP50NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/50-hp-rotary-phase-converter-gp50nl-single-phase-to-three-phase-converter',
    'GP60NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/phoenix-phase-converters-60-hp-no-230',
    'GP75NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/phoenix-phase-converters-75-hp-no-230',
    'GP100NL': 'https://phoenixphaseconverters.com/collections/phase-converters-single-phase-230v-to-three-phase-230v/products/phoenix-phase-converters-100-hp-no-230',
    
    // DualZone Models
    'GP20/40NL': 'https://phoenixphaseconverters.com/collections/dual-zone-industrial-grade-rotary-phase-converter/products/20-hp-autostart-rotary-phase-converter-gp20asl',
    'GP25/50NL': 'https://phoenixphaseconverters.com/collections/dual-zone-industrial-grade-rotary-phase-converter/products/30-60-hp-rotary-phase-converter-gp25-50nl-auto-zoned-power-rotary-phase-converter',
    'GP30/60NL': 'https://phoenixphaseconverters.com/collections/dual-zone-industrial-grade-rotary-phase-converter/products/30-60-hp-rotary-phase-converter-gp30-60nl-auto-zoned-power-rotary-phase-converter',
    'GP40/80NL': 'https://phoenixphaseconverters.com/collections/dual-zone-industrial-grade-rotary-phase-converter/products/gp40x2nl',
    'GP50/100NL': 'https://phoenixphaseconverters.com/collections/dual-zone-industrial-grade-rotary-phase-converter/products/50-100-hp-rotary-phase-converter-gp50-100nl-auto-zoned-power-rotary-phase-converter'
  },
  
  // Manual URLs
  manuals: {
    default: 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/Manual_Ver425_wecompress.com.pdf?v=1746482995',
    stepByStep: 'https://phoenixphaseconverters.com/pages/manual',
    dualZone: 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/Dual_Zone_new.pdf?v=1742854970',
    wiringDiagrams: 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/wiringdiagramaug25.pdf?v=1756618542',
    'GP15NLT': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP15NLA.pdf?v=1734058737',
    'GP20NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP20NL.pdf?v=1721701776',
    'GP30NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP30NL.pdf?v=1706949316',
    'GP40NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP40NL_5.pdf?v=1733954747',
    'GP60NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP60NL_4686c1c6-058a-44cc-961b-9563306534f1.pdf?v=1721699421',
    'GP30/60NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP3060LT_3.pdf?v=1733984612',
    'GP25/50NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP50NL_Manual.pdf?v=1706946910',
    'GP40/80NL': 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/GP4080L.pdf?v=1721734748'
  },
  
  // Video URLs
  videos: {
    dualZone: { title: 'DualZone Digital Rotary Phase Converter', url: 'https://youtu.be/9ZImw4W0EWk' },
    dualZoneShort: { title: 'DualZone with Transformer & AutoLink', url: 'https://www.youtube.com/shorts/KdTOgkJO678' },
    enclosure: { title: 'Phase Converter Electrical Enclosure', url: 'https://youtu.be/ecfZ26SGrMY' },
    autoLink: { title: 'How the AutoLink Technology Works', url: 'https://youtu.be/QbqVHpzWDnA' },
    multipleMachines: { title: 'One Phase Converter Running 3 CNC Machines', url: 'https://youtu.be/zi9L7Jf3P8o' },
    nlVsPl: { title: 'NL vs PL Model Comparison', url: 'https://youtu.be/n-J23vQgNvo' },
    n4Motorsports: { title: 'Customer Spotlight: N4 Motorsports Shop Setup', url: 'https://www.youtube.com/shorts/KdTOgkJO678' }
  },
  
  // Blog/Resources
  resources: {
    vfdVsRotary: 'https://phoenixphaseconverters.com/blogs/news/digital-vfd-vs-rotary-phase-converters-why-rotary-is-the-smarter-choice',
    knowledgeBase: 'https://phoenixphaseconverters.com/pages/knowledge-base',
    support: 'https://phoenixphaseconverters.com/pages/support-page',
    downloadApp: 'https://phoenixphaseconverters.com/pages/phoenix-app-walk-through'
  },
  
  // Extract model from product title
  extractModel: function(title) {
    if (!title) return null;
    const titleUpper = title.toUpperCase();
    const patterns = [
      /GP\d+\/\d+[A-Z]+/,  // DualZone like GP30/60NL
      /GP\d+[A-Z]+/        // Standard like GP10NL, GP15NLTA
    ];
    for (const pattern of patterns) {
      const match = titleUpper.match(pattern);
      if (match) return match[0];
    }
    return null;
  },
  
  // Get product page URL
  getProductUrl: function(productTitle) {
    const model = this.extractModel(productTitle);
    if (model && this.productUrls[model]) {
      return this.productUrls[model];
    }
    return null;
  },
  
  // Get relevant videos based on product title
  getVideosForProduct: function(productTitle) {
    const title = productTitle.toLowerCase();
    const model = this.extractModel(productTitle);
    const modelUpper = model ? model.toUpperCase() : '';
    const videos = [];
    
    // DualZone products
    if (modelUpper.includes('/') || title.includes('dual') || title.includes('zone')) {
      videos.push(this.videos.dualZone);
      videos.push(this.videos.dualZoneShort);
    }
    
    // AutoLink products (NLA, NLTA, PLTA)
    if (modelUpper.includes('NLA') || modelUpper.includes('NLTA') || modelUpper.includes('PLTA') || title.includes('autolink')) {
      videos.push(this.videos.autoLink);
    }
    
    // Transformer products (NLT, PLT)
    if (modelUpper.includes('NLT') || modelUpper.includes('PLT') || title.includes('transformer')) {
      videos.push(this.videos.enclosure);
    }
    
    // NL vs PL comparison
    if (modelUpper.includes('NL') || modelUpper.includes('PL')) {
      videos.push(this.videos.nlVsPl);
    }
    
    // Multiple machines video for larger HP units
    const hpMatch = productTitle.match(/(\d+)\s*HP/i);
    if (hpMatch && parseInt(hpMatch[1]) >= 15) {
      videos.push(this.videos.multipleMachines);
    }
    
    return videos.slice(0, 3);
  },
  
  // Get manual URL based on product
  getManualForProduct: function(productTitle) {
    const model = this.extractModel(productTitle);
    const title = productTitle.toLowerCase();
    
    // Check for specific model manual
    if (model && this.manuals[model]) {
      return this.manuals[model];
    }
    
    // DualZone manual
    if (title.includes('dual') || title.includes('zone') || (model && model.includes('/'))) {
      return this.manuals.dualZone;
    }
    
    return this.manuals.default;
  }
};

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
    
    // Get product details with links
    const products = (draftOrder.line_items || []).map(item => ({
      name: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price).toFixed(2),
      productUrl: productDatabase.getProductUrl(item.title),
      videos: productDatabase.getVideosForProduct(item.title),
      manual: productDatabase.getManualForProduct(item.title),
      model: productDatabase.extractModel(item.title)
    }));
    
    const productList = products.map(p => `- ${p.name} (Qty: ${p.quantity}) - $${p.price}`).join('\n');
    const productNames = products.map(p => p.name).join(', ');
    
    // Build video and manual links for the email
    let resourceLinks = '\n\nRESOURCES TO INCLUDE IN EMAIL:\n';
    
    // Product page links
    products.forEach(p => {
      if (p.productUrl) {
        resourceLinks += `Product Page for ${p.name}: ${p.productUrl}\n`;
      }
    });
    
    // Manual links
    resourceLinks += `\nInstallation Manual: ${productDatabase.manuals.default}\n`;
    resourceLinks += `All Wiring Diagrams: ${productDatabase.manuals.wiringDiagrams}\n`;
    
    if (products.length > 0 && products[0].manual !== productDatabase.manuals.default) {
      resourceLinks += `Model-Specific Manual: ${products[0].manual}\n`;
    }
    
    // Video links
    if (products.length > 0) {
      const relevantVideos = products[0].videos;
      if (relevantVideos && relevantVideos.length > 0) {
        resourceLinks += '\nRelevant Videos:\n';
        relevantVideos.forEach(v => {
          resourceLinks += `- ${v.title}: ${v.url}\n`;
        });
      }
    }
    
    // Knowledge base
    resourceLinks += `\nKnowledge Base & FAQ: ${productDatabase.resources.knowledgeBase}\n`;
    
    // App download - highlight this!
    resourceLinks += `\n**HIGHLIGHT THIS IN EMAIL:**\nDownload our FREE App: ${productDatabase.resources.downloadApp}\n(Useful tools to keep track of quotes, orders, manuals, and troubleshooting!)\n`;

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
        
        const systemPrompt = `You are Glen Floreancig, Founder of Phoenix Phase Converters. You write detailed, consultative follow-up emails in HTML format that:

1. Reference the actual phone conversation when available
2. Explain the technical "why" behind your recommendations
3. Educate the customer about their power situation
4. Include relevant product links, manuals, and videos as clickable links
5. Are warm but professional - like talking to a neighbor who needs help

Key facts about Phoenix Phase Converters:
- LIFETIME WARRANTY against defects
- American-made/built in Phoenix, Arizona
- Free shipping to contiguous USA
- 24/7 technical support included
- Patented technologies (US 5969957, US 9484844)
- Featured in VoyagePhoenix Magazine
- "Best Power Converter Provider 2025" - Electrical Business Review

FORMAT YOUR RESPONSE AS HTML EMAIL:
- Use <p> tags for paragraphs
- Use <a href="..."> for all links (make them clickable)
- Use <strong> or <b> for emphasis
- Use <ul> and <li> for bullet lists
- Use <br> for line breaks where needed
- Style links with color: #f97316 (Phoenix orange)
- Keep it clean and professional

Always end with this signature (in HTML):
<p>Best regards,</p>
<p><strong>Glen Floreancig</strong><br>
Founder | Phoenix Phase Converters</p>
<p>📞 <a href="tel:8004176568">800-417-6568</a><br>
🌐 <a href="https://phoenixphaseconverters.com" style="color: #f97316;">PhoenixPhaseConverters.com</a></p>
<p style="color: #666; font-size: 12px;">Phoenix Phase Converters<br>
American-Built Rotary & Digital Phase Conversion Solutions</p>`;

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

${resourceLinks}

Write a detailed, consultative email that:
1. Thanks them for calling Phoenix Phase Converters
2. References specific details from our conversation if available
3. Explains why this product is right for their application
4. Highlights the LIFETIME WARRANTY and American-made quality
5. Includes the quote/invoice link for easy checkout
6. Includes the product page link so they can see full specs
7. Includes links to the installation manual and wiring diagrams
8. Includes relevant YouTube videos for their specific product
9. **IMPORTANT: Highlight the FREE App download** - mention it's a useful tool to keep track of quotes, orders, access manuals, and get troubleshooting help
10. Offers to answer any questions about sizing or installation
11. Uses the full signature format

Format the links cleanly with descriptive labels. Make it educational and helpful, not salesy. Match the tone of a knowledgeable expert helping a customer solve their power problem.`;

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

// Template email fallback (HTML format)
function generateTemplateEmail(name, orderName, total, products, invoiceUrl) {
  const productNames = products.map(p => p.name).join(', ');
  return `<p>Hi ${name},</p>

<p>Thank you for calling Phoenix Phase Converters! I wanted to follow up on our conversation and send over your quote for the <strong>${productNames}</strong>.</p>

<p>Your quote total is <strong>$${total}</strong>, which includes free shipping anywhere in the contiguous USA.</p>

<p><a href="${invoiceUrl}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Your Quote & Complete Order</a></p>

<p>A few things that set Phoenix Phase Converters apart:</p>
<ul>
  <li><strong>LIFETIME WARRANTY</strong> against any manufacturing defects</li>
  <li>American-made right here in Phoenix, Arizona</li>
  <li>24/7 technical support included with every unit</li>
  <li>Patented technologies for reduced inrush current and better voltage balance</li>
</ul>

<p>📱 <strong>Download our FREE App:</strong> <a href="https://phoenixphaseconverters.com/pages/phoenix-app-walk-through" style="color: #f97316;">Phoenix App</a><br>
<em>Keep track of your quotes, orders, access manuals, and get troubleshooting help!</em></p>

<p>If you have any questions about sizing, installation, or anything else, feel free to reply to this email or give us a call. We're happy to help make sure you get the right solution for your application.</p>

<p>Best regards,</p>
<p><strong>Glen Floreancig</strong><br>
Founder | Phoenix Phase Converters</p>
<p>📞 <a href="tel:8004176568">800-417-6568</a><br>
🌐 <a href="https://phoenixphaseconverters.com" style="color: #f97316;">PhoenixPhaseConverters.com</a></p>
<p style="color: #666; font-size: 12px;">Phoenix Phase Converters<br>
American-Built Rotary & Digital Phase Conversion Solutions</p>`;
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
