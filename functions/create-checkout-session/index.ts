// create-checkout-session.ts
// Supabase Edge Function: public checkout endpoint. Called directly by
// checkout.html's browser JS when the customer submits the checkout form.
//
// Re-prices every cart item server-side from penky_products (never trusts
// client-submitted prices), creates the penky_orders + penky_order_items
// rows (payment_status='pending', order_status='new' — both column
// defaults), then creates a PayMongo or Stripe Checkout Session depending
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
// Stripe Checkout Sessions API is well-established, standard v1 REST
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
// auto-provided by Supabase), PAYMONGO_SECRET_KEY, STRIPE_SECRET_KEY.
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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
  payment_method: "paymongo" | "stripe";
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
  if (body.payment_method !== "paymongo" && body.payment_method !== "stripe") {
    return json({ error: 'payment_method must be "paymongo" or "stripe"' }, 400);
  }
  if (!body.success_url || !body.cancel_url) {
    return json({ error: "success_url and cancel_url are required" }, 400);
  }
  if (body.payment_method === "paymongo" && !PAYMONGO_SECRET_KEY) {
    return json({ error: "PAYMONGO_SECRET_KEY secret is not set on this project" }, 500);
  }
  if (body.payment_method === "stripe" && !STRIPE_SECRET_KEY) {
    return json({ error: "STRIPE_SECRET_KEY secret is not set on this project" }, 500);
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
      total_amount_php: totalPhp,
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
        ? await createPayMongoCheckoutSession(order.id, body, items)
        : await createStripeCheckoutSession(order.id, body, items);

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
        line_items: lineItems,
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

async function createStripeCheckoutSession(
  orderId: string,
  body: CheckoutRequestBody,
  items: PricedItem[],
): Promise<string> {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", body.success_url);
  params.set("cancel_url", body.cancel_url);
  params.set("customer_email", body.customer_email);
  params.set("metadata[order_id]", orderId);

  items.forEach((item, idx) => {
    params.set(`line_items[${idx}][quantity]`, String(item.quantity));
    params.set(`line_items[${idx}][price_data][currency]`, "php");
    params.set(`line_items[${idx}][price_data][unit_amount]`, String(Math.round(item.unit_price_php * 100)));
    params.set(`line_items[${idx}][price_data][product_data][name]`, item.title);
    if (item.image_url) {
      params.set(`line_items[${idx}][price_data][product_data][images][0]`, item.image_url);
    }
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
    body: params.toString(),
  });

  const responseJson = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe checkout session creation failed: ${responseJson.error?.message ?? res.statusText}`);
  }

  if (!responseJson.url) throw new Error("Stripe response did not include a url");
  return responseJson.url;
}
