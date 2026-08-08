-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Migration 003: Preisuntergrenze PHP 199 und Auslistung nicht tragfähiger Artikel
--
-- Grundlage: docs/MARGIN_ANALYSIS.md und docs/PREISVORSCHLAG.md.
-- Gemessene CJ-Tarife China -> Philippinen, Kurs 60,70 PHP/USD.
--
-- REVERSIBEL: die alten Preise werden vorher in penky_price_history
-- gesichert. Rücknahme steht am Ende dieser Datei.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Versandkosten als Funktion, damit die Regel nachvollziehbar bleibt
--    und nicht als Zahlenkolonne im Update versteckt ist.
--    Stützstellen aus CJs Rechner, dazwischen linear interpoliert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.penky_ship_usd(weight_g INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN weight_g IS NULL     THEN 3.73                       -- unbekannt: 200-g-Annahme
    WHEN weight_g <=   10     THEN 1.60
    WHEN weight_g <=   50     THEN 1.60 + (2.06-1.60)*(weight_g-  10)/  40.0
    WHEN weight_g <=  100     THEN 2.06 + (2.63-2.06)*(weight_g-  50)/  50.0
    WHEN weight_g <=  200     THEN 2.63 + (3.73-2.63)*(weight_g- 100)/ 100.0
    WHEN weight_g <=  300     THEN 3.73 + (4.56-3.73)*(weight_g- 200)/ 100.0
    WHEN weight_g <=  500     THEN 4.56 + (5.83-4.56)*(weight_g- 300)/ 200.0
    WHEN weight_g <= 1000     THEN 5.83 + (9.00-5.83)*(weight_g- 500)/ 500.0
    ELSE 9.00 + (9.00-5.83)/500.0*(weight_g-1000)             -- darüber extrapoliert
  END;
$$;

COMMENT ON FUNCTION public.penky_ship_usd(INTEGER) IS
  'Günstigste CJ-Versandoption China->Philippinen in USD, gemessen 2026-08-08. Nur Attribut "Ordinary".';

-- ---------------------------------------------------------------------------
-- 2. Alte Preise sichern, bevor irgendetwas angefasst wird
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.penky_price_history (
  id           BIGSERIAL PRIMARY KEY,
  product_id   UUID NOT NULL,
  old_price_php NUMERIC(12,2),
  new_price_php NUMERIC(12,2),
  reason       TEXT,
  changed_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.penky_price_history ENABLE ROW LEVEL SECURITY;
-- Keine Policies: nur der service_role_key kommt heran, so wie bei
-- penky_cj_auth_state. Preishistorie geht Besucher nichts an.

-- ---------------------------------------------------------------------------
-- 3. Untergrenze PHP 199
--    33 Artikel liegen darunter (14 Armbänder, 8 Kreuze, 8 Rosenkränze,
--    3 Lichter). Ein Devotionalienshop mit PHP-10-Artikeln wirkt nicht
--    günstig, sondern billig -- beim Taufgeschenk das falsche Signal.
-- ---------------------------------------------------------------------------
INSERT INTO public.penky_price_history (product_id, old_price_php, new_price_php, reason)
SELECT id, price_php, 199, 'Untergrenze PHP 199 (Migration 003)'
FROM public.penky_products
WHERE price_php < 199;

UPDATE public.penky_products
SET price_php = 199
WHERE price_php < 199;

-- ---------------------------------------------------------------------------
-- 4. Artikel auslisten, die auch bei PHP 199 Verlust machen
--    Betrifft schwere Billigware: der Versand allein übersteigt den Preis.
--    Nicht gelöscht, nur deaktiviert -- rückgängig zu machen.
-- ---------------------------------------------------------------------------
UPDATE public.penky_products
SET active = FALSE
WHERE active
  AND 199 - (COALESCE(cost_price_usd,0) * 60.70)
          - (public.penky_ship_usd(weight_g) * 60.70) < 0;

-- ---------------------------------------------------------------------------
-- 5. Ladeneinstellungen für Mindestbestellwert
-- ---------------------------------------------------------------------------
INSERT INTO public.penky_store_settings (key, value)
VALUES ('min_order_php', '500')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.penky_store_settings (key, value)
VALUES ('usd_php_rate', '60.70')
ON CONFLICT (key) DO NOTHING;   -- vorhandenen Kurs nicht überschreiben

-- ---------------------------------------------------------------------------
-- Kontrolle nach dem Lauf
-- ---------------------------------------------------------------------------
-- SELECT count(*) FILTER (WHERE price_php < 199)          AS unter_199,
--        count(*) FILTER (WHERE NOT active)               AS deaktiviert,
--        count(*)                                          AS gesamt
-- FROM public.penky_products;

-- ---------------------------------------------------------------------------
-- RÜCKNAHME (nicht ausführen, sofern nicht gewollt)
-- ---------------------------------------------------------------------------
-- UPDATE public.penky_products p
-- SET price_php = h.old_price_php
-- FROM public.penky_price_history h
-- WHERE h.product_id = p.id
--   AND h.reason = 'Untergrenze PHP 199 (Migration 003)';
--
-- UPDATE public.penky_products SET active = TRUE WHERE NOT active;
