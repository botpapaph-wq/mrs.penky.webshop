# Local Testing Guide

## Quick Start

### Test Frontend Locally

```bash
cd src/
python3 -m http.server 8000
```

Visit: `http://localhost:8000/`

### Test Pages

1. **Product Catalog** (index.html)
   - Should show 7 products with category filter
   - Try filtering by "Crosses", "Rosaries", "Bracelets", "Lights"
   - Add items to cart
   - Chat widget toggles at bottom-right (💬)

2. **Checkout** (checkout.html)
   - Click "Proceed to Checkout" on index.html
   - Or visit: `http://localhost:8000/checkout.html`
   - Fill form with test data
   - Select currency and payment method
   - Cart should show items from localStorage

3. **Success Page** (success.html)
   - Visit: `http://localhost:8000/success.html?order_id=TEST-12345`
   - Should display order reference and confirmation
   - Cart clears on page load

4. **Cancel Page** (cancel.html)
   - Visit: `http://localhost:8000/cancel.html`
   - Should show preserved cart items
   - Offers to retry or continue shopping

### Test Chat Widget

1. Click 💬 icon at bottom-right
2. Type a question about products
3. (Backend test) Should fetch from `/api/chat` endpoint
   - Will fail locally without Supabase/Llama connection
   - Check browser console for fetch error (expected)

## Visual Verification Checklist

### Colors & Typography
- [ ] Navigation is dark navy (#1C2541)
- [ ] "MP" logo has gold (#D4AF37) circle
- [ ] Product cards have gold top borders
- [ ] Tagline is gold text
- [ ] Serif fonts (Georgia/Garamond) throughout

### Responsive Layout
- [ ] Full desktop (1200px+): 4-column grid
- [ ] Tablet (768px-1199px): 2-3 columns
- [ ] Mobile (<768px): 1-2 columns

### Cart Functionality
- [ ] Add item to cart
- [ ] Cart count in header updates
- [ ] Cart persists on page reload
- [ ] Checkout form displays saved cart
- [ ] Remove cart shows empty message

### Chat Widget
- [ ] Toggle opens/closes on 💬 click
- [ ] Messages appear in chat bubble
- [ ] Input field focusable
- [ ] "Send" button works (or press Enter)
- [ ] History persists in localStorage

## Troubleshooting

### Styles don't load
- Ensure Tailwind CDN URL works: `https://cdn.tailwindcss.com`
- Clear browser cache (Ctrl+Shift+Delete)
- Try incognito window

### Cart empty after refresh
- Check browser localStorage: `localStorage.getItem('cart')`
- Verify not in private/incognito mode (localStorage won't persist)

### Chat widget doesn't connect
- Expected locally (requires Supabase Edge Function)
- Check browser console for fetch errors
- Update `CHAT_API` URL in chat-widget.js when deployed

## Unit Test Endpoints

### Frontend-Only Tests (No Backend)
- ✓ index.html loads and renders
- ✓ Filtering works (JavaScript)
- ✓ Cart persist/restore works (localStorage)
- ✓ Checkout form validates (basic HTML5)
- ✓ Chat widget UI toggles

### Backend Integration Tests (Require Supabase)
- ⚠️ checkout.html → create-checkout-session
- ⚠️ chat-widget.js → /api/chat
- ⚠️ Payment webhooks → order.status update

---

**Next**: Update CHAT_API and SUPABASE_URL when backend is ready.
