-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Supabase Postgres Schema + RLS
-- Production: PHP/USD dual-currency, Invoicing via Zoho Books
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "http";
CREATE EXTENSION IF NOT EXISTS "plpgsql";

-- Store configuration
CREATE TABLE IF NOT EXISTS public.store_settings (
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
CREATE TABLE IF NOT EXISTS public.products (
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
CREATE TABLE IF NOT EXISTS public.orders (
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
  CONSTRAINT email_format CHECK (customer_email ~ '^[^@]+@[^@]+$')
);

CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_order_status ON public.orders(order_status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_php NUMERIC(12, 2) NOT NULL CHECK (unit_price_php > 0),
  unit_price_usd NUMERIC(12, 2),
  subtotal_php NUMERIC(12, 2) NOT NULL CHECK (subtotal_php > 0),
  subtotal_usd NUMERIC(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);

-- Webhook events (idempotency)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  gateway TEXT NOT NULL CHECK (gateway IN ('paymongo', 'stripe')),
  external_event_id TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  signature_verified BOOLEAN DEFAULT FALSE,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_order_id ON public.webhook_events(order_id);
CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);
CREATE INDEX idx_webhook_events_gateway ON public.webhook_events(gateway);

-- Integration tokens (DO NOT expose to frontend)
CREATE TABLE IF NOT EXISTS public.integration_tokens (
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

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_settings_public_read" ON public.store_settings FOR SELECT USING (TRUE);
CREATE POLICY "store_settings_no_write" ON public.store_settings FOR INSERT WITH CHECK (FALSE);

CREATE POLICY "products_public_read_active" ON public.products FOR SELECT USING (active = TRUE);
CREATE POLICY "products_no_write" ON public.products FOR INSERT WITH CHECK (FALSE);

CREATE POLICY "orders_read_all" ON public.orders FOR SELECT USING (TRUE);
CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "order_items_read" ON public.order_items FOR SELECT USING (TRUE);
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "webhook_events_insert" ON public.webhook_events FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "webhook_events_update" ON public.webhook_events FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "integration_tokens_insert" ON public.integration_tokens FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "integration_tokens_update" ON public.integration_tokens FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- SEED DATA
-- ============================================================================

INSERT INTO public.store_settings (organization_name, organization_id, currency_php_id, currency_usd_id, ai_chat_enabled, invoice_auto_enabled)
VALUES ('Mrs. Penky', '932735549', '1097528000000097085', '1097528000000000097', TRUE, TRUE) ON CONFLICT DO NOTHING;

INSERT INTO public.products (title, description, price_php, price_usd, stock_quantity, category, sku, active) VALUES
('Premium Pensky Tote', 'Luxury handmade tote bag, genuine leather', 2999.00, 54.00, 50, 'bags', 'PENSTOTE-001', TRUE),
('Classic Pensky Wallet', 'RFID-blocking slim wallet', 1299.00, 23.50, 100, 'wallets', 'PENSWALLET-001', TRUE),
('Limited Edition Key Chain', 'Brass and leather key fob', 599.00, 10.75, 25, 'accessories', 'PENSKEYCHAIN-LTD', TRUE),
('Pensky Travel Case', 'Durable carry-on organizer', 4999.00, 90.00, 15, 'bags', 'PENSCASE-TRAVEL', TRUE)
ON CONFLICT (sku) DO NOTHING;
