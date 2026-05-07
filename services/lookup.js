/**
 * Lookup Service
 *
 * Resolves an arbitrary user-entered identifier (invoice/order number, draft
 * number, or numeric/global ID) to either:
 *   - a paid/open Order (for invoices), or
 *   - a Draft Order (for quotes)
 *
 * Uses Shopify Admin GraphQL via the SHOPIFY_TOKEN / SHOPIFY_STORE env vars.
 * Falls back to legacy SHOPIFY_STORE_URL + OAuth client credentials in
 * services/shopify.js if a static token is not provided.
 */

const axios = require('axios');
const shopifyService = require('./shopify');

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

function storeDomain() {
  return (
    process.env.SHOPIFY_STORE ||
    process.env.SHOPIFY_STORE_URL ||
    'electricmotorexperts.myshopify.com'
  ).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function getToken() {
  if (process.env.SHOPIFY_TOKEN) return process.env.SHOPIFY_TOKEN;
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  // Fall back to the OAuth client_credentials flow already used elsewhere
  return shopifyService.getAccessToken();
}

async function gql(query, variables = {}) {
  const token = await getToken();
  if (!token) {
    const err = new Error('Shopify auth missing: set SHOPIFY_TOKEN');
    err.code = 'SHOPIFY_AUTH_MISSING';
    throw err;
  }

  const url = `https://${storeDomain()}/admin/api/${API_VERSION}/graphql.json`;
  const response = await axios.post(
    url,
    { query, variables },
    {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  if (response.data.errors && response.data.errors.length) {
    const msg = response.data.errors.map((e) => e.message).join('; ');
    const err = new Error(`Shopify GraphQL: ${msg}`);
    err.code = 'SHOPIFY_GRAPHQL';
    throw err;
  }
  return response.data.data;
}

/**
 * Normalizes user input.
 *
 * Returns: { raw, kind, name, numeric, gid }
 *  - kind: 'draft' | 'order' | 'unknown'
 *  - name: '#26-19566' style (with #) when the input looks like an order
 *  - numeric: any digits-only portion (for partial fallback search)
 *  - gid: GraphQL global ID if user pasted one
 */
function classifyInput(input) {
  const raw = String(input || '').trim();
  const out = { raw, kind: 'unknown', name: null, numeric: null, gid: null };
  if (!raw) return out;

  if (raw.startsWith('gid://shopify/')) {
    out.gid = raw;
    out.kind = raw.includes('/DraftOrder/') ? 'draft' : 'order';
    return out;
  }

  const cleaned = raw.replace(/^#/, '').trim();

  // Draft IDs typically start with 'D' (D12345) in Shopify
  if (/^D\d+/i.test(cleaned)) {
    out.kind = 'draft';
    out.name = '#' + cleaned.toUpperCase();
    out.numeric = (cleaned.match(/\d+/) || [])[0] || null;
    return out;
  }

  // Order names like 26-19566 or 19566
  if (/^[\d-]+$/.test(cleaned)) {
    out.kind = 'order';
    out.name = '#' + cleaned;
    out.numeric = cleaned.replace(/\D/g, '');
    return out;
  }

  // Anything else: treat as free-form, search both
  out.numeric = (cleaned.match(/\d+/) || [])[0] || null;
  return out;
}

const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  processedAt
  displayFinancialStatus
  displayFulfillmentStatus
  email
  phone
  note
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  currentSubtotalPriceSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalReceivedSet { shopMoney { amount currencyCode } }
  totalOutstandingSet { shopMoney { amount currencyCode } }
  customer { firstName lastName email phone displayName }
  billingAddress {
    name company address1 address2 city province provinceCode zip country countryCodeV2 phone
  }
  shippingAddress {
    name company address1 address2 city province provinceCode zip country countryCodeV2 phone
  }
  shippingLine { title originalPriceSet { shopMoney { amount } } }
  lineItems(first: 100) {
    edges {
      node {
        id
        title
        variantTitle
        sku
        quantity
        originalUnitPriceSet { shopMoney { amount } }
        discountedUnitPriceSet { shopMoney { amount } }
        product { id }
        image { url }
      }
    }
  }
  transactions(first: 20) {
    id
    kind
    status
    gateway
    amountSet { shopMoney { amount currencyCode } }
    createdAt
  }
`;

const DRAFT_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  updatedAt
  status
  invoiceUrl
  email
  note2
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  customer { firstName lastName email phone displayName }
  billingAddress {
    name company address1 address2 city province provinceCode zip country countryCodeV2 phone
  }
  shippingAddress {
    name company address1 address2 city province provinceCode zip country countryCodeV2 phone
  }
  shippingLine { title originalPriceSet { shopMoney { amount } } }
  appliedDiscount { title description value valueType amountV2 { amount currencyCode } }
  lineItems(first: 100) {
    edges {
      node {
        id
        title
        variantTitle
        sku
        quantity
        originalUnitPriceSet { shopMoney { amount } }
        discountedUnitPriceSet { shopMoney { amount } }
        product { id }
        image { url }
      }
    }
  }
`;

async function findOrderByName(name) {
  // GraphQL `query` filter on orders supports `name:` prefix
  const data = await gql(
    `query($q: String!) { orders(first: 5, query: $q) { edges { node { ${ORDER_FIELDS} } } } }`,
    { q: `name:${name}` }
  );
  return (data?.orders?.edges || []).map((e) => e.node);
}

async function findDraftByName(name) {
  const data = await gql(
    `query($q: String!) { draftOrders(first: 5, query: $q) { edges { node { ${DRAFT_FIELDS} } } } }`,
    { q: `name:${name}` }
  );
  return (data?.draftOrders?.edges || []).map((e) => e.node);
}

async function getOrderByGid(gid) {
  const data = await gql(
    `query($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: gid }
  );
  return data?.order ? [data.order] : [];
}

async function getDraftByGid(gid) {
  const data = await gql(
    `query($id: ID!) { draftOrder(id: $id) { ${DRAFT_FIELDS} } }`,
    { id: gid }
  );
  return data?.draftOrder ? [data.draftOrder] : [];
}

/**
 * Try a name query, and if nothing comes back, try variants:
 *   #26-19566, 26-19566, #19566, 19566
 */
async function searchOrders(input) {
  const cleaned = input.replace(/^#/, '').trim();
  const variants = Array.from(
    new Set([`#${cleaned}`, cleaned, `#${cleaned.replace(/^.*-/, '')}`, cleaned.replace(/^.*-/, '')])
  ).filter(Boolean);
  for (const v of variants) {
    const hits = await findOrderByName(v);
    if (hits.length) return hits;
  }
  return [];
}

async function searchDrafts(input) {
  const cleaned = input.replace(/^#/, '').trim();
  const variants = Array.from(
    new Set([
      `#${cleaned}`,
      cleaned,
      cleaned.startsWith('D') || cleaned.startsWith('d') ? cleaned : `D${cleaned.replace(/\D/g, '')}`,
    ])
  ).filter(Boolean);
  for (const v of variants) {
    const hits = await findDraftByName(v);
    if (hits.length) return hits;
  }
  return [];
}

/**
 * Top-level lookup. `mode` can be 'auto' (default), 'order', or 'draft'.
 * Returns { type: 'order'|'draft', record, candidates? } or throws.
 */
async function lookup(rawInput, mode = 'auto') {
  const cls = classifyInput(rawInput);
  if (!cls.raw) {
    const err = new Error('Empty lookup input');
    err.code = 'EMPTY_INPUT';
    throw err;
  }

  if (cls.gid) {
    if (cls.kind === 'draft') {
      const hits = await getDraftByGid(cls.gid);
      if (!hits.length) throw notFound(rawInput);
      return { type: 'draft', record: hits[0] };
    }
    const hits = await getOrderByGid(cls.gid);
    if (!hits.length) throw notFound(rawInput);
    return { type: 'order', record: hits[0] };
  }

  const wantOrder = mode === 'order' || (mode === 'auto' && cls.kind !== 'draft');
  const wantDraft = mode === 'draft' || (mode === 'auto' && cls.kind === 'draft');

  // Auto-detect: try the favored kind first, then the other
  if (mode === 'auto') {
    const orderHits = await searchOrders(cls.raw);
    if (orderHits.length === 1) return { type: 'order', record: orderHits[0] };
    if (orderHits.length > 1) {
      return { type: 'order', record: orderHits[0], candidates: orderHits };
    }
    const draftHits = await searchDrafts(cls.raw);
    if (draftHits.length === 1) return { type: 'draft', record: draftHits[0] };
    if (draftHits.length > 1) {
      return { type: 'draft', record: draftHits[0], candidates: draftHits };
    }
    throw notFound(rawInput);
  }

  if (wantOrder) {
    const hits = await searchOrders(cls.raw);
    if (!hits.length) throw notFound(rawInput);
    return hits.length === 1
      ? { type: 'order', record: hits[0] }
      : { type: 'order', record: hits[0], candidates: hits };
  }

  if (wantDraft) {
    const hits = await searchDrafts(cls.raw);
    if (!hits.length) throw notFound(rawInput);
    return hits.length === 1
      ? { type: 'draft', record: hits[0] }
      : { type: 'draft', record: hits[0], candidates: hits };
  }

  throw notFound(rawInput);
}

function notFound(input) {
  const err = new Error(`No invoice or quote found for "${input}"`);
  err.code = 'NOT_FOUND';
  err.status = 404;
  return err;
}

/** Convert a GraphQL Order node into the shape used by the PDF generator. */
function normalizeOrder(o) {
  const num = (v) => parseFloat(v || 0) || 0;
  const li = (o.lineItems?.edges || []).map((e) => {
    const n = e.node;
    const unit = num(n.discountedUnitPriceSet?.shopMoney?.amount || n.originalUnitPriceSet?.shopMoney?.amount);
    return {
      id: n.id,
      title: n.title + (n.variantTitle && n.variantTitle !== 'Default Title' ? ` — ${n.variantTitle}` : ''),
      variantTitle: n.variantTitle,
      sku: n.sku || '',
      quantity: n.quantity,
      price: unit,
      total: unit * n.quantity,
      image: n.image?.url || null,
      productId: n.product?.id || null,
    };
  });

  const subtotal = num(o.currentSubtotalPriceSet?.shopMoney?.amount);
  const total = num(o.currentTotalPriceSet?.shopMoney?.amount);
  const shippingCost = num(o.totalShippingPriceSet?.shopMoney?.amount);
  const discountAmount = num(o.totalDiscountsSet?.shopMoney?.amount);
  const taxAmount = num(o.totalTaxSet?.shopMoney?.amount);
  const totalReceived = num(o.totalReceivedSet?.shopMoney?.amount);
  const totalOutstanding = num(o.totalOutstandingSet?.shopMoney?.amount);

  return {
    kind: 'order',
    id: o.legacyResourceId || o.id,
    gid: o.id,
    invoiceNumber: (o.name || '').replace(/^#/, ''),
    quoteNumber: o.name || `#${o.legacyResourceId}`,
    name: o.name,
    createdAt: o.processedAt || o.createdAt,
    quoteDate: formatDate(o.processedAt || o.createdAt),
    validUntil: '',
    dueDate: '',
    financialStatus: o.displayFinancialStatus || '',
    fulfillmentStatus: o.displayFulfillmentStatus || '',
    invoiceUrl: '',
    customer: customerFromAddress(o.customer, o.billingAddress, o.email),
    shipping: shippingFromAddress(o.shippingAddress, o.customer),
    lineItems: li,
    subtotal,
    shippingCost,
    shippingTitle: o.shippingLine?.title || 'Shipping',
    discountAmount,
    discountTitle: 'Discount',
    taxAmount,
    total,
    totalReceived,
    balanceDue: totalOutstanding,
    currency: o.currentTotalPriceSet?.shopMoney?.currencyCode || 'USD',
    note: o.note || '',
    company: companyBlock(),
    invoiceNotes: defaultNotes(),
    personalMessage: { from: 'Glen', message: 'Thank you for your business!' },
  };
}

/** Convert a GraphQL DraftOrder node into the shape used by the PDF generator. */
function normalizeDraft(d) {
  const num = (v) => parseFloat(v || 0) || 0;
  const li = (d.lineItems?.edges || []).map((e) => {
    const n = e.node;
    const unit = num(n.discountedUnitPriceSet?.shopMoney?.amount || n.originalUnitPriceSet?.shopMoney?.amount);
    return {
      id: n.id,
      title: n.title + (n.variantTitle && n.variantTitle !== 'Default Title' ? ` — ${n.variantTitle}` : ''),
      variantTitle: n.variantTitle,
      sku: n.sku || '',
      quantity: n.quantity,
      price: unit,
      total: unit * n.quantity,
      image: n.image?.url || null,
      productId: n.product?.id || null,
    };
  });

  const subtotal = num(d.subtotalPriceSet?.shopMoney?.amount);
  const total = num(d.totalPriceSet?.shopMoney?.amount);
  const shippingCost = num(d.totalShippingPriceSet?.shopMoney?.amount);
  const discountAmount = num(d.totalDiscountsSet?.shopMoney?.amount) ||
    num(d.appliedDiscount?.amountV2?.amount);
  const taxAmount = num(d.totalTaxSet?.shopMoney?.amount);

  const validUntil = new Date(d.createdAt || Date.now());
  validUntil.setDate(validUntil.getDate() + 30);

  return {
    kind: 'draft',
    id: d.legacyResourceId || d.id,
    gid: d.id,
    invoiceNumber: (d.name || '').replace(/^#/, ''),
    quoteNumber: d.name || `#${d.legacyResourceId}`,
    name: d.name,
    createdAt: d.createdAt,
    quoteDate: formatDate(d.createdAt),
    validUntil: formatDate(validUntil),
    dueDate: formatDate(validUntil),
    status: (d.status || '').toLowerCase(),
    invoiceUrl: d.invoiceUrl || '',
    customer: customerFromAddress(d.customer, d.billingAddress, d.email),
    shipping: shippingFromAddress(d.shippingAddress, d.customer),
    lineItems: li,
    subtotal,
    shippingCost,
    shippingTitle: d.shippingLine?.title || 'Shipping',
    discountAmount,
    discountTitle: d.appliedDiscount?.title || d.appliedDiscount?.description || 'Discount',
    taxAmount,
    total,
    currency: d.totalPriceSet?.shopMoney?.currencyCode || 'USD',
    note: d.note2 || '',
    company: companyBlock(),
    invoiceNotes: defaultNotes(),
    personalMessage: { from: 'Glen', message: 'We appreciate the opportunity to work with you!' },
  };
}

function customerFromAddress(customer, billing, fallbackEmail) {
  const name = customer?.displayName ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') ||
    billing?.name || 'Customer';
  return {
    name,
    company: billing?.company || '',
    address1: [billing?.address1, billing?.address2].filter(Boolean).join(', '),
    city: billing?.city || '',
    state: billing?.provinceCode || billing?.province || '',
    zip: billing?.zip || '',
    country: billing?.country || '',
    email: customer?.email || fallbackEmail || '',
    phone: customer?.phone || billing?.phone || '',
  };
}

function shippingFromAddress(shipping, customer) {
  const name = shipping?.name ||
    [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || '';
  return {
    name,
    company: shipping?.company || '',
    address1: [shipping?.address1, shipping?.address2].filter(Boolean).join(', '),
    city: shipping?.city || '',
    state: shipping?.provinceCode || shipping?.province || '',
    zip: shipping?.zip || '',
    country: shipping?.country || '',
    phone: shipping?.phone || '',
  };
}

function companyBlock() {
  return {
    name: 'Phoenix Phase Converters',
    address: '12518 Graceham Road',
    city: 'Thurmont, MD 21788',
    country: 'United States',
    phone: process.env.COMPANY_PHONE || '+1 800 417 6568',
    email: process.env.COMPANY_EMAIL || 'support@phoenixphaseconverters.com',
    website: 'www.phoenixphaseconverters.com',
  };
}

function defaultNotes() {
  return [
    'Free shipping to the contiguous USA on most orders',
    'American-made with 5-year warranty',
    '24/7 technical support included',
  ];
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch (e) { return ''; }
}

module.exports = {
  lookup,
  classifyInput,
  normalizeOrder,
  normalizeDraft,
  storeDomain,
};
