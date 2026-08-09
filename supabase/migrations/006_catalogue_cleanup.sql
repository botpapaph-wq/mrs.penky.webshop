-- ============================================================================
-- Mrs. Penky E-Commerce Platform
-- Migration 006: Katalog bereinigen
--
-- Zwei Dinge, die ein Devotionalienshop nicht anbieten sollte:
--
--   1. Artikel, die thematisch nicht passen. Eine Halloween-Augapfelkerze und
--      eine Buddha-Giessform stehen derzeit zwischen Rosenkraenzen. Dazu neun
--      Kerzengiessformen, Dochte und ein "Rosary drill cutter" -- das ist
--      Bastelbedarf und Werkzeug, kein Andachtsgegenstand. Die Kategorie
--      "Lights" bestand ueberwiegend daraus.
--
--   2. Eine Fertigungsbehauptung im Produkttitel. "Catholic rosary necklace
--      handmade" widerspricht der eigenen FAQ, die ausdruecklich sagt, dass
--      nichts handgefertigt ist.
--
-- Was BLEIBT unter "Lights": Grablichter und Memorial-Kerzen, Duftkerzen,
-- die Engelsfluegel-Kerze, Kerzenhalter und Kerzenglaeser.
--
-- REVERSIBEL: Ruecknahme am Dateiende. Nichts wird geloescht, nur
-- deaktiviert -- Bestellhistorie und Fremdschluessel bleiben intakt.
-- Mehrfach ausfuehrbar.
--
-- Ausfuehren im Supabase SQL-Editor (Service-Role).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Protokolltabelle: festhalten, was warum verschwunden ist. Ohne das laesst
-- sich spaeter nicht mehr unterscheiden, ob ein Artikel bewusst ausgelistet
-- oder versehentlich vom CJ-Sync deaktiviert wurde.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.penky_delisted (
  id          BIGSERIAL PRIMARY KEY,
  product_id  UUID NOT NULL,
  title       TEXT,
  reason      TEXT NOT NULL,
  delisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.penky_delisted ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. Namentlich benannte Artikel
--
-- Match ueber die UUID UND den Titel: die UUID ist eindeutig, der Titel ist
-- die Absicherung, falls ein Re-Sync die IDs neu vergeben hat. Trifft eine
-- der beiden Bedingungen zu, greift die Regel.
-- ---------------------------------------------------------------------------
WITH targets(product_id, product_title, reason) AS (
  VALUES
    ('27cc9b49-f219-4ae1-97bd-fbceb911be45'::uuid,
     'Eyeball Candle Halloween  Floating Candle',
     'Halloween-Motiv -- passt nicht zu einem Devotionalienshop'),

    ('45ae50b2-5734-4545-a445-eb51a080c231'::uuid,
     'Religious Element Buddha Modeling Candle Silicone Mold',
     'Buddha-Motiv und Giessform -- weder katholisch noch Fertigprodukt'),

    ('81ead23d-99b5-4099-9e54-88bc865fc047'::uuid,
     'Rosary drill cutter',
     'Werkzeug zur Rosenkranzherstellung, kein Andachtsgegenstand'),

    ('5ad1d348-7348-4b93-a3ba-bc753ef66875'::uuid,
     'Candle Diy Material Candle Lamp Wick Aromatherapy Candle Material',
     'Kerzendochte -- Bastelmaterial'),

    ('c00e486c-c1a3-44b9-a160-0934b0305eee'::uuid,
     'DIY Candle Wick Material Candle Maker',
     'Kerzendochte -- Bastelmaterial'),

    ('07bf8cc2-635a-4730-8890-488eb50ed6ed'::uuid,
     'Shell Candle Mould Homemade Aromatherapy Candle',
     'Kerzengiessform -- Bastelmaterial'),

    ('484e92b6-042f-4f6b-9272-7281f562aa19'::uuid,
     'Candle Mold Creative Candle Mold Square Weave Pattern Candle Mold Color Candle Mold',
     'Kerzengiessform -- Bastelmaterial'),

    ('858a0c48-d616-44e4-828a-998d7c1d021e'::uuid,
     'Candle Acrylic Mold Scented Candle Diy Mold',
     'Kerzengiessform -- Bastelmaterial'),

    ('0ea84487-9ad9-4b31-b2ed-9b3a3f9a2bfb'::uuid,
     'Lion Candle Mold Handmade Candle Scented Candle DIY Material',
     'Kerzengiessform -- Bastelmaterial'),

    ('ffc237e0-406e-4e49-976a-82bf2f24af4c'::uuid,
     'Screw Wax Silicone Mold Rotating Lace Candle Mold',
     'Kerzengiessform -- Bastelmaterial'),

    ('e868cec9-52a0-4095-80c8-281156261120'::uuid,
     'Plastic Candle Mold for Candle Making - Taper Candle Mould',
     'Kerzengiessform -- Bastelmaterial')
),
matched AS (
  -- DISTINCT ON: ein Produkt kann sowohl ueber die UUID als auch ueber den
  -- Titel treffen. Ohne das stuende es doppelt im Protokoll.
  SELECT DISTINCT ON (p.id) p.id, p.title, t.reason
  FROM public.penky_products p
  JOIN targets t
    ON p.id = t.product_id
    OR lower(btrim(p.title)) = lower(btrim(t.product_title))
  WHERE p.active IS TRUE
  ORDER BY p.id
),
logged AS (
  INSERT INTO public.penky_delisted (product_id, title, reason)
  SELECT id, title, reason FROM matched
  RETURNING product_id
)
UPDATE public.penky_products p
SET active = FALSE,
    updated_at = CURRENT_TIMESTAMP
FROM logged
WHERE p.id = logged.product_id;

-- ---------------------------------------------------------------------------
-- 2. Sicherheitsnetz fuer kuenftige CJ-Importe
--
-- Der Sync legt neue Artikel an. Ohne diese Regel waere der Katalog nach dem
-- naechsten Lauf wieder voller Giessformen. Bewusst eng gefasst: "candle
-- holder" und "candle cup" sind ausgenommen, das sind fertige Produkte.
-- ---------------------------------------------------------------------------
WITH junk AS (
  SELECT id, title
  FROM public.penky_products
  WHERE active IS TRUE
    AND (
         title ~* '\y(mold|mould)\y'
      OR title ~* '\ywick\y'
      OR title ~* '\yhalloween\y'
      OR title ~* '\ybuddha\y'
      OR title ~* '\y(diy|do.it.yourself)\y'
    )
    AND title !~* '\ycandle (holder|cup|tray|jar)\y'
),
logged AS (
  INSERT INTO public.penky_delisted (product_id, title, reason)
  SELECT id, title, 'Musterfilter: Giessform / Docht / DIY / Halloween / Buddha'
  FROM junk
  RETURNING product_id
)
UPDATE public.penky_products p
SET active = FALSE,
    updated_at = CURRENT_TIMESTAMP
FROM logged
WHERE p.id = logged.product_id;

-- ---------------------------------------------------------------------------
-- 3. "handmade" aus Produkttiteln entfernen
--
-- Die FAQ sagt ausdruecklich, dass nichts handgefertigt ist. Ein Titel, der
-- das Gegenteil behauptet, ist im Streitfall eine Zusicherung.
-- ---------------------------------------------------------------------------
UPDATE public.penky_products
SET title = btrim(regexp_replace(
      regexp_replace(title, '\y(handmade|hand.made|handcrafted|hand.crafted)\y', '', 'gi'),
      '\s{2,}', ' ', 'g')),
    updated_at = CURRENT_TIMESTAMP
WHERE title ~* '\y(handmade|hand.made|handcrafted|hand.crafted)\y';

-- Dasselbe fuer Beschreibungen, soweit vorhanden.
UPDATE public.penky_products
SET description = regexp_replace(description, '\y(handmade|handcrafted)\y', 'selected', 'gi'),
    updated_at = CURRENT_TIMESTAMP
WHERE description IS NOT NULL
  AND description ~* '\y(handmade|handcrafted)\y';

COMMIT;

-- ---------------------------------------------------------------------------
-- Kontrolle
-- ---------------------------------------------------------------------------
-- SELECT reason, count(*) FROM public.penky_delisted GROUP BY reason;
-- SELECT title, price_php FROM public.penky_products
--   WHERE category = 'lights' AND active IS TRUE ORDER BY price_php;
-- SELECT count(*) AS aktiv FROM public.penky_products WHERE active IS TRUE;

-- ============================================================================
-- RUECKNAHME
-- ============================================================================
-- BEGIN;
--   UPDATE public.penky_products p
--   SET active = TRUE
--   FROM public.penky_delisted d
--   WHERE p.id = d.product_id;
--
--   DELETE FROM public.penky_delisted;
-- COMMIT;
--
-- Hinweis: die Titelaenderung aus Schritt 3 laesst sich so nicht
-- zurueckdrehen -- das Wort "handmade" ist dann weg. Das ist beabsichtigt.
-- ============================================================================
