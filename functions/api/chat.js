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

// Llama 3.1 8B answered Cebuano in English. It recognises the language but has
// too little of it to hold a conversation, so it fell back to what it knows.
// The 70B model does hold Cebuano, which matters here: this shop is in Davao.
// If the bigger model is unavailable on the account, the smaller one still
// answers rather than the chat going dark -- see runModel().
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';
const CATALOG_TTL_SECONDS = 300;
const MAX_CATALOG_ITEMS = 80;

/**
 * Everything the bot is allowed to answer on its own. Without this it had the
 * product list and nothing else, so every question about postage, returns or
 * payment turned into "please email us" -- which is not support, it is
 * forwarding the work to the shop owner's inbox.
 *
 * Kept in step with shipping.html, faq.html and refund.html by hand. If a
 * policy changes on those pages it has to change here.
 */
const SHOP_FACTS = `
SHIPPING
- Delivery across the Philippines and to selected countries in Southeast Asia; many other countries are offered at checkout.
- Postage is calculated at checkout from the delivery address and the cart, and shown in full before payment. Nothing is added afterwards.
- Shipping is FREE on orders of PHP 800 or more.
- Minimum order value is PHP 500.
- Delivery time is shown with the postage estimate at checkout. Some items ship from within the Philippines and arrive quickly; others come from an overseas warehouse and take noticeably longer. Never quote a number of days yourself -- the checkout has the real figure for that address.
- Tracking reference is emailed as soon as the parcel is with the courier.
- Cross-border parcels may attract import duty in the destination country. That is set by the authorities there, is not collected by us, and is not part of the checkout total.
- A wrong or incomplete address may mean the parcel cannot be recovered, and re-shipping may cost postage again.

PAYMENT
- PayMongo: GCash, Maya, QR Ph, credit and debit cards.
- PayPal: for paying from outside the Philippines.
- Card details are entered on the provider's own page and never stored by the shop.
- Everything is priced and charged in Philippine Peso. A foreign card is converted by the customer's own bank at its own rate.

ORDERS AND RETURNS
- No account needed; guest checkout.
- An order can usually still be changed or cancelled if it has not been dispatched. Ask them to write in as soon as possible with the order number.
- Damaged, wrong or missing item: report within 7 days of delivery with the order number and a photo. Replacement, exchange or refund follows.
- Change of mind is generally not returnable, because the items are devotional or personal in nature.
- Refunds usually take 5 to 10 business days after approval, depending on the payment provider.

THE SHOP
- Mrs. Penky's Webshop is a small family business in Davao City, a project of remoteSalesForce.asia, founded and managed by Penky Benaning Kopplin.
- Products are selected from suppliers, not manufactured in-house.
- Email for anything that genuinely needs a human: mrs.penkys.webshop@gmail.com. Replies within 2-3 business days.
`;

/**
 * Liest die aktiven Produkte aus Supabase und baut daraus eine kompakte Liste.
 * Gibt null zurück, wenn keine Zugangsdaten gesetzt sind oder der Abruf fehlschlägt —
 * der Bot arbeitet dann nur mit den Kategorieangaben weiter.
 */
async function loadCatalog(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const url =
    `${env.SUPABASE_URL}/rest/v1/penky_products` +
    `?select=title,price_php,category,stock_quantity` +
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
        const stock = stockIsMaintained && Number(r.stock_quantity) === 0 ? ' [out of stock]' : '';
        return `- ${r.title} (${r.category}) — ${php}${stock}`;
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
- All prices are shown and charged in Philippine Peso (PHP). There is no second currency; never quote a USD amount.
- Shipping covers the Philippines and Southeast Asia. It is calculated at checkout from the address and cart, and it is free from PHP 800. The minimum order value is PHP 500.
- Payment is handled at checkout via PayMongo (GCash, Maya, QR Ph, cards) and PayPal (international). Stripe is not used.

HARD RULES
- Only name products, prices, and availability that appear in the product list below. If an item is not in the list, say you cannot find it and offer to check with the team.
- Never invent products, prices, discounts, delivery dates, or promotions.
- Do not claim that items are blessed, consecrated, or religiously certified.
- Keep answers short: two to four sentences unless the customer asks for detail.

ANSWER THE QUESTION — DO NOT FORWARD IT
You have the shop's shipping, payment, order and return policy in the SHOP
FACTS section below. Use it. Almost every question a customer asks is already
answered there, and sending them to email instead simply moves the work to a
colleague's inbox and makes the shop look unstaffed.

- Anything covered by SHOP FACTS or the product list: answer it outright. No
  hedging, no "please contact support".
- Only these genuinely need a human, because only a human can look them up:
  the status of one specific order, a payment that failed or was double-charged,
  and a damaged or missing parcel. Even then, say what happens next and what
  the customer should include (order number, photo) rather than only handing
  over an address.
- If something is truly not in SHOP FACTS or the product list, say plainly that
  you do not have that detail, then give the closest useful thing you do have.
  Never invent a figure, a delivery date, a discount or a product.
- Do not end a reply with the email address unless you have just named a reason
  a human is actually needed.

LANGUAGE
This shop is in Davao City. Cebuano (Bisaya) is not a special case here — it is
the everyday language, and English is the second one.

- Detect the language of the customer's LAST message and reply entirely in it.
  Switch again if they switch, mid-conversation, without remarking on it.
- Cebuano in, Cebuano out. A full Cebuano reply, not an English reply with
  "Maayong adlaw" bolted on the front. This is the most common failure: do not
  fall back to English because the topic is technical.
- Same for Tagalog, and for Taglish or Bisaya-English mixes: mirror the mix.
- Useful Cebuano for this shop: presyo (price), padala/hatod (delivery),
  bayad (payment), pila (how much), kanus-a (when), naa ba (is there any),
  palit (buy), salamat (thanks), palihug (please), sige (all right),
  libre nga padala (free shipping), among tindahan (our shop).
- Product names and prices stay exactly as they appear in the catalogue. Do not
  translate a product title, and write amounts as PHP 249 in any language.

TONE OF VOICE
- Warm, polite, plainly worded. Philippine English when writing English.
- Use "po" where a Filipino naturally would, sparingly — at most once per reply,
  and never in the middle of a technical explanation.
- Do not imitate an accent in spelling and do not overdo the local flavour. Clarity first.
- Never use religious authority: you are shop staff helping with products and
  orders, not a spiritual adviser.

SHOP FACTS
${SHOP_FACTS}
${catalog
  ? `CURRENT PRODUCTS (live from the shop database)\n${catalog}`
  : `PRODUCT LIST UNAVAILABLE\nThe live catalogue could not be loaded right now. Describe the categories (crosses, rosaries, bracelets, lights) in general terms, do NOT quote any prices, and point the customer to the shop page.`}`;
}

/**
 * Runs the preferred model, and falls back to the smaller one if the account
 * cannot serve it. Not every Workers AI model is enabled on every plan, and a
 * model that is missing should degrade the answer, not remove the chat.
 */
async function runModel(env, payload) {
  try {
    return await env.AI.run(MODEL, payload);
  } catch (err) {
    console.error(`Model ${MODEL} failed, falling back to ${FALLBACK_MODEL}:`, err);
    return await env.AI.run(FALLBACK_MODEL, payload);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Without the Workers AI binding there is nothing to answer with. Say so
  // explicitly instead of returning a generic 500 -- a missing binding and a
  // broken request look identical otherwise.
  //
  // This check used to sit inside loadCatalog(), where its `return new
  // Response(...)` never reached the client: the Response object was handed
  // back as if it were the catalogue string, got interpolated into the system
  // prompt as "[object Response]", and the request then died one line later on
  // env.AI.run of an undefined binding -- surfacing as a bare 500.
  if (!env.AI) {
    console.error('Workers AI binding "AI" is not configured on this Pages project');
    return new Response(
      JSON.stringify({ error: 'Chat is not configured yet: the Workers AI binding is missing.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
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

    const payload = {
      messages: [
        { role: 'system', content: buildSystemPrompt(catalog) },
        ...recentMessages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: String(msg.content ?? ''),
        })),
      ],
      // 400 was tight once the reply has to carry a policy answer as well as a
      // greeting, and Cebuano needs more tokens than English for the same
      // sentence. Temperature stays low: this bot quotes policy, it does not
      // improvise.
      max_tokens: 600,
      temperature: 0.3,
    };

    const response = await runModel(env, payload);
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
