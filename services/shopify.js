/**
 * Shopify API Service
 * Handles all Shopify API interactions including draft orders, orders, and webhooks
 */

const axios = require('axios');

class ShopifyService {
  constructor() {
    this.baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01`;
    this.headers = {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make authenticated request to Shopify API
   */
  async request(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.headers,
        ...(data && { data })
      };
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Shopify API Error [${endpoint}]:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.errors || error.message);
    }
  }

  /**
   * Get all draft orders (quotes)
   */
  async getDraftOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 250,
      order: 'updated_at desc',
      ...(params.status && params.status !== 'any' && { status: params.status })
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
    return this.request('GET', `/customers/search.json?query=${encodeURIComponent(query)}`);
  }

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
   * Get single product by ID
   */
  async getProduct(id) {
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
      'draft_orders/delete',
      'orders/create',
      'orders/paid',
      'orders/fulfilled'
    ];

    const appUrl = process.env.APP_URL;
    const results = [];

    // First, get existing webhooks
    const existingWebhooks = await this.getWebhooks();
    const existingTopics = existingWebhooks.webhooks?.map(w => w.topic) || [];

    for (const topic of webhookTopics) {
      // Skip if already registered
      if (existingTopics.includes(topic)) {
        console.log(`Webhook already registered: ${topic}`);
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
        console.log(`Webhook registered: ${topic}`);
        results.push({ topic, status: 'created', id: result.webhook?.id });
      } catch (error) {
        console.error(`Failed to register webhook ${topic}:`, error.message);
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
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;
    
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
