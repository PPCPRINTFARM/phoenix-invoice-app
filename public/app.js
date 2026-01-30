/**
 * Phoenix Invoice App - Frontend JavaScript
 */

// State management
const state = {
  draftOrders: [],
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
    
    // Sort by created_at descending (newest first)
    const sortedOrders = data.draftOrders.sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    state.draftOrders = sortedOrders;
    state.selectedQuotes.clear();
    
    if (sortedOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading">No draft orders found</td></tr>';
      return;
    }
    
    tbody.innerHTML = sortedOrders.map(order => `
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
          <button class="btn btn-sm btn-success" onclick="sendQuoteEmail(${order.id})" title="Generate invoice + email">
            Send
          </button>
          <button class="btn btn-sm btn-primary" onclick="createInvoice(${order.id})">
            Invoice
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

// Send Quote + Email
async function sendQuoteEmail(draftOrderId) {
  showToast('Generating invoice and email...', 'info');
  
  try {
    // First generate the invoice
    const invoiceData = await api(`/draft-orders/${draftOrderId}/create-invoice`, {
      method: 'POST',
      body: JSON.stringify({ sendEmail: false, completeOrder: false })
    });
    
    // Then generate the email
    const emailData = await api(`/draft-orders/${draftOrderId}/generate-email`, {
      method: 'POST'
    });
    
    // Store email data for copy/gmail functions
    window.currentEmailData = emailData;
    
    // Show modal with HTML email preview and download option
    showModal('Send Quote Email', `
      <div style="margin-bottom: 16px;">
        <strong>To:</strong> ${emailData.to}<br>
        <strong>Subject:</strong> ${emailData.subject}
      </div>
      <div style="margin-bottom: 16px;">
        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Email Preview:</label>
        <div id="email-preview" style="background: white; color: #333; padding: 20px; border-radius: 8px; max-height: 400px; overflow-y: auto; border: 1px solid #374151;">
          ${emailData.body}
        </div>
        <input type="hidden" id="email-body-raw" value="${encodeURIComponent(emailData.body)}">
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-secondary" onclick="copyEmailToClipboard()">
          📋 Copy HTML
        </button>
        <button class="btn btn-secondary" onclick="copyEmailAsText()">
          📝 Copy as Text
        </button>
        <button class="btn btn-secondary" onclick="downloadInvoice('${invoiceData.invoice.invoiceNumber}')">
          📄 Download Invoice
        </button>
      </div>
    `, [
      { text: 'Cancel', class: 'btn-secondary', onclick: 'closeModal()' },
      { text: 'Open in Gmail', class: 'btn-primary', onclick: `openInGmail('${emailData.to}', '${encodeURIComponent(emailData.subject)}')` }
    ]);
    
  } catch (error) {
    showToast('Failed to generate email: ' + error.message, 'error');
  }
}

function copyEmailToClipboard() {
  const emailBody = decodeURIComponent(document.getElementById('email-body-raw').value);
  navigator.clipboard.writeText(emailBody).then(() => {
    showToast('HTML email copied to clipboard!', 'success');
  });
}

function copyEmailAsText() {
  const emailPreview = document.getElementById('email-preview');
  const textContent = emailPreview.innerText || emailPreview.textContent;
  navigator.clipboard.writeText(textContent).then(() => {
    showToast('Plain text email copied to clipboard!', 'success');
  });
}

function openInGmail(to, subject) {
  const emailPreview = document.getElementById('email-preview');
  const textContent = emailPreview.innerText || emailPreview.textContent;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${encodeURIComponent(textContent)}`;
  window.open(gmailUrl, '_blank');
  closeModal();
  showToast('Gmail opened - attach the invoice PDF!', 'info');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSection('dashboard');
});
