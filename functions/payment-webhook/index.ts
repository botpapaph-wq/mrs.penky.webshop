// index.ts (payment-webhook)
// Supabase Edge Function: receives PayMongo / PayPal payment webhooks,
// verifies the signature, marks the order paid, forwards it to CJ
// Dropshipping for fulfillment, and creates a draft Zoho Books invoice.
//
// Deploy as the "payment-webhook" function. Point PayMongo's and PayPal's
// webhook settings at:
//   https://<project-ref>.supabase.co/functions/v1/payment-webhook
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-provided by Supabase), PAYMONGO_WEBHOOK_SECRET, PAYPAL_CLIENT_ID,
// PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV,
// ZOHO_ACCESS_TOKEN, INTERNAL_FUNCTION_SECRET (shared with forward-order.ts).
//
// NOTE on Zoho: ZOHO_ACCESS_TOKEN is a short-lived Zoho OAuth access token
// (~1 hour). This function does not refresh it automatically — if Zoho
// invoicing starts failing, the token needs to be regenerated and the
// secret updated. zoho.ts contains a proper refresh-token flow
// (getZohoAccessToken) that can replace this once real Zoho OAuth
// client_id/client_secret/refresh_token are available (stored in
// penky_integration_tokens).
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyPayPalWebhook, paypalRequest } from '../_shared/paypal.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const paymongoWebhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') || '';

const zohoAccessToken = Deno.env.get('ZOHO_ACCESS_TOKEN') || '';
const internalFunctionSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
const zohoOrgId = '932735549';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('paymongo-signature');
  const body = await req.text();

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    let gateway = 'paymongo';
    const payload: any = JSON.parse(body);
    let eventId: string;
    let orderId: string | null = null;
    let eventType: string;

    // Verify signature & determine gateway
    if (req.headers.has('paymongo-signature')) {
      if (!(await verifyPayMongoSignature(body, signature!, paymongoWebhookSecret))) {
        return new Response(JSON.stringify({ error: 'Invalid PayMongo signature' }), { status: 403 });
      }
      gateway = 'paymongo';
      eventId = payload.data?.id || '';
      eventType = payload.data?.attributes?.type || 'unknown';

      // Extract order ID from reference_number
      orderId = payload.data?.attributes?.data?.attributes?.reference_number
        || payload.data?.attributes?.reference_number
        || null;
    } else if (req.headers.has('paypal-transmission-id')) {
      // PayPal has no shared HMAC secret: the signature is checked by calling
      // PayPal back with the transmission headers.
      if (!(await verifyPayPalWebhook(req.headers, body))) {
        return new Response(JSON.stringify({ error: 'Invalid PayPal signature' }), { status: 403 });
      }
      gateway = 'paypal';
      eventId = payload.id || '';
      eventType = payload.event_type || 'unknown';

      // custom_id was set to our order id when the order was created. It sits
      // in a different place depending on the event.
      orderId = payload.resource?.custom_id
        || payload.resource?.purchase_units?.[0]?.custom_id
        || null;

      // intent=CAPTURE means the money is only authorised once the buyer
      // approves; the capture itself is ours to trigger. Do that here, then
      // wait for PAYMENT.CAPTURE.COMPLETED before marking the order paid, so
      // there is exactly one place where an order becomes "paid".
      if (eventType === 'CHECKOUT.ORDER.APPROVED' && payload.resource?.id) {
        try {
          await paypalRequest(`/v2/checkout/orders/${payload.resource.id}/capture`, {
            method: 'POST',
            headers: { 'PayPal-Request-Id': `capture-${payload.resource.id}` },
            body: '{}',
          });
        } catch (captureErr) {
          console.error('PayPal capture failed:', captureErr);
          // 500 so PayPal retries the notification instead of dropping it.
          return new Response(JSON.stringify({ error: 'Capture failed' }), { status: 500 });
        }
        return new Response(JSON.stringify({ status: 'captured' }), { status: 200 });
      }
    } else {
      return new Response(JSON.stringify({ error: 'No valid signature' }), { status: 400 });
    }

    // Idempotency: check if event already processed
    const { data: existingEvent } = await supabase
      .from('penky_webhook_events')
      .select('id,processed')
      .eq('external_event_id', eventId)
      .eq('gateway', gateway)
      .maybeSingle();

    if (existingEvent?.processed) {
      console.log(`Event ${eventId} already processed, skipping.`);
      return new Response(JSON.stringify({ status: 'already_processed' }), { status: 200 });
    }

    // Log webhook event
    const { error: logError } = await supabase
      .from('penky_webhook_events')
      .upsert(
        {
          external_event_id: eventId,
          gateway,
          event_type: eventType,
          order_id: orderId,
          payload,
          signature_verified: true,
          processed: false,
        },
        { onConflict: 'external_event_id' }
      )
      .select()
      .maybeSingle();

    if (logError) console.error('Webhook event log error:', logError);

    // Process payment events
    if ((gateway === 'paymongo' && eventType === 'checkout_session.payment.paid') ||
        (gateway === 'paypal' && eventType === 'PAYMENT.CAPTURE.COMPLETED')) {

      if (!orderId) {
        console.warn('No order ID found in webhook');
        return new Response(JSON.stringify({ status: 'no_order_id' }), { status: 200 });
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('penky_orders')
        .update({
          payment_status: 'paid',
          order_status: 'processing',
          paid_at: new Date().toISOString(),
          webhook_delivered: true,
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('Order update error:', updateError);
        return new Response(JSON.stringify({ error: 'Order update failed' }), { status: 500 });
      }

      // Fetch order for Zoho invoice + CJ forwarding
      const { data: order, error: fetchError } = await supabase
        .from('penky_orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (fetchError || !order) {
        console.error('Order fetch error:', fetchError);
        return new Response(JSON.stringify({ error: 'Order fetch failed' }), { status: 500 });
      }

      // Fetch order items
      const { data: items, error: itemsError } = await supabase
        .from('penky_order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsError) {
        console.error('Items fetch error:', itemsError);
        return new Response(JSON.stringify({ error: 'Items fetch failed' }), { status: 500 });
      }

      // Create Zoho invoice (best-effort — don't fail the webhook if this fails)
      try {
        const invoiceRes = await createZohoInvoice(order, items || []);
        if (invoiceRes?.invoice_id) {
          await supabase
            .from('penky_orders')
            .update({ zoho_invoice_id: invoiceRes.invoice_id })
            .eq('id', orderId);
        }
      } catch (invoiceErr) {
        console.error('Zoho invoice error:', invoiceErr);
      }

      // Forward the order to CJ Dropshipping for fulfillment (best-effort —
      // don't fail the webhook if this fails; forward-order.ts marks the
      // order 'manual_review' or 'error' on its own if something is wrong,
      // and it can be re-triggered manually later).
      try {
        await fetch(`${supabaseUrl}/functions/v1/forward-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': internalFunctionSecret,
          },
          body: JSON.stringify({ order_id: orderId }),
        });
      } catch (forwardErr) {
        console.error('forward-order call failed:', forwardErr);
      }

      // Mark webhook as processed
      await supabase
        .from('penky_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('external_event_id', eventId);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

// ============================================================================
// Signature Verification
// ============================================================================

async function verifyPayMongoSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(',');
  const t = parts.find((p) => p.startsWith('t='))?.slice(2) || '';
  const te = parts.find((p) => p.startsWith('te='))?.slice(3) || '';
  const li = parts.find((p) => p.startsWith('li='))?.slice(3) || '';

  const computedSig = await hmacSha256Hex(`${t}.${body}`, secret);
  // PayMongo sends both a test-mode (te) and live-mode (li) signature field;
  // only the one matching the webhook secret's mode will match — checking
  // both is correct and safe.
  return (te !== '' && computedSig === te) || (li !== '' && computedSig === li);
}


async function hmacSha256Hex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createZohoInvoice(order: any, items: any[]): Promise<{ invoice_id: string }> {
  const lineItems = items.map((item) => ({
    item_name: `Product ${item.product_id}`,
    quantity: item.quantity,
    rate: item.unit_price_php,
  }));

  const payload = {
    contact_name: order.customer_name,
    email: order.customer_email,
    phone: order.customer_phone,
    line_items: lineItems,
    reference_number: order.id,
    currency_id: '1097528000000097085', // PHP
    notes: `Order from Mrs. Penky - ${order.shipping_address}`,
    is_draft: true,
  };

  const res = await fetch(`https://www.zohoapis.com/books/v3/invoices?organization_id=${zohoOrgId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: payload }),
  });

  if (!res.ok) {
    throw new Error(`Zoho invoice creation failed: ${res.status}`);
  }

  const data = await res.json();
  return { invoice_id: data.invoice?.invoice_id || '' };
}
