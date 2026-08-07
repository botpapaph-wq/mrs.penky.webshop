/**
 * Cloudflare Pages Function — /api/chat
 * AI Chatbot für Mrs. Penky (Workers AI)
 *
 * Änderungen ggü. Vorversion:
 *  - Modell @cf/meta/llama-2-7b-chat-int8 (abgekündigt) -> @cf/meta/llama-3.1-8b-instruct-fp8
 *  - Hartkodierter, sachlich falscher Produktkatalog entfernt
 *    (beschrieb einen Lederwaren-Shop mit vier nicht existierenden Artikeln)
 *  - Katalog wird zur Laufzeit aus Supabase gelesen (penky_products)
 *  - Keine Fertigungsbehauptungen ("handmade"/"handcrafted") mehr im Prompt
 *
 * Benötigte Bindings/Variablen im Pages-Projekt:
 *  - AI                 (Workers AI Binding)
 *  - SUPABASE_URL       (z. B. https://<ref>.supabase.co)
 *  - SUPABASE_ANON_KEY  (Anon/Publishable Key, kein Service-Role-Key)
 */

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const CATALOG_TTL_SECONDS = 300;
const MAX_CATALOG_ITEMS = 80;

/**
 * Liest die aktiven Produkte aus Supabase und baut daraus eine kompakte Liste.
 * Gibt null zurück, wenn keine Zugangsdaten gesetzt sind oder der Abruf fehlschlägt —
 * der Bot arbeitet dann nur mit den Kategorieangaben weiter.
 */
async function loadCatalog(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const url =
    `${env.SUPABASE_URL}/rest/v1/penky_products` +
    `?select=title,price_php,price_usd,category,stock_quantity` +
    `&active=eq.true&order=category.asc,price_php.asc&limit=${MAX_CATALOG_ITEMS}`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      cf: { cacheTtl: CATALOG_TTL_SECONDS, cacheEverything: true },
    });
    if (!res.ok) return null;

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Bestandsführung wird nur berücksichtigt, wenn sie überhaupt gepflegt ist.
    // Steht bei ALLEN Artikeln 0, ist das Feld ungenutzt (CJ-Sync schreibt
    // derzeit keine Mengen) — dann darf der Bot nicht behaupten, alles sei
    // ausverkauft.
    const stockIsMaintained = rows.some((r) => Number(r.stock_quantity) > 0);

    return rows
      .map((r) => {
        const php = r.price_php != null ? `PHP ${Number(r.price_php).toFixed(0)}` : 'price on request';
        const usd = r.price_usd != null ? ` / USD ${Number(r.price_usd).toFixed(2)}` : '';
        const stock = stockIsMaintained && Number(r.stock_quantity) === 0 ? ' [out of stock]' : '';
        return `- ${r.title} (${r.category}) — ${php}${usd}${stock}`;
      })
      .join('\n');
  } catch {
    return null;
  }
}

function buildSystemPrompt(catalog) {
  return `You are the customer service assistant for Mrs. Penky, an online shop for devotional and religious gifts.

ABOUT THE SHOP
- Mrs. Penky sells devotional pieces and keepsakes: crosses and pendants, rosaries, bracelets, and candles and candle accessories (listed on the site under "Lights").
- Products are sourced from suppliers and carefully selected — they are NOT handmade, handcrafted, or produced in-house. Never claim otherwise.
- Prices are shown in Philippine Peso (PHP), with USD as a secondary currency.
- Shipping covers the Philippines and Southeast Asia.
- Payment is handled at checkout via PayMongo (local methods) and Stripe (international cards).

HARD RULES
- Only name products, prices, and availability that appear in the product list below. If an item is not in the list, say you cannot find it and offer to check with the team.
- Never invent products, prices, discounts, delivery dates, or promotions.
- Do not claim that items are blessed, consecrated, or religiously certified.
- For questions about a specific order, refund, or payment problem, do not guess — offer to escalate to support.
- Keep answers short: two to four sentences unless the customer asks for detail.
- Answer in the language the customer writes in.

TONE OF VOICE
- Write in Philippine English: warm, polite, plainly worded. The shop is based in Davao City.
- Use "po" and "opo" naturally where a Filipino would, but sparingly — at most once per reply, and never in the middle of a technical explanation.
- A Bisaya greeting such as "Maayong adlaw" is fine as an opener. Do not scatter Bisaya or Tagalog words through the rest of the reply.
- If the customer writes in Tagalog, Bisaya or Taglish, answer the same way.
- Do not imitate an accent in spelling, and do not overdo the local flavour — one light touch per conversation is enough. Clarity comes first.
- Never use religious authority: you are shop staff helping with products and orders, not a spiritual adviser.

${catalog
  ? `CURRENT PRODUCTS (live from the shop database)\n${catalog}`
  : `PRODUCT LIST UNAVAILABLE\nThe live catalogue could not be loaded right now. Describe the categories (crosses, rosaries, bracelets, lights) in general terms, do NOT quote any prices, and point the customer to the shop page.`}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = Array.isArray(history) ? [...history] : [];
    messages.push({ role: 'user', content: message });
    const recentMessages = messages.slice(-10);

    const catalog = await loadCatalog(env);

    const response = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: buildSystemPrompt(catalog) },
        ...recentMessages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: String(msg.content ?? ''),
        })),
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const assistantMessage = response.response || '';

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        history: [...recentMessages, { role: 'assistant', content: assistantMessage }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Chat error:', err);
    return new Response(JSON.stringify({ error: 'Chat temporarily unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
