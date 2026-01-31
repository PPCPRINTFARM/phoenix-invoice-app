/**
 * Shopify API Service - Phoenix Invoice App
 * Uses static Admin API Access Token (shpat_)
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2024-01';
    
    this.baseUrl = `https://${this.storeUrl}/admin/api/${this.apiVersion}`;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': this.accessToken
    };
  }

  async request(method, endpoint, data = null) {
    try {
      const headers = this.getHeaders();
      
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers,
        ...(data && { data })
      };
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  async graphql(query, variables = {}) {
    try {
      const headers = this.getHeaders();
      
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
      console.error('[Shopify] GraphQL Error:', error.response?.data || error.message);
      throw error;
    }
  }

  // DRAFT ORDERS
  async getDraftOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'open',
      ...params
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
        custom_message: invoiceData.message || 'Thank you for your order. Please find your invoice attached.'
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
    const appUrl = process.env.APP_URL || 'https://phoenix-invoice-app.onrender.com';
    
    const webhooksToRegister = [
      { topic: 'draft_orders/create', address: `${appUrl}/webhooks/draft-orders/create` },
      { topic: 'draft_orders/update', address: `${appUrl}/webhooks/draft-orders/update` },
      { topic: 'orders/create', address: `${appUrl}/webhooks/orders/create` },
      { topic: 'orders/paid', address: `${appUrl}/webhooks/orders/paid` }
    ];

    console.log('[Shopify] Registering webhooks...');
    
    try {
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

module.exports = new ShopifyService();
