/**
 * Invoice Service - Phoenix Phase Converters Style
 * Generates professional invoices matching the PPC quote template
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

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

  /**
   * Download image from URL to local file
   */
  async downloadImage(url, filename) {
    return new Promise((resolve, reject) => {
      if (!url) {
        resolve(null);
        return;
      }

      const filepath = path.join(this.assetsDir, filename);
      
      // Check if already cached
      if (fs.existsSync(filepath)) {
        resolve(filepath);
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(filepath);

      protocol.get(url, (response) => {
        // Handle redirects
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
        console.error('Image download error:', err.message);
        resolve(null);
      });
    });
  }

  /**
   * Generate invoice number
   */
  generateInvoiceNumber(draftOrderId) {
    const prefix = process.env.INVOICE_PREFIX || 'INV-';
    return `${prefix}${draftOrderId}`;
  }

  /**
   * Convert draft order to invoice data
   */
  draftOrderToInvoice(draftOrder) {
    const taxRate = parseFloat(process.env.TAX_RATE) || 0.06;
    const subtotal = parseFloat(draftOrder.subtotal_price) || 0;
    const shippingCost = parseFloat(draftOrder.total_shipping_price_set?.shop_money?.amount) || 0;
    const taxAmount = parseFloat(draftOrder.total_tax) || (subtotal * taxRate);
    const total = subtotal + taxAmount + shippingCost - (parseFloat(draftOrder.total_discounts) || 0);

    // Calculate validity date (30 days from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    return {
      invoiceNumber: this.generateInvoiceNumber(draftOrder.id),
      quoteNumber: draftOrder.name || `Q-${draftOrder.id}`,
      draftOrderId: draftOrder.id,
      createdAt: new Date().toISOString(),
      quoteDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      validUntil: validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      dueDate: this.calculateDueDate(30),

      // Company Info
      company: {
        name: 'Phoenix Phase Converters',
        address: '12518 Graceham Road',
        city: 'Thurmont, MD 21788',
        country: 'United States',
        phone: '+1 800 417 6568',
        email: 'support@phoenixphaseconverters.com',
        website: 'www.phoenixphaseconverters.com'
      },

      // Customer Info
      customer: {
        name: draftOrder.customer?.first_name 
          ? `${draftOrder.customer.first_name} ${draftOrder.customer.last_name || ''}`
          : draftOrder.billing_address?.name || 'Customer',
        company: draftOrder.billing_address?.company || '',
        address1: draftOrder.billing_address?.address1 || '',
        address2: draftOrder.billing_address?.address2 || '',
        city: draftOrder.billing_address?.city || '',
        state: draftOrder.billing_address?.province_code || '',
        zip: draftOrder.billing_address?.zip || '',
        email: draftOrder.customer?.email || draftOrder.email || '',
        phone: draftOrder.customer?.phone || draftOrder.billing_address?.phone || ''
      },

      // Line Items with product info
      lineItems: (draftOrder.line_items || []).map(item => ({
        id: item.id,
        title: item.title,
        variantTitle: item.variant_title,
        sku: item.sku || '',
        quantity: item.quantity,
        price: parseFloat(item.price),
        total: parseFloat(item.price) * item.quantity,
        taxable: item.taxable,
        image: item.image?.src || null,
        productId: item.product_id,
        // Product features - you can customize these per product
        features: this.getProductFeatures(item.title)
      })),

      // Totals
      subtotal,
      taxRate,
      taxAmount,
      shippingCost,
      discount: parseFloat(draftOrder.total_discounts) || 0,
      total,
      currency: draftOrder.currency || 'USD',

      // Additional Info
      note: draftOrder.note || '',
      tags: draftOrder.tags || '',
      status: 'pending',

      // Notes for the invoice
      invoiceNotes: [
        'Products include free shipping to the contiguous USA',
        'We are crafted with top-quality USA-made parts',
        'Includes a 5-year Limited warranty',
        '24/7 technical support from quality professional technicians'
      ],

      // Personal message
      personalMessage: {
        from: 'Glen',
        message: 'We appreciate the opportunity to work with you!\nPlease let us know if you have any questions.'
      }
    };
  }

  /**
   * Get product features based on product title
   */
  getProductFeatures(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('fx20') || titleLower.includes('heavy duty digital')) {
      return [
        'Powers from 20 HP to 60 HP machines',
        '100% cold digital start on real-world sized load',
        'Fully automated with digital controls',
        'Built with rugged indoor/outdoor-rated enclosures',
        'Easy installation with USA-based support'
      ];
    }
    
    if (titleLower.includes('fx10') || titleLower.includes('digital')) {
      return [
        'Powers from 10 HP to 30 HP machines',
        'Digital phase conversion technology',
        'Automatic voltage regulation',
        'Compact design for easy installation',
        'Made in the USA with premium components'
      ];
    }
    
    if (titleLower.includes('rotary') || titleLower.includes('rpc')) {
      return [
        'True 3-phase power output',
        'Suitable for CNC machines and compressors',
        'Heavy-duty industrial construction',
        'Low maintenance design',
        '5-year manufacturer warranty'
      ];
    }
    
    // Default features
    return [
      'Premium quality American-made product',
      'Professional-grade construction',
      'Easy installation',
      'Technical support included',
      'Manufacturer warranty'
    ];
  }

  formatAddress(address) {
    if (!address) return '';
    
    const parts = [
      address.address1,
      address.address2,
      `${address.city || ''}, ${address.province_code || ''} ${address.zip || ''}`,
      address.country
    ].filter(Boolean);
    
    return parts.join('\n');
  }

  calculateDueDate(days = 30) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Draw the Phoenix logo (simplified SVG-style)
   */
  drawLogo(doc, x, y) {
    // Phoenix bird shape using paths
    doc.save();
    
    // Main wing - orange
    doc.fillColor(this.colors.orange);
    doc.moveTo(x + 5, y + 45)
       .bezierCurveTo(x + 15, y + 25, x + 35, y + 10, x + 55, y + 5)
       .bezierCurveTo(x + 45, y + 18, x + 38, y + 28, x + 32, y + 38)
       .bezierCurveTo(x + 25, y + 35, x + 15, y + 40, x + 5, y + 45)
       .fill();
    
    // Secondary feathers - gold
    doc.fillColor(this.colors.gold);
    doc.moveTo(x + 32, y + 38)
       .bezierCurveTo(x + 48, y + 32, x + 58, y + 42, x + 62, y + 55)
       .bezierCurveTo(x + 52, y + 50, x + 42, y + 44, x + 32, y + 38)
       .fill();
    
    // Tail feathers
    doc.fillColor('#fb923c');
    doc.moveTo(x, y + 50)
       .bezierCurveTo(x + 8, y + 48, x + 15, y + 52, x + 20, y + 60)
       .bezierCurveTo(x + 12, y + 58, x + 5, y + 55, x, y + 50)
       .fill();
    
    doc.restore();
    
    // Company name text
    doc.font('Helvetica-Bold')
       .fontSize(28)
       .fillColor(this.colors.navyBlue)
       .text('PHOENIX', x + 75, y + 8);
    
    doc.font('Helvetica')
       .fontSize(12)
       .fillColor(this.colors.orange)
       .text('PHASE CONVERTERS', x + 75, y + 38);
  }

  /**
   * Generate QR code pattern
   */
  drawQRPlaceholder(doc, x, y, size) {
    // White background
    doc.rect(x, y, size, size)
       .fill(this.colors.white);
    
    // QR code border
    doc.rect(x, y, size, size)
       .lineWidth(2)
       .strokeColor(this.colors.navyBlue)
       .stroke();
    
    // Grid pattern to simulate QR
    const cellSize = size / 10;
    const pattern = [
      [1,1,1,1,1,1,1,0,1,1],
      [1,0,0,0,0,0,1,0,0,1],
      [1,0,1,1,1,0,1,0,1,0],
      [1,0,1,1,1,0,1,0,0,1],
      [1,0,1,1,1,0,1,0,1,1],
      [1,0,0,0,0,0,1,0,0,0],
      [1,1,1,1,1,1,1,0,1,0],
      [0,0,0,0,0,0,0,0,1,1],
      [1,0,1,1,0,1,1,0,0,1],
      [1,1,0,1,1,0,1,1,1,1]
    ];
    
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        if (pattern[j][i]) {
          doc.rect(x + i * cellSize + 2, y + j * cellSize + 2, cellSize - 1, cellSize - 1)
             .fill(this.colors.navyBlue);
        }
      }
    }
    
    // PAY ONLINE text
    doc.font('Helvetica-Bold')
       .fontSize(11)
       .fillColor(this.colors.navyBlue)
       .text('PAY ONLINE', x, y + size + 10, { width: size, align: 'center' });
  }

  /**
   * Draw payment icons bar
   */
  drawPaymentIcons(doc, x, y) {
    // Background bar
    doc.rect(x, y, 512, 32)
       .fill('#f1f5f9');
    
    let iconX = x + 15;
    
    // PayPal
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#003087')
       .text('PayPal', iconX, y + 10);
    iconX += 55;
    
    // Visa
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1f71')
       .text('VISA', iconX, y + 10);
    iconX += 40;
    
    doc.font('Helvetica').fontSize(10).fillColor('#1a1f71')
       .text('visa', iconX, y + 10);
    iconX += 35;
    
    // Mastercard (two overlapping circles)
    doc.circle(iconX + 8, y + 16, 9).fill('#eb001b');
    doc.circle(iconX + 18, y + 16, 9).fill('#f79e1b');
    iconX += 40;
    
    // Bank transfer
    doc.font('Helvetica-Bold').fontSize(9).fillColor(this.colors.textDark)
       .text('Bank', iconX, y + 10);
    iconX += 40;
    
    // Additional payment badges
    const badges = ['ACH', 'Wire'];
    for (const badge of badges) {
      doc.roundedRect(iconX, y + 6, 35, 20, 3)
         .fill(this.colors.navyBlue);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(this.colors.white)
         .text(badge, iconX + 5, y + 12);
      iconX += 45;
    }
    
    // Discover
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ff6000')
       .text('DISCOVER', iconX, y + 10);
  }

  /**
   * Generate PDF invoice matching Phoenix template
   */
  async generatePDF(invoice) {
    return new Promise(async (resolve, reject) => {
      const filename = `${invoice.invoiceNumber}.pdf`;
      const filepath = path.join(this.invoiceDir, filename);
      
      const doc = new PDFDocument({ 
        size: 'LETTER',
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
        bufferPages: true
      });
      
      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 50;
      const contentWidth = pageWidth - (margin * 2);

      try {
        // ============ HEADER SECTION ============
        
        // Draw logo area
        this.drawLogo(doc, margin, 30);
        
        // QUOTE/INVOICE title
        doc.font('Helvetica-Bold')
           .fontSize(42)
           .fillColor(this.colors.navyBlue)
           .text('QUOTE', margin, 95);
        
        // Quote details box on the right
        const detailsX = pageWidth - margin - 180;
        
        // Quote number with box
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark)
           .text('Quote #:', detailsX, 40);
        
        doc.font('Helvetica-Bold')
           .fontSize(16)
           .fillColor(this.colors.navyBlue)
           .text(invoice.quoteNumber, detailsX + 60, 37);
        
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark)
           .text(`Quote Date: ${invoice.quoteDate}`, detailsX, 60)
           .text(`Quote Valid Until: ${invoice.validUntil}`, detailsX, 75);

        // ============ BILL TO / COMPANY INFO ============
        
        let y = 145;
        
        // Light blue background boxes
        doc.rect(margin, y, 230, 110)
           .fill(this.colors.lightBlue);
        
        doc.rect(pageWidth / 2 + 10, y, 230, 110)
           .fill(this.colors.lightBlue);
        
        // Bill To section
        doc.font('Helvetica-Bold')
           .fontSize(11)
           .fillColor(this.colors.navyBlue)
           .text('Bill To:', margin + 10, y + 10);
        
        y += 28;
        doc.font('Helvetica-Bold')
           .fontSize(11)
           .fillColor(this.colors.textDark)
           .text(invoice.customer.name, margin + 10, y);
        
        y += 14;
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark);
        
        if (invoice.customer.company) {
          doc.text(invoice.customer.company, margin + 10, y);
          y += 12;
        }
        if (invoice.customer.address1) {
          doc.text(invoice.customer.address1, margin + 10, y);
          y += 12;
        }
        if (invoice.customer.city) {
          doc.text(`${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.zip}`, margin + 10, y);
          y += 12;
        }
        if (invoice.customer.email) {
          doc.text(invoice.customer.email, margin + 10, y);
          y += 12;
        }
        if (invoice.customer.phone) {
          doc.text(invoice.customer.phone, margin + 10, y);
        }
        
        // Company info on the right
        const companyX = pageWidth / 2 + 20;
        y = 145;
        
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor(this.colors.navyBlue)
           .text(invoice.company.name, companyX, y + 10);
        
        y += 28;
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark)
           .text(invoice.company.address, companyX, y);
        
        y += 12;
        doc.text(`${invoice.company.city}, ${invoice.company.country}`, companyX, y);
        
        y += 16;
        doc.fillColor(this.colors.navyBlue)
           .text(invoice.company.email, companyX, y);
        
        y += 12;
        doc.fillColor(this.colors.textDark)
           .text(invoice.company.phone, companyX, y);
        
        y += 12;
        doc.fillColor(this.colors.navyBlue)
           .text(invoice.company.website, companyX, y);

        // ============ PRODUCT TABLE ============
        
        y = 270;
        
        // Table header
        doc.rect(margin, y, contentWidth, 28)
           .fill(this.colors.navyBlue);
        
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(this.colors.white)
           .text('Product', margin + 15, y + 9)
           .text('QTY', margin + 310, y + 9, { width: 50, align: 'center' })
           .text('UNIT PRICE', margin + 360, y + 9, { width: 80, align: 'center' })
           .text('TOTAL', margin + 440, y + 9, { width: 70, align: 'right' });
        
        y += 28;
        
        // Line items
        for (const item of invoice.lineItems) {
          const itemStartY = y;
          const rowHeight = 130; // Height for product row with features and image
          
          // Product title
          doc.font('Helvetica-Bold')
             .fontSize(12)
             .fillColor(this.colors.textDark)
             .text(item.title, margin + 15, y + 12, { width: 280 });
          
          // Quantity, price, total
          doc.font('Helvetica')
             .fontSize(11)
             .text(item.quantity.toString(), margin + 310, y + 12, { width: 50, align: 'center' })
             .text(`$${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + 360, y + 12, { width: 80, align: 'center' })
             .text(`$${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + 440, y + 12, { width: 70, align: 'right' });
          
          // Product features (bullet points)
          y += 38;
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(this.colors.textDark);
          
          for (const feature of item.features.slice(0, 5)) {
            doc.text(`•  ${feature}`, margin + 15, y, { width: 260 });
            y += 14;
          }
          
          // Product image area (right side)
          const imageX = margin + 330;
          const imageY = itemStartY + 38;
          const imageWidth = 120;
          const imageHeight = 85;
          
          // Try to download and embed product image
          if (item.image) {
            try {
              const imagePath = await this.downloadImage(item.image, `product_${item.id}.jpg`);
              if (imagePath && fs.existsSync(imagePath)) {
                doc.image(imagePath, imageX, imageY, { 
                  fit: [imageWidth, imageHeight],
                  align: 'center',
                  valign: 'center'
                });
              } else {
                this.drawImagePlaceholder(doc, imageX, imageY, imageWidth, imageHeight);
              }
            } catch (err) {
              this.drawImagePlaceholder(doc, imageX, imageY, imageWidth, imageHeight);
            }
          } else {
            this.drawImagePlaceholder(doc, imageX, imageY, imageWidth, imageHeight);
          }
          
          y = itemStartY + rowHeight;
        }

        // ============ TOTALS SECTION ============
        
        // Totals box
        const totalsX = margin + 290;
        const totalsWidth = contentWidth - 290;
        
        // Subtotal header
        doc.rect(totalsX, y, totalsWidth, 22)
           .fill(this.colors.navyBlue);
        
        doc.font('Helvetica-Bold')
           .fontSize(9)
           .fillColor(this.colors.white)
           .text('SUBTOTAL', totalsX + 10, y + 7)
           .text('QTY', totalsX + 95, y + 7, { width: 40, align: 'center' })
           .text('UNIT PRICE', totalsX + 135, y + 7, { width: 80, align: 'right' });
        
        y += 22;
        
        // Subtotal row
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark)
           .text('Subtotal', totalsX + 10, y + 8)
           .text(invoice.lineItems.reduce((sum, i) => sum + i.quantity, 0).toString(), totalsX + 95, y + 8, { width: 40, align: 'center' })
           .text(`$${invoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, totalsX + 135, y + 8, { width: 80, align: 'right' });
        
        y += 25;
        
        // Shipping
        doc.text('Shipping', totalsX + 10, y + 3)
           .text(invoice.shippingCost > 0 ? `$${invoice.shippingCost.toFixed(2)}` : 'Free', totalsX + 135, y + 3, { width: 80, align: 'right' });
        
        y += 20;
        
        // Tax
        const taxPercent = Math.round(invoice.taxRate * 100);
        doc.text(`Tax (${taxPercent}%)`, totalsX + 10, y + 3)
           .text(`$${invoice.taxAmount.toFixed(2)}`, totalsX + 135, y + 3, { width: 80, align: 'right' });
        
        y += 25;
        
        // Total line
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .fillColor(this.colors.navyBlue)
           .text('Total', margin, y + 5);
        
        doc.font('Helvetica-Bold')
           .fontSize(14)
           .text('Total:', totalsX + 50, y + 5)
           .fontSize(16)
           .text(`$${invoice.total.toFixed(2)}`, totalsX + 110, y + 3, { width: 105, align: 'right' });

        // ============ NOTES SECTION ============
        
        y += 45;
        
        // Notes header
        doc.rect(margin, y, 290, 22)
           .fill(this.colors.navyBlue);
        
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(this.colors.white)
           .text('NOTES:', margin + 10, y + 6);
        
        y += 28;
        
        // Notes list
        doc.font('Helvetica')
           .fontSize(9)
           .fillColor(this.colors.textDark);
        
        for (const note of invoice.invoiceNotes) {
          doc.text(`•  ${note}`, margin + 10, y, { width: 280 });
          y += 14;
        }
        
        // Personal message
        y += 8;
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .text(invoice.personalMessage.from, margin + 10, y);
        
        y += 16;
        doc.font('Helvetica')
           .fontSize(10)
           .text(invoice.personalMessage.message, margin + 10, y, { width: 280 });
        
        // QR Code on the right
        const notesStartY = y - 100;
        const qrX = margin + 380;
        const qrY = notesStartY;
        this.drawQRPlaceholder(doc, qrX, qrY, 90);

        // ============ PAYMENT ICONS ============
        
        y += 40;
        this.drawPaymentIcons(doc, margin, y);

        // ============ FOOTER ============
        
        y += 45;
        
        // Footer contact info with icons
        doc.font('Helvetica')
           .fontSize(10)
           .fillColor(this.colors.textDark);
        
        // Left column - email icon simulation
        doc.rect(margin, y, 18, 12).lineWidth(1).stroke(this.colors.textDark);
        doc.moveTo(margin, y).lineTo(margin + 9, y + 6).lineTo(margin + 18, y).stroke();
        doc.text(invoice.company.email, margin + 25, y);
        
        // Phone
        doc.text(invoice.company.phone, margin, y + 18);
        
        // Right column
        doc.text(invoice.company.phone, margin + 310, y);
        doc.text(invoice.company.website, margin + 310, y + 18);

        // Page number at bottom
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc.fontSize(8)
             .fillColor(this.colors.textMuted)
             .text(
               `Page ${i + 1} of ${pageCount}`,
               margin,
               pageHeight - 25,
               { align: 'center', width: contentWidth }
             );
        }

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            filename,
            filepath,
            invoice
          });
        });

        writeStream.on('error', reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw placeholder for product image
   */
  drawImagePlaceholder(doc, x, y, width, height) {
    // Light gray box
    doc.rect(x, y, width, height)
       .fill('#f3f4f6');
    
    doc.rect(x, y, width, height)
       .lineWidth(1)
       .strokeColor(this.colors.borderGray)
       .stroke();
    
    // Placeholder icon (simple camera/image shape)
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // Mountain/image icon
    doc.fillColor(this.colors.textMuted);
    
    // Simple landscape icon
    doc.moveTo(centerX - 25, centerY + 15)
       .lineTo(centerX - 10, centerY - 5)
       .lineTo(centerX, centerY + 5)
       .lineTo(centerX + 10, centerY - 10)
       .lineTo(centerX + 25, centerY + 15)
       .closePath()
       .fill();
    
    // Sun
    doc.circle(centerX + 15, centerY - 15, 6).fill();
    
    // Text
    doc.font('Helvetica')
       .fontSize(8)
       .fillColor(this.colors.textMuted)
       .text('Product Image', x, y + height + 3, { width: width, align: 'center' });
  }

  /**
   * Get invoice by number
   */
  getInvoice(invoiceNumber) {
    const filepath = path.join(this.invoiceDir, `${invoiceNumber}.pdf`);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    return null;
  }

  /**
   * List all invoices
   */
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
