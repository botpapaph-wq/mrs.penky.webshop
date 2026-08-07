// ============================================================================
// Zoho Books API Helper
// ============================================================================

const ZOHO_API_ROOT = 'https://www.zohoapis.com/books/v3';

export interface ZohoToken {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

/**
 * Get valid access token (refresh if expired)
 */
export async function getZohoAccessToken(
  orgId: string,
  currentToken: ZohoToken,
  clientId: string,
  clientSecret: string,
  refreshUrl: string // Your backend endpoint to handle token refresh
): Promise<string> {
  // If token not expired, return as-is
  if (currentToken.expires_at && currentToken.expires_at > Date.now() + 5 * 60 * 1000) {
    return currentToken.access_token;
  }

  // Token expired or missing TTL — refresh
  if (!currentToken.refresh_token) {
    throw new Error('No refresh_token in Zoho integration_tokens table');
  }

  const refreshRes = await fetch(refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: currentToken.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!refreshRes.ok) {
    throw new Error(`Zoho token refresh failed: ${await refreshRes.text()}`);
  }

  const { access_token, expires_in } = await refreshRes.json();
  return access_token;
}

/**
 * Create invoice in Zoho Books
 */
export async function createZohoInvoice(
  accessToken: string,
  organizationId: string,
  payload: {
    contact_name: string;
    email: string;
    phone: string;
    line_items: Array<{ item_name: string; quantity: number; rate: number }>;
    reference_number: string;
    currency_id: string;
    notes?: string;
  }
): Promise<{ invoice_id: string; invoice_number?: string }> {
  const url = `${ZOHO_API_ROOT}/invoices?organization_id=${organizationId}`;

  const body = {
    customer_name: payload.contact_name,
    customer_email: payload.email,
    phone_number: payload.phone,
    reference_number: payload.reference_number,
    currency_id: payload.currency_id,
    line_items: payload.line_items.map((item) => ({
      item_name: item.item_name,
      quantity: item.quantity,
      rate: item.rate,
      item_type: 'item',
    })),
    notes: payload.notes || '',
    is_draft: true, // Save as draft, send separately if needed
    send: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: body }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Zoho invoice creation failed: ${res.status} ${error}`);
  }

  const data = await res.json();
  if (data.code !== 0 || !data.invoice) {
    throw new Error(`Zoho API error: ${data.message}`);
  }

  return {
    invoice_id: data.invoice.invoice_id,
    invoice_number: data.invoice.invoice_number,
  };
}

/**
 * Get invoice from Zoho
 */
export async function getZohoInvoice(
  accessToken: string,
  organizationId: string,
  invoiceId: string
): Promise<any> {
  const url = `${ZOHO_API_ROOT}/invoices/${invoiceId}?organization_id=${organizationId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Zoho invoice fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return data.invoice || null;
}
