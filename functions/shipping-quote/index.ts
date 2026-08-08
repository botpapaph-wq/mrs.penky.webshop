// index.ts (shipping-quote)
// Supabase Edge Function: returns real shipping options for a cart and a
// destination, plus the free-shipping threshold, so the checkout page can
// show the customer what postage will cost before they pay.
//
// The actual calculation lives in ../_shared/shipping.ts, shared with
// create-checkout-session. Displayed price and charged price must never come
// from two different implementations.
//
// The CJ access token stays server-side; only the result is returned.
//
// Required secrets: CJ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quoteShipping, freeShippingThresholdPhp } from "../_shared/shipping.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const quote = await quoteShipping(
      supabase,
      body.end_country_code,
      body.items ?? [],
      body.zip,
    );

    const threshold = await freeShippingThresholdPhp(supabase);
    const subtotal = Number(body.subtotal_php) || 0;
    const free = subtotal >= threshold;

    return json({
      quotable: quote.quotable,
      deliverable: quote.deliverable,
      currency: "PHP",
      free_shipping_threshold_php: threshold,
      free_shipping_applies: free,
      // What the customer will actually be charged for postage.
      shipping_php: free ? 0 : (quote.chosen?.price_php ?? null),
      chosen: quote.chosen,
      options: quote.options.slice(0, 5),
    });
  } catch (err) {
    console.error("shipping-quote error:", err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
