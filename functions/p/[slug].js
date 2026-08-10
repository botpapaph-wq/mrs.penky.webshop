/**
 * Produktseite unter /p/<slug>
 *
 * Warum serverseitig und nicht als statische Datei je Produkt:
 * der Katalog kommt vom CJ-Sync und ändert sich, ohne dass jemand deployt.
 * Eine bei jedem Aufruf gerenderte Seite ist immer aktuell; vorgebaute
 * Dateien wären es nur bis zum nächsten Sync.
 *
 * Warum überhaupt: bis hierher hatte der Shop 79 Produkte und keine einzige
 * Adresse, die eine Suchmaschine indexieren kann -- Produkte öffneten nur ein
 * Fenster auf der Startseite. Jede Suche nach "rosary necklace Davao" landete
 * zwangsläufig woanders.
 *
 * Der Slug endet auf die ersten acht Zeichen der UUID. Titel ändern sich
 * (Migration 007 tut genau das), IDs nicht -- damit bleibt eine einmal
 * indexierte Adresse gültig, und ein alter Slug mit neuem Titel leitet mit
 * 301 auf die richtige Fassung um, statt ins Leere zu laufen.
 *
 * Benötigte Variablen im Pages-Projekt: SUPABASE_URL, SUPABASE_ANON_KEY.
 */

const CURRENCY = '₱'; // ₱

export async function onRequestGet({ params, env, request }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return new Response('Product pages are not configured.', { status: 503 });
  }

  const slug = String(params.slug || '');
  const idPrefix = slug.slice(-8).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(idPrefix)) return notFound();

  const url =
    `${env.SUPABASE_URL}/rest/v1/penky_products` +
    `?select=id,title,description,price_php,image_urls,category,stock_quantity,active` +
    `&id=like.${idPrefix}*&limit=1`;

  let rows;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`REST ${res.status}`);
    rows = await res.json();
  } catch (err) {
    console.error('Product lookup failed:', err);
    return new Response('Temporarily unavailable.', { status: 503 });
  }

  const p = rows && rows[0];
  if (!p || p.active !== true) return notFound();

  // Der kanonische Slug wird aus dem aktuellen Titel gebildet. Kam der Besucher
  // über einen veralteten, verweist 301 auf den richtigen: eine Adresse pro
  // Produkt, sonst teilt sich die Suchmaschine die Bewertung auf mehrere.
  const canonicalSlug = makeSlug(p.title, p.id);
  if (slug !== canonicalSlug) {
    return Response.redirect(new URL(`/p/${canonicalSlug}`, request.url).toString(), 301);
  }

  return new Response(renderPage(p, canonicalSlug), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Kurz im Edge-Cache, damit ein Preis- oder Bestandswechsel binnen
      // Minuten durchschlägt statt erst nach Stunden.
      'Cache-Control': 'public, max-age=0, s-maxage=300, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function notFound() {
  return new Response(renderNotFound(), {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * CJ-Beschreibungen enthalten rohes HTML aus dem Lieferantenportal, samt
 * Tabellen, Inline-Styles und gelegentlich einem <script>. Nichts davon wird
 * übernommen: nur der Text, in Absätze zerlegt.
 */
function cleanDescription(raw) {
  if (!raw) return [];
  const text = String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]{2,}/g, ' ');
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

function renderPage(p, slug) {
  const price = Number(p.price_php) || 0;
  const img = (p.image_urls && p.image_urls[0]) || '/logo-large.png';
  const paras = cleanDescription(p.description);
  const inStock = p.stock_quantity === null || Number(p.stock_quantity) > 0;
  const canonical = `https://www.mrspenky.shop/p/${slug}`;

  const summary = paras[0]
    ? paras[0].slice(0, 155)
    : `${p.title} from Mrs. Penky. Devotional pieces shipped across the Philippines.`;

  // Nur Angaben, die wirklich stimmen. Keine Bewertungen, keine erfundene
  // Verfügbarkeit -- Google entfernt Rich Results, deren Auszeichnung nicht
  // dem entspricht, was auf der Seite steht.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: [img],
    description: summary,
    category: p.category || undefined,
    sku: String(p.id).slice(0, 8),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'PHP',
      price: price.toFixed(2),
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Mrs. Penky' },
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(p.title)} - Mrs. Penky</title>
<meta name="description" content="${esc(summary)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Mrs. Penky" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(summary)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(img)}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #fff; margin: 0; color: #1C2541;
  }
  .navy { color: #1C2541; }
  .gold { color: #C9A961; }
  .gold-bg { background: #C9A961; }
  .footer-navy { background: #10182E; }
  .logo-img { height: 40px; width: auto; }
  .pill-btn-primary { background: #C9A961; color: #1C2541; }
  .pill-btn-primary:hover { background: #D9BC7C; }
  .card { background: #fff; border: 1px solid #ECE7DA; border-radius: 16px; }
  .card-eyebrow {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    font-weight: 700; color: #C9A961; margin-bottom: 4px;
  }
  .prod-img {
    width: 100%; aspect-ratio: 1/1; object-fit: cover;
    border-radius: 16px; background: #F7F4EC; display: block;
  }
  .stock-yes { color: #1C7C4C; }
  .stock-no { color: #9A3B3B; }
</style>
<link rel="stylesheet" href="/tailwind.css?v=20260810" />
</head>
<body>
<header class="sticky top-0 z-50 bg-white border-b border-gray-100">
  <div class="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
    <a href="/index.html" class="flex items-center gap-2">
      <img src="/logo-header.png" alt="Mrs. Penky" class="logo-img" />
      <span class="text-lg font-bold navy">Mrs. <span class="gold">Penky</span></span>
    </a>
    <nav class="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
      <a href="/index.html#shop" class="hover:text-gray-900">Collections</a>
      <a href="/about.html" class="hover:text-gray-900">Our Story</a>
      <a href="/contact.html" class="hover:text-gray-900">Contact</a>
    </nav>
    <a href="/index.html#shop" class="px-5 py-2.5 rounded-full text-sm font-semibold pill-btn-primary transition">Back to Shop</a>
  </div>
</header>

<div class="max-w-6xl mx-auto px-6 py-10">
  <nav aria-label="Breadcrumb" class="text-sm text-gray-500 mb-8">
    <a href="/index.html" class="hover:text-gray-800">Home</a>
    <span class="mx-2">/</span>
    <a href="/index.html?cat=${esc(p.category || 'all')}#shop" class="hover:text-gray-800">${esc(p.category || 'Collection')}</a>
    <span class="mx-2">/</span>
    <span class="navy">${esc(p.title)}</span>
  </nav>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
    <img src="${esc(img)}" alt="${esc(p.title)}" class="prod-img" loading="eager" />

    <div>
      <p class="card-eyebrow">${esc(p.category || 'Devotional')}</p>
      <h1 class="text-3xl lg:text-4xl font-bold navy mb-4" style="letter-spacing:-0.5px;">${esc(p.title)}</h1>
      <p class="text-3xl font-bold gold mb-2">${CURRENCY}${price.toLocaleString('en-PH')}</p>
      <p class="text-sm mb-6 ${inStock ? 'stock-yes' : 'stock-no'}">
        ${inStock ? 'In stock' : 'Currently unavailable'}
      </p>

      <button id="addBtn"
        class="w-full sm:w-auto px-8 py-3.5 rounded-full font-semibold pill-btn-primary transition mb-3"
        ${inStock ? '' : 'disabled style="opacity:.45;cursor:not-allowed;"'}>
        Add to cart
      </button>
      <p id="added" class="text-sm stock-yes mb-6" hidden>Added. <a href="/checkout.html" class="underline">Go to checkout</a></p>

      <div class="card p-6 text-sm text-gray-700 space-y-2">
        <p><strong class="navy">Free shipping</strong> on orders from ${CURRENCY}800.</p>
        <p>Postage is shown before you pay, never added afterwards.</p>
        <p>7 days to report a problem with your parcel.</p>
      </div>
    </div>
  </div>

  ${paras.length ? `
  <div class="card p-8 mt-10 max-w-3xl">
    <p class="card-eyebrow">Details</p>
    <div class="text-sm text-gray-700 leading-relaxed space-y-3">
      ${paras.map((t) => `<p>${esc(t)}</p>`).join('')}
    </div>
  </div>` : ''}
</div>

<footer class="footer-navy text-white pt-16 pb-8 mt-8">
  <div class="max-w-7xl mx-auto px-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
      <div class="col-span-2 md:col-span-1">
        <div class="flex items-center gap-2 mb-4">
          <img src="/logo-header.png" alt="Mrs. Penky" class="logo-img" />
          <span class="text-lg font-bold">Mrs. <span class="gold">Penky</span></span>
        </div>
        <p class="text-sm text-white/60 leading-relaxed">
          Devotional gifts and keepsakes. Shipping across the Philippines and Southeast Asia.
        </p>
      </div>
      <div>
        <p class="text-xs tracking-[2px] uppercase gold font-semibold mb-4">Shop</p>
        <ul class="space-y-2 text-sm text-white/70">
          <li><a href="/index.html?cat=crosses#shop" class="hover:text-white">Crosses</a></li>
          <li><a href="/index.html?cat=rosaries#shop" class="hover:text-white">Rosaries</a></li>
          <li><a href="/index.html?cat=bracelets#shop" class="hover:text-white">Bracelets</a></li>
          <li><a href="/index.html?cat=lights#shop" class="hover:text-white">Lights</a></li>
        </ul>
      </div>
      <div>
        <p class="text-xs tracking-[2px] uppercase gold font-semibold mb-4">Info</p>
        <ul class="space-y-2 text-sm text-white/70">
          <li><a href="/about.html" class="hover:text-white">About Us</a></li>
          <li><a href="/contact.html" class="hover:text-white">Contact</a></li>
          <li><a href="/shipping.html" class="hover:text-white">Shipping</a></li>
          <li><a href="/faq.html" class="hover:text-white">FAQ</a></li>
        </ul>
      </div>
      <div>
        <p class="text-xs tracking-[2px] uppercase gold font-semibold mb-4">Legal</p>
        <ul class="space-y-2 text-sm text-white/70">
          <li><a href="/terms.html" class="hover:text-white">Terms of Service</a></li>
          <li><a href="/privacy.html" class="hover:text-white">Privacy Policy</a></li>
          <li><a href="/refund.html" class="hover:text-white">Refund Policy</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-white/10 pt-8 text-center text-xs text-white/50">
      &copy; 2026 Mrs. Penky &middot; Davao City, Philippines
    </div>
  </div>
</footer>

<script>
  // Gleiches Warenkorbformat wie index.html und checkout.html:
  // { product_id, title, price_php, quantity }
  (function () {
    var item = ${JSON.stringify({
      product_id: p.id,
      title: p.title,
      price_php: price,
      quantity: 1,
    })};
    var btn = document.getElementById('addBtn');
    if (!btn || btn.disabled) return;
    btn.addEventListener('click', function () {
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch (e) {}
      var found = cart.find(function (i) { return i.product_id === item.product_id; });
      if (found) { found.quantity += 1; } else { cart.push(item); }
      try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {}
      document.getElementById('added').hidden = false;
    });
  })();
</script>
<script src="/chat-widget.js?v=20260809"></script>
<script src="/cookie-consent.js?v=20260810"></script>
<script src="/mobile-nav.js?v=20260810"></script>
</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Not found - Mrs. Penky</title><meta name="robots" content="noindex" />
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;
background:#fff;color:#1C2541;margin:0;display:flex;min-height:100vh;align-items:center;
justify-content:center;text-align:center;padding:24px;}
a{color:#8A7333;}</style></head>
<body><div>
<h1 style="font-size:24px;margin:0 0 8px;">This piece is no longer listed</h1>
<p style="color:#4B5563;margin:0 0 20px;">It may have sold out or been taken out of the collection.</p>
<a href="/index.html#shop">See the current collection</a>
</div></body></html>`;
}
