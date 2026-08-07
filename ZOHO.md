# Zoho Books Integration

Automatic invoice generation on payment confirmation.

## Configuration

### API Base URL

```
https://www.zohoapis.com/books/v3
```

Region-specific endpoints:
- `.com` (US) - Default
- `.eu` (EU)
- `.in` (India)
- `.com.au` (Australia)
- `.jp` (Japan)
- `.ca` (Canada)
- `.sa` (Saudi Arabia)
- `.uk` (UK)

**Our setup:** `.com` (US datacenter)

### Organization ID

```
932735549
```

Verify in Zoho Books Settings → Organization Information.

---

## OAuth 2.0 Setup

### Client Credentials

```
Client ID:      YOUR_CLIENT_ID
Client Secret:  YOUR_CLIENT_SECRET
Redirect URI:   https://mrs.penky.com/auth/zoho/callback
Grant Type:     authorization_code
```

### Token Exchange

1. User visits: `https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ&client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://mrs.penky.com/auth/zoho/callback`

2. User authorizes → redirects with `code=...`

3. Exchange for token:

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=https://mrs.penky.com/auth/zoho/callback"
```

Response:

```json
{
  "access_token": "1000.abc...",
  "refresh_token": "e8d...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### Token Refresh

Access tokens expire in 1 hour. Refresh:

```bash
curl -X POST https://accounts.zoho.com/oauth/v2/token \
  -d "grant_type=refresh_token" \
  -d "refresh_token=YOUR_REFRESH_TOKEN" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

---

## Invoice Creation

### API Endpoint

```
POST https://www.zohoapis.com/books/v3/invoices?organization_id=932735549
```

### Headers

```
Authorization: Zoho-oauthtoken {ACCESS_TOKEN}
Content-Type: application/json
```

### Request Body

```json
{
  "data": {
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "phone_number": "+63 9x xxxx xxxx",
    "reference_number": "ORDER-UUID",
    "currency_id": "1097528000000097085",
    "line_items": [
      {
        "item_name": "Premium Pensky Tote",
        "quantity": 1,
        "rate": 2999.00,
        "item_type": "item"
      }
    ],
    "notes": "Shipped to: Manila, Philippines",
    "is_draft": true,
    "send": false
  }
}
```

### Currency IDs

- **PHP:** `1097528000000097085`
- **USD:** `1097528000000000097`
- **EUR:** `1097528000000000109`

---

## Invoice Fields

### Required

- `customer_name` (string)
- `customer_email` (string)
- `reference_number` (string) — Must be unique per organization
- `currency_id` (string)
- `line_items` (array)

### Optional

- `customer_id` — Existing customer in Zoho
- `phone_number`
- `billing_address` (object)
- `shipping_address` (object)
- `notes`
- `terms`
- `is_draft` (boolean) — Default: false
- `send` (boolean) — Send via email; requires `customer_email`

### Line Item

```json
{
  "item_name": "Product Name",
  "description": "Optional description",
  "quantity": 1,
  "rate": 1000.00,
  "item_type": "item",
  "discount": 0,
  "tax_id": "optional_tax_id"
}
```

---

## Error Handling

### Common Errors

| Code | Message | Fix |
|------|---------|-----|
| 401 | Unauthorized | Token expired; refresh via refresh_token |
| 403 | Forbidden | Organization_id mismatch or insufficient permissions |
| 400 | Invalid currency_id | Check currency_id in settings |
| 409 | Duplicate reference_number | Order ID already exists; use unique ref |

### Response Example (Success)

```json
{
  "code": 0,
  "message": "The invoice has been created successfully.",
  "invoice": {
    "invoice_id": "123456789",
    "invoice_number": "INV-001",
    "reference_number": "ORDER-UUID",
    "total": 2999.00,
    "status": "draft"
  }
}
```

---

## Webhook Simulation (Testing)

Test invoice creation without full PayMongo flow:

```bash
ORG_ID=932735549
TOKEN=$(cat ~/.env | grep ZOHO_ACCESS_TOKEN | cut -d= -f2)

curl -X POST https://www.zohoapis.com/books/v3/invoices?organization_id=$ORG_ID \
  -H "Authorization: Zoho-oauthtoken $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "customer_name": "Test Customer",
      "customer_email": "test@example.com",
      "reference_number": "TEST-'$(date +%s)'",
      "currency_id": "1097528000000097085",
      "line_items": [
        {
          "item_name": "Test Product",
          "quantity": 1,
          "rate": 100.00,
          "item_type": "item"
        }
      ],
      "notes": "Test invoice",
      "is_draft": true
    }
  }'
```

---

## Production Checklist

- [ ] OAuth credentials in environment variables
- [ ] Access token refreshes correctly
- [ ] Test invoice creates in Zoho
- [ ] Line items calculate correctly
- [ ] Currency ID matches orders
- [ ] Reference_number unique per order
- [ ] Email confirmations send after invoice created
- [ ] Draft invoices created (not sent auto)
