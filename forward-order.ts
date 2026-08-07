// forward-order.ts
// Supabase Edge Function: forwards a paid order to CJ Dropshipping for
// fulfillment. Call this after payment is confirmed (e.g. from
// payment-webhook.ts once an order's payment_status becomes 'paid'),
// passing { "order_id": "<uuid>" } as the request body.
//
// IMPORTANT — payment mode (per project decision, 2026-08-07):
// This creates the order at CJ with payType=3 ("create order only") — no
// payment is triggered on the CJ side. You still need to go into the CJ
// dashboard, confirm logistics/price, and pay for the order there before CJ
// will actually pick and ship it. This was chosen deliberately over
// payType=2 (automatic CJ wallet balance deduction) to keep a manual review
// step before real money moves. Only change PAY_TYPE below if you
// deliberately want CJ to auto-deduct from your wallet on every order —
// that skips human review entirely and money leaves your CJ balance
// immediately on every checkout.
//
// CJ docs referenced (checked 2026-08-07):
// https://developers.cjdropshipping.com/en/api/api2/api/shopping.html
// (POST /shopping/order/createOrderV2)
//
// Requires migration 002_cj_dropshipping.sql to have been applied
// (adds shipping_city/shipping_province/shipping_country_code/shipping_zip
// and fulfillment_status/cj_order_id/cj_shipment_order_id to orders, and
// cj_product_id/cj_variant_id/... to products).
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cjRequest } from "./cj-client.ts";

const PAY_TYPE = 3; // 3 = create order only, no payment triggered at CJ — see header comment
const FROM_COUNTRY_CODE = Deno.env.get("CJ_FROM_COUNTRY_CODE") ?? "CN";
// CJ requires a logisticName up front for createOrderV2. This default is a
// commonly available CJ shipping line, but it is NOT guaranteed valid for
// every product/warehouse combination. Verify against CJ's "Get Order
// Optional Logistics" endpoint for your actual catalog before relying on
// this in production, and override via the env var if it turns out wrong.
const DEFAULT_LOGISTIC_NAME = Deno.env.get("CJ_DEFAULT_LOGISTIC_NAME") ?? "CJPacket Ordinary";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface OrderRow {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_country_code: string | null;
  shipping_zip: string | null;
  payment_status: string;
  fulfillment_status: string;
}

interface OrderItemProduct {
  id: string;
  title: string;
  cj_variant_id: string | null;
}

interface OrderItemRow {
  id: string;
  quantity: number;
  products: OrderItemProduct | null;
}

interface CjCreateOrderResult {
  orderId?: string;
  shipmentOrderId?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
  }

  // This function creates real orders at CJ — not meant to be publicly
  // callable. Deployed with verify_jwt=false (payment-webhook can't send a
  // Supabase JWT), so it's gated by a shared secret header instead.
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (expectedSecret && req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { order_id } = await req.json().catch(() => ({ order_id: null }));
  if (!order_id) {
    return new Response(JSON.stringify({ error: "order_id is required" }), { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("penky_orders")
    .select(
      "id, customer_name, customer_email, customer_phone, shipping_address, shipping_city, shipping_province, shipping_country_code, shipping_zip, payment_status, fulfillment_status",
    )
    .eq("id", order_id)
    .maybeSingle<OrderRow>();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: orderError?.message ?? "Order not found" }), { status: 404 });
  }

  if (order.payment_status !== "paid") {
    return new Response(
      JSON.stringify({ error: `Order ${order_id} is not paid yet (payment_status: ${order.payment_status})` }),
      { status: 409 },
    );
  }

  if (order.fulfillment_status === "forwarded") {
    return new Response(JSON.stringify({ ok: true, skipped: "already forwarded" }));
  }

  if (!order.shipping_city || !order.shipping_province || !order.shipping_country_code) {
    await supabase.from("penky_orders").update({ fulfillment_status: "manual_review" }).eq("id", order_id);
    return new Response(
      JSON.stringify({
        error:
          "Order is missing shipping_city / shipping_province / shipping_country_code — cannot forward to CJ automatically. Checkout needs to collect these as structured fields, not just a single free-text address. Order marked for manual review.",
      }),
      { status: 422 },
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("penky_order_items")
    .select("id, quantity, products:penky_products ( id, title, cj_variant_id )")
    .eq("order_id", order_id)
    .returns<OrderItemRow[]>();

  if (itemsError) {
    return new Response(JSON.stringify({ error: itemsError.message }), { status: 500 });
  }

  const missing = (items ?? []).filter((i) => !i.products?.cj_variant_id);
  if (missing.length > 0) {
    await supabase.from("penky_orders").update({ fulfillment_status: "manual_review" }).eq("id", order_id);
    return new Response(
      JSON.stringify({
        error: `Order contains ${missing.length} item(s) with no CJ variant mapping (not CJ-sourced yet, or sync-products.ts has not run for them). Order marked for manual review.`,
        missingProducts: missing.map((i) => i.products?.title ?? i.id),
      }),
      { status: 422 },
    );
  }

  const products = (items ?? []).map((i) => ({
    vid: i.products!.cj_variant_id!,
    quantity: i.quantity,
    storeLineItemId: i.id,
  }));

  let cjResult: CjCreateOrderResult;
  try {
    cjResult = await cjRequest<CjCreateOrderResult>(`/shopping/order/createOrderV2`, {
      method: "POST",
      body: JSON.stringify({
        orderNumber: order.id,
        shippingCountryCode: order.shipping_country_code,
        shippingCountry: order.shipping_country_code,
        shippingProvince: order.shipping_province,
        shippingCity: order.shipping_city,
        shippingZip: order.shipping_zip ?? "",
        shippingPhone: order.customer_phone,
        shippingCustomerName: order.customer_name,
        shippingAddress: order.shipping_address,
        email: order.customer_email,
        payType: PAY_TYPE,
        logisticName: DEFAULT_LOGISTIC_NAME,
        fromCountryCode: FROM_COUNTRY_CODE,
        platform: "Api",
        orderFlow: 1,
        products,
      }),
    });
  } catch (err) {
    await supabase.from("penky_orders").update({ fulfillment_status: "error" }).eq("id", order_id);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502 });
  }

  const { error: updateError } = await supabase
    .from("penky_orders")
    .update({
      fulfillment_status: "forwarded",
      cj_order_id: cjResult.orderId ?? null,
      cj_shipment_order_id: cjResult.shipmentOrderId ?? null,
      cj_forwarded_at: new Date().toISOString(),
    })
    .eq("id", order_id);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      cjOrderId: cjResult.orderId ?? null,
      note: "Order created at CJ with payType=3 — go into the CJ dashboard to confirm logistics and pay before it ships.",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
