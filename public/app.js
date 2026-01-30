/**
 * Phoenix Invoice App - Frontend JavaScript
 */

// State management
const state = {
  draftOrders: [],/**
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

  invoices: [],
  webhooks: [],
  selectedQuotes: new Set(),
  stats: {}
};

// API helper
async function api(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    showSection(section);
  });
});

function showSection(sectionName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionName);
  });
  
  // Update sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === `${sectionName}-section`);
  });
  
  // Update title
  const titles = {
    dashboard: 'Dashboard',
    quotes: 'Draft Quotes',
    invoices: 'Invoices',
    webhooks: 'Webhooks'
  };
  document.getElementById('page-title').textContent = titles[sectionName] || sectionName;
  
  // Load data for section
  switch (sectionName) {
    case 'dashboard':
      loadStats();
      break;
    case 'quotes':
      loadDraftOrders();
      break;
    case 'invoices':
      loadInvoices();
      break;
    case 'webhooks':
      loadWebhooks();
      break;
  }
}

// Data loading functions
async function loadStats() {
  try {
    const data = await api('/stats');
    state.stats = data.stats;
    
    document.getElementById('stat-quotes').textContent = data.stats.openQuotes;
    document.getElementById('stat-quote-value').textContent = formatCurrency(data.stats.totalQuoteValue);
    document.getElementById('stat-invoices').textContent = data.stats.invoicesGenerated;
    document.getElementById('stat-revenue').textContent = formatCurrency(data.stats.monthlyRevenue);
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadDraftOrders() {
  const tbody = document.getElementById('quotes-table-body');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading quotes...</td></tr>';
  
  try {
    const status = document.getElementById('quote-status-filter').value;
    const data = await api(`/draft-orders?status=${status}`);
    state.draftOrders = data.draftOrders;
    state.selectedQuotes.clear();
    
    if (data.draftOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading">No draft orders found</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.draftOrders.map(order => `
      <tr>
        <td>
          <input type="checkbox" 
                 class="quote-checkbox" 
                 data-id="${order.id}"
                 onchange="toggleQuoteSelection(${order.id})">
        </td>
        <td><strong>${order.name}</strong></td>
        <td>${getCustomerName(order)}</td>
        <td>${order.email || order.customer?.email || '-'}</td>
        <td>${formatCurrency(order.total_price)}</td>
        <td>${formatDate(order.created_at)}</td>
        <td><span class="status-badge ${order.status}">${order.status}</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="createInvoice(${order.id})">
            Create Invoice
          </button>
          <button class="btn btn-sm btn-secondary" onclick="viewQuoteDetails(${order.id})">
            View
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Failed to load quotes</td></tr>';
  }
}

async function loadInvoices() {
  const tbody = document.getElementById('invoices-table-body');
  tbody.innerHTML = '<tr><td colspan="3" class="loading">Loading invoices...</td></tr>';
  
  try {
    const data = await api('/invoices');
    state.invoices = data.invoices;
    
    if (data.invoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="loading">No invoices generated yet</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.invoices.map(invoice => `
      <tr>
        <td><strong>${invoice.invoiceNumber}</strong></td>
        <td>${formatDate(invoice.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="downloadInvoice('${invoice.invoiceNumber}')">
            Download PDF
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading">Failed to load invoices</td></tr>';
  }
}

async function loadWebhooks() {
  const tbody = document.getElementById('webhooks-table-body');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading webhooks...</td></tr>';
  
  try {
    const data = await api('/webhooks');
    state.webhooks = data.webhooks;
    
    if (data.webhooks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="loading">No webhooks registered. Click "Register Webhooks" to set them up.</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.webhooks.map(webhook => `
      <tr>
        <td>${webhook.id}</td>
        <td><code>${webhook.topic}</code></td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${webhook.address}</td>
        <td>${webhook.format}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteWebhook(${webhook.id})">
            Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Failed to load webhooks</td></tr>';
  }
}

// Quote actions
function toggleQuoteSelection(id) {
  if (state.selectedQuotes.has(id)) {
    state.selectedQuotes.delete(id);
  } else {
    state.selectedQuotes.add(id);
  }
}

function toggleAllQuotes() {
  const selectAll = document.getElementById('select-all-quotes').checked;
  const checkboxes = document.querySelectorAll('.quote-checkbox');
  
  state.selectedQuotes.clear();
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
    if (selectAll) {
      state.selectedQuotes.add(parseInt(cb.dataset.id));
    }
  });
}

async function createInvoice(draftOrderId) {
  showModal('Create Invoice', `
    <p>Create an invoice for this draft order?</p>
    <div style="margin-top: 16px;">
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <input type="checkbox" id="send-email-checkbox">
        Send invoice email to customer
      </label>
      <label style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="complete-order-checkbox">
        Complete draft order (convert to real order)
      </label>
    </div>
  `, [
    { text: 'Cancel', class: 'btn-secondary', onclick: 'closeModal()' },
    { text: 'Create Invoice', class: 'btn-primary', onclick: `confirmCreateInvoice(${draftOrderId})` }
  ]);
}

async function confirmCreateInvoice(draftOrderId) {
  const sendEmail = document.getElementById('send-email-checkbox').checked;
  const completeOrder = document.getElementById('complete-order-checkbox').checked;
  
  closeModal();
  showToast('Creating invoice...', 'info');
  
  try {
    const data = await api(`/draft-orders/${draftOrderId}/create-invoice`, {
      method: 'POST',
      body: JSON.stringify({ sendEmail, completeOrder })
    });
    
    showToast(`Invoice ${data.invoice.invoiceNumber} created successfully!`, 'success');
    loadDraftOrders();
    loadStats();
    
    // Offer to download
    showModal('Invoice Created', `
      <div class="invoice-preview">
        <div class="company-name">${data.invoice.company.name}</div>
        <div class="invoice-title">INVOICE</div>
        <p><strong>Invoice #:</strong> ${data.invoice.invoiceNumber}</p>
        <p><strong>Customer:</strong> ${data.invoice.customer.name}</p>
        <p><strong>Total:</strong> ${formatCurrency(data.invoice.total)}</p>
        <p><strong>Due Date:</strong> ${data.invoice.dueDate}</p>
      </div>
    `, [
      { text: 'Close', class: 'btn-secondary', onclick: 'closeModal()' },
      { text: 'Download PDF', class: 'btn-primary', onclick: `downloadInvoice('${data.invoice.invoiceNumber}'); closeModal();` }
    ]);
  } catch (error) {
    showToast('Failed to create invoice', 'error');
  }
}

async function batchCreateInvoices() {
  if (state.selectedQuotes.size === 0) {
    showToast('Please select at least one quote', 'error');
    return;
  }
  
  const count = state.selectedQuotes.size;
  showModal('Batch Create Invoices', `
    <p>Create invoices for <strong>${count}</strong> selected quote(s)?</p>
    <div style="margin-top: 16px;">
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <input type="checkbox" id="batch-send-email">
        Send invoice emails to customers
      </label>
      <label style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="batch-complete-order">
        Complete draft orders (convert to real orders)
      </label>
    </div>
  `, [
    { text: 'Cancel', class: 'btn-secondary', onclick: 'closeModal()' },
    { text: `Create ${count} Invoice(s)`, class: 'btn-primary', onclick: 'confirmBatchCreate()' }
  ]);
}

async function confirmBatchCreate() {
  const sendEmails = document.getElementById('batch-send-email').checked;
  const completeOrders = document.getElementById('batch-complete-order').checked;
  const draftOrderIds = Array.from(state.selectedQuotes);
  
  closeModal();
  showToast(`Creating ${draftOrderIds.length} invoices...`, 'info');
  
  try {
    const data = await api('/draft-orders/batch-invoice', {
      method: 'POST',
      body: JSON.stringify({ draftOrderIds, sendEmails, completeOrders })
    });
    
    showToast(`Created ${data.successful} of ${data.processed} invoices`, 
              data.failed > 0 ? 'error' : 'success');
    
    loadDraftOrders();
    loadStats();
  } catch (error) {
    showToast('Batch creation failed', 'error');
  }
}

function viewQuoteDetails(draftOrderId) {
  const order = state.draftOrders.find(o => o.id === draftOrderId);
  if (!order) return;
  
  const lineItems = (order.line_items || []).map(item => `
    <tr>
      <td>${item.title}${item.variant_title ? ` - ${item.variant_title}` : ''}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('');
  
  showModal(`Quote ${order.name}`, `
    <div style="margin-bottom: 20px;">
      <h4 style="margin-bottom: 8px; color: var(--text-secondary);">Customer</h4>
      <p><strong>${getCustomerName(order)}</strong></p>
      <p>${order.email || order.customer?.email || 'No email'}</p>
      ${order.billing_address ? `<p>${order.billing_address.address1 || ''}</p>` : ''}
    </div>
    
    <h4 style="margin-bottom: 8px; color: var(--text-secondary);">Line Items</h4>
    <table class="data-table" style="margin-bottom: 20px;">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems || '<tr><td colspan="4">No items</td></tr>'}
      </tbody>
    </table>
    
    <div style="text-align: right;">
      <p><strong>Subtotal:</strong> ${formatCurrency(order.subtotal_price)}</p>
      <p><strong>Shipping:</strong> ${formatCurrency(order.total_shipping_price_set?.shop_money?.amount || 0)}</p>
      <p><strong>Tax:</strong> ${formatCurrency(order.total_tax)}</p>
      <p style="font-size: 18px;"><strong>Total:</strong> ${formatCurrency(order.total_price)}</p>
    </div>
    
    ${order.note ? `<div style="margin-top: 20px;"><h4>Note</h4><p>${order.note}</p></div>` : ''}
  `, [
    { text: 'Close', class: 'btn-secondary', onclick: 'closeModal()' },
    { text: 'Create Invoice', class: 'btn-primary', onclick: `closeModal(); createInvoice(${order.id});` }
  ]);
}

// Invoice actions
function downloadInvoice(invoiceNumber) {
  window.open(`/api/invoices/${invoiceNumber}/download`, '_blank');
}

// Webhook actions
async function registerWebhooks() {
  showToast('Registering webhooks...', 'info');
  
  try {
    const data = await api('/webhooks/register', { method: 'POST' });
    
    const created = data.results.filter(r => r.status === 'created').length;
    const existing = data.results.filter(r => r.status === 'exists').length;
    const errors = data.results.filter(r => r.status === 'error').length;
    
    showToast(`Registered: ${created}, Already existed: ${existing}, Errors: ${errors}`, 
              errors > 0 ? 'error' : 'success');
    
    loadWebhooks();
  } catch (error) {
    showToast('Failed to register webhooks', 'error');
  }
}

async function deleteWebhook(webhookId) {
  if (!confirm('Are you sure you want to delete this webhook?')) return;
  
  try {
    await api(`/webhooks/${webhookId}`, { method: 'DELETE' });
    showToast('Webhook deleted', 'success');
    loadWebhooks();
  } catch (error) {
    showToast('Failed to delete webhook', 'error');
  }
}

// Utility functions
function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(num);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getCustomerName(order) {
  if (order.customer) {
    return `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Guest';
  }
  if (order.billing_address) {
    return order.billing_address.name || 'Guest';
  }
  return 'Guest';
}

// Modal functions
function showModal(title, bodyHtml, buttons = []) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = buttons.map(btn => 
    `<button class="btn ${btn.class}" onclick="${btn.onclick}">${btn.text}</button>`
  ).join('');
  
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// Close modal on outside click
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') {
    closeModal();
  }
});

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastSlide 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Refresh data
function refreshData() {
  const activeSection = document.querySelector('.section.active');
  if (activeSection) {
    const sectionName = activeSection.id.replace('-section', '');
    showSection(sectionName);
  }
  showToast('Data refreshed', 'success');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSection('dashboard');
});
