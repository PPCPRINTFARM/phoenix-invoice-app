/**
 * Shopify API Service - Phoenix Invoice App
 * Uses Client Credentials Grant for Admin API access
 * Tokens expire every 24 hours and are refreshed automatically
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.clientId = process.env.SHOPIFY_API_KEY;      // Also known as Client ID
    this.clientSecret = process.env.SHOPIFY_API_SECRET; // Also known as Client Secret
    this.apiVersion = '2026-01';
    
    // Token management
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Base URL for API requests
    this.baseUrl = `https://${this.storeUrl}/admin/api/${this.apiVersion}`;
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken() {
    // Check if we have a valid token (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - bufferMs)) {
      return this.accessToken;
    }

    // Need to fetch a new token
    console.log('[Shopify] Fetching new access token via client credentials...');
    
    try {
      const response = await axios.post(
        `https://${this.storeUrl}/admin/oauth/access_token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Token expires in 24 hours (86399 seconds)
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('[Shopify] Access token acquired successfully');
      console.log(`[Shopify] Token expires in ${Math.round(response.data.expires_in / 3600)} hours`);
      console.log(`[Shopify] Scopes: ${response.data.scope}`);
      
      return this.accessToken;
    } catch (error) {
      console.error('[Shopify] Failed to get access token:', error.response?.data || error.message);
      throw new Error(`Failed to authenticate with Shopify: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get headers with current access token
   */
  async getHeaders() {
    const token = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    };
  }

  /**
   * Make authenticated request to Shopify API
   */
  async request(method, endpoint, data = null) {
    try {
      const headers = await this.getHeaders();
      
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers,
        ...(data && { data })
      };
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      // If we get a 401, try refreshing the token once
      if (error.response?.status === 401) {
        console.log('[Shopify] Got 401, forcing token refresh...');
        this.accessToken = null;
        this.tokenExpiry = null;
        
        const headers = await this.getHeaders();
        const config = {
          method,
          url: `${this.baseUrl}${endpoint}`,
          headers,
          ...(data && { data })
        };
        
        const response = await axios(config);
        return response.data;
      }
      
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Make GraphQL request to Shopify Admin API
   */
  async graphql(query, variables = {}) {
    try {
      const headers = await this.getHeaders();
      
      const response = await axios.post(
        `${this.baseUrl}/graphql.json`,
        { query, variables },
        { headers }
      );
      
      if (response.data.errors) {
        console.error('[Shopify] GraphQL Errors:', response.data.errors);
        throw new Error(response.data.errors[0]?.message || 'GraphQL error');
      }
      
      return response.data.data;
    } catch (error) {
      // If we get a 401, try refreshing the token once
      if (error.response?.status === 401) {
        console.log('[Shopify] Got 401 on GraphQL, forcing token refresh...');
        this.accessToken = null;
        this.tokenExpiry = null;
        
        const headers = await this.getHeaders();
        const response = await axios.post(
          `${this.baseUrl}/graphql.json`,
          { query, variables },
          { headers }
        );
        
        return response.data.data;
      }
      
      console.error('[Shopify] GraphQL Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // ==========================================
  // DRAFT ORDERS (QUOTES)
  // ==========================================

  /**
   * Get all draft orders (quotes)
   */
  async getDraftOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'open',
      ...params
    }).toString();
    
    return this.request('GET', `/draft_orders.json?${queryParams}`);
  }

  /**
   * Get single draft order by ID
   */
  async getDraftOrder(id) {
    return this.request('GET', `/draft_orders/${id}.json`);
  }

  /**
   * Update a draft order
   */
  async updateDraftOrder(id, data) {
    return this.request('PUT', `/draft_orders/${id}.json`, { draft_order: data });
  }

  /**
   * Complete/convert draft order to real order
   */
  async completeDraftOrder(id, paymentPending = true) {
    return this.request('PUT', `/draft_orders/${id}/complete.json?payment_pending=${paymentPending}`);
  }

  /**
   * Send invoice for draft order via Shopify
   */
  async sendDraftOrderInvoice(id, invoiceData = {}) {
    const data = {
      draft_order_invoice: {
        to: invoiceData.to || null,
        from: invoiceData.from || process.env.COMPANY_EMAIL,
        subject: invoiceData.subject || `Invoice from ${process.env.COMPANY_NAME}`,
        custom_message: invoiceData.message || 'Thank you for your order. Please find your invoice attached.'
      }
    };
    return this.request('POST', `/draft_orders/${id}/send_invoice.json`, data);
  }

  /**
   * Delete a draft order
   */
  async deleteDraftOrder(id) {
    return this.request('DELETE', `/draft_orders/${id}.json`);
  }

  // ==========================================
  // ORDERS
  // ==========================================

  /**
   * Get orders
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

  // ==========================================
  // PRODUCTS
  // ==========================================

  /**
   * Get products
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    }).toString();
    
    return this.request('GET', `/products.json?${queryParams}`);
  }

  /**
   * Get single product
   */
  async getProduct(id) {
    return this.request('GET', `/products/${id}.json`);
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================

  /**
   * Get customers
   */
  async getCustomers(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    }).toString();
    
    return this.request('GET', `/customers.json?${queryParams}`);
  }

  /**
   * Search customers by email or phone
   */
  async searchCustomers(query) {
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

  // ==========================================
  // WEBHOOKS
  // ==========================================

  /**
   * Get registered webhooks
   */
  async getWebhooks() {
    return this.request('GET', '/webhooks.json');
  }

  /**
   * Register a webhook
   */
  async createWebhook(topic, address) {
    return this.request('POST', '/webhooks.json', {
      webhook: {
        topic,
        address,
        format: 'json'
      }
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id) {
    return this.request('DELETE', `/webhooks/${id}.json`);
  }

  // ==========================================
  // SHOP INFO
  // ==========================================

  /**
   * Get shop information
   */
  async getShop() {
    return this.request('GET', '/shop.json');
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const shop = await this.getShop();
      return {
        success: true,
        shop: shop.shop.name,
        email: shop.shop.email,
        domain: shop.shop.domain
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Register webhooks for the app
   */
  async registerWebhooks() {
    const appUrl = process.env.APP_URL || 'https://phoenix-invoice-app.onrender.com';
    
    const webhooksToRegister = [
      { topic: 'draft_orders/create', address: `${appUrl}/webhooks/draft-orders/create` },
      { topic: 'draft_orders/update', address: `${appUrl}/webhooks/draft-orders/update` },
      { topic: 'orders/create', address: `${appUrl}/webhooks/orders/create` },
      { topic: 'orders/paid', address: `${appUrl}/webhooks/orders/paid` }
    ];

    console.log('[Shopify] Registering webhooks...');
    
    try {
      // Get existing webhooks
      const existing = await this.getWebhooks();
      const existingTopics = existing.webhooks?.map(w => w.topic) || [];
      
      for (const webhook of webhooksToRegister) {
        if (!existingTopics.includes(webhook.topic)) {
          try {
            await this.createWebhook(webhook.topic, webhook.address);
            console.log(`[Shopify] Registered webhook: ${webhook.topic}`);
          } catch (err) {
            console.log(`[Shopify] Webhook ${webhook.topic} may already exist: ${err.message}`);
          }
        } else {
          console.log(`[Shopify] Webhook already exists: ${webhook.topic}`);
        }
      }
      
      console.log('[Shopify] Webhook registration complete');
    } catch (error) {
      console.error('[Shopify] Failed to register webhooks:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new ShopifyService();
