/**
 * Produkt-Sitemap unter /sitemap-products.xml
 *
 * Getrennt von der statischen sitemap.xml, weil sich der Produktbestand mit
 * jedem CJ-Sync ändert. Eine gepflegte Liste im Repo wäre nach dem ersten
 * Sync falsch: sie enthielte Artikel, die es nicht mehr gibt, und keine der
 * neu hinzugekommenen. Diese Fassung liest den Bestand bei jedem Abruf.
 *
 * Der Slug muss zeichengleich zu dem in functions/p/[slug].js sein, sonst
 * meldet die Sitemap Adressen, die mit 301 auf eine andere umleiten -- kein
 * Fehler, aber ein Grund, warum Google eine Seite langsamer aufnimmt.
 */

export async function onRequestGet({ env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return new Response('Not configured', { status: 503 });
  }

  const url =
    `${env.SUPABASE_URL}/rest/v1/penky_products` +
    `?select=id,title,updated_at&active=eq.true&order=updated_at.desc&limit=1000`;

  let rows = [];
  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`REST ${res.status}`);
    rows = await res.json();
  } catch (err) {
    console.error('Sitemap lookup failed:', err);
    return new Response('Temporarily unavailable', { status: 503 });
  }

  const entries = rows
    .map((p) => {
      const loc = `https://www.mrspenky.shop/p/${makeSlug(p.title, p.id)}`;
      const mod = (p.updated_at || '').slice(0, 10);
      return (
        '  <url><loc>' + xml(loc) + '</loc>' +
        (mod ? '<lastmod>' + mod + '</lastmod>' : '') +
        '<changefreq>weekly</changefreq><priority>0.8</priority></url>'
      );
    })
    .join('\n');

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries + '\n' +
    '</urlset>\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=900, must-revalidate',
    },
  });
}

function makeSlug(title, id) {
  const base = String(title || 'item')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${base || 'item'}-${String(id).slice(0, 8)}`;
}

function xml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
