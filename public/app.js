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

// Search for a specific quote by number
async function searchQuote() {
  const searchInput = document.getElementById('quote-search');
  const searchTerm = searchInput.value.trim();
  
  if (!searchTerm) {
    showToast('Enter a quote number to search', 'error');
    return;
  }
  
  showToast(`Searching for quote ${searchTerm}...`, 'info');
  
  try {
    const data = await api(`/draft-orders/search?q=${encodeURIComponent(searchTerm)}`);
    
    if (data.found && data.draftOrder) {
      const found = data.draftOrder;
      state.draftOrders = [found];
      const tbody = document.getElementById('quotes-table-body');
      tbody.innerHTML = `
        <tr>
          <td><input type="checkbox" class="quote-checkbox" data-id="${found.id}" onchange="toggleQuoteSelection(${found.id})"></td>
          <td><strong>${found.name}</strong></td>
          <td>${getCustomerName(found)}</td>
          <td>${found.email || found.customer?.email || '-'}</td>
          <td>${formatCurrency(found.total_price)}</td>
          <td>${formatDate(found.created_at)}</td>
          <td><span class="status-badge ${found.status}">${found.status}</span></td>
          <td>
            <button class="btn btn-sm btn-success" onclick="sendQuoteEmail(${found.id})" title="Generate invoice + email">Send</button>
            <button class="btn btn-sm btn-primary" onclick="createInvoice(${found.id})">Invoice</button>
            <button class="btn btn-sm btn-secondary" onclick="viewQuoteDetails(${found.id})">View</button>
          </td>
        </tr>
      `;
      showToast(`Found quote ${found.name}!`, 'success');
    } else {
      showToast(data.message || 'Quote not found', 'error');
    }
  } catch (error) {
    showToast('Search failed: ' + error.message, 'error');
  }
}

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
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionName);
  });
  
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === `${sectionName}-section`);
  });
  
  const titles = {
    dashboard: 'Dashboard',
    'create-quote': 'Create New Quote',
    quotes: 'Draft Quotes',
    invoices: 'Invoices',
    webhooks: 'Webhooks'
  };
  document.getElementById('page-title').textContent = titles[sectionName] || sectionName;
  
  switch (sectionName) {
    case 'dashboard': loadStats(); break;
    case 'quotes': loadDraftOrders(); break;
    case 'invoices': loadInvoices(); break;
    case 'webhooks': loadWebhooks(); break;
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
    
    const sortedOrders = data.draftOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    state.draftOrders = sortedOrders;
    state.selectedQuotes.clear();
    
    if (sortedOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading">No draft orders found</td></tr>';
      return;
    }
    
    tbody.innerHTML = sortedOrders.map(order => `
      <tr>
        <td><input type="checkbox" class="quote-checkbox" data-id="${order.id}" onchange="toggleQuoteSelection(${order.id})"></td>
        <td><strong>${order.name}</strong></td>
        <td>${getCustomerName(order)}</td>
        <td>${order.email || order.customer?.email || '-'}</td>
        <td>${formatCurrency(order.total_price)}</td>
        <td>${formatDate(order.created_at)}</td>
        <td><span class="status-badge ${order.status}">${order.status}</span></td>
        <td>
          <button class="btn btn-sm btn-success" onclick="sendQuoteEmail(${order.id})" title="Generate invoice + email">Send</button>
          <button class="btn btn-sm btn-primary" onclick="createInvoice(${order.id})">Invoice</button>
          <button class="btn btn-sm btn-secondary" onclick="viewQuoteDetails(${order.id})">View</button>
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
        <td><button class="btn btn-sm btn-primary" onclick="downloadInvoice('${invoice.invoiceNumber}')">Download PDF</button></td>
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
        <td><button class="btn btn-sm btn-danger" onclick="deleteWebhook(${webhook.id})">Delete</button></td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Failed to load webhooks</td></tr>';
  }
}

// Quote actions
function toggleQuoteSelection(id) {
  if (state.selectedQuotes.has(id)) state.selectedQuotes.delete(id);
  else state.selectedQuotes.add(id);
}

function toggleAllQuotes() {
  const selectAll = document.getElementById('select-all-quotes').checked;
  const checkboxes = document.querySelectorAll('.quote-checkbox');
  state.selectedQuotes.clear();
  checkboxes.forEach(cb => {
    cb.checked = selectAll;
    if (selectAll) state.selectedQuotes.add(parseInt(cb.dataset.id));
  });
}

async function createInvoice(draftOrderId) {
  showModal('Create Invoice', `
    <p>Create an invoice for this draft order?</p>
    <div style="margin-top: 16px;">
      <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <input type="checkbox" id="send-email-checkbox"> Send invoice email to customer
      </label>
      <label style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="complete-order-checkbox"> Complete draft order (convert to real order)
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
        <input type="checkbox" id="batch-send-email"> Send invoice emails to customers
      </label>
      <label style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="batch-complete-order"> Complete draft orders (convert to real orders)
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
    
    showToast(`Created ${data.successful} of ${data.processed} invoices`, data.failed > 0 ? 'error' : 'success');
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
    </div>
    <h4 style="margin-bottom: 8px; color: var(--text-secondary);">Line Items</h4>
    <table class="data-table" style="margin-bottom: 20px;">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${lineItems || '<tr><td colspan="4">No items</td></tr>'}</tbody>
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

function downloadInvoice(invoiceNumber) {
  window.open(`/api/invoices/${invoiceNumber}/download`, '_blank');
}

async function registerWebhooks() {
  showToast('Registering webhooks...', 'info');
  try {
    const data = await api('/webhooks/register', { method: 'POST' });
    const created = data.results.filter(r => r.status === 'created').length;
    const existing = data.results.filter(r => r.status === 'exists').length;
    const errors = data.results.filter(r => r.status === 'error').length;
    showToast(`Registered: ${created}, Already existed: ${existing}, Errors: ${errors}`, errors > 0 ? 'error' : 'success');
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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount) || 0);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getCustomerName(order) {
  if (order.customer) return `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Guest';
  if (order.billing_address) return order.billing_address.name || 'Guest';
  return 'Guest';
}

function showModal(title, bodyHtml, buttons = []) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = buttons.map(btn => 
    `<button class="btn ${btn.class}" onclick="${btn.onclick}">${btn.text}</button>`
  ).join('');
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

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

function refreshData() {
  const activeSection = document.querySelector('.section.active');
  if (activeSection) showSection(activeSection.id.replace('-section', ''));
  showToast('Data refreshed', 'success');
}

// Send Quote + Email
async function sendQuoteEmail(draftOrderId) {
  showToast('Generating invoice and email...', 'info');
  
  try {
    const invoiceData = await api(`/draft-orders/${draftOrderId}/create-invoice`, {
      method: 'POST',
      body: JSON.stringify({ sendEmail: false, completeOrder: false })
    });
    
    const emailData = await api(`/draft-orders/${draftOrderId}/generate-email`, { method: 'POST' });
    window.currentEmailData = emailData;
    
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
        <button class="btn btn-secondary" onclick="copyEmailToClipboard()">📋 Copy HTML</button>
        <button class="btn btn-secondary" onclick="copyEmailAsText()">📝 Copy as Text</button>
        <button class="btn btn-secondary" onclick="downloadInvoice('${invoiceData.invoice.invoiceNumber}')">📄 Download Invoice</button>
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
  navigator.clipboard.writeText(decodeURIComponent(document.getElementById('email-body-raw').value))
    .then(() => showToast('HTML email copied to clipboard!', 'success'));
}

function copyEmailAsText() {
  navigator.clipboard.writeText(document.getElementById('email-preview').innerText)
    .then(() => showToast('Plain text email copied to clipboard!', 'success'));
}

function openInGmail(to, subject) {
  const text = document.getElementById('email-preview').innerText;
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${encodeURIComponent(text)}`, '_blank');
  closeModal();
  showToast('Gmail opened - attach the invoice PDF!', 'info');
}

// ========== CREATE QUOTE FUNCTIONS ==========

const quoteLineItems = [];
let searchTimeout = null;
let selectedCustomerId = null;
let quoteShippingCost = 0;

async function searchCustomers(query) {
  const resultsDiv = document.getElementById('customer-search-results');
  if (!query || query.length < 2) { resultsDiv.classList.remove('active'); return; }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const data = await api(`/customers/search?q=${encodeURIComponent(query)}`);
      if (data.customers && data.customers.length > 0) {
        resultsDiv.innerHTML = data.customers.map(c => `
          <div class="search-result-item" onclick="selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})">
            <div class="title">${c.first_name || ''} ${c.last_name || ''}</div>
            <div class="subtitle">${c.email || 'No email'} | ${c.phone || 'No phone'}</div>
          </div>
        `).join('');
        resultsDiv.classList.add('active');
      } else {
        resultsDiv.innerHTML = '<div class="search-result-item"><div class="subtitle">No customers found</div></div>';
        resultsDiv.classList.add('active');
      }
    } catch (error) { console.error('Customer search error:', error); }
  }, 300);
}

function selectCustomer(customer) {
  selectedCustomerId = customer.id;
  document.getElementById('customer-first-name').value = customer.first_name || '';
  document.getElementById('customer-last-name').value = customer.last_name || '';
  document.getElementById('customer-email').value = customer.email || '';
  document.getElementById('customer-phone').value = customer.phone || '';
  
  if (customer.default_address) {
    const addr = customer.default_address;
    document.getElementById('shipping-address1').value = addr.address1 || '';
    document.getElementById('shipping-address2').value = addr.address2 || '';
    document.getElementById('shipping-city').value = addr.city || '';
    document.getElementById('shipping-state').value = addr.province || '';
    document.getElementById('shipping-zip').value = addr.zip || '';
  }
  
  document.getElementById('customer-search').value = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  document.getElementById('customer-search-results').classList.remove('active');
  showToast('Customer selected!', 'success');
}

async function searchProducts(query) {
  const resultsDiv = document.getElementById('product-search-results');
  if (!query || query.length < 2) { resultsDiv.classList.remove('active'); return; }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const data = await api(`/products/search?q=${encodeURIComponent(query)}`);
      if (data.products && data.products.length > 0) {
        resultsDiv.innerHTML = data.products.map(p => {
          const variant = p.variants?.[0];
          const price = variant?.price || '0.00';
          const image = p.image?.src || p.images?.[0]?.src || '';
          return `
            <div class="search-result-item" onclick='addProductToQuote(${JSON.stringify({
              id: p.id, variantId: variant?.id, title: p.title, price: price, image: image, sku: variant?.sku || ''
            }).replace(/'/g, "&#39;")})'>
              <div class="title">${p.title}</div>
              <div class="subtitle">${variant?.sku || 'No SKU'}</div>
              <div class="price">$${parseFloat(price).toFixed(2)}</div>
            </div>
          `;
        }).join('');
        resultsDiv.classList.add('active');
      } else {
        resultsDiv.innerHTML = '<div class="search-result-item"><div class="subtitle">No products found</div></div>';
        resultsDiv.classList.add('active');
      }
    } catch (error) { console.error('Product search error:', error); }
  }, 300);
}

function addProductToQuote(product) {
  const existing = quoteLineItems.find(item => item.variantId === product.variantId);
  if (existing) existing.quantity++;
  else quoteLineItems.push({ ...product, quantity: 1 });
  
  renderLineItems();
  document.getElementById('product-search').value = '';
  document.getElementById('product-search-results').classList.remove('active');
  showToast(`Added ${product.title}`, 'success');
}

function removeFromQuote(variantId) {
  const index = quoteLineItems.findIndex(item => item.variantId === variantId);
  if (index > -1) { quoteLineItems.splice(index, 1); renderLineItems(); }
}

function updateQuantity(variantId, quantity) {
  const item = quoteLineItems.find(i => i.variantId === variantId);
  if (item) { item.quantity = Math.max(1, parseInt(quantity) || 1); renderLineItems(); }
}

function updateShippingCost(value) {
  quoteShippingCost = parseFloat(value) || 0;
  updateQuoteTotals();
}

function updateQuoteTotals() {
  let subtotal = 0;
  quoteLineItems.forEach(item => subtotal += parseFloat(item.price) * item.quantity);
  const total = subtotal + quoteShippingCost;
  
  document.getElementById('quote-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('quote-shipping-display').textContent = quoteShippingCost > 0 ? `$${quoteShippingCost.toFixed(2)}` : 'Free';
  document.getElementById('quote-total').textContent = `$${total.toFixed(2)}`;
}

function renderLineItems() {
  const container = document.getElementById('quote-line-items');
  
  if (quoteLineItems.length === 0) {
    container.innerHTML = '<p class="empty-state">No products added yet. Search above to add products.</p>';
    updateQuoteTotals();
    return;
  }
  
  container.innerHTML = quoteLineItems.map(item => {
    const lineTotal = parseFloat(item.price) * item.quantity;
    return `
      <div class="line-item">
        <img src="${item.image || 'https://via.placeholder.com/60'}" alt="${item.title}" class="line-item-image">
        <div class="line-item-info">
          <div class="name">${item.title}</div>
          <div class="variant">${item.sku || ''}</div>
        </div>
        <div class="line-item-qty">
          <input type="number" value="${item.quantity}" min="1" onchange="updateQuantity(${item.variantId}, this.value)">
          <span>× $${parseFloat(item.price).toFixed(2)}</span>
        </div>
        <div class="line-item-price">$${lineTotal.toFixed(2)}</div>
        <button class="line-item-remove" onclick="removeFromQuote(${item.variantId})">×</button>
      </div>
    `;
  }).join('');
  
  updateQuoteTotals();
}

function clearQuoteForm() {
  selectedCustomerId = null;
  quoteLineItems.length = 0;
  quoteShippingCost = 0;
  
  ['customer-search', 'customer-first-name', 'customer-last-name', 'customer-email', 'customer-phone',
   'shipping-address1', 'shipping-address2', 'shipping-city', 'shipping-state', 'shipping-zip', 'quote-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const shippingInput = document.getElementById('shipping-cost');
  if (shippingInput) shippingInput.value = '0';
  
  renderLineItems();
  showToast('Form cleared', 'info');
}

async function createQuote() {
  if (quoteLineItems.length === 0) { showToast('Please add at least one product', 'error'); return; }
  
  const email = document.getElementById('customer-email').value;
  if (!email) { showToast('Customer email is required', 'error'); return; }
  
  showToast('Creating quote in Shopify...', 'info');
  
  try {
    const shippingInput = document.getElementById('shipping-cost');
    const shippingCost = shippingInput ? parseFloat(shippingInput.value) || 0 : quoteShippingCost;
    
    const quoteData = {
      customer: selectedCustomerId ? { id: selectedCustomerId } : {
        firstName: document.getElementById('customer-first-name').value,
        lastName: document.getElementById('customer-last-name').value,
        email: email,
        phone: document.getElementById('customer-phone').value
      },
      email: email,
      lineItems: quoteLineItems.map(item => ({
        variantId: item.variantId,
        productId: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price
      })),
      shippingAddress: {
        firstName: document.getElementById('customer-first-name').value,
        lastName: document.getElementById('customer-last-name').value,
        address1: document.getElementById('shipping-address1').value,
        address2: document.getElementById('shipping-address2').value,
        city: document.getElementById('shipping-city').value,
        state: document.getElementById('shipping-state').value,
        zip: document.getElementById('shipping-zip').value,
        country: 'US',
        phone: document.getElementById('customer-phone').value
      },
      shippingCost: shippingCost,
      note: document.getElementById('quote-notes').value
    };
    
    console.log('Sending quote data:', quoteData);
    
    const result = await api('/draft-orders', {
      method: 'POST',
      body: JSON.stringify(quoteData)
    });
    
    showToast(`Quote ${result.draftOrder.name} created successfully!`, 'success');
    clearQuoteForm();
    loadDraftOrders();
    showSection('quotes');
    
    return result.draftOrder;
  } catch (error) {
    showToast('Failed to create quote: ' + error.message, 'error');
    return null;
  }
}

async function createQuoteAndSend() {
  const draftOrder = await createQuote();
  if (draftOrder) {
    setTimeout(async () => { await sendQuoteEmail(draftOrder.id); }, 1000);
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-container')) {
    document.querySelectorAll('.search-results').forEach(el => el.classList.remove('active'));
  }
});

document.addEventListener('DOMContentLoaded', () => { showSection('dashboard'); });
