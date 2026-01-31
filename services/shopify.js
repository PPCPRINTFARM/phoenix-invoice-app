/**
 * Shopify API Service - Phoenix Invoice App
 * Uses Client Credentials OAuth flow for Admin API access
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.clientId = process.env.SHOPIFY_CLIENT_ID;
    this.clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    this.apiVersion = '2024-01';
    
    // Token management
    this.accessToken = null;
    this.tokenExpiry = null;
    
    this.baseUrl = `https://${this.storeUrl}/admin/api/${this.apiVersion}`;
  }

  async getAccessToken() {
    // Check if we have a valid token (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000;
    if (this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - bufferMs)) {
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
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('[Shopify] Access token acquired successfully');
      return this.accessToken;
    } catch (error) {
      console.error('[Shopify] Failed to get access token:', error.response?.data || error.message);
      throw new Error(`Failed to authenticate with Shopify: ${error.message}`);
    }
  }

  async getHeaders() {
    const token = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    };
  }

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

  // DRAFT ORDERS - FIXED: Don't filter by status when 'any' is passed
  async getDraftOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 250,
      ...(params.status && params.status !== 'any' && { status: params.status })
    }).toString();
    
    return this.request('GET', `/draft_orders.json?${queryParams}`);
  }

  async getDraftOrder(id) {
    return this.request('GET', `/draft_orders/${id}.json`);
  }

  async createDraftOrder(data) {
    return this.request('POST', '/draft_orders.json', { draft_order: data });
  }

  async updateDraftOrder(id, data) {
    return this.request('PUT', `/draft_orders/${id}.json`, { draft_order: data });
  }

  async completeDraftOrder(id, paymentPending = true) {
    return this.request('PUT', `/draft_orders/${id}/complete.json?payment_pending=${paymentPending}`);
  }

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

  async deleteDraftOrder(id) {
    return this.request('DELETE', `/draft_orders/${id}.json`);
  }

  // ORDERS
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'any',
      ...params
    }).toString();
    
    return this.request('GET', `/orders.json?${queryParams}`);
  }

  async getOrder(id) {
    return this.request('GET', `/orders/${id}.json`);
  }

  // PRODUCTS
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    }).toString();
    
    return this.request('GET', `/products.json?${queryParams}`);
  }

  async getProduct(id) {
    return this.request('GET', `/products/${id}.json`);
  }

  async searchProducts(query) {
    return this.request('GET', `/products.json?title=${encodeURIComponent(query)}`);
  }

  // CUSTOMERS
  async getCustomer(id) {
    return this.request('GET', `/customers/${id}.json`);
  }

  async getCustomers(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    }).toString();
    
    return this.request('GET', `/customers.json?${queryParams}`);
  }

  async searchCustomers(query) {
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

  // METAFIELDS
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

  // WEBHOOKS
  async getWebhooks() {
    return this.request('GET', '/webhooks.json');
  }

  async createWebhook(topic, address) {
    return this.request('POST', '/webhooks.json', {
      webhook: {
        topic,
        address,
        format: 'json'
      }
    });
  }

  async deleteWebhook(id) {
    return this.request('DELETE', `/webhooks/${id}.json`);
  }

  verifyWebhookSignature(body, hmacHeader) {
    const crypto = require('crypto');
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
    
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
    
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader || '')
    );
  }

  // SHOP
  async getShop() {
    return this.request('GET', '/shop.json');
  }

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

  async registerWebhooks() {
    const webhookTopics = [
      'draft_orders/create',
      'draft_orders/update',
      'draft_orders/delete',
      'orders/create',
      'orders/paid',
      'orders/fulfilled'
    ];

    const appUrl = process.env.APP_URL || 'https://phoenix-invoice-app.onrender.com';
    const results = [];

    const existingWebhooks = await this.getWebhooks();
    const existingTopics = existingWebhooks.webhooks?.map(w => w.topic) || [];

    for (const topic of webhookTopics) {
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
}

module.exports = new ShopifyService();
