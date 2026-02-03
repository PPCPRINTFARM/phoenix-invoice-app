/**
 * Shopify API Service
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.clientId = process.env.SHOPIFY_CLIENT_ID;
    this.clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    this.baseUrl = `https://${this.storeUrl}/admin/api/2024-01`;
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.productsCache = null;
    this.productsCacheExpiry = null;
  }

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

  async request(method, endpoint, data = null, retry = true) {
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
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 401 && retry) {
        this.accessToken = null;
        return this.request(method, endpoint, data, false);
      }
      
      console.error(`[Shopify] API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

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
        this.accessToken = null;
        return this.requestWithHeaders(method, endpoint, data, false);
      }
      
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Get ALL draft orders - up to 2000 (8 pages), newest ID first
   */
  async getDraftOrders(params = {}) {
    const status = params.status || 'any';
    console.log(`[Shopify] Fetching ALL draft orders (status: ${status})...`);
    
    let allDrafts = [];
    let url = `/draft_orders.json?limit=250&order=id%20desc${status !== 'any' ? `&status=${status}` : ''}`;
    let page = 1;
    
    while (url && page <= 8) {
      console.log(`[Shopify] Fetching page ${page}...`);
      const response = await this.requestWithHeaders('GET', url);
      const drafts = response.data.draft_orders || [];
      
      if (drafts.length === 0) break;
      
      allDrafts = allDrafts.concat(drafts);
      console.log(`[Shopify] Page ${page}: ${drafts.length} drafts, total: ${allDrafts.length}`);
      
      // Get next page from Link header
      const linkHeader = response.headers?.link || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1].replace(this.baseUrl, '');
      } else {
        url = null;
      }
      page++;
    }
    
    console.log(`[Shopify] Total: ${allDrafts.length} drafts`);
    return { draft_orders: allDrafts };
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

  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'any'
    }).toString();
    return this.request('GET', `/orders.json?${queryParams}`);
  }

  async getOrder(id) {
    return this.request('GET', `/orders/${id}.json`);
  }

  async getCustomer(id) {
    return this.request('GET', `/customers/${id}.json`);
  }

  async searchCustomers(query) {
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

  async getProducts(params = {}) {
    if (this.productsCache && this.productsCacheExpiry && Date.now() < this.productsCacheExpiry) {
      return { products: this.productsCache };
    }
    
    const result = await this.request('GET', '/products.json?limit=250');
    this.productsCache = result.products || [];
    this.productsCacheExpiry = Date.now() + (5 * 60 * 1000);
    
    return { products: this.productsCache };
  }

  async getProduct(id) {
    return this.request('GET', `/products/${id}.json`);
  }

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

  async registerWebhooks() {
    const topics = ['draft_orders/create', 'draft_orders/update', 'orders/create', 'orders/paid'];
    const appUrl = process.env.APP_URL;
    const results = [];

    const existing = await this.getWebhooks();
    const existingTopics = existing.webhooks?.map(w => w.topic) || [];

    for (const topic of topics) {
      if (existingTopics.includes(topic)) {
        results.push({ topic, status: 'exists' });
        continue;
      }

      try {
        const result = await this.request('POST', '/webhooks.json', {
          webhook: { topic, address: `${appUrl}/webhooks/${topic.replace('/', '-')}`, format: 'json' }
        });
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
}

module.exports = new ShopifyService();
