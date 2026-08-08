-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Migration 004: Versand wird dem Kunden berechnet
--
-- Entscheidung vom 08.08.2026: Der Versand wird sichtbar ausgewiesen statt in
-- die Produktpreise eingerechnet. Grund steht in docs/MARGIN_ANALYSIS.md --
-- Versand schwankt zwischen PHP 97 und 546 je nach Gewicht und zwischen
-- PHP 227 (Manila) und 329 (Riad) je nach Ziel. Ein Aufschlag auf jeden
-- Artikel würde leichte Ware verteuern, schwere subventionieren und einen
-- Warenkorb mit drei Stücken dreifach belasten, obwohl der Versand dabei nur
-- von PHP 111 auf 153 steigt.
--
-- Voraussetzung: Migration 003 muss gelaufen sein.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Bestellungen führen Versand getrennt von der Warensumme
--    total_amount_php enthält ab jetzt Ware + Versand; subtotal_php die Ware
--    allein. Bestehende Zeilen behalten ihre Summe und bekommen Versand 0 --
--    für die wurde nie Versand berechnet, das bleibt korrekt.
-- ---------------------------------------------------------------------------
ALTER TABLE public.penky_orders
  ADD COLUMN IF NOT EXISTS subtotal_php     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shipping_fee_php NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method  TEXT;

COMMENT ON COLUMN public.penky_orders.subtotal_php IS
  'Warenwert ohne Versand.';
COMMENT ON COLUMN public.penky_orders.shipping_fee_php IS
  'Dem Kunden berechneter Versand. 0 bei Gratisversand oder Altbestellungen.';
COMMENT ON COLUMN public.penky_orders.shipping_method IS
  'Von CJ gewählte Versandart, z. B. "CJPacket Asia Ordinary". Wird an forward-order weitergereicht.';

UPDATE public.penky_orders
SET subtotal_php = total_amount_php
WHERE subtotal_php IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Gratisversand-Schwelle
--    PHP 800: bei drei Artikeln kostet der Versand rund PHP 153, das sind
--    19 % des Warenwerts und damit tragbar. Niedriger angesetzt frisst die
--    Schwelle die Marge, höher angesetzt wirkt sie nicht mehr als Anreiz.
-- ---------------------------------------------------------------------------
INSERT INTO public.penky_store_settings (key, value)
VALUES ('free_shipping_threshold_php', '800')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ---------------------------------------------------------------------------
-- Kontrolle
-- ---------------------------------------------------------------------------
-- SELECT key, value FROM public.penky_store_settings
--  WHERE key IN ('min_order_php','free_shipping_threshold_php','usd_php_rate');

-- ---------------------------------------------------------------------------
-- RÜCKNAHME
-- ---------------------------------------------------------------------------
-- ALTER TABLE public.penky_orders
--   DROP COLUMN IF EXISTS subtotal_php,
--   DROP COLUMN IF EXISTS shipping_fee_php,
--   DROP COLUMN IF EXISTS shipping_method;
-- DELETE FROM public.penky_store_settings WHERE key = 'free_shipping_threshold_php';
