-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Supabase Postgres Schema + RLS
-- Production: PHP/USD dual-currency, Invoicing via Zoho Books
--
-- NAMING: all tables use a penky_ prefix. This project's database is shared
-- with unrelated systems (intranet, recruiting, RemoteSalesforce, and an
-- existing PayPal-based "orders" table for a different product) — the
-- prefix guarantees no collision with anything else in this account.
--
-- SECURITY: orders, order_items, webhook_events and integration_tokens get
-- NO RLS policies for anon/authenticated on purpose. They are only ever
-- touched via Edge Functions using the service_role key, which bypasses RLS
-- entirely and needs no policy to do so. A permissive USING(TRUE) policy
-- here would let the public anon key (embedded in frontend JS) read every
-- customer's PII and forge/alter order rows — deliberately avoided.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "http";
CREATE EXTENSION IF NOT EXISTS "plpgsql";

-- Store configuration
CREATE TABLE IF NOT EXISTS public.penky_store_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_name TEXT NOT NULL DEFAULT 'Mrs. Penky',
  organization_id TEXT NOT NULL DEFAULT '932735549',
  currency_php_id TEXT NOT NULL DEFAULT '1097528000000097085',
  currency_usd_id TEXT NOT NULL DEFAULT '1097528000000000097',
  paymongo_publishable_key TEXT,
  stripe_publishable_key TEXT,
  ai_chat_enabled BOOLEAN DEFAULT TRUE,
  invoice_auto_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS public.penky_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  price_php NUMERIC(12, 2) NOT NULL CHECK (price_php > 0),
  price_usd NUMERIC(12, 2) CHECK (price_usd > 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_urls TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  active BOOLEAN DEFAULT TRUE,
  sku TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders
CREATE TABLE IF NOT EXISTS public.penky_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'new' CHECK (order_status IN ('new', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_amount_php NUMERIC(12, 2) NOT NULL CHECK (total_amount_php >= 0),
  total_amount_usd NUMERIC(12, 2),
  currency_code TEXT NOT NULL DEFAULT 'PHP' CHECK (currency_code IN ('PHP', 'USD')),
  primary_currency TEXT NOT NULL DEFAULT 'PHP',
  metadata JSONB DEFAULT '{}',
  zoho_invoice_id TEXT,
  webhook_delivered BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT penky_orders_email_format CHECK (customer_email ~ '^[^@]+@[^@]+$')
);

CREATE INDEX idx_penky_orders_payment_status ON public.penky_orders(payment_status);
CREATE INDEX idx_penky_orders_order_status ON public.penky_orders(order_status);
CREATE INDEX idx_penky_orders_created_at ON public.penky_orders(created_at DESC);
CREATE INDEX idx_penky_orders_customer_email ON public.penky_orders(customer_email);

-- Order items
CREATE TABLE IF NOT EXISTS public.penky_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.penky_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.penky_products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_php NUMERIC(12, 2) NOT NULL CHECK (unit_price_php > 0),
  unit_price_usd NUMERIC(12, 2),
  subtotal_php NUMERIC(12, 2) NOT NULL CHECK (subtotal_php > 0),
  subtotal_usd NUMERIC(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_penky_order_items_order_id ON public.penky_order_items(order_id);
CREATE INDEX idx_penky_order_items_product_id ON public.penky_order_items(product_id);

-- Webhook events (idempotency)
CREATE TABLE IF NOT EXISTS public.penky_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  gateway TEXT NOT NULL CHECK (gateway IN ('paymongo', 'stripe')),
  external_event_id TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.penky_orders(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_penky_webhook_events_order_id ON public.penky_webhook_events(order_id);
CREATE INDEX idx_penky_webhook_events_processed ON public.penky_webhook_events(processed);
CREATE INDEX idx_penky_webhook_events_gateway ON public.penky_webhook_events(gateway);

-- Integration tokens (DO NOT expose to frontend)
CREATE TABLE IF NOT EXISTS public.penky_integration_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL UNIQUE CHECK (service IN ('zoho_books', 'paymongo', 'stripe')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.penky_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penky_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penky_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penky_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penky_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penky_integration_tokens ENABLE ROW LEVEL SECURITY;

-- Public, read-only info. Intentionally open.
CREATE POLICY "penky_store_settings_public_read" ON public.penky_store_settings FOR SELECT USING (TRUE);
CREATE POLICY "penky_products_public_read_active" ON public.penky_products FOR SELECT USING (active = TRUE);

-- penky_orders / penky_order_items / penky_webhook_events / penky_integration_tokens:
-- NO policies for anon/authenticated on purpose. Only Edge Functions
-- (service_role, which bypasses RLS) may read or write these tables.

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO public.penky_store_settings (organization_name, organization_id, currency_php_id, currency_usd_id, ai_chat_enabled, invoice_auto_enabled)
VALUES ('Mrs. Penky', '932735549', '1097528000000097085', '1097528000000000097', TRUE, TRUE) ON CONFLICT DO NOTHING;
