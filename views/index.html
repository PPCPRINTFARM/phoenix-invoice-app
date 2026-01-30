<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phoenix Invoice Manager | Shopify Quotes to Invoices</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="app">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>Phoenix<br>Invoice</span>
      </div>
      
      <nav class="nav">
        <a href="#" class="nav-item active" data-section="dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </a>
        <a href="#" class="nav-item" data-section="quotes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          Draft Quotes
        </a>
        <a href="#" class="nav-item" data-section="invoices">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
          </svg>
          Invoices
        </a>
        <a href="#" class="nav-item" data-section="webhooks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Webhooks
        </a>
      </nav>
      
      <div class="sidebar-footer">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>Connected to Shopify</span>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main">
      <!-- Header -->
      <header class="header">
        <div class="header-title">
          <h1 id="page-title">Dashboard</h1>
          <p class="subtitle">Manage your Shopify quotes and invoices</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="refreshData()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <!-- Dashboard Section -->
      <section id="dashboard-section" class="section active">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon orange">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div class="stat-content">
              <h3 id="stat-quotes">0</h3>
              <p>Open Quotes</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div class="stat-content">
              <h3 id="stat-quote-value">$0</h3>
              <p>Quote Pipeline</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <div class="stat-content">
              <h3 id="stat-invoices">0</h3>
              <p>Invoices Generated</p>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <div class="stat-content">
              <h3 id="stat-revenue">$0</h3>
              <p>30-Day Revenue</p>
            </div>
          </div>
        </div>

        <div class="recent-activity">
          <h2>Quick Actions</h2>
          <div class="action-cards">
            <div class="action-card" onclick="showSection('quotes')">
              <div class="action-icon">📋</div>
              <h3>View Draft Quotes</h3>
              <p>Browse and convert your Shopify draft orders to invoices</p>
            </div>
            <div class="action-card" onclick="showSection('invoices')">
              <div class="action-icon">📄</div>
              <h3>Manage Invoices</h3>
              <p>View, download, and send generated invoices</p>
            </div>
            <div class="action-card" onclick="showSection('webhooks')">
              <div class="action-icon">🔔</div>
              <h3>Webhook Status</h3>
              <p>Monitor real-time Shopify event notifications</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Quotes Section -->
      <section id="quotes-section" class="section">
        <div class="section-header">
          <h2>Draft Quotes</h2>
          <div class="section-actions">
            <select id="quote-status-filter" onchange="loadDraftOrders()">
              <option value="any" selected>All Drafts</option>
              <option value="open">Open</option>
              <option value="invoice_sent">Invoice Sent</option>
              <option value="completed">Completed</option>
            </select>
            <button class="btn btn-primary" onclick="batchCreateInvoices()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Create Selected Invoices
            </button>
          </div>
        </div>
        
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" id="select-all-quotes" onchange="toggleAllQuotes()"></th>
                <th>Quote #</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Total</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="quotes-table-body">
              <tr><td colspan="8" class="loading">Loading quotes...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Invoices Section -->
      <section id="invoices-section" class="section">
        <div class="section-header">
          <h2>Generated Invoices</h2>
        </div>
        
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="invoices-table-body">
              <tr><td colspan="3" class="loading">Loading invoices...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Webhooks Section -->
      <section id="webhooks-section" class="section">
        <div class="section-header">
          <h2>Webhook Configuration</h2>
          <button class="btn btn-primary" onclick="registerWebhooks()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Register Webhooks
          </button>
        </div>
        
        <div class="webhook-info">
          <div class="info-card">
            <h3>Supported Webhook Events</h3>
            <ul class="webhook-topics">
              <li><span class="topic">draft_orders/create</span> - New quote created</li>
              <li><span class="topic">draft_orders/update</span> - Quote modified or converted</li>
              <li><span class="topic">draft_orders/delete</span> - Quote deleted</li>
              <li><span class="topic">orders/create</span> - New order created</li>
              <li><span class="topic">orders/paid</span> - Order payment received</li>
              <li><span class="topic">orders/fulfilled</span> - Order shipped</li>
            </ul>
          </div>
        </div>
        
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Topic</th>
                <th>Address</th>
                <th>Format</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="webhooks-table-body">
              <tr><td colspan="5" class="loading">Loading webhooks...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <!-- Modal -->
  <div id="modal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modal-title">Modal Title</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
      <div class="modal-footer" id="modal-footer"></div>
    </div>
  </div>

  <!-- Toast notifications -->
  <div id="toast-container"></div>

  <script src="/app.js"></script>
</body>
</html>
