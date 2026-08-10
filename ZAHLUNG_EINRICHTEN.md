# Zahlungsgateway scharf schalten

## Stand 10.08.2026, 05:00 — PayPal Sandbox steht, Zahlung noch nicht getestet

Gesetzt in Supabase: `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
Webhook in PayPal angelegt: ID `6DC006822H6555546`, Ereignisse
`CHECKOUT.ORDER.APPROVED` und `PAYMENT.CAPTURE.COMPLETED`.

**Bewiesen:**

| Prüfung | Ergebnis |
|---|---|
| `create-checkout-session` mit `payment_method: paypal` | HTTP 200, echte Zahlungsseite `sandbox.paypal.com/checkoutnow?token=…` |
| Bestellung in `penky_orders` | wird angelegt, Preise serverseitig, Versand berechnet |
| Webhook-Endpunkt von PayPal erreichbar | ja — Simulator löst die Funktion aus, sie startet |
| Unsignierte Anfragen | werden mit HTTP 400 abgewiesen, nichts wird geschrieben |

**Nicht bewiesen:** dass eine abgeschlossene Zahlung die Bestellung auf
`paid` setzt. Dafür muss ein Kauf wirklich durchlaufen.

**Warum es hängt:** der Kaufabschluss verlangt eine Anmeldung als
Sandbox-Testkäufer. Passwörter gebe ich nicht ein, auch keine Testpasswörter.

**Nächster Schritt, ein Mensch:**

1. Im Shop einen Warenkorb füllen, PayPal wählen, zur Zahlungsseite gehen.
2. Dort **nicht** das Kartenformular („Pay with Debit or Credit Card")
   ausfüllen, sondern **Log In** wählen.
3. Anmelden als `sb-zq8fs51544335@personal.example.com`.
   Passwort: PayPal Developer → Testing Tools → Sandbox Accounts →
   drei Punkte → View/Edit account.
4. „Pay Now".

Danach prüfen:

```sql
SELECT id, payment_status, paid_at, webhook_delivered
FROM penky_orders ORDER BY created_at DESC LIMIT 3;

SELECT event_type, signature_verified, processed
FROM penky_webhook_events ORDER BY created_at DESC LIMIT 5;
```

Erwartet: `payment_status = paid`, `paid_at` gesetzt, ein Ereignis
`PAYMENT.CAPTURE.COMPLETED` mit `signature_verified = true`.

Der Sandbox-Käufer ist ein erfundenes Konto mit erfundenem Guthaben und
hat mit dem Live-Konto nichts zu tun. Es fließt kein Geld, es wird keine
Karte gebraucht.

---


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

**Voraussetzung:** ein PayPal-**Business**-Konto. Ein privates Konto kann
keine REST-App anlegen. Falls noch keins da ist: auf paypal.com anlegen
oder ein bestehendes privates Konto auf Business hochstufen.

**Wo genau die Werte liegen** — geprüft am 10.08.2026:

1. `https://developer.paypal.com/dashboard/applications/live` öffnen und mit
   dem Business-Konto anmelden. Oben rechts steht ein Schalter
   **Sandbox / Live** — zum Testen erst auf Sandbox stehen lassen.
2. **Create App** klicken, Namen vergeben (z. B. „Mrs Penky Shop"),
   **Create App**.
3. Auf der Seite, die danach erscheint, stehen oben **Client ID** und
   **Client Secret** (letzteres hinter *Show*). Das sind die ersten beiden
   Werte.
4. Auf derselben App-Seite nach unten zu **Webhooks** → **Add Webhook**.
   URL eintragen, die zwei Ereignisse unten anhaken, speichern. Danach
   erscheint der Webhook in der Liste, und seine **Webhook ID** ist der
   dritte Wert.

| Secret | Woher |
|---|---|
| `PAYPAL_CLIENT_ID` | Schritt 3 |
| `PAYPAL_CLIENT_SECRET` | Schritt 3, hinter *Show* |
| `PAYPAL_WEBHOOK_ID` | Schritt 4 |
| `PAYPAL_ENV` | `sandbox` zum Testen, danach `live` |

Sandbox und Live sind zwei getrennte Welten mit eigenen Apps und eigenen
Schlüsseln. Beim Umschalten auf `live` müssen also **alle drei** Werte
gegen die Live-Fassung getauscht werden, nicht nur `PAYPAL_ENV`.

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

**Voraussetzung:** PayMongo nimmt nur Händler mit einem in den Philippinen
registrierten Geschäft. Für ein Einzelunternehmen heißt das:

- DTI-Registrierung des Geschäfts
- ein staatlicher Ausweis der bei der DTI eingetragenen Person
  (ein Primärausweis oder drei Sekundärausweise)
- eine sichtbare Online-Präsenz — mrspenky.shop erfüllt das
- ein Bankkonto für die Auszahlungen

Alle Unterlagen werden online auf der Aktivierungsseite im PayMongo-Dashboard
hochgeladen. Ohne abgeschlossene Aktivierung gibt es nur Testschlüssel.

**Wo genau die Werte liegen:**

1. Konto anlegen auf `https://dashboard.paymongo.com`.
2. Links in der Seitenleiste **Developers**. Dort stehen die Schlüssel.
3. Über den Schalter **Viewing live data** in der Seitenleiste wird zwischen
   Test- und Live-Schlüsseln umgeschaltet. Testschlüssel beginnen mit
   `sk_test_`, Live-Schlüssel mit `sk_live_`. Mit dem Testschlüssel fließt
   kein echtes Geld — damit lässt sich die ganze Kette vorher durchspielen.
4. Im selben Bereich **Webhooks** → Endpunkt anlegen, Ereignis
   `checkout_session.payment.paid`, URL wie oben. Beim Anlegen wird einmalig
   ein Signaturgeheimnis angezeigt — das ist `PAYMONGO_WEBHOOK_SECRET`, und
   es erscheint danach nicht wieder.

| Secret | Woher |
|---|---|
| `PAYMONGO_SECRET_KEY` | Schritt 2/3, `sk_test_…` bzw. `sk_live_…` |
| `PAYMONGO_WEBHOOK_SECRET` | Schritt 4, nur einmal sichtbar |

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
