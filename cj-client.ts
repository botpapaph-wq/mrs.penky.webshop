// cj-client.ts
// Shared CJ Dropshipping API client for Supabase Edge Functions:
// token acquisition/caching + a small authenticated request helper.
//
// CJ docs referenced (checked 2026-08-07):
// https://developers.cjdropshipping.com/en/api/api2/api/auth.html
//
// Auth flow: POST /authentication/getAccessToken { apiKey } using the
// CJ_API_KEY secret -> { accessToken (~15 days), refreshToken (~180 days) }.
// Token state is cached in public.penky_cj_auth_state (single row, id=1) so
// it survives Edge Function cold starts and is shared by every function
// that needs to call CJ (sync-products.ts, forward-order.ts, ...).
//
// Deno / Supabase Edge Functions runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface CjTokenState {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

interface CjAuthStateRow {
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
}

async function cjAuthFetch(path: string, body: Record<string, string>): Promise<CjTokenState> {
  const res = await fetch(`${CJ_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(`CJ ${path} failed: ${json.message ?? res.statusText} (code ${json.code ?? res.status})`);
  }
  return {
    access_token: json.data.accessToken,
    refresh_token: json.data.refreshToken,
    access_token_expires_at: json.data.accessTokenExpiryDate,
    refresh_token_expires_at: json.data.refreshTokenExpiryDate,
  };
}

function fetchNewToken(): Promise<CjTokenState> {
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY secret is not set in this project's Edge Function secrets");
  return cjAuthFetch("/authentication/getAccessToken", { apiKey });
}

function refreshExistingToken(refreshToken: string): Promise<CjTokenState> {
  return cjAuthFetch("/authentication/refreshAccessToken", { refreshToken });
}

const SAFETY_MARGIN_MS = 5 * 60 * 1000; // treat tokens as expired 5 min early

/**
 * Returns a valid CJ-Access-Token, transparently refreshing or
 * re-authenticating as needed. Persists the result in cj_auth_state so
 * subsequent invocations (even on a different Edge Function or after a
 * cold start) reuse it instead of hitting CJ's rate-limited auth endpoint.
 */
export async function getCjAccessToken(): Promise<string> {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("penky_cj_auth_state")
    .select("access_token, refresh_token, access_token_expires_at, refresh_token_expires_at")
    .eq("id", 1)
    .maybeSingle<CjAuthStateRow>();

  if (error) throw new Error(`penky_cj_auth_state read failed: ${error.message}`);

  const now = Date.now();

  const accessStillValid =
    !!data?.access_token &&
    !!data.access_token_expires_at &&
    new Date(data.access_token_expires_at).getTime() - now > SAFETY_MARGIN_MS;

  if (accessStillValid) {
    return data!.access_token!;
  }

  const refreshStillValid =
    !!data?.refresh_token &&
    !!data.refresh_token_expires_at &&
    new Date(data.refresh_token_expires_at).getTime() - now > SAFETY_MARGIN_MS;

  const fresh = refreshStillValid
    ? await refreshExistingToken(data!.refresh_token!)
    : await fetchNewToken();

  const { error: upsertError } = await supabase
    .from("penky_cj_auth_state")
    .upsert({ id: 1, ...fresh, updated_at: new Date().toISOString() });

  if (upsertError) throw new Error(`penky_cj_auth_state write failed: ${upsertError.message}`);

  return fresh.access_token;
}

/**
 * Authenticated JSON request against the CJ API. Does NOT throttle calls —
 * CJ's auth endpoint and most business endpoints are rate-limited
 * (commonly 1 request/second); callers doing bulk work must space out
 * their own calls (see `sleep` below).
 */
export async function cjRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getCjAccessToken();
  const res = await fetch(`${CJ_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(`CJ API ${path} failed: ${json.message ?? res.statusText} (code ${json.code ?? res.status})`);
  }
  return json.data as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
