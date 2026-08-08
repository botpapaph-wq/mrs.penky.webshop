// shipping.ts
// Shared shipping quote logic.
//
// Lives here rather than inside one function because two callers need the
// exact same answer: shipping-quote (what the checkout page displays) and
// create-checkout-session (what the customer is actually charged). If those
// two ever disagree, the shop either overcharges or eats the difference --
// so there is deliberately only one implementation.
//
// Deno / Supabase Edge Functions runtime.

import { cjRequest } from "./cj-client.ts";

export interface CartLine {
  product_id: string;
  quantity: number;
}

export interface ShippingOption {
  method: string;
  price_usd: number;
  price_php: number;
  delivery: string | null;
  delivery_likely: string | null;
  note: string | null;
}

export interface ShippingQuote {
  /** false when no cart item is mapped to a supplier variant yet */
  quotable: boolean;
  /** false when no carrier serves this destination for this cart */
  deliverable: boolean;
  options: ShippingOption[];
  /** cheapest option, or null */
  chosen: ShippingOption | null;
  usd_php_rate: number | null;
}

interface CjFreightOption {
  logisticName?: string;
  price?: number | string;
  aging?: string;
  remoteFee?: number | string;
  remark?: string;
  arrivalTimeRanges?: { minDays?: string; maxDays?: string; ratio?: string }[];
}

async function setting(supabase: any, key: string): Promise<string | null> {
  const { data } = await supabase
    .from("penky_store_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value ?? null;
}

export async function usdToPhpRate(supabase: any): Promise<number> {
  const rate = Number(await setting(supabase, "usd_php_rate"));
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("usd_php_rate is not set in penky_store_settings");
  }
  return rate;
}

export async function freeShippingThresholdPhp(supabase: any): Promise<number> {
  const v = Number(await setting(supabase, "free_shipping_threshold_php"));
  return Number.isFinite(v) && v > 0 ? v : 800;
}

/**
 * Asks CJ what it costs to send this cart to this country.
 *
 * Product ids are resolved to CJ variant ids here, from the database -- a vid
 * supplied by the browser is never used, otherwise anyone could quote
 * arbitrary CJ products or, worse, have us charge for a different parcel than
 * the one we ship.
 */
export async function quoteShipping(
  supabase: any,
  destination: string,
  items: CartLine[],
  zip?: string,
): Promise<ShippingQuote> {
  const empty: ShippingQuote = {
    quotable: false, deliverable: false, options: [], chosen: null, usd_php_rate: null,
  };

  const dest = String(destination ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(dest) || !Array.isArray(items) || items.length === 0) return empty;

  const { data: products, error } = await supabase
    .from("penky_products")
    .select("id, cj_variant_id")
    .in("id", items.map((i) => i.product_id));

  if (error) throw new Error(`Product lookup failed: ${error.message}`);

  const vidById = new Map(
    (products ?? [])
      .filter((p: any) => p.cj_variant_id)
      .map((p: any) => [p.id, p.cj_variant_id as string]),
  );

  const cjProducts = items
    .filter((i) => vidById.has(i.product_id))
    .map((i) => ({
      vid: vidById.get(i.product_id)!,
      quantity: Math.max(1, Number(i.quantity) || 1),
    }));

  if (cjProducts.length === 0) return empty;

  const raw = await cjRequest<CjFreightOption[]>("/logistic/freightCalculate", {
    method: "POST",
    body: JSON.stringify({
      startCountryCode: "CN",
      endCountryCode: dest,
      products: cjProducts,
      ...(zip ? { zip } : {}),
    }),
  });

  if (!Array.isArray(raw) || raw.length === 0) {
    return { ...empty, quotable: true };
  }

  const rate = await usdToPhpRate(supabase);

  const options: ShippingOption[] = raw
    .map((o) => {
      const usd = Number(o.price ?? NaN);
      const remote = Number(o.remoteFee ?? 0) || 0;
      const total = Number.isFinite(usd) ? usd + remote : NaN;
      const likely = (o.arrivalTimeRanges ?? [])
        .slice()
        .sort((a, b) => Number(b.ratio ?? 0) - Number(a.ratio ?? 0))[0];
      return {
        method: o.logisticName ?? "Unknown",
        price_usd: Number(total.toFixed(2)),
        price_php: Math.ceil(total * rate),
        delivery: o.aging ?? null,
        delivery_likely: likely ? `${likely.minDays}-${likely.maxDays}` : null,
        note: o.remark ?? null,
      };
    })
    .filter((o) => Number.isFinite(o.price_php))
    .sort((a, b) => a.price_php - b.price_php);

  return {
    quotable: true,
    deliverable: options.length > 0,
    options,
    // Cheapest wins. Express costs up to nineteen times as much (Riyadh:
    // $5.42 vs $102.05) and must never be selected on the customer's behalf.
    chosen: options[0] ?? null,
    usd_php_rate: rate,
  };
}
