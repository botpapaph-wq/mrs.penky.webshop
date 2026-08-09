// create-checkout-session.ts
// Supabase Edge Function: public checkout endpoint. Called directly by
// checkout.html's browser JS when the customer submits the checkout form.
//
// Re-prices every cart item server-side from penky_products (never trusts
// client-submitted prices), creates the penky_orders + penky_order_items
// rows (payment_status='pending', order_status='new' — both column
// defaults), then creates a PayMongo Checkout Session or a PayPal Order depending
// on payment_method and returns { checkout_url } for the browser to
// redirect to. This matches what checkout.html's existing JS already
// expects from EDGE_FUNCTION_URL.
//
// PayMongo API confirmed via docs.paymongo.com (checked 2026-08-07):
// - Resource: https://docs.paymongo.com/reference/checkout-session-resource
// - Create (v1): POST https://api.paymongo.com/v1/checkout_sessions
//   Basic auth (secret key + ":" base64-encoded). Body: { data: { attributes: {...} } }.
//   Only "PHP" currency is supported. line_items[].amount is in centavos.
//   cancel_url: "A URL link used to go back to the merchant's page. No
//   actual canceling of records is done." reference_number is what
//   payment-webhook.ts (index.ts) reads back out of the webhook payload to
//   find the order — set to our order UUID.
//   NOTE: v1's interactive body-params table didn't render through a plain
//   fetch (client-side widget), so the exact field list here is taken from
//   the fully-rendered Checkout Session *resource* schema, which lists the
//   same writable attributes. v2 (deferred Payment Intent) exists too but
//   v1 was chosen for simplicity, matching the synchronous
//   "checkout_session.payment.paid" webhook flow already implemented.
//
// PayPal Orders API v2 is used instead of Stripe: Stripe does not accept
// business accounts registered in the Philippines.
// (form-encoded, Bearer auth) — not re-verified against docs this session,
// flagged here for the record rather than treated as CJ-API-level risk.
//
// Deployed with verify_jwt=false — this is the public entry point called
// directly from the storefront's anon browser JS, so it cannot require a
// Supabase auth JWT. Unlike sync-products.ts / forward-order.ts it does
// NOT use the INTERNAL_FUNCTION_SECRET guard: real customers must be able
// to call it with no shared secret.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-provided by Supabase), PAYMONGO_SECRET_KEY, PAYPAL_CLIENT_ID,
// PAYPAL_CLIENT_SECRET, PAYPAL_ENV.
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paypalRequest, money } from "../_shared/paypal.ts";
import { quoteShipping, loadSettings } from "../_shared/shipping.ts";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";


function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

interface CheckoutItemInput {
  product_id: string;
  quantity: number;
}

interface CheckoutRequestBody {
  items: CheckoutItemInput[];
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  // Structured fields — checkout.html doesn't collect these yet (still
  // pending), but forward-order.ts requires them to forward an order to
  // CJ, so they're accepted here already and default shipping_country_code
  // to 'PH' (matches the penky_orders column default) when absent.
  shipping_city?: string;
  shipping_province?: string;
  shipping_country_code?: string;
  shipping_zip?: string;
  payment_method: "paymongo" | "paypal";
  success_url: string;
  cancel_url: string;
}

interface ProductRow {
  id: string;
  title: string;
  price_php: number;
  price_usd: number | null;
  image_urls: string[] | null;
}

interface PricedItem {
  product_id: string;
  title: string;
  quantity: number;
  unit_price_php: number;
  unit_price_usd: number | null;
  image_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: CheckoutRequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "items is required and must be a non-empty array" }, 400);
  }
  if (!body.customer_name || !body.customer_email || !body.customer_phone || !body.shipping_address) {
    return json(
      { error: "customer_name, customer_email, customer_phone and shipping_address are required" },
      400,
    );
  }
  if (body.payment_method !== "paymongo" && body.payment_method !== "paypal") {
    return json({ error: 'payment_method must be "paymongo" or "paypal"' }, 400);
  }
  if (!body.success_url || !body.cancel_url) {
    return json({ error: "success_url and cancel_url are required" }, 400);
  }
  if (body.payment_method === "paymongo" && !PAYMONGO_SECRET_KEY) {
    return json({ error: "PAYMONGO_SECRET_KEY secret is not set on this project" }, 500);
  }
  if (body.payment_method === "paypal" && !Deno.env.get("PAYPAL_CLIENT_ID")) {
    return json({ error: "PAYPAL_CLIENT_ID secret is not set on this project" }, 500);
  }

  const supabase = supabaseAdmin();

  // Server-side re-pricing: look up the real current price for every
  // product ID in the cart. Client-submitted prices are never trusted.
  const productIds = [...new Set(body.items.map((i) => i.product_id))];
  const { data: products, error: productsError } = await supabase
    .from("penky_products")
    .select("id, title, price_php, price_usd, image_urls")
    .in("id", productIds)
    .returns<ProductRow[]>();

  if (productsError) return json({ error: productsError.message }, 500);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const missingIds = productIds.filter((id) => !productById.has(id));
  if (missingIds.length > 0) {
    return json({ error: `Unknown or inactive product_id(s): ${missingIds.join(", ")}` }, 400);
  }

  const items: PricedItem[] = body.items.map((item) => {
    const product = productById.get(item.product_id)!;
    return {
      product_id: product.id,
      title: product.title,
      quantity: item.quantity,
      unit_price_php: product.price_php,
      unit_price_usd: product.price_usd,
      image_url: product.image_urls?.[0] ?? null,
    };
  });

  const totalPhp = items.reduce((sum, i) => sum + i.unit_price_php * i.quantity, 0);

  // Minimum order value. The cart and the checkout page both check this, but
  // neither is trustworthy: the request can be made directly. Shipping costs
  // PHP 97 for the first 10 g and only about PHP 0.50 per gram after that, so
  // a lone cheap item cannot carry its own postage -- see
  // docs/MARGIN_ANALYSIS.md. Read from settings so it can be changed without
  // a deployment; falls back to 500 if the row is missing.
  const settings = await loadSettings(supabase);
  const minOrderPhp = settings.min_order_php;
  if (totalPhp < minOrderPhp) {
    return json({
      error: `Minimum order value is PHP ${minOrderPhp}. This cart totals PHP ${totalPhp}.`,
      min_order_php: minOrderPhp,
      cart_total_php: totalPhp,
    }, 400);
  }

  // Shipping. Quoted here as well, not taken from the browser: the amount
  // charged has to come from the same source as the parcel we actually book,
  // otherwise the difference lands in the margin. Uses the same helper the
  // checkout page called, so the customer is charged what they were shown.
  const freeShipping = totalPhp >= settings.free_shipping_threshold_php;

  const shippingQuote = await quoteShipping(
    supabase,
    body.shipping_country_code ?? "PH",
    body.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    body.shipping_zip,
  );

  // A destination no carrier serves must fail before payment, not after --
  // forward-order would otherwise be stuck with a paid, unshippable order.
  if (shippingQuote.quotable && !shippingQuote.deliverable) {
    return json({
      error: "We cannot ship to this destination at the moment.",
      destination: body.shipping_country_code ?? "PH",
    }, 400);
  }

  const shippingPhp = freeShipping ? 0 : (shippingQuote.chosen?.price_php ?? 0);
  const grandTotalPhp = totalPhp + shippingPhp;
  const allHaveUsd = items.every((i) => i.unit_price_usd !== null);
  const totalUsd = allHaveUsd ? items.reduce((sum, i) => sum + i.unit_price_usd! * i.quantity, 0) : null;

  // Create the order first (payment_status/order_status use their column
  // defaults: 'pending' / 'new') so there's an order ID to hand the
  // payment gateway as the reference it will echo back in the webhook.
  const { data: order, error: orderError } = await supabase
    .from("penky_orders")
    .insert({
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      shipping_address: body.shipping_address,
      shipping_city: body.shipping_city ?? null,
      shipping_province: body.shipping_province ?? null,
      shipping_country_code: body.shipping_country_code ?? "PH",
      shipping_zip: body.shipping_zip ?? null,
      total_amount_php: grandTotalPhp,
      subtotal_php: totalPhp,
      shipping_fee_php: shippingPhp,
      shipping_method: shippingQuote.chosen?.method ?? null,
      total_amount_usd: totalUsd,
      currency_code: "PHP",
      primary_currency: "PHP",
      metadata: { payment_method: body.payment_method },
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return json({ error: orderError?.message ?? "Order creation failed" }, 500);
  }

  const { error: itemsError } = await supabase.from("penky_order_items").insert(
    items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price_php: i.unit_price_php,
      unit_price_usd: i.unit_price_usd,
      subtotal_php: i.unit_price_php * i.quantity,
      subtotal_usd: i.unit_price_usd !== null ? i.unit_price_usd * i.quantity : null,
    })),
  );

  if (itemsError) return json({ error: itemsError.message }, 500);

  try {
    const checkoutUrl =
      body.payment_method === "paymongo"
        ? await createPayMongoCheckoutSession(order.id, body, items, shippingPhp)
        : await createPayPalOrder(order.id, body, items, shippingPhp);

    return json({ checkout_url: checkoutUrl, order_id: order.id });
  } catch (err) {
    // The order row already exists as 'pending' / 'new' — left in place on
    // purpose so the customer can retry checkout without losing the cart
    // record; nothing here is money-affecting yet.
    return json({ error: (err as Error).message, order_id: order.id }, 502);
  }
});

async function createPayMongoCheckoutSession(
  orderId: string,
  body: CheckoutRequestBody,
  items: PricedItem[],
  shippingPhp: number,
): Promise<string> {
  const lineItems = items.map((i) => ({
    amount: Math.round(i.unit_price_php * 100), // centavos — PHP is the only supported currency
    currency: "PHP",
    name: i.title,
    quantity: i.quantity,
    images: i.image_url ? [i.image_url] : undefined,
  }));

  const payload = {
    data: {
      attributes: {
        // Shipping as its own line rather than spread across the products,
        // so the customer sees on the receipt what postage cost.
        line_items: shippingPhp > 0
          ? [...lineItems, {
              amount: Math.round(shippingPhp * 100),
              currency: "PHP",
              name: "Shipping",
              quantity: 1,
            }]
          : lineItems,
        payment_method_types: ["card", "gcash", "paymaya"],
        reference_number: orderId,
        success_url: body.success_url,
        cancel_url: body.cancel_url,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        billing: {
          name: body.customer_name,
          email: body.customer_email,
          phone: body.customer_phone,
          address: {
            line1: body.shipping_address,
            city: body.shipping_city || undefined,
            state: body.shipping_province || undefined,
            postal_code: body.shipping_zip || undefined,
            country: body.shipping_country_code || "PH",
          },
        },
      },
    },
  };

  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`,
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await res.json();
  if (!res.ok) {
    const message = responseJson.errors?.[0]?.detail ?? res.statusText;
    throw new Error(`PayMongo checkout session creation failed: ${message}`);
  }

  const checkoutUrl = responseJson.data?.attributes?.checkout_url;
  if (!checkoutUrl) throw new Error("PayMongo response did not include a checkout_url");
  return checkoutUrl;
}

async function createPayPalOrder(
  orderId: string,
  body: CheckoutRequestBody,
  items: PricedItem[],
  shippingPhp: number,
): Promise<string> {
  // Line items are re-priced server-side before this point, so the totals
  // here are authoritative -- never taken from the browser.
  const itemTotal = items.reduce((sum, it) => sum + it.unit_price_php * it.quantity, 0);

  const order = await paypalRequest<{ id: string; links: { rel: string; href: string }[] }>(
    "/v2/checkout/orders",
    {
      method: "POST",
      headers: {
        // Makes a retried request reuse the same PayPal order instead of
        // creating a second one if our call times out mid-flight.
        "PayPal-Request-Id": orderId,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            // custom_id carries our order id through every later webhook.
            custom_id: orderId,
            invoice_id: orderId,
            description: "Mrs. Penky order",
            amount: {
              currency_code: "PHP",
              value: money(itemTotal + shippingPhp),
              breakdown: {
                item_total: { currency_code: "PHP", value: money(itemTotal) },
                // PayPal shows this as a separate line, so the customer sees
                // the same split as on our checkout page.
                shipping: { currency_code: "PHP", value: money(shippingPhp) },
              },
            },
            items: items.map((it) => ({
              name: it.title.slice(0, 127),
              quantity: String(it.quantity),
              unit_amount: { currency_code: "PHP", value: money(it.unit_price_php) },
            })),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "Mrs. Penky",
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: body.success_url,
              cancel_url: body.cancel_url,
            },
          },
        },
      }),
    },
  );

  // v2 returns the approval link as "payer-action" when a payment_source is
  // supplied, and as "approve" otherwise. Accept either.
  const link = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!link?.href) throw new Error("PayPal response did not include an approval link");
  return link.href;
}

