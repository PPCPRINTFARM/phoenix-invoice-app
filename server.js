/**
 * Phoenix Invoice App - Shopify Draft Quote to Invoice Converter
 * Main Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for easier development
}));

// Logging
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
  origin: [
    process.env.APP_URL,
    `https://${process.env.SHOPIFY_STORE_URL}`,
    'http://localhost:3000'
  ],
  credentials: true
}));

// Webhooks need raw body for signature verification
app.use('/webhooks', bodyParser.raw({ type: 'application/json' }));

// JSON parsing for other routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

// Serve admin dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     Phoenix Invoice App - Shopify Integration             ║
║     Server running on port ${PORT}                           ║
║     Dashboard: http://localhost:${PORT}                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Initialize webhooks on startup
  const shopifyService = require('./services/shopify');
  shopifyService.registerWebhooks().catch(err => {
    console.error('Failed to register webhooks:', err.message);
  });
});

module.exports = app;
