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
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    console.log('[Shopify] Fetching new access token...');
    
    try {
      const response = await axios.post(
        `https://${this.storeUrl}/admin/oauth/access_token`,
        {
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      
      console.log('[Shopify] Access token acquired');
      return this.accessToken;
    } catch (error) {
      console.error('[Shopify] OAuth error:', error.response?.data || error.message);
      throw new Error('Failed to obtain Shopify access token');
    }
  }

  /**
   * Make request with headers (for pagination)
   */
  async requestWithHeaders(method, endpoint, data = null, retry = true) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        },
        ...(data && { data })
      });
      
      return { data: response.data, headers: response.headers };
    } catch (error) {
      if (error.response?.status === 401 && retry) {
        console.log('[Shopify] Token expired, refreshing...');
        this.accessToken = null;
        return this.requestWithHeaders(method, endpoint, data, false);
      }
      
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Simple request (data only)
   */
  async request(method, endpoint, data = null) {
    const result = await this.requestWithHeaders(method, endpoint, data);
    return result.data;
  }

  /**
   * Parse Link header for next page
   */
  getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  /**
   * Get draft orders - fetches up to 500 (2 pages), returns newest first
   */
  async getDraftOrders(params = {}) {
    const status = params.status || 'open';
    console.log(`[Shopify] Fetching draft orders (status: ${status})...`);
    
    let allDrafts = [];
    // Request newest first with order=created_at desc
    let endpoint = `/draft_orders.json?limit=250&order=created_at%20desc${status !== 'any' ? `&status=${status}` : ''}`;
    
    // Page 1
    console.log('[Shopify] Fetching page 1...');
    const page1 = await this.requestWithHeaders('GET', endpoint);
    allDrafts = page1.data.draft_orders || [];
    console.log(`[Shopify] Page 1: ${allDrafts.length} drafts`);
    
    // Page 2 (if exists)
    const nextUrl = this.getNextPageUrl(page1.headers.link);
    if (nextUrl) {
      console.log('[Shopify] Fetching page 2...');
      const urlObj = new URL(nextUrl);
      const page2Endpoint = urlObj.pathname.replace('/admin/api/2024-01', '') + urlObj.search;
      const page2 = await this.requestWithHeaders('GET', page2Endpoint);
      const page2Drafts = page2.data.draft_orders || [];
      allDrafts = allDrafts.concat(page2Drafts);
      console.log(`[Shopify] Page 2: ${page2Drafts.length} drafts, total: ${allDrafts.length}`);
    }
    
    // Sort newest first
    allDrafts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    console.log(`[Shopify] Returning ${allDrafts.length} drafts (newest first)`);
    return { draft_orders: allDrafts };
  }

  /**
   * Get single draft order
   */
  async getDraftOrder(id) {
    return this.request('GET', `/draft_orders/${id}.json`);
  }

  /**
   * Create draft order
   */
  async createDraftOrder(data) {
    return this.request('POST', '/draft_orders.json', { draft_order: data });
  }

  /**
   * Update draft order
   */
  async updateDraftOrder(id, data) {
    return this.request('PUT', `/draft_orders/${id}.json`, { draft_order: data });
  }

  /**
   * Complete draft order
   */
  async completeDraftOrder(id, paymentPending = true) {
    return this.request('PUT', `/draft_orders/${id}/complete.json?payment_pending=${paymentPending}`);
  }

  /**
   * Send invoice for draft order
   */
  async sendDraftOrderInvoice(id, invoiceData = {}) {
    return this.request('POST', `/draft_orders/${id}/send_invoice.json`, {
      draft_order_invoice: {
        to: invoiceData.to || null,
        from: invoiceData.from || process.env.COMPANY_EMAIL,
        subject: invoiceData.subject || `Invoice from ${process.env.COMPANY_NAME}`,
        custom_message: invoiceData.message || 'Thank you for your order.',
        bcc: invoiceData.bcc || []
      }
    });
  }

  /**
   * Get orders
   */
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'any'
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
   * Get customer
   */
  async getCustomer(id) {
    return this.request('GET', `/customers/${id}.json`);
  }

  /**
   * Search customers
   */
  async searchCustomers(query) {
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

  /**
   * Get products - fetches up to 500 (2 pages), cached 5 min
   */
  async getProducts(params = {}) {
    console.log('[Shopify] Fetching products...');
    
    // Return cache if valid
    if (this.productsCache && this.productsCacheExpiry && Date.now() < this.productsCacheExpiry) {
      console.log(`[Shopify] Returning ${this.productsCache.length} cached products`);
      return { products: this.productsCache };
    }
    
    let allProducts = [];
    
    // Page 1
    console.log('[Shopify] Fetching products page 1...');
    const page1 = await this.requestWithHeaders('GET', '/products.json?limit=250');
    allProducts = page1.data.products || [];
    console.log(`[Shopify] Page 1: ${allProducts.length} products`);
    
    // Page 2 (if exists)
    const nextUrl = this.getNextPageUrl(page1.headers.link);
    if (nextUrl) {
      console.log('[Shopify] Fetching products page 2...');
      const urlObj = new URL(nextUrl);
      const page2Endpoint = urlObj.pathname.replace('/admin/api/2024-01', '') + urlObj.search;
      const page2 = await this.requestWithHeaders('GET', page2Endpoint);
      const page2Products = page2.data.products || [];
      allProducts = allProducts.concat(page2Products);
      console.log(`[Shopify] Page 2: ${page2Products.length} products, total: ${allProducts.length}`);
    }
    
    // Cache for 5 minutes
    this.productsCache = allProducts;
    this.productsCacheExpiry = Date.now() + (5 * 60 * 1000);
    
    console.log(`[Shopify] Returning ${allProducts.length} products`);
    return { products: allProducts };
  }

  /**
   * Get single product
   */
  async getProduct(id) {
    return this.request('GET', `/products/${id}.json`);
  }

  /**
   * Create order metafield
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
    const topics = ['draft_orders/create', 'draft_orders/update', 'orders/create', 'orders/paid'];
    const appUrl = process.env.APP_URL;
    const results = [];

    const existing = await this.getWebhooks();
    const existingTopics = existing.webhooks?.map(w => w.topic) || [];

    for (const topic of topics) {
      if (existingTopics.includes(topic)) {
        console.log(`[Shopify] Webhook exists: ${topic}`);
        results.push({ topic, status: 'exists' });
        continue;
      }

      try {
        const result = await this.request('POST', '/webhooks.json', {
          webhook: { topic, address: `${appUrl}/webhooks/${topic.replace('/', '-')}`, format: 'json' }
        });
        console.log(`[Shopify] Webhook registered: ${topic}`);
        results.push({ topic, status: 'created', id: result.webhook?.id });
      } catch (error) {
        results.push({ topic, status: 'error', error: error.message });
      }
    }
    return results;
  }

  async getWebhooks() {
    return this.request('GET', '/webhooks.json');
  }

  async deleteWebhook(id) {
    return this.request('DELETE', `/webhooks/${id}.json`);
  }

  verifyWebhookSignature(body, hmacHeader) {
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha256', process.env.SHOPIFY_CLIENT_SECRET)
      .update(body, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader || ''));
  }
}

module.exports = new ShopifyService();
