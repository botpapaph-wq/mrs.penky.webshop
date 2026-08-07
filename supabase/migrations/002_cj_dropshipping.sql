-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Migration 002: CJ Dropshipping integration
--
-- Adds CJ product/variant mapping columns to penky_products, structured
-- shipping address fields required by CJ's Create Order API to
-- penky_orders, and a single-row token cache for the CJ Dropshipping
-- access/refresh token.
--
-- NAMING: penky_ prefix, see 001_init_schema.sql header for why.
-- ============================================================================

-- Map local products to their CJ Dropshipping source product/variant.
ALTER TABLE public.penky_products
  ADD COLUMN IF NOT EXISTS cj_product_id TEXT,
  ADD COLUMN IF NOT EXISTS cj_variant_id TEXT,
  ADD COLUMN IF NOT EXISTS cj_variant_sku TEXT,
  ADD COLUMN IF NOT EXISTS cost_price_usd NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS weight_g INTEGER,
  ADD COLUMN IF NOT EXISTS cj_synced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_penky_products_cj_product_id ON public.penky_products(cj_product_id);

-- CJ's Create Order API requires structured shipping fields
-- (country code / province / city), not a single free-text address.
-- checkout.html now collects these separately — forward-order.ts will
-- refuse to forward orders missing them and flag for manual review
-- instead of guessing.
ALTER TABLE public.penky_orders
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_province TEXT,
  ADD COLUMN IF NOT EXISTS shipping_country_code TEXT DEFAULT 'PH',
  ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'not_forwarded'
    CHECK (fulfillment_status IN ('not_forwarded', 'forwarded', 'manual_review', 'error')),
  ADD COLUMN IF NOT EXISTS cj_order_id TEXT,
  ADD COLUMN IF NOT EXISTS cj_shipment_order_id TEXT,
  ADD COLUMN IF NOT EXISTS cj_forwarded_at TIMESTAMP WITH TIME ZONE;

-- Single-row cache for the CJ access/refresh token so Edge Functions don't
-- re-authenticate on every cold start (CJ's auth endpoint is rate-limited
-- to 1 request/second, and access tokens are valid for ~15 days).
-- Only ever touched by the service_role key from inside Edge Functions —
-- RLS is enabled with NO policies defined, so anon/authenticated roles
-- have zero access to this table by default.
CREATE TABLE IF NOT EXISTS public.penky_cj_auth_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMP WITH TIME ZONE,
  refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.penky_cj_auth_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.penky_cj_auth_state (id) VALUES (1) ON CONFLICT DO NOTHING;
