# Phoenix Phase Converters — Shopify Admin UI Extensions

This folder contains two Shopify Admin UI Action extensions that add a
**Download PDF** button under the **More actions** dropdown on:

- **Order details** — `admin.order-details.action.render`
- **Draft order details** — `admin.draft-order-details.action.render`

Each extension also registers a `should-render` target so the button only
appears when an order/draft order is selected on the page.

When clicked, the extension opens the existing Phoenix invoice backend at:

```
https://phoenix-invoice-app.onrender.com/api/pdf/order/<legacyId>
https://phoenix-invoice-app.onrender.com/api/pdf/draft/<legacyId>
```

The backend resolves the order/draft from the ID, fetches it from the
Shopify Admin API, and streams a branded PDF (PPC orange/navy template,
logo, paid-invoice vs. draft-quote layout, and a payment QR code on
drafts).

---

## File structure

```
extensions/
├── order-pdf-action/
│   ├── shopify.extension.toml
│   ├── package.json
│   └── src/
│       ├── OrderActionExtension.jsx      # admin.order-details.action.render
│       └── OrderActionShouldRender.js    # admin.order-details.action.should-render
└── draft-order-pdf-action/
    ├── shopify.extension.toml
    ├── package.json
    └── src/
        ├── DraftOrderActionExtension.jsx     # admin.draft-order-details.action.render
        └── DraftOrderActionShouldRender.js   # admin.draft-order-details.action.should-render
```

The parent `shopify.app.toml` lives at the repo root.

---

## Required Shopify app scopes

Configured in `shopify.app.toml`:

- `read_orders` — read order details for invoice rendering
- `read_draft_orders` — read draft order details for quote rendering
- `read_customers` — render customer name / email on the PDF
- `read_products` — fetch product images / metadata for PDF line items

If you need to look up orders older than 60 days, also add
`read_all_orders`. This scope requires Shopify Plus or app review approval.

---

## Required Render env vars (backend)

The Express backend deployed at `https://phoenix-invoice-app.onrender.com`
needs:

- `SHOPIFY_TOKEN` — Admin API access token (custom app or installed app)
- `SHOPIFY_STORE` — your `*.myshopify.com` domain (e.g., `phoenix-pc.myshopify.com`)

Optional:

- `APP_URL` — public URL of the Render service (used for webhooks / CORS)
- `SHOPIFY_API_VERSION` — defaults to `2025-01`

---

## Install Shopify CLI and deploy

```bash
# 1. Install Shopify CLI globally (or use npx)
npm i -g @shopify/cli @shopify/app

# 2. From the repo root, link this codebase to your Partner app
shopify app config link
# Pick the existing "Phoenix Invoice App" Partner app (or create one).
# This populates client_id and application_url in shopify.app.toml.

# 3. Build and deploy the extensions
shopify app deploy

# 4. Local development against a dev store
shopify app dev
```

`shopify app deploy` packages all extensions found under `extensions/`
and pushes them as a new app version to the Partner dashboard. After
deploy, open Shopify admin → Settings → Apps and sales channels →
your app → release the new version.

---

## How to register/install the custom app

1. Log in to the **Shopify Partner Dashboard**:
   https://partners.shopify.com
2. **Apps → Create app → Create app manually**.
3. Name it "Phoenix Invoice App". Set **App URL** to
   `https://phoenix-invoice-app.onrender.com` and the redirect URL to
   `https://phoenix-invoice-app.onrender.com/auth/callback`.
4. Copy the **Client ID** into `shopify.app.toml` (or run
   `shopify app config link`).
5. From the repo root, run `shopify app deploy` to push extensions and
   the access scopes config.
6. In the Partner dashboard for the app, click **Test on development
   store** or **Select store** to install on the production store.
7. After install, the Shopify admin will surface the **Download PDF**
   action in the **More actions** menu on order and draft order pages.

For a fully custom app (no app store listing) you can alternatively use
the **Custom apps** section in your store admin and install a private
custom app — but Admin UI extensions still need to be deployed via
`shopify app deploy` against a Partner-dashboard app.

---

## Testing

1. After deploy + install, open an order in Shopify admin:
   `https://<your-store>.myshopify.com/admin/orders/<id>`
2. Click **More actions** → **Phoenix Phase Converters**.
3. A modal appears with a **Download PDF** button. Click it.
4. A new tab opens to `https://phoenix-invoice-app.onrender.com/api/pdf/order/<id>`
   which streams the branded invoice PDF.
5. Repeat on a draft order:
   `https://<your-store>.myshopify.com/admin/draft_orders/<id>`
   The same flow renders a branded **quote** PDF (with payment QR).

---

## Troubleshooting — "Download PDF" not visible in More actions

- **Did you deploy and release?** `shopify app deploy` only stages a new
  version. You must release it: Partner dashboard → App → Versions →
  Release. (Or the embedded admin "Release new version" prompt.)
- **Is the app installed on this store?** Check the store admin →
  Settings → Apps and sales channels.
- **Wrong scopes?** If the app was previously installed with fewer
  scopes, reinstall after `shopify app deploy` to grant the new ones.
- **Browser cache.** Hard-refresh the order/draft order page.
- **Extension target mismatch.** Each `shopify.extension.toml` must
  list exactly one render target per file. Order and draft order
  targets live in separate extensions in this repo.
- **API version drift.** Both `shopify.app.toml` and each
  `shopify.extension.toml` should use `2025-01` (or newer matching).
- **PDF download fails.** Open the URL directly in a browser:
  `https://phoenix-invoice-app.onrender.com/api/pdf/order/<id>`. If
  that 500s, check the Render logs — usually a missing `SHOPIFY_TOKEN`
  env var. If it 404s, the legacy ID isn't matching; the backend will
  fall back to GID-based lookup.

---

## Backend endpoint contract used by these extensions

```
GET /api/pdf/order/:id
GET /api/pdf/draft/:id
```

`:id` may be either a numeric legacyResourceId (e.g. `5879238328492`)
or a URL-encoded GraphQL gid (e.g. `gid%3A%2F%2Fshopify%2FOrder%2F5879238328492`).

The extensions extract the trailing numeric segment from the
admin-provided `gid://shopify/Order/<id>` and pass it as the legacy ID.
If a non-numeric resource is encountered, the GID is URL-encoded and
sent verbatim. The backend handles both.
