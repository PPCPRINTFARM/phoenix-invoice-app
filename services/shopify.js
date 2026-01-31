/**
 * Shopify API Service
 * Handles all Shopify API interactions using OAuth Client Credentials
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.clientId = process.env.SHOPIFY_CLIENT_ID;
    this.clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    this.baseUrl = `https://${this.storeUrl}/admin/api/2024-01`;
    
    // Token cache
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Products cache (refresh every 5 minutes)
    this.productsCache = null;
    this.productsCacheExpiry = null;
  }

  /**
   * Get access token via OAuth Client Credentials flow
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    console.log('[Shopify] Fetching new access token via client credentials...');
    
    try {
      const response = await axios.post(
        `https://${this.storeUrl}/admin/oauth/access_token`,
        {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      this.accessToken = response.data.access_token;
      // Token typically valid for 24 hours, but refresh after 23 hours
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      
      console.log('[Shopify] Access token acquired successfully');
      return this.accessToken;
    } catch (error) {
      console.error('[Shopify] OAuth token error:', error.response?.data || error.message);
      throw new Error('Failed to obtain Shopify access token');
    }
  }

  /**
   * Make authenticated request to Shopify API
   * Returns { data, headers } to access pagination info
   */
  async requestWithHeaders(method, endpoint, data = null, retry = true) {
    try {
      const token = await this.getAccessToken();
      
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        ...(data && { data })
      };
      
      const response = await axios(config);
      return { data: response.data, headers: response.headers };
    } catch (error) {
      // If 401, clear token and retry once
      if (error.response?.status === 401 && retry) {
        console.log('[Shopify] Token expired, refreshing...');
        this.accessToken = null;
        this.tokenExpiry = null;
        return this.requestWithHeaders(method, endpoint, data, false);
      }
      
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Make authenticated request to Shopify API (returns data only)
   */
  async request(method, endpoint, data = null, retry = true) {
    const result = await this.requestWithHeaders(method, endpoint, data, retry);
    return result.data;
  }

  /**
   * Parse Link header to get next page URL
   */
  parseNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    
    const links = linkHeader.split(',');
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Get all draft orders with pagination (to get newest)
   * Fetches multiple pages and returns all, sorted newest first
   */
  async getDraftOrders(params = {}) {
    console.log('[Shopify] Fetching draft orders...', params);
    
    const status = params.status || 'open';
    
    let allDrafts = [];
    let endpoint = `/draft_orders.json?limit=250${status !== 'any' ? `&status=${status}` : ''}`;
    let pageCount = 0;
    const maxPages = 10; // Safety limit - 2500 max drafts
    
    // Paginate through all drafts
    while (endpoint && pageCount < maxPages) {
      pageCount++;
      console.log(`[Shopify] Fetching draft orders page ${pageCount}...`);
      
      const { data, headers } = await this.requestWithHeaders('GET', endpoint);
      const drafts = data.draft_orders || [];
      allDrafts = allDrafts.concat(drafts);
      
      console.log(`[Shopify] Page ${pageCount}: ${drafts.length} drafts, total: ${allDrafts.length}`);
      
      // Check for next page
      const nextUrl = this.parseNextPageUrl(headers.link);
      if (nextUrl) {
        // Extract just the path and query from the full URL
        const urlObj = new URL(nextUrl);
        endpoint = urlObj.pathname.replace('/admin/api/2024-01', '') + urlObj.search;
      } else {
        endpoint = null;
      }
    }
    
    console.log(`[Shopify] Total draft orders fetched: ${allDrafts.length}`);
    
    // Sort by created_at descending (newest first)
    allDrafts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return { draft_orders: allDrafts };
  }

  /**
   * Get single draft order by ID
   */
  async getDraftOrder(id) {
    return this.request('GET', `/draft_orders/${id}.json`);
  }

  /**
   * Create a new draft order
   */
  async createDraftOrder(data) {
    console.log('[Shopify] Creating draft order...');
    return this.request('POST', '/draft_orders.json', { draft_order: data });
  }

  /**
   * Update a draft order
   */
  async updateDraftOrder(id, data) {
    return this.request('PUT', `/draft_orders/${id}.json`, { draft_order: data });
  }

  /**
   * Complete/convert draft order to real order (creates invoice)
   */
  async completeDraftOrder(id, paymentPending = true) {
    return this.request('PUT', `/draft_orders/${id}/complete.json?payment_pending=${paymentPending}`);
  }

  /**
   * Send invoice for draft order
   */
  async sendDraftOrderInvoice(id, invoiceData = {}) {
    const data = {
      draft_order_invoice: {
        to: invoiceData.to || null,
        from: invoiceData.from || process.env.COMPANY_EMAIL,
        subject: invoiceData.subject || `Invoice from ${process.env.COMPANY_NAME}`,
        custom_message: invoiceData.message || 'Thank you for your order. Please find your invoice attached.',
        bcc: invoiceData.bcc || []
      }
    };
    
    return this.request('POST', `/draft_orders/${id}/send_invoice.json`, data);
  }

  /**
   * Get all orders
   */
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'any',
      ...params
    }).toString();
    
    return this.request('GET', `/orders.json?${queryParams}`);
  }

  /**
   * Get single order
   */
  async getOrder(id) {
    return this.request('GET', `/orders/${id}.json`);
  }

  /**
   * Get customer by ID
   */
  async getCustomer(id) {
    return this.request('GET', `/customers/${id}.json`);
  }

  /**
   * Search customers
   */
  async searchCustomers(query) {
    console.log('[Shopify] Searching customers:', query);
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

  /**
   * Get ALL products with pagination (cached for 5 minutes)
   */
  async getProducts(params = {}) {
    console.log('[Shopify] Fetching products...', params);
    
    // Return cached products if still valid
    if (this.productsCache && this.productsCacheExpiry && Date.now() < this.productsCacheExpiry) {
      console.log('[Shopify] Returning cached products:', this.productsCache.length);
      return { products: this.productsCache };
    }
    
    let allProducts = [];
    let endpoint = '/products.json?limit=250';
    let pageCount = 0;
    const maxPages = 10; // Safety limit - 2500 max products
    
    // Paginate through all products
    while (endpoint && pageCount < maxPages) {
      pageCount++;
      console.log(`[Shopify] Fetching products page ${pageCount}...`);
      
      const { data, headers } = await this.requestWithHeaders('GET', endpoint);
      const products = data.products || [];
      allProducts = allProducts.concat(products);
      
      console.log(`[Shopify] Page ${pageCount}: ${products.length} products, total: ${allProducts.length}`);
      
      // Check for next page
      const nextUrl = this.parseNextPageUrl(headers.link);
      if (nextUrl) {
        const urlObj = new URL(nextUrl);
        endpoint = urlObj.pathname.replace('/admin/api/2024-01', '') + urlObj.search;
      } else {
        endpoint = null;
      }
    }
    
    console.log(`[Shopify] Total products fetched: ${allProducts.length}`);
    
    // Cache products for 5 minutes
    this.productsCache = allProducts;
    this.productsCacheExpiry = Date.now() + (5 * 60 * 1000);
    
    return { products: allProducts };
  }

  /**
   * Get single product by ID
   */
  async getProduct(id) {
    console.log('[Shopify] Fetching product:', id);
    return this.request('GET', `/products/${id}.json`);
  }

  /**
   * Create metafield for order (store invoice data)
   */
  async createOrderMetafield(orderId, data) {
    return this.request('POST', `/orders/${orderId}/metafields.json`, {
      metafield: {
        namespace: 'phoenix_invoices',
        key: 'invoice_data',
        value: JSON.stringify(data),
        type: 'json'
      }
    });
  }

  /**
   * Register webhooks
   */
  async registerWebhooks() {
    const webhookTopics = [
      'draft_orders/create',
      'draft_orders/update',
      'orders/create',
      'orders/paid'
    ];

    const appUrl = process.env.APP_URL;
    const results = [];

    // First, get existing webhooks
    const existingWebhooks = await this.getWebhooks();
    const existingTopics = existingWebhooks.webhooks?.map(w => w.topic) || [];

    for (const topic of webhookTopics) {
      // Skip if already registered
      if (existingTopics.includes(topic)) {
        console.log(`[Shopify] Webhook already registered: ${topic}`);
        results.push({ topic, status: 'exists' });
        continue;
      }

      try {
        const result = await this.request('POST', '/webhooks.json', {
          webhook: {
            topic,
            address: `${appUrl}/webhooks/${topic.replace('/', '-')}`,
            format: 'json'
          }
        });
        console.log(`[Shopify] Webhook registered: ${topic}`);
        results.push({ topic, status: 'created', id: result.webhook?.id });
      } catch (error) {
        console.error(`[Shopify] Failed to register webhook ${topic}:`, error.message);
        results.push({ topic, status: 'error', error: error.message });
      }
    }

    return results;
  }

  /**
   * Get all registered webhooks
   */
  async getWebhooks() {
    return this.request('GET', '/webhooks.json');
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id) {
    return this.request('DELETE', `/webhooks/${id}.json`);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, hmacHeader) {
    const crypto = require('crypto');
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
    
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader || '')
    );
  }
}

module.exports = new ShopifyService();
