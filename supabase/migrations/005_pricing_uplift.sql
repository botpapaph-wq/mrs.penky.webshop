-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Migration 005: Preise anheben
--
-- Ersetzt die Untergrenze aus Migration 003 (PHP 199) durch PHP 249 und
-- setzt zusätzlich eine Mindestspanne von 65 % auf den Einkaufspreis.
--
-- WICHTIG -- Unterschied zu 003:
-- Seit Migration 004 wird der Versand dem Kunden getrennt berechnet. Er darf
-- deshalb NICHT mehr im Verkaufspreis stecken, sonst zahlt der Kunde ihn
-- zweimal. Diese Migration rechnet nur noch Einkauf + Spanne.
--
-- Rechnung:  Preis = Einkauf / 0,35        (= 65 % Rohertrag)
--            danach auf glatte Zehner minus 1 gerundet
--            Untergrenze PHP 249
--
-- Beispiel: Armband, Einkauf USD 0,55 = PHP 33
--           33 / 0,35 = PHP 94  ->  Untergrenze greift  ->  PHP 249
--           Rohertrag PHP 216, der Versand liegt daneben beim Kunden.
--
-- REVERSIBEL: alte Preise gehen nach penky_price_history, Rücknahme am Ende.
-- Diese Datei ist eigenständig -- sie läuft auch, wenn 003 nie ausgeführt
-- wurde, und ist mehrfach ausführbar.
-- ============================================================================

-- Sicherheitsnetz, falls 003 nicht gelaufen ist
CREATE TABLE IF NOT EXISTS public.penky_price_history (
  id            BIGSERIAL PRIMARY KEY,
  product_id    UUID NOT NULL,
  old_price_php NUMERIC(12,2),
  new_price_php NUMERIC(12,2),
  reason        TEXT,
  changed_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.penky_price_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Zielpreis als Funktion, damit die Regel lesbar bleibt
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.penky_target_price_php(
  cost_price_usd NUMERIC,
  usd_php_rate   NUMERIC DEFAULT 60.70
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    249,
    ROUND( (COALESCE(cost_price_usd,0) * usd_php_rate / 0.35) / 10 ) * 10 - 1
  );
$$;

COMMENT ON FUNCTION public.penky_target_price_php(NUMERIC, NUMERIC) IS
  '65 % Rohertrag auf den Einkaufspreis, Untergrenze PHP 249. Ohne Versand -- der wird seit Migration 004 getrennt berechnet.';

-- ---------------------------------------------------------------------------
-- Anheben. Nur nach oben: ein bereits höher kalkulierter Preis bleibt stehen.
-- ---------------------------------------------------------------------------
INSERT INTO public.penky_price_history (product_id, old_price_php, new_price_php, reason)
SELECT id, price_php, public.penky_target_price_php(cost_price_usd), 'Anhebung 65 % / Untergrenze PHP 249 (Migration 005)'
FROM public.penky_products
WHERE price_php < public.penky_target_price_php(cost_price_usd);

UPDATE public.penky_products
SET price_php = public.penky_target_price_php(cost_price_usd)
WHERE price_php < public.penky_target_price_php(cost_price_usd);

-- ---------------------------------------------------------------------------
-- Zwei Artikel bleiben unwirtschaftlich, weil ihr Versand allein den Preis
-- übersteigt: 320 g LED-Kerze und 269 g Metallarmband. Seit 004 zahlt den
-- Versand zwar der Kunde -- aber PHP 285 Porto auf einen PHP 249 Artikel
-- verkauft sich nicht. Deaktiviert, nicht gelöscht.
-- ---------------------------------------------------------------------------
UPDATE public.penky_products
SET active = FALSE
WHERE active AND weight_g >= 250 AND price_php <= 300;

-- ---------------------------------------------------------------------------
-- Kontrolle
-- ---------------------------------------------------------------------------
-- SELECT min(price_php), max(price_php), count(*) FILTER (WHERE NOT active)
-- FROM public.penky_products;

-- ---------------------------------------------------------------------------
-- RÜCKNAHME
-- ---------------------------------------------------------------------------
-- UPDATE public.penky_products p
-- SET price_php = h.old_price_php
-- FROM public.penky_price_history h
-- WHERE h.product_id = p.id
--   AND h.reason = 'Anhebung 65 % / Untergrenze PHP 249 (Migration 005)';
