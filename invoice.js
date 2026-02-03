/**
 * Invoice Service - Phoenix Phase Converters Style
 * Generates professional invoices matching the PPC quote template
 * FIXED: Multiple products, discounts, shipping
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const QRCode = require('qrcode');

class InvoiceService {
  constructor() {
    this.invoiceDir = path.join(__dirname, '..', 'invoices');
    this.assetsDir = path.join(__dirname, '..', 'assets');
    this.ensureDirectories();
    
    // Phoenix brand colors
    this.colors = {
      navyBlue: '#0d3b66',
      darkBlue: '#1a365d',
      lightBlue: '#e8f4f8',
      orange: '#f97316',
      gold: '#f59e0b',
      textDark: '#1f2937',
      textMuted: '#6b7280',
      white: '#ffffff',
      borderGray: '#e5e7eb',
      green: '#10b981',
      red: '#ef4444'
    };
  }

  ensureDirectories() {
    if (!fs.existsSync(this.invoiceDir)) {
      fs.mkdirSync(this.invoiceDir, { recursive: true });
    }
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
    }
  }

  async downloadImage(url, filename) {
    return new Promise((resolve, reject) => {
      if (!url) {
        resolve(null);
        return;
      }
      const filepath = path.join(this.assetsDir, filename);
      
      if (fs.existsSync(filepath)) {
        resolve(filepath);
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(filepath);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          this.downloadImage(response.headers.location, filename)
            .then(resolve)
            .catch(reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filepath);
        });
      }).on('error', (err) => {
        fs.unlink(filepath, () => {});
        resolve(null);
      });
    });
  }

  generateInvoiceNumber(draftOrderId) {
    const prefix = process.env.INVOICE_PREFIX || 'INV-';
    return `${prefix}${draftOrderId}`;
  }

  draftOrderToInvoice(draftOrder) {
    const subtotal = parseFloat(draftOrder.subtotal_price) || 0;
    
    // Get shipping from shipping_line (more reliable)
    let shippingCost = 0;
    let shippingTitle = 'Shipping';
    if (draftOrder.shipping_line) {
      shippingCost = parseFloat(draftOrder.shipping_line.price) || 0;
      shippingTitle = draftOrder.shipping_line.title || 'Shipping';
    } else if (draftOrder.total_shipping_price_set?.shop_money?.amount) {
      shippingCost = parseFloat(draftOrder.total_shipping_price_set.shop_money.amount) || 0;
    }
    
    // Get discount
    let discountAmount = 0;
    let discountTitle = 'Discount';
    if (draftOrder.applied_discount) {
      discountAmount = parseFloat(draftOrder.applied_discount.amount) || 0;
      discountTitle = draftOrder.applied_discount.title || draftOrder.applied_discount.description || 'Discount';
    } else if (draftOrder.total_discounts) {
      discountAmount = parseFloat(draftOrder.total_discounts) || 0;
    }
    
    const total = parseFloat(draftOrder.total_price) || (subtotal + shippingCost - discountAmount);
    
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    return {
      invoiceNumber: this.generateInvoiceNumber(draftOrder.id),
      quoteNumber: draftOrder.name || `Q-${draftOrder.id}`,
      draftOrderId: draftOrder.id,
      createdAt: new Date().toISOString(),
      quoteDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      validUntil: validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      dueDate: validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      
      company: {
        name: 'Phoenix Phase Converters',
        address: '12518 Graceham Road',
        city: 'Thurmont, MD 21788',
        country: 'United States',
        phone: '+1 800 417 6568',
        email: 'support@phoenixphaseconverters.com',
        website: 'www.phoenixphaseconverters.com'
      },
      
      customer: {
        name: draftOrder.customer?.first_name 
          ? `${draftOrder.customer.first_name} ${draftOrder.customer.last_name || ''}`
          : draftOrder.billing_address?.name || 'Customer',
        company: draftOrder.billing_address?.company || '',
        address1: draftOrder.billing_address?.address1 || '',
        city: draftOrder.billing_address?.city || '',
        state: draftOrder.billing_address?.province_code || '',
        zip: draftOrder.billing_address?.zip || '',
        email: draftOrder.customer?.email || draftOrder.email || '',
        phone: draftOrder.customer?.phone || draftOrder.billing_address?.phone || ''
      },
      
      shipping: {
        name: draftOrder.shipping_address?.name || (draftOrder.customer?.first_name 
          ? `${draftOrder.customer?.first_name || ''} ${draftOrder.customer?.last_name || ''}`
          : 'Customer'),
        company: draftOrder.shipping_address?.company || '',
        address1: draftOrder.shipping_address?.address1 || '',
        city: draftOrder.shipping_address?.city || '',
        state: draftOrder.shipping_address?.province_code || '',
        zip: draftOrder.shipping_address?.zip || '',
        phone: draftOrder.shipping_address?.phone || ''
      },
      
      lineItems: (draftOrder.line_items || []).map(item => ({
        id: item.id,
        title: item.title,
        variantTitle: item.variant_title,
        sku: item.sku || '',
        quantity: item.quantity,
        price: parseFloat(item.price),
        total: parseFloat(item.price) * item.quantity,
        image: item.image?.src || null,
        productId: item.product_id
      })),
      
      subtotal,
      shippingCost,
      shippingTitle,
      discountAmount,
      discountTitle,
      taxAmount: 0,
      total,
      currency: draftOrder.currency || 'USD',
      
      invoiceNotes: [
        'Free shipping to the contiguous USA on most orders',
        'American-made with LIFETIME WARRANTY',
        '24/7 technical support included'
      ],
      personalMessage: {
        from: 'Glen',
        message: 'We appreciate the opportunity to work with you!'
      }
    };
  }

  formatCurrency(amount) {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  async generatePDF(invoice) {
    return new Promise(async (resolve, reject) => {
      const filename = `${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(this.invoiceDir, filename);
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margin: 40,
        autoFirstPage: true
      });
      
      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      const pageWidth = 612;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      try {
        // ========== HEADER ==========
        
        // Phoenix Logo
        const logoUrl = 'https://cdn.shopify.com/s/files/1/0680/2538/5243/files/Screenshot_2026-01-29_at_8.35.29_PM.png?v=1769744152';
        try {
          const logoPath = await this.downloadImage(logoUrl, 'phoenix-logo.png');
          if (logoPath && fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, 35, { width: 150 });
          } else {
            doc.font('Helvetica-Bold').fontSize(24).fillColor(this.colors.navyBlue)
               .text('PHOENIX', margin, 40);
            doc.font('Helvetica').fontSize(10).fillColor(this.colors.orange)
               .text('PHASE CONVERTERS', margin, 65);
          }
        } catch (logoErr) {
          doc.font('Helvetica-Bold').fontSize(24).fillColor(this.colors.navyBlue)
             .text('PHOENIX', margin, 40);
          doc.font('Helvetica').fontSize(10).fillColor(this.colors.orange)
             .text('PHASE CONVERTERS', margin, 65);
        }
        
        // QUOTE Title
        doc.font('Helvetica-Bold').fontSize(36).fillColor(this.colors.navyBlue)
           .text('QUOTE', margin, 95);
        
        // Contact info
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.navyBlue);
        doc.text(invoice.company.phone, margin, 130);
        doc.text(invoice.company.email, margin + 100, 130);
        
        // Quote details - right side
        const rightCol = pageWidth - margin - 180;
        doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark);
        doc.text(`Quote #: ${invoice.quoteNumber}`, rightCol, 45);
        doc.text(`Date: ${invoice.quoteDate}`, rightCol, 60);
        doc.text(`Valid Until: ${invoice.validUntil}`, rightCol, 75);

        // ========== BILL TO / SHIP TO ==========
        
        let y = 150;
        
        // Bill To Box
        doc.rect(margin, y, 250, 85).fill(this.colors.lightBlue);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.navyBlue)
           .text('Bill To:', margin + 10, y + 8);
        
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.textDark)
           .text(invoice.customer.name, margin + 10, y + 22);
        
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.textDark);
        let billY = y + 36;
        if (invoice.customer.company) {
          doc.text(invoice.customer.company, margin + 10, billY, { width: 230 });
          billY += 12;
        }
        if (invoice.customer.address1) {
          doc.text(invoice.customer.address1, margin + 10, billY, { width: 230 });
          billY += 12;
        }
        if (invoice.customer.city) {
          doc.text(`${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.zip}`, margin + 10, billY, { width: 230 });
          billY += 12;
        }
        if (invoice.customer.email) {
          doc.text(invoice.customer.email, margin + 10, billY, { width: 230 });
        }
        
        // Ship To Box
        const shipX = margin + 270;
        doc.rect(shipX, y, 250, 85).fill(this.colors.lightBlue);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.navyBlue)
           .text('Ship To:', shipX + 10, y + 8);
        
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.textDark)
           .text(invoice.shipping.name || invoice.customer.name, shipX + 10, y + 22);
        
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.textDark);
        let shipY = y + 36;
        if (invoice.shipping.company) {
          doc.text(invoice.shipping.company, shipX + 10, shipY, { width: 230 });
          shipY += 12;
        }
        if (invoice.shipping.address1) {
          doc.text(invoice.shipping.address1, shipX + 10, shipY, { width: 230 });
          shipY += 12;
        }
        if (invoice.shipping.city) {
          doc.text(`${invoice.shipping.city}, ${invoice.shipping.state} ${invoice.shipping.zip}`, shipX + 10, shipY, { width: 230 });
          shipY += 12;
        }
        if (invoice.shipping.phone) {
          doc.text(invoice.shipping.phone, shipX + 10, shipY, { width: 230 });
        }

        // ========== PRODUCT TABLE ==========
        
        y = 250;
        
        // Table Header
        doc.rect(margin, y, contentWidth, 22).fill(this.colors.navyBlue);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(this.colors.white);
        doc.text('Product', margin + 10, y + 7);
        doc.text('QTY', margin + 320, y + 7, { width: 50, align: 'center' });
        doc.text('PRICE', margin + 380, y + 7, { width: 60, align: 'center' });
        doc.text('TOTAL', margin + 450, y + 7, { width: 70, align: 'right' });
        
        y += 22;
        
        // ===== ALL LINE ITEMS =====
        for (let i = 0; i < invoice.lineItems.length; i++) {
          const item = invoice.lineItems[i];
          
          // Alternate row background
          if (i % 2 === 1) {
            doc.rect(margin, y, contentWidth, 40).fill('#f8fafc');
          }
          
          // Product name
          doc.font('Helvetica-Bold').fontSize(9).fillColor(this.colors.textDark)
             .text(item.title, margin + 10, y + 5, { width: 290 });
          
          // SKU if available
          if (item.sku) {
            doc.font('Helvetica').fontSize(8).fillColor(this.colors.textMuted)
               .text(item.sku, margin + 10, y + 18, { width: 290 });
          }
          
          // Qty, Price, Total
          doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark)
             .text(item.quantity.toString(), margin + 320, y + 12, { width: 50, align: 'center' })
             .text(this.formatCurrency(item.price), margin + 380, y + 12, { width: 60, align: 'center' })
             .text(this.formatCurrency(item.total), margin + 450, y + 12, { width: 70, align: 'right' });
          
          y += 40;
          
          // Check if we need a new page
          if (y > 600) {
            doc.addPage();
            y = 50;
          }
        }
        
        // Line under products
        doc.moveTo(margin, y).lineTo(margin + contentWidth, y)
           .strokeColor(this.colors.borderGray).lineWidth(1).stroke();

        // ========== TOTALS ==========
        
        y += 15;
        const totalsX = margin + 300;
        const totalsValueX = margin + 450;
        
        // Subtotal
        doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark);
        doc.text('Subtotal:', totalsX, y, { width: 100 });
        doc.text(this.formatCurrency(invoice.subtotal), totalsValueX, y, { width: 70, align: 'right' });
        
        // Discount (if any)
        if (invoice.discountAmount > 0) {
          y += 18;
          doc.font('Helvetica').fontSize(10).fillColor(this.colors.green);
          doc.text(invoice.discountTitle + ':', totalsX, y, { width: 140 });
          doc.text('-' + this.formatCurrency(invoice.discountAmount), totalsValueX, y, { width: 70, align: 'right' });
        }
        
        // Shipping
        y += 18;
        doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark);
        const shippingLabel = invoice.shippingTitle || 'Shipping';
        doc.text(shippingLabel + ':', totalsX, y, { width: 140 });
        doc.text(invoice.shippingCost > 0 ? this.formatCurrency(invoice.shippingCost) : 'Free', totalsValueX, y, { width: 70, align: 'right' });
        
        // Tax (if any)
        if (invoice.taxAmount > 0) {
          y += 18;
          doc.text('Tax:', totalsX, y, { width: 100 });
          doc.text(this.formatCurrency(invoice.taxAmount), totalsValueX, y, { width: 70, align: 'right' });
        }
        
        // Total
        y += 25;
        doc.font('Helvetica-Bold').fontSize(14).fillColor(this.colors.navyBlue);
        doc.text('Total:', totalsX, y);
        doc.text(this.formatCurrency(invoice.total), totalsValueX - 20, y, { width: 90, align: 'right' });

        // ========== NOTES SECTION ==========
        
        y += 45;
        
        // Notes box
        doc.rect(margin, y, 280, 18).fill(this.colors.navyBlue);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(this.colors.white)
           .text('NOTES:', margin + 10, y + 5);
        
        y += 25;
        doc.font('Helvetica').fontSize(8).fillColor(this.colors.textDark);
        for (const note of invoice.invoiceNotes) {
          doc.text('• ' + note, margin + 10, y, { width: 260 });
          y += 12;
        }
        
        // Personal message
        y += 5;
        doc.font('Helvetica-Bold').fontSize(10)
           .text(invoice.personalMessage.from, margin + 10, y);
        y += 14;
        doc.font('Helvetica').fontSize(9)
           .text(invoice.personalMessage.message, margin + 10, y, { width: 260 });

        // QR Code
        const qrX = margin + 400;
        const qrY = y - 70;
        
        const paymentUrl = `https://phoenixphaseconverters.com/checkout?quote=${invoice.quoteNumber}`;
        try {
          const qrDataUrl = await QRCode.toDataURL(paymentUrl, {
            width: 70,
            margin: 1,
            color: { dark: '#0d3b66', light: '#ffffff' }
          });
          const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
          doc.image(qrBuffer, qrX, qrY, { width: 70, height: 70 });
        } catch (qrErr) {
          doc.rect(qrX, qrY, 70, 70).lineWidth(1).strokeColor(this.colors.navyBlue).stroke();
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor(this.colors.navyBlue)
           .text('PAY ONLINE', qrX, qrY + 75, { width: 70, align: 'center' });

        // ========== PAYMENT METHODS BAR ==========
        
        y += 50;
        if (y < 700) { // Make sure we have room
          doc.rect(margin, y, contentWidth, 25).fill('#f1f5f9');
          doc.font('Helvetica-Bold').fontSize(9);
          doc.fillColor('#003087').text('PayPal', margin + 15, y + 8);
          doc.fillColor('#1a1f71').text('VISA', margin + 70, y + 8);
          doc.fillColor(this.colors.textDark).text('MC', margin + 110, y + 8);
          doc.fillColor(this.colors.textDark).text('Bank', margin + 150, y + 8);
          doc.fillColor('#ff6000').text('DISCOVER', margin + 200, y + 8);
        }

        // ========== FOOTER ==========
        
        y += 35;
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.textMuted);
        doc.text(invoice.company.email, margin, y);
        doc.text(invoice.company.phone, margin, y + 12);
        doc.text(invoice.company.website, margin + 300, y);

        doc.end();

        writeStream.on('finish', () => {
          resolve({ filename, filepath, invoice });
        });

        writeStream.on('error', reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  getInvoice(invoiceNumber) {
    const filepath = path.join(this.invoiceDir, `${invoiceNumber}.pdf`);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    return null;
  }

  listInvoices() {
    const files = fs.readdirSync(this.invoiceDir);
    return files
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        filename: f,
        invoiceNumber: f.replace('.pdf', ''),
        filepath: path.join(this.invoiceDir, f),
        createdAt: fs.statSync(path.join(this.invoiceDir, f)).birthtime
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

module.exports = new InvoiceService();
