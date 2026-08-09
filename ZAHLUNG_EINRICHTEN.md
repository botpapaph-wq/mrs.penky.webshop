# Zahlungsgateway scharf schalten

Stand 09.08.2026. Der Code ist vollständig und geprüft. Es fehlen
ausschließlich Zugangsdaten. Die kann ich nicht setzen — Schlüssel und
Passwörter fasse ich nicht an. Das musst du eintragen.

**Gemessen, nicht vermutet:** in den Edge-Function-Secrets liegen aktuell
`RESEND_API_KEY`, `SLACK_BOT_TOKEN`, `RESEND_API_KEY_RSF`, `CJ_API_KEY` und
die Supabase-eigenen. Kein einziger Zahlungsschlüssel. Ein Live-Test der
Funktion `create-checkout-session` bestätigt es:

```
paypal   → HTTP 500  PAYPAL_CLIENT_ID secret is not set on this project
paymongo → HTTP 500  PAYMONGO_SECRET_KEY secret is not set on this project
```

Es funktioniert also **keine** der beiden Zahlarten, nicht nur PayPal.

---

## Was du eintragen musst

Alles hier: Supabase → Edge Functions → **Secrets**
`https://supabase.com/dashboard/project/jvujmlssgnqawqqaeqnb/functions/secrets`

### PayPal

| Secret | Woher |
|---|---|
| `PAYPAL_CLIENT_ID` | developer.paypal.com → Apps & Credentials → **Live** → App anlegen |
| `PAYPAL_CLIENT_SECRET` | dieselbe App |
| `PAYPAL_WEBHOOK_ID` | die ID des Webhooks aus dem Schritt unten |
| `PAYPAL_ENV` | `sandbox` zum Testen, danach `live` |

`PAYPAL_ENV` steht ohne Eintrag auf `sandbox`. Ein vergessener Wert kann
also nie versehentlich echtes Geld bewegen.

**Webhook in der PayPal-App anlegen:**

```
URL:      https://jvujmlssgnqawqqaeqnb.supabase.co/functions/v1/payment-webhook
Ereignisse:  CHECKOUT.ORDER.APPROVED
             PAYMENT.CAPTURE.COMPLETED
```

Beide werden gebraucht. Bei `APPROVED` löst unsere Funktion die Abbuchung
aus, erst bei `CAPTURE.COMPLETED` wird die Bestellung auf bezahlt gesetzt —
damit es genau eine Stelle gibt, an der das passiert.

### PayMongo (GCash, Maya, QR Ph, lokale Karten)

| Secret | Woher |
|---|---|
| `PAYMONGO_SECRET_KEY` | PayMongo Dashboard → Developers → API Keys |
| `PAYMONGO_WEBHOOK_SECRET` | beim Anlegen des Webhooks, Ereignis `checkout_session.payment.paid`, gleiche URL wie oben |

### Für die Weitergabe an CJ

| Secret | Woher |
|---|---|
| `INTERNAL_FUNCTION_SECRET` | frei gewählte lange Zufallszeichenkette, schützt `forward-order` vor Aufrufen von außen |

---

## Reihenfolge

1. PayPal in **Sandbox** einrichten, `PAYPAL_ENV=sandbox`.
2. Testkauf mit einem Sandbox-Käuferkonto durchklicken.
3. In Supabase prüfen: `penky_orders` steht auf `paid`,
   `penky_webhook_events` hat den Eintrag mit `signature_verified = true`.
4. Erst dann `PAYPAL_ENV` auf `live` und die Live-Zugangsdaten eintragen.
5. Ein echter Kauf über den kleinsten Artikel, danach erstatten.

Sag Bescheid, wenn die Secrets drin sind — dann prüfe ich die Kette
durch und melde, was hakt.

---

## Was heute noch geändert wurde

Ein Kunde, der bei fehlendem Gateway auf *Proceed to Payment* klickte,
bekam bis eben ein Browserfenster mit dem Text
`Error: PAYPAL_CLIENT_ID secret is not set on this project`.

Jetzt erscheint ein Kasten im Seitendesign:

> **We could not open the payment page.**
> This one is on us, not on you — nothing has been charged. Please try
> again in a few minutes, or send your order to
> mrs.penkys.webshop@gmail.com and we will take it from there.

Der technische Text geht in die Browserkonsole. Fehler, die der Kunde
selbst beheben kann (fehlende Angaben, unzustellbares Land), bleiben
wortgetreu stehen. Der Knopf sperrt während der Anfrage.

Commit `9122ebc`, deployt als `fc36755`, live geprüft.
