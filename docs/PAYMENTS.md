# Payment Integration Guide

## Supported Gateways

- **PayMongo:** GCash, Maya, QR Ph, Debit/Credit Cards (PHP primary)
- **Stripe:** International credit cards (USD primary)

## Currency Handling

### PHP (Default)

Amounts stored in centavos (minor units):
```
₱100.00 = 10,000 centavos
```

### USD

Amounts stored in cents (minor units):
```
$10.00 = 1,000 cents
```

---

## PayMongo Hosted Checkout

### Create Session (Backend)

```bash
SECRET_KEY=sk_live_xxx

curl https://api.paymongo.com/v2/checkout_sessions \
  -u $SECRET_KEY: \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attributes": {
        "line_items": [
          {
            "name": "Product Name",
            "amount": 100000,
            "currency": "PHP",
            "quantity": 1
          }
        ],
        "payment_method_types": ["qrph", "card", "gcash", "maya"],
        "success_url": "https://mrs.penky.com/success.html",
        "cancel_url": "https://mrs.penky.com/checkout.html",
        "reference_number": "ORDER-UUID"
      }
    }
  }'
```

Response:

```json
{
  "data": {
    "id": "cs_test_xxx",
    "attributes": {
      "checkout_url": "https://checkout.paymongo.com/xxx"
    }
  }
}
```

### Redirect User

```javascript
window.location.href = checkoutUrl;
```

### Webhook Signature Verification

PayMongo sends: `paymongo-signature: t=1234567890,te=SIGNATURE,li=LIVE_SIGNATURE`

Verify (Edge Function):

```typescript
function verifyPayMongoSignature(body: string, signature: string, secret: string) {
  const parts = signature.split(',');
  const t = parts.find(p => p.startsWith('t='))?.slice(2) || '';
  const te = parts.find(p => p.startsWith('te='))?.slice(3) || '';
  
  const computed = hmacSha256(`${t}.${body}`, secret);
  return te === computed;
}
```

---

## Stripe Payment Intents

### Create Intent (Backend)

```bash
curl https://api.stripe.com/v1/payment_intents \
  -H "Authorization: Bearer sk_live_xxx" \
  -d "amount=1000" \
  -d "currency=usd" \
  -d "automatic_payment_methods[enabled]=true" \
  -d "metadata[order_id]=ORDER-UUID"
```

Response:

```json
{
  "id": "pi_test_xxx",
  "client_secret": "pi_test_secret_xxx",
  "status": "requires_payment_method"
}
```

### Frontend (Stripe.js)

```javascript
const stripe = Stripe('pk_live_xxx');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#card-element');

stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'Customer Name' }
  }
}).then(result => {
  if (result.error) {
    alert(result.error.message);
  } else {
    window.location.href = '/success.html';
  }
});
```

---

## Webhook Signature Verification

### PayMongo

```
Signature: t=timestamp,te=test_signature,li=live_signature
Verify: HMAC-SHA256(timestamp.body, secret)
```

### Stripe

```
Signature: t=timestamp,v1=signature
Verify: HMAC-SHA256(timestamp.body, secret)
```

---

## Common Issues

### "Insufficient funds"
User doesn't have balance in e-wallet → redirect to top-up

### "Card declined"
PayMongo/Stripe declined transaction → show error message

### "Webhook timeout"
Edge Function taking >30s → return 200 immediately, process async

### "Order already paid"
Duplicate webhook → check idempotency key

---

## Testing

### PayMongo Test Cards

- **QRPH:** Test environment only (no real QR code)
- **GCash:** Fake number 09171234567
- **Maya:** Fake number 09171234567

### Stripe Test Cards

- **Visa:** `4242 4242 4242 4242`
- **Mastercard:** `5555 5555 5555 4444`
- **Amex:** `3782 822463 10005`

See: https://stripe.com/docs/testing

---

## Production Checklist

- [ ] Webhook endpoints registered
- [ ] Signature verification working
- [ ] Test transactions completed
- [ ] Idempotency handling implemented
- [ ] Error logging configured
- [ ] SSL certificate valid
- [ ] PCI DSS compliance verified (no card data on server)
- [ ] Payment confirmations sending
