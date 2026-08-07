# Setup & Deployment Guide

## Prerequisites

- Supabase project (free tier sufficient)
- PayMongo account (merchant onboarded)
- Stripe account (optional, for USD/international)
- Zoho Books account (with organization ID: 932735549)
- Cloudflare account with Pages enabled
- GitHub account (for CI/CD)
- Z.com domain (already purchased)

## 1. Supabase Setup

### Create Project

1. Go to https://supabase.com/dashboard
2. Create new project (select "Philippines" region)
3. Wait for provisioning (~2 min)
4. Note `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Settings → API

### Apply Schema

```bash
# Install Supabase CLI
npm install -g supabase

# Link project
supabase login
supabase link --project-ref YOUR_PROJECT_ID

# Run migration
supabase migration up

# Seed sample products (optional)
psql "YOUR_CONNECTION_STRING" < ./supabase/migrations/001_init_schema.sql
```

### Enable RLS

Navigate to **Settings → Authentication → Policies** in Supabase Dashboard and verify all RLS policies are enabled (already defined in migration).

---

## 2. PayMongo Setup

### Register Webhook

```bash
PAYMONGO_SECRET_KEY=sk_live_xxx
ORG_ID=932735549

curl https://api.paymongo.com/v1/webhooks \
  -H "Authorization: Basic $(echo -n '$PAYMONGO_SECRET_KEY:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attributes": {
        "url": "https://mrs.penky.com/functions/payment-webhook",
        "events": ["checkout_session.payment.paid", "checkout_session.payment.failed"]
      }
    }
  }'
```

Save returned `webhook_id` and secret key.

### Store Webhook Secret

In Cloudflare Workers KV or environment:

```
PAYMONGO_WEBHOOK_SECRET=whsk_test_xxx
```

---

## 3. Stripe Setup (Optional)

### Create Test Keys

1. https://dashboard.stripe.com/apikeys
2. Copy **Secret Key** (starts with `sk_test_`)
3. Enable Webhooks: https://dashboard.stripe.com/webhooks
4. Add endpoint `https://mrs.penky.com/functions/payment-webhook`
5. Subscribe to: `charge.succeeded`, `charge.failed`

---

## 4. Zoho Books OAuth Setup

### Register OAuth Client

1. Go to https://api.zoho.com/oauth/manage
2. Create new client
3. Authorized redirect URI: `https://mrs.penky.com/auth/zoho/callback`
4. Note `CLIENT_ID` and `CLIENT_SECRET`

### Get Access Token

1. Redirect user to: `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ&client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://mrs.penky.com/auth/zoho/callback`
2. User authorizes → gets code
3. Exchange code for token:

```bash
curl https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://mrs.penky.com/auth/zoho/callback" \
  -d "code=YOUR_CODE"
```

4. Store `access_token` and `refresh_token` in secrets

---

## 5. Cloudflare Pages Deployment

### Connect GitHub

1. https://dash.cloudflare.com → Pages
2. **Connect to Git** → Authorize GitHub
3. Select repository: `botpapaph-wq/mrs.penky.webshop`
4. Build settings:
   - Framework: None
   - Build command: `npm run build` (or skip if static)
   - Build output directory: `src`

### Set Environment Variables

In Cloudflare Pages Settings → Environment:

```
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=eyJ...
PAYMONGO_SECRET_KEY=sk_live_...
STRIPE_SECRET_KEY=sk_live_...
ZOHO_ACCESS_TOKEN=1000....
```

### Deploy

Push to `main` branch → Cloudflare automatically deploys

---

## 6. Domain & DNS

### Z.com Configuration

1. Log in to Z.com console
2. Nameservers → Point to Cloudflare:
   ```
   ns1.cloudflare.com
   ns2.cloudflare.com
   ```

### Cloudflare DNS

1. Add site to Cloudflare: https://dash.cloudflare.com
2. Add DNS records:
   ```
   A record:     mrs.penky.com  → 192.0.2.1  (Cloudflare IP)
   CNAME record: www            → mrs.penky.com
   ```

3. SSL/TLS → Full (encrypted)

---

## 7. Test & Go Live

### Local Testing

```bash
# Install dependencies
npm install

# Run local dev server
npm run dev

# Test checkout flow
# Visit http://localhost:3000 → add products → checkout
```

### Production Testing

1. PayMongo: Use test keys first
2. Add small test payment (₱1)
3. Verify webhook fires → order marked `paid`
4. Check Zoho Books for invoice

### Go Live Checklist

- [ ] Database backed up
- [ ] SSL certificate active
- [ ] All env vars set in Cloudflare
- [ ] PayMongo test payments working
- [ ] Stripe (if used) test payments working
- [ ] Zoho Books invoices generating
- [ ] Chat widget tested
- [ ] Mobile checkout tested (iOS + Android)
- [ ] Email confirmations sending
- [ ] Monitoring/alerts configured

### Enable Production Credentials

1. Switch PayMongo to live keys
2. Switch Stripe to live keys
3. Update DNS TTL to 3600

---

## 8. Monitoring & Maintenance

### Set Up Alerts

- Webhook failures: Monitor `webhook_events.error_message`
- Payment failures: Alert on `orders.payment_status = 'failed'`
- Zoho invoice errors: Log in `integration_tokens` table

### Database Backups

Supabase automatically backs up daily. Manual backup:

```bash
supabase db push --debug
```

### Update Dependencies

```bash
npm outdated
npm update
```

---

## Troubleshooting

### Webhook Not Firing

1. Check PayMongo/Stripe webhook settings
2. Verify function URL is publicly accessible
3. Check signature verification (test with hardcoded secret)
4. Review logs in Cloudflare dashboard

### Orders Not Creating

1. Verify Supabase connection string
2. Check RLS policies allow inserts
3. Test with cURL directly to Edge Function

### Zoho Invoice Not Creating

1. Verify access token not expired
2. Check organization_id is correct
3. Ensure line items have valid currency_id

---

## Support

For issues, contact: bot.papa.ph@gmail.com
