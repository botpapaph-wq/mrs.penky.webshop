import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as crypto from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const paymongoWebhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') || '';
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const zohoAccessToken = Deno.env.get('ZOHO_ACCESS_TOKEN') || '';
const zohoOrgId = '932735549';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('paymongo-signature') || req.headers.get('stripe-signature');
  const body = await req.text();

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    let gateway = 'paymongo';
    let payload: any = JSON.parse(body);
    let eventId: string;
    let orderId: string | null = null;
    let eventType: string;

    // Verify signature & determine gateway
    if (req.headers.has('paymongo-signature')) {
      if (!verifyPayMongoSignature(body, signature!, paymongoWebhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid PayMongo signature' }), { status: 403 });
      }
      gateway = 'paymongo';
      eventId = payload.data?.id || '';
      eventType = payload.data?.attributes?.type || 'unknown';

      // Extract order ID from reference_number
      orderId = payload.data?.attributes?.reference_number || null;
    } else if (req.headers.has('stripe-signature')) {
      if (!verifyStripeSignature(body, signature!, stripeWebhookSecret)) {
        return new Response(JSON.stringify({ error: 'Invalid Stripe signature' }), { status: 403 });
      }
      gateway = 'stripe';
      eventId = payload.id || '';
      eventType = payload.type || 'unknown';

      // Extract order ID from metadata
      orderId = payload.data?.object?.metadata?.order_id || null;
    } else {
      return new Response(JSON.stringify({ error: 'No valid signature' }), { status: 400 });
    }

    // Idempotency: check if event already processed
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id,processed')
      .eq('external_event_id', eventId)
      .eq('gateway', gateway)
      .single();

    if (existingEvent?.processed) {
      console.log(`Event ${eventId} already processed, skipping.`);
      return new Response(JSON.stringify({ status: 'already_processed' }), { status: 200 });
    }

    // Log webhook event
    const { data: webEvent, error: logError } = await supabase
      .from('webhook_events')
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
      .single();

    if (logError) console.error('Webhook event log error:', logError);

    // Process payment events
    if ((gateway === 'paymongo' && eventType === 'checkout_session.payment.paid') || 
        (gateway === 'stripe' && eventType === 'charge.succeeded')) {
      
      if (!orderId) {
        console.warn('No order ID found in webhook');
        return new Response(JSON.stringify({ status: 'no_order_id' }), { status: 200 });
      }

      // Update order status
      const { error: updateError } = await supabase
        .from('orders')
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

      // Fetch order for Zoho invoice
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError || !order) {
        console.error('Order fetch error:', fetchError);
        return new Response(JSON.stringify({ error: 'Order fetch failed' }), { status: 500 });
      }

      // Fetch order items
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsError) {
        console.error('Items fetch error:', itemsError);
        return new Response(JSON.stringify({ error: 'Items fetch failed' }), { status: 500 });
      }

      // Create Zoho invoice
      try {
        const invoiceRes = await createZohoInvoice(order, items || []);
        if (invoiceRes?.invoice_id) {
          await supabase
            .from('orders')
            .update({ zoho_invoice_id: invoiceRes.invoice_id })
            .eq('id', orderId);
        }
      } catch (invoiceErr) {
        console.error('Zoho invoice error:', invoiceErr);
        // Don't fail the webhook if Zoho fails; just log it
      }

      // Mark webhook as processed
      await supabase
        .from('webhook_events')
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

function verifyPayMongoSignature(body: string, signature: string, secret: string): boolean {
  const parts = signature.split(',');
  const t = parts.find((p) => p.startsWith('t='))?.slice(2) || '';
  const te = parts.find((p) => p.startsWith('te='))?.slice(3) || '';

  const computedSig = hmacSha256(`${t}.${body}`, secret);
  return te === computedSig || computedSig === te;
}

function verifyStripeSignature(body: string, signature: string, secret: string): boolean {
  const parts = signature.split(',');
  const timestamp = parts
    .find((p) => p.startsWith('t='))
    ?.slice(2) || '';
  const sig = parts.find((p) => p.startsWith('v1='))?.slice(3) || '';

  const computedSig = hmacSha256(`${timestamp}.${body}`, secret);
  return sig === computedSig;
}

function hmacSha256(data: string, secret: string): string {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const message = encoder.encode(data);

  // Use crypto.subtle for HMAC-SHA256
  const hmac = crypto.subtleCrypto.sign('HMAC', key, message);
  // Convert to hex
  const hashArray = Array.from(new Uint8Array(hmac));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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
