/**
 * Invoice Service - Phoenix Phase Converters Style
 * Generates professional invoices matching the PPC quote template
 * FIXED: Single page layout
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
      borderGray: '#e5e7eb'
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
    const taxRate = parseFloat(process.env.TAX_RATE) || 0.06;
    const subtotal = parseFloat(draftOrder.subtotal_price) || 0;
    const shippingCost = parseFloat(draftOrder.total_shipping_price_set?.shop_money?.amount) || 0;
    const taxAmount = parseFloat(draftOrder.total_tax) || (subtotal * taxRate);
    const total = subtotal + taxAmount + shippingCost - (parseFloat(draftOrder.total_discounts) || 0);

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

      lineItems: (draftOrder.line_items || []).map(item => ({
        id: item.id,
        title: item.title,
        variantTitle: item.variant_title,
        quantity: item.quantity,
        price: parseFloat(item.price),
        total: parseFloat(item.price) * item.quantity,
        image: item.image?.src || null,
        productId: item.product_id,
        features: this.getProductFeatures(item.title)
      })),

      subtotal,
      taxRate,
      taxAmount,
      shippingCost,
      discount: parseFloat(draftOrder.total_discounts) || 0,
      total,
      currency: draftOrder.currency || 'USD',

      invoiceNotes: [
        'Free shipping to the contiguous USA',
        'USA-made parts with 5-year warranty',
        '24/7 technical support included'
      ],

      personalMessage: {
        from: 'Glen',
        message: 'We appreciate the opportunity to work with you!'
      }
    };
  }

  getProductFeatures(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('fx20') || titleLower.includes('heavy duty digital')) {
      return [
        'Powers 20-60 HP machines',
        '100% cold digital start',
        'Fully automated digital controls',
        'Indoor/outdoor enclosure'
      ];
    }
    
    if (titleLower.includes('rotary') || titleLower.includes('rpc')) {
      return [
        'True 3-phase power output',
        'CNC & compressor compatible',
        'Heavy-duty construction',
        '5-year warranty'
      ];
    }
    
    return [
      'American-made quality',
      'Professional-grade',
      'Easy installation',
      '5-year warranty'
    ];
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
        
        // Phoenix Logo Text
        doc.font('Helvetica-Bold')
           .fontSize(24)
           .fillColor(this.colors.navyBlue)
           .text('PHOENIX', margin, 40);
        
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.orange)
           .text('PHASE CONVERTERS', margin, 65);
        
        // QUOTE Title
        doc.font('Helvetica-Bold')
           .fontSize(36)
           .fillColor(this.colors.navyBlue)
           .text('QUOTE', margin, 85);
        
        // Quote details - right side
        const rightCol = pageWidth - margin - 180;
        doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark);
        doc.text(`Quote #: ${invoice.quoteNumber}`, rightCol, 40);
        doc.text(`Date: ${invoice.quoteDate}`, rightCol, 55);
        doc.text(`Valid Until: ${invoice.validUntil}`, rightCol, 70);

        // ========== BILL TO / COMPANY ==========
        
        let y = 130;
        
        // Bill To Box
        doc.rect(margin, y, 240, 85).fill(this.colors.lightBlue);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.navyBlue)
           .text('Bill To:', margin + 10, y + 8);
        
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.textDark)
           .text(invoice.customer.name, margin + 10, y + 22);
        
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.textDark);
        let billY = y + 36;
        if (invoice.customer.company) {
          doc.text(invoice.customer.company, margin + 10, billY);
          billY += 12;
        }
        if (invoice.customer.address1) {
          doc.text(invoice.customer.address1, margin + 10, billY);
          billY += 12;
        }
        if (invoice.customer.city) {
          doc.text(`${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.zip}`, margin + 10, billY);
          billY += 12;
        }
        if (invoice.customer.email) {
          doc.text(invoice.customer.email, margin + 10, billY);
        }
        
        // Company Box
        const companyX = margin + 260;
        doc.rect(companyX, y, 240, 85).fill(this.colors.lightBlue);
        
        doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.navyBlue)
           .text(invoice.company.name, companyX + 10, y + 8);
        
        doc.font('Helvetica').fontSize(9).fillColor(this.colors.textDark)
           .text(invoice.company.address, companyX + 10, y + 24)
           .text(invoice.company.city + ', ' + invoice.company.country, companyX + 10, y + 36);
        
        doc.fillColor(this.colors.navyBlue)
           .text(invoice.company.email, companyX + 10, y + 52)
           .text(invoice.company.phone, companyX + 10, y + 64);

        // ========== PRODUCT TABLE ==========
        
        y = 230;
        
        // Table Header
        doc.rect(margin, y, contentWidth, 22).fill(this.colors.navyBlue);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(this.colors.white);
        doc.text('Product', margin + 10, y + 7);
        doc.text('QTY', margin + 340, y + 7, { width: 40, align: 'center' });
        doc.text('PRICE', margin + 390, y + 7, { width: 60, align: 'center' });
        doc.text('TOTAL', margin + 460, y + 7, { width: 60, align: 'right' });
        
        y += 22;
        
        // Product Row (first item only for single page)
        const item = invoice.lineItems[0];
        if (item) {
          // Try to download and display product image
          let productImagePath = null;
          if (item.image) {
            try {
              const imageFilename = `product_${item.id}.jpg`;
              productImagePath = await this.downloadImage(item.image, imageFilename);
            } catch (imgErr) {
              console.log('Could not download product image:', imgErr.message);
            }
          }
          
          // Product name (narrower if we have an image)
          const titleWidth = productImagePath ? 220 : 300;
          doc.font('Helvetica-Bold').fontSize(10).fillColor(this.colors.textDark)
             .text(item.title, margin + 10, y + 8, { width: titleWidth });
          
          // Qty, Price, Total
          doc.font('Helvetica').fontSize(10)
             .text(item.quantity.toString(), margin + 340, y + 8, { width: 40, align: 'center' })
             .text(this.formatCurrency(item.price), margin + 390, y + 8, { width: 60, align: 'center' })
             .text(this.formatCurrency(item.total), margin + 460, y + 8, { width: 60, align: 'right' });
          
          // Features
          const featuresStartY = y + 30;
          y += 30;
          doc.font('Helvetica').fontSize(8).fillColor(this.colors.textMuted);
          for (const feature of item.features.slice(0, 4)) {
            doc.text('• ' + feature, margin + 10, y, { width: titleWidth });
            y += 11;
          }
          
          // Product image on the right side of product info
          if (productImagePath && fs.existsSync(productImagePath)) {
            try {
              doc.image(productImagePath, margin + 240, featuresStartY - 22, { 
                width: 80,
                height: 80,
                fit: [80, 80]
              });
            } catch (imgErr) {
              console.log('Could not embed product image:', imgErr.message);
            }
          }
        }
        
        // Line under product
        y += 10;
        doc.moveTo(margin, y).lineTo(margin + contentWidth, y)
           .strokeColor(this.colors.borderGray).lineWidth(1).stroke();

        // ========== TOTALS ==========
        
        y += 15;
        const totalsX = margin + 320;
        
        // Subtotal
        doc.font('Helvetica').fontSize(10).fillColor(this.colors.textDark);
        doc.text('Subtotal:', totalsX, y);
        doc.text(this.formatCurrency(invoice.subtotal), totalsX + 120, y, { width: 80, align: 'right' });
        
        y += 18;
        doc.text('Shipping:', totalsX, y);
        doc.text(invoice.shippingCost > 0 ? this.formatCurrency(invoice.shippingCost) : 'Free', totalsX + 120, y, { width: 80, align: 'right' });
        
        y += 18;
        const taxPercent = Math.round(invoice.taxRate * 100);
        doc.text(`Tax (${taxPercent}%):`, totalsX, y);
        doc.text(this.formatCurrency(invoice.taxAmount), totalsX + 120, y, { width: 80, align: 'right' });
        
        y += 22;
        doc.font('Helvetica-Bold').fontSize(14).fillColor(this.colors.navyBlue);
        doc.text('Total:', totalsX, y);
        doc.text(this.formatCurrency(invoice.total), totalsX + 100, y, { width: 100, align: 'right' });

        // ========== NOTES SECTION ==========
        
        y += 40;
        
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

        // QR Code (right side) - link to payment page
        const qrX = margin + 400;
        const qrY = y - 70;
        
        // Generate QR code linking to payment/checkout page
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
          // Fallback: draw empty box if QR fails
          doc.rect(qrX, qrY, 70, 70).lineWidth(1).strokeColor(this.colors.navyBlue).stroke();
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor(this.colors.navyBlue)
           .text('PAY ONLINE', qrX, qrY + 75, { width: 70, align: 'center' });

        // ========== PAYMENT METHODS BAR ==========
        
        y += 50;
        doc.rect(margin, y, contentWidth, 25).fill('#f1f5f9');
        doc.font('Helvetica-Bold').fontSize(9);
        doc.fillColor('#003087').text('PayPal', margin + 15, y + 8);
        doc.fillColor('#1a1f71').text('VISA', margin + 70, y + 8);
        doc.fillColor(this.colors.textDark).text('MC', margin + 110, y + 8);
        doc.fillColor(this.colors.textDark).text('Bank', margin + 150, y + 8);
        doc.fillColor('#ff6000').text('DISCOVER', margin + 200, y + 8);

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
