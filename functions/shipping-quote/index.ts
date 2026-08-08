// index.ts (shipping-quote)
// Supabase Edge Function: returns real shipping options for a cart and a
// destination, by asking CJ Dropshipping's freight calculation endpoint.
//
// This is the server-side equivalent of CJ's own shipping calculator
// (cjdropshipping.com/calculation.html). It is NOT a copy of their page:
// the CJ access token must never reach the browser, so the call is made
// here and only the resulting options are returned.
//
// CJ endpoint (checked 2026-08-08):
//   POST https://developers.cjdropshipping.com/api2.0/v1/logistic/freightCalculate
//   { startCountryCode, endCountryCode, products: [{ quantity, vid }] }
//
// Why this exists:
//   - shipping.html promises the cost is shown before payment; nothing
//     calculated it, so every international order lost the shipping cost.
//   - forward-order.ts used one hardcoded logisticName for every destination.
//     If that method does not serve the country, CJ rejects the order AFTER
//     the customer has paid. Quoting first surfaces that before checkout.
//
// Required secrets: CJ_API_KEY (via _shared/cj-client.ts), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cjRequest } from "../_shared/cj-client.ts";

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

interface CartLine {
  product_id: string;
  quantity: number;
}

interface QuoteRequest {
  end_country_code: string;
  items: CartLine[];
  zip?: string;
}

interface CjFreightOption {
  logisticName?: string;
  logisticPrice?: number | string;
  logisticPriceCn?: number | string;
  logisticAging?: string;
  logisticRemarks?: string;
}

// CJ prices are quoted in USD. The shop charges PHP, so the quote is
// converted with a rate held in penky_store_settings -- never hardcoded,
// because a stale rate silently eats the margin.
async function usdToPhpRate(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await supabase
    .from("penky_store_settings")
    .select("value")
    .eq("key", "usd_php_rate")
    .maybeSingle();

  const rate = Number(data?.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("usd_php_rate is not set in penky_store_settings");
  }
  return rate;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as QuoteRequest;

    const destination = String(body.end_country_code ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(destination)) {
      return json({ error: "end_country_code must be a 2-letter ISO country code" }, 400);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return json({ error: "items must be a non-empty array" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve our product ids to CJ variant ids. Never trust a vid sent by
    // the browser -- it would let anyone quote arbitrary CJ products.
    const ids = body.items.map((i) => i.product_id);
    const { data: products, error } = await supabase
      .from("penky_products")
      .select("id, cj_variant_id, title")
      .in("id", ids);

    if (error) return json({ error: `Product lookup failed: ${error.message}` }, 500);

    const vidById = new Map(
      (products ?? []).filter((p) => p.cj_variant_id).map((p) => [p.id, p.cj_variant_id as string]),
    );

    const cjProducts = body.items
      .filter((i) => vidById.has(i.product_id))
      .map((i) => ({ vid: vidById.get(i.product_id)!, quantity: Math.max(1, Number(i.quantity) || 1) }));

    if (cjProducts.length === 0) {
      // Nothing in the cart is mapped to CJ yet -- say so plainly rather
      // than returning an empty list that reads like "no delivery possible".
      return json({
        quotable: false,
        reason: "none_of_the_items_are_linked_to_a_supplier_variant",
        options: [],
      });
    }

    const options = await cjRequest<CjFreightOption[]>("/logistic/freightCalculate", {
      method: "POST",
      body: JSON.stringify({
        startCountryCode: "CN",
        endCountryCode: destination,
        products: cjProducts,
        ...(body.zip ? { zip: body.zip } : {}),
      }),
    });

    if (!Array.isArray(options) || options.length === 0) {
      // No carrier serves this destination for this cart. This is the answer
      // the checkout needs BEFORE taking money.
      return json({ quotable: true, deliverable: false, options: [] });
    }

    const rate = await usdToPhpRate(supabase);

    const normalised = options
      .map((o) => {
        const usd = Number(o.logisticPrice ?? o.logisticPriceCn ?? NaN);
        return {
          method: o.logisticName ?? "Unknown",
          price_usd: Number.isFinite(usd) ? Number(usd.toFixed(2)) : null,
          price_php: Number.isFinite(usd) ? Math.ceil(usd * rate) : null,
          delivery: o.logisticAging ?? null,
          note: o.logisticRemarks ?? null,
        };
      })
      .filter((o) => o.price_php !== null)
      .sort((a, b) => (a.price_php! - b.price_php!));

    return json({
      quotable: true,
      deliverable: normalised.length > 0,
      currency: "PHP",
      usd_php_rate: rate,
      options: normalised,
    });
  } catch (err) {
    console.error("shipping-quote error:", err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
