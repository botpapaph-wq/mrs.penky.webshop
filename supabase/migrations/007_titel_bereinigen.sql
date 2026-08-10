-- ============================================================================
-- Mrs. Penky
-- Migration 007: Produkttitel entwirren
--
-- Die Titel kommen unbearbeitet aus dem CJ-Katalog und tragen die Spuren
-- einer Maschinenuebersetzung:
--
--   "Cross Virgin Magic Pendant Pendant"
--   "Beaded cross accessory bracelet bracelet"
--   "Wooden Beads Cross Catholic Rosary Rosary Bracelet"
--   "Candlelight dinner golden candle candle decoration"
--   "Cross-border New Zircon Cross Pendant"   (跨境 = Export, kein Merkmal)
--
-- Dazu drei Artikel namens "Cross pendant necklace", zwei "Jesus cross
-- pendant", zwei "Cross bracelet" -- fuer einen Kunden nicht unterscheidbar.
--
-- REVERSIBEL: penky_title_backup haelt den Titel vor der Aenderung.
-- Mehrfach ausfuehrbar.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.penky_title_backup (
  product_id UUID PRIMARY KEY,
  title_before TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.penky_title_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO public.penky_title_backup (product_id, title_before)
SELECT id, title FROM public.penky_products
ON CONFLICT (product_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Unmittelbar wiederholte Woerter zusammenziehen
--
-- Die Rueckreferenz \1 trifft dasselbe Wort noch einmal, auch mit anderer
-- Gross-/Kleinschreibung. Damit wird aus "Pendant Pendant" ein "Pendant" und
-- aus "Rosary Rosary Bracelet" ein "Rosary Bracelet", ohne jeden Titel
-- einzeln aufzuzaehlen.
-- ---------------------------------------------------------------------------
UPDATE public.penky_products
SET title = btrim(regexp_replace(
      regexp_replace(title, '\y(\w+)(\s+\1\y)+', '\1', 'gi'),
      '\s{2,}', ' ', 'g')),
    updated_at = CURRENT_TIMESTAMP
WHERE title ~* '\y(\w+)\s+\1\y';

-- ---------------------------------------------------------------------------
-- 2. Handelsjargon entfernen
--
-- "Cross-border" ist die Uebersetzung von 跨境 und beschreibt den Versandweg
-- des Haendlers, nicht das Produkt. "New" sagt im Dauerkatalog nichts aus.
-- ---------------------------------------------------------------------------
UPDATE public.penky_products
SET title = btrim(regexp_replace(
      regexp_replace(title, '\y(cross.border|foreign trade)\y[ ,-]*', '', 'gi'),
      '\s{2,}', ' ', 'g')),
    updated_at = CURRENT_TIMESTAMP
WHERE title ~* '\y(cross.border|foreign trade)\y';

UPDATE public.penky_products
SET title = btrim(regexp_replace(title, '^new\s+', '', 'i')),
    updated_at = CURRENT_TIMESTAMP
WHERE title ~* '^new\s+';

-- Erster Buchstabe gross, falls Schritt 2 ihn abgeschnitten hat.
UPDATE public.penky_products
SET title = upper(left(title, 1)) || substr(title, 2)
WHERE title ~ '^[a-z]';

-- ---------------------------------------------------------------------------
-- 3. Gleichnamige Artikel unterscheidbar machen
--
-- Kein erfundenes Merkmal: das Unterscheidungswort wird aus der eigenen
-- Beschreibung genommen. Findet sich dort keins, bleibt der Titel wie er ist
-- und taucht in der Kontrollabfrage am Ende wieder auf.
-- ---------------------------------------------------------------------------
WITH material AS (
  SELECT id,
         title,
         (regexp_match(
            coalesce(description, ''),
            '\y(stainless steel|sterling silver|silver|gold plated|gold|copper|brass|alloy|titanium|leather|cowhide|wooden|wood|zircon|crystal|resin|glass|ceramic|pearl)\y',
            'i'
          ))[1] AS material
  FROM public.penky_products
  WHERE active IS TRUE
),
dupes AS (
  SELECT lower(btrim(title)) AS key
  FROM public.penky_products
  WHERE active IS TRUE
  GROUP BY 1
  HAVING count(*) > 1
),
renamable AS (
  -- DISTINCT ON: pro Titel bleibt genau ein Artikel unveraendert, damit nicht
  -- alle drei einen Zusatz bekommen, wenn nur zwei ihn brauchen.
  SELECT DISTINCT ON (lower(btrim(m.title)), m.material)
         m.id, m.title, m.material
  FROM material m
  JOIN dupes d ON d.key = lower(btrim(m.title))
  WHERE m.material IS NOT NULL
  ORDER BY lower(btrim(m.title)), m.material, m.id
)
UPDATE public.penky_products p
SET title = r.title || ' – ' || initcap(r.material),
    updated_at = CURRENT_TIMESTAMP
FROM renamable r
WHERE p.id = r.id
  AND p.title NOT LIKE '% – %';

COMMIT;

-- ---------------------------------------------------------------------------
-- Kontrolle
-- ---------------------------------------------------------------------------
-- Was ist noch doppelt?
-- SELECT title, count(*) FROM penky_products WHERE active IS TRUE
--   GROUP BY title HAVING count(*) > 1 ORDER BY 2 DESC;
--
-- Gibt es noch Wortdoppelungen?
-- SELECT title FROM penky_products WHERE active IS TRUE
--   AND title ~* '\y(\w+)\s+\1\y';
--
-- Was wurde geaendert?
-- SELECT b.title_before, p.title FROM penky_title_backup b
--   JOIN penky_products p ON p.id = b.product_id
--   WHERE b.title_before <> p.title ORDER BY 1;

-- ============================================================================
-- RUECKNAHME
-- ============================================================================
-- BEGIN;
--   UPDATE public.penky_products p
--   SET title = b.title_before
--   FROM public.penky_title_backup b
--   WHERE p.id = b.product_id;
--   DELETE FROM public.penky_title_backup;
-- COMMIT;
-- ============================================================================
