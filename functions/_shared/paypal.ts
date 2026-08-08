// paypal.ts
// Shared PayPal REST helper for the Supabase Edge Functions.
//
// Stripe does not accept business accounts registered in the Philippines, so
// PayPal handles international payments while PayMongo keeps the local
// methods (GCash, Maya, QR Ph, local cards).
//
// API reference (checked 2026-08-08):
//   Orders v2            https://developer.paypal.com/docs/api/orders/v2/
//   Webhook verification https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
//
// Required secrets:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
//   PAYPAL_WEBHOOK_ID   (from the webhook you create in the PayPal dashboard)
//   PAYPAL_ENV          "live" or "sandbox" (defaults to sandbox, so a missing
//                        value can never accidentally charge a real card)
//
// Deno / Supabase Edge Functions runtime.

const ENV = (Deno.env.get("PAYPAL_ENV") ?? "sandbox").toLowerCase();

export const PAYPAL_BASE = ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";

/**
 * OAuth2 client_credentials token. PayPal tokens are valid for ~9 hours;
 * we cache in module scope so a warm function reuses it instead of
 * re-authenticating on every request.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`PayPal auth failed: ${json.error_description ?? res.statusText}`);
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in ?? 3600) * 1000),
  };
  return cachedToken.value;
}

/** Authenticated JSON request against the PayPal REST API. */
export async function paypalRequest<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.details?.[0]?.description ?? json.message ?? res.statusText;
    throw new Error(`PayPal ${path} failed: ${detail}`);
  }
  return json as T;
}

/** PayPal wants amounts as decimal strings with exactly two places. */
export function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * Verifies a webhook payload against PayPal's own verification endpoint.
 *
 * Unlike PayMongo and Stripe, PayPal does not use a shared HMAC secret --
 * the signature is checked by calling PayPal back with the transmission
 * headers and the raw body. Returns false on any error, so a verification
 * outage can never be mistaken for a valid event.
 */
export async function verifyPayPalWebhook(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID") ?? "";
  if (!webhookId) {
    console.error("PAYPAL_WEBHOOK_ID is not set - refusing to trust the event");
    return false;
  }

  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  for (const h of required) {
    if (!headers.get(h)) {
      console.error(`Missing PayPal header: ${h}`);
      return false;
    }
  }

  try {
    const result = await paypalRequest<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.get("paypal-auth-algo"),
          cert_url: headers.get("paypal-cert-url"),
          transmission_id: headers.get("paypal-transmission-id"),
          transmission_sig: headers.get("paypal-transmission-sig"),
          transmission_time: headers.get("paypal-transmission-time"),
          webhook_id: webhookId,
          // Must be the parsed body, not the raw string -- PayPal
          // re-serialises it on their side before checking.
          webhook_event: JSON.parse(rawBody),
        }),
      },
    );
    return result.verification_status === "SUCCESS";
  } catch (err) {
    console.error("PayPal webhook verification error:", err);
    return false;
  }
}
