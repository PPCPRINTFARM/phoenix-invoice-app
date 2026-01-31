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
   */
  async request(method, endpoint, data = null, retry = true) {
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
      return response.data;
    } catch (error) {
      // If 401, clear token and retry once
      if (error.response?.status === 401 && retry) {
        console.log('[Shopify] Token expired, refreshing...');
        this.accessToken = null;
        this.tokenExpiry = null;
        return this.request(method, endpoint, data, false);
      }
      
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Get all draft orders (quotes)
   */
  async getDraftOrders(params = {}) {
    console.log('[Shopify] Fetching draft orders...', params);
    const queryParams = new URLSearchParams({
      limit: params.limit || 250,
      ...(params.status && params.status !== 'any' && { status: params.status })
    }).toString();
    
    const result = await this.request('GET', `/draft_orders.json?${queryParams}`);
    console.log('[Shopify] Draft orders result:', result.draft_orders?.length || 0, 'orders');
    return result;
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
   * Get products
   */
  async getProducts(params = {}) {
    console.log('[Shopify] Fetching products...', params);
    const queryParams = new URLSearchParams({
      limit: params.limit || 50
    }).toString();
    
    const result = await this.request('GET', `/products.json?${queryParams}`);
    console.log('[Shopify] Products result:', result.products?.length || 0, 'products');
    return result;
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
