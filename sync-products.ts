// sync-products.ts
// Supabase Edge Function: pulls devotional products from CJ Dropshipping
// (crosses, rosaries, bracelets, lights) and upserts them into
// public.products with a 3x markup on CJ's own sell price (cost basis),
// converted to PHP and rounded to the nearest 10.
//
// Trigger manually (curl/Postman) or wire up to a cron schedule whenever
// the catalog should be refreshed. Not triggered automatically by anything
// else in this project.
//
// CJ docs referenced (checked 2026-08-07):
// - Product List V2: https://developers.cjdropshipping.com/en/api/api2/api/product.html
//   (GET /product/listV2?keyWord=...)
// - Product Details:  same page, GET /product/query?pid=...
//
// Pricing decisions (per project spec, revised 2026-08-07):
// - Markup basis: CJ's own sell price only (not shipping cost).
// - Markup: 3x (multiplier 3). Originally 50% (1.5x), but real CJ costs on
//   this catalog run well under $1-2 USD per item — at 1.5x that priced
//   crosses/pendants at ₱70-260, which doesn't cover PayMongo/Stripe fees
//   plus shipping plus any real margin. Bumped to 3x per owner decision.
// - USD -> PHP conversion: fixed rate via CJ_USD_TO_PHP_RATE env var,
//   default 58. This is NOT a live FX rate — update the secret manually
//   when the real rate moves meaningfully.
// - Final PHP price rounded to the nearest 10.
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cjRequest, sleep } from "./cj-client.ts";

// Search keywords mapped to this storefront's categories (index.html).
// This list only controls what gets pulled from CJ — adjust freely,
// it never touches products that already exist locally under a different
// category.
const CATEGORY_KEYWORDS: Record<string, string> = {
  crosses: "cross pendant",
  rosaries: "rosary",
  bracelets: "cross bracelet",
  lights: "religious candle",
};

const MARKUP_MULTIPLIER = 3; // 3x CJ cost, per revised project decision (was 1.5x)
const USD_TO_PHP_RATE = Number(Deno.env.get("CJ_USD_TO_PHP_RATE") ?? "58");
const PAGE_SIZE = 20;
const REQUEST_DELAY_MS = 1100; // CJ's documented rate limit is 1 request/second

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

function computeSellPricePhp(costUsd: number): number {
  return roundToNearest10(costUsd * MARKUP_MULTIPLIER * USD_TO_PHP_RATE);
}

interface CjListV2Product {
  id: string;
  nameEn: string;
}

interface CjListV2Response {
  content: { productList: CjListV2Product[] }[];
}

interface CjVariant {
  vid: string;
  variantSku: string;
  variantSellPrice: number;
  variantWeight: number;
}

interface CjProductDetail {
  pid: string;
  productNameEn: string;
  productSku: string;
  bigImage: string;
  description: string;
  sellPrice: number;
  variants: CjVariant[];
}

interface CategorySyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
  }

  // Not meant to be publicly callable (bulk-writes the catalog and burns CJ
  // API quota). Deployed with verify_jwt=false so a cron/curl caller doesn't
  // need a Supabase session — gated by a shared secret header instead.
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (expectedSecret && req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { categories?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // no body -> sync every known category
  }
  const categories = body.categories?.length ? body.categories : Object.keys(CATEGORY_KEYWORDS);

  const supabase = supabaseAdmin();
  const results: Record<string, CategorySyncResult> = {};

  for (const category of categories) {
    const keyword = CATEGORY_KEYWORDS[category];
    const summary: CategorySyncResult = { synced: 0, skipped: 0, errors: [] };
    results[category] = summary;

    if (!keyword) {
      summary.errors.push(`Unknown category "${category}" — no keyword mapping in CATEGORY_KEYWORDS`);
      continue;
    }

    let listResp: CjListV2Response;
    try {
      listResp = await cjRequest<CjListV2Response>(
        `/product/listV2?page=1&size=${PAGE_SIZE}&keyWord=${encodeURIComponent(keyword)}`,
      );
    } catch (err) {
      summary.errors.push(`listV2(${keyword}): ${(err as Error).message}`);
      continue;
    }

    const products = listResp.content?.flatMap((c) => c.productList ?? []) ?? [];

    for (const p of products) {
      await sleep(REQUEST_DELAY_MS); // stay under CJ's 1 req/sec limit

      let detail: CjProductDetail;
      try {
        detail = await cjRequest<CjProductDetail>(`/product/query?pid=${p.id}`);
      } catch (err) {
        summary.errors.push(`query(${p.id}): ${(err as Error).message}`);
        continue;
      }

      const variant = detail.variants?.[0];
      if (!variant) {
        summary.skipped++;
        continue;
      }

      const costUsd = variant.variantSellPrice ?? detail.sellPrice;
      // penky_products.price_php has CHECK (price_php > 0) -- CJ occasionally
      // returns 0/missing pricing on a variant (out of stock, data gap).
      // Skip rather than let the DB reject the whole upsert.
      if (!costUsd || costUsd <= 0) {
        summary.skipped++;
        continue;
      }
      const pricePhp = computeSellPricePhp(costUsd);
      const priceUsd = Math.round(costUsd * MARKUP_MULTIPLIER * 100) / 100;
      // penky_products.weight_g is INTEGER -- CJ sometimes returns a
      // fractional gram value (e.g. 31.5); round it instead of failing.
      const weightG = typeof variant.variantWeight === "number" ? Math.round(variant.variantWeight) : null;

      const { error } = await supabase.from("penky_products").upsert(
        {
          title: detail.productNameEn,
          description: detail.description ?? null,
          price_php: pricePhp,
          price_usd: priceUsd,
          image_urls: detail.bigImage ? [detail.bigImage] : [],
          category,
          sku: variant.variantSku || detail.productSku,
          cj_product_id: detail.pid,
          cj_variant_id: variant.vid,
          cj_variant_sku: variant.variantSku,
          cost_price_usd: costUsd,
          weight_g: weightG,
          cj_synced_at: new Date().toISOString(),
        },
        { onConflict: "sku" },
      );

      if (error) {
        summary.errors.push(`upsert(${detail.pid}): ${error.message}`);
      } else {
        summary.synced++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
