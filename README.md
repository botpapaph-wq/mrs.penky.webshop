# Mrs. Penky E-Commerce Platform

Ultra-lightweight, zero-maintenance e-commerce platform for Philippines/SEA market. Dual-currency (PHP/USD), automatic invoicing, AI chatbot, optimized for mobile.

## Stack

- **Frontend:** HTML5 + Tailwind CSS + Vanilla JS (zero npm dependencies)
- **Hosting:** Cloudflare Pages (static) + Cloudflare Workers AI (chatbot)
- **Backend:** Supabase Edge Functions (serverless)
- **Database:** Supabase (Postgres + RLS)
- **Payments:** PayMongo (PHP/e-wallets) + Stripe (USD/international)
- **Invoicing:** Zoho Books API (automated)
- **Domain/DNS:** Z.com + Cloudflare

## Quick Start

1. Clone repository
2. Copy `.env.example` to `.env.local` and fill in credentials
3. Run `supabase migration up` to initialize database
4. Run `npm run dev` to start local server
5. Deploy to Cloudflare Pages via GitHub Actions

See `docs/SETUP.md` for detailed setup instructions.

## Project Structure

```
.
├── src/                      # Frontend (HTML/JS/CSS)
│   ├── index.html            # Product catalog
│   ├── checkout.html         # Checkout flow
│   ├── success.html          # Payment confirmation
│   ├── cancel.html           # Payment cancelled
│   └── chat-widget.js        # AI chatbot widget
├── functions/
│   ├── api/chat.js           # Cloudflare Pages Function
│   ├── create-checkout-session/  # Supabase Edge Function
│   ├── payment-webhook/      # Webhook handler
│   └── _shared/              # Shared utilities
├── supabase/
│   └── migrations/
│       └── 001_init_schema.sql  # Database schema + RLS
├── docs/
│   ├── SETUP.md              # Deployment guide
│   └── ZOHO.md               # Zoho Books setup
└── wrangler.toml             # Cloudflare config
```

## Key Features

- ✅ Product catalog with search & filter
- ✅ Shopping cart (localStorage)
- ✅ Multi-currency checkout (PHP/USD)
- ✅ PayMongo (GCash, Maya, QR Ph, Cards)
- ✅ Stripe (international credit cards)
- ✅ Automatic Zoho invoice generation
- ✅ Webhook idempotency & deduplication
- ✅ AI chatbot (Cloudflare Workers AI / Llama)
- ✅ Row-level security (RLS)
- ✅ Mobile-optimized (<50KB load)

## Performance

- First paint: <800ms (mobile 3G)
- Page size: ~35KB (uncompressed)
- Cold-start latency: <100ms (Edge Functions)
- Webhook processing: <500ms

## Compliance

- TCPA consent patterns (SMS marketing)
- GDPR-ready (data deletion, consent)
- PCI DSS (no card storage on server)
- Webhook signature verification (PayMongo + Stripe)

## License

Proprietary — Copyright 2026 Bodo Kopplin, Mentor GmbH.
