# Mrs. Penky Webshop — Gesamtstand

**Stand: 11.08.2026, mittags. Dies ist das aktuelle Dokument.**
Alle anderen Berichte im Ordner sind Momentaufnahmen und teils überholt —
Übersicht am Ende unter *Ältere Dokumente*.

---

## In einem Satz

Der Shop ist live, sieht auf allen Geräten richtig aus, rechnet Versand
korrekt und ist SEO-fähig. Er kann noch **kein Geld annehmen**: dafür fehlen
Zugangsdaten eines Zahlungsanbieters und ein Guthaben bei CJ.

---

## Was live ist und geprüft wurde

| | Prüfung |
|---|---|
| **Deployment** | Cloudflare Pages hängt am Repo `botpapaph-wq/mrs.penky.webshop`, Branch `main`, Ausgabe `src`. Jeder Push baut automatisch. |
| **Startseite** | Badge „Free shipping from ₱800", 68 aktive Produkte aus Supabase |
| **Checkout** | Navy Kopfband, zweispaltig, Order Summary rechts |
| **Versand** | ₱629 Warenkorb → „CJPacket Liquid Line (5–7 days) ₱175" plus Hinweis „Add ₱171 more and shipping is free" |
| **Mindestbestellwert** | unter ₱500 gesperrt, mit Hinweis |
| **Ländervorwahl** | Auswahl mit 16 Ländern, PH voreingestellt. `09606865887` → `+639606865887`, führende Null fällt weg |
| **Bestätigungsseite** | behauptet nichts mehr; Bestellnummer aus der eigenen Datenbank |
| **Cookie-Banner** | Consent Mode v2, GA4 bleibt aktiv, `analytics_storage` startet auf denied |
| **Chatbot** | antwortet, wechselt korrekt nach Cebuano |
| **Mobil** | Tailwind als eigene 16-KB-Datei statt 400-KB-CDN-Skript; Chatfenster passt sich der Breite an; Burger-Menü auf allen 11 Seiten |
| **Produktseiten** | `/p/<slug>`, serverseitig gerendert, Open Graph, JSON-LD |
| **Sitemap** | `/sitemap-products.xml`, bei jedem Abruf aus dem Bestand gebaut, in `robots.txt` eingetragen |
| **Webhook** | PayPal-förmige Anfrage ohne Signatur → 403, unbekannte → 400 |

---

## Was noch fehlt, damit der Shop verkaufen kann

Vier Dinge, in dieser Reihenfolge:

### 1. `INTERNAL_FUNCTION_SECRET` setzen

Supabase → Edge Functions → Secrets. Eine frei gewählte lange
Zufallszeichenkette. Ohne sie ruft `payment-webhook` die Funktion
`forward-order` nicht auf, und keine Bestellung erreicht CJ.

### 2. Sandbox-Kauf abschließen

Im Shop bestellen, PayPal wählen. Auf der PayPal-Seite **nicht** das
Kartenformular ausfüllen, sondern **Log In**:

```
sb-zq8fs51544335@personal.example.com
```

Passwort: PayPal Developer → Testing Tools → Sandbox Accounts → drei Punkte
→ View/Edit account. Erfundenes Konto, erfundenes Guthaben, kein Geld.

Danach prüfen:

```sql
SELECT id, payment_status, paid_at, webhook_delivered
FROM penky_orders ORDER BY created_at DESC LIMIT 3;

SELECT event_type, signature_verified, processed
FROM penky_webhook_events ORDER BY created_at DESC LIMIT 5;
```

Erwartet: `paid`, `paid_at` gesetzt, ein `PAYMENT.CAPTURE.COMPLETED` mit
`signature_verified = true`.

### 3. CJ-Geldbörse aufladen

Steht auf 0,00 €. CJ fertigt eine Bestellung erst ab, wenn sie bezahlt ist —
sonst bleibt sie auf „awaiting payment", egal wie die Automatik eingestellt
ist.

### 4. Live schalten

PayPal Developer auf **Live** umschalten, dort eine App anlegen, und in
Supabase **alle drei** Werte austauschen plus `PAYPAL_ENV=live`. Sandbox und
Live sind getrennte Welten mit eigenen Schlüsseln.

PayMongo für GCash, Maya und lokale Karten: Konto ist angelegt, die
ID-Verifizierung läuft noch. Testschlüssel (`sk_test_…`) gibt es schon vor
der Verifizierung.

---

## Offene Entscheidungen

**Zwei Artikelpaare heißen weiterhin gleich.** Beide nennen dasselbe
Material in der Beschreibung, deshalb konnte die Migration sie nicht
unterscheiden:

- `Cross pendant necklace – Alloy` — `397b5559`, `41ddca0f`
- `Jesus cross pendant – Titanium` — `8228cf3c`, `9b52d8d9`

Vermutlich echte Dubletten aus dem CJ-Import. Einen Unterschied zu erfinden
wäre falsch. Entweder je einen deaktivieren oder so lassen.

**Zwei überzählige CJ-Adressen.** Beim Anlegen zeigte CJ die gespeicherte
Adresse nicht an — ein Anzeigefehler —, deshalb habe ich zweimal nachgelegt.
Drei identische Einträge, der als Standard markierte ist der vollständigste.

**„Cross Necklace Knife Metal Pendant Pendant"** — ein Kreuzanhänger mit
Klinge. Passt er ins Sortiment? Die Frage steht seit dem ersten Audit.

---

## Konten und Zugänge

| Dienst | Stand |
|---|---|
| **Cloudflare Pages** | Projekt `mrs-penky-webshop`, Konto `fdcb17fef71e322c142dd30a729ebac9`, Git-verbunden |
| **GitHub** | `botpapaph-wq/mrs.penky.webshop`, Cloudflare-App hat Zugriff auf alle Repos |
| **Supabase** | Projekt `jvujmlssgnqawqqaeqnb` |
| **PayPal** | Business-Konto vorhanden. Sandbox-App „Default Application", Webhook `6DC006822H6555546` auf `CHECKOUT.ORDER.APPROVED` und `PAYMENT.CAPTURE.COMPLETED` |
| **PayMongo** | Konto angelegt, ID-Verifizierung offen |
| **CJ Dropshipping** | ID `CJ5697322`, API-Store `MrsPenky-Webshop` autorisiert und aktiv, Geldbörse 0,00 € |

### Gesetzte Supabase-Secrets

```
PAYPAL_ENV = sandbox          PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET          PAYPAL_WEBHOOK_ID = 6DC006822H6555546
CJ_API_KEY                    RESEND_API_KEY
SLACK_BOT_TOKEN               RESEND_API_KEY_RSF
```

Fehlend: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`,
`INTERNAL_FUNCTION_SECRET`.

### CJ-Einstellungen

```
Standard-Versandart Philippinen   1. CJPacket Asia Liquid Line
                                  2. CJPacket Asia Ordinary
Empfängeradresse                  Penky Benaning Kopplin
                                  Purok 20, Acacia Street
                                  Mandaguit Compound, Calinan
                                  Davao City, Davao del Sur 8000
                                  +639606865887
```

---

## Zwei Fallen, die Zeit gekostet haben

**Der Importpfad beim Edge-Function-Deploy.** Über das Dashboard liegen die
Dateien flach nebeneinander, der Import muss `./_shared/paypal.ts` heißen.
Im Repo steht `../_shared/…`, weil dort ein echtes Elternverzeichnis
existiert. Mit dem falschen Pfad antwortet der Deploy mit HTTP 400 und
keiner brauchbaren Meldung. Steht als Kommentar in der Datei.

**Das Repo ist nicht das, was läuft.** Supabase Edge Functions deployen
nicht automatisch aus GitHub. `payment-webhook` lief tagelang in einer
Fassung aus der Stripe-Zeit, während im Repo längst PayPal-Code stand. Wer
ein Verhalten erklären will, muss den deployten Code ansehen, nicht den im
Repo.

---

## Datenbank

Migrationen 001 bis 007 in `supabase/migrations/`. Die letzten beiden sind
eingespielt:

- **006** — 11 unpassende Artikel deaktiviert (Halloween-Kerze, Buddha-Form,
  Gießformen, Dochte, Rosary drill cutter), „handmade" aus allen Titeln.
  Protokoll in `penky_delisted`, Rücknahme am Dateiende.
- **007** — 14 Titel bereinigt. Alte Titel in `penky_title_backup`,
  Rücknahme am Dateiende.

Aktueller Bestand: **68 aktive Produkte**, 0 Wortdoppelungen, 0 „handmade".

---

## Was danach lohnt

Ohne Eile, nach dem ersten echten Verkauf:

1. **36 von 79 Artikeln kosten exakt ₱249** — die Preisuntergrenze aus
   Migration 005 greift bei fast der Hälfte. Rechnerisch richtig, wirkt aber
   wie ein Platzhalter. Streuen oder bündeln.
2. **Kategorie „Lights"** enthält nach der Bereinigung nur noch wenige
   Artikel. Auffüllen oder mit einer anderen zusammenlegen.
3. **Kontaktformular** zeigt auf die Edge Function `contact-message`. Die
   existiert und ist deployt — einmal durchtesten, ob wirklich etwas ankommt.

---

## Ältere Dokumente

Historisch, nicht mehr pflegen:

| Datei | Was drinsteht | Vorsicht |
|---|---|---|
| `AUDIT_2026-08-09.md` | erster Gesamtaudit | Punkte A1 und B1 waren falsch — gegen einen alten Commit geprüft |
| `DEPLOY_DIAGNOSE.md` | warum Cloudflare nichts auslieferte | erledigt, Ursache war die fehlende Repo-Freigabe |
| `STATUS_2026-08-10.md` | Nachtarbeit vom 10. | enthält die falsche Webhook-Diagnose |
| `STATUS_2026-08-11.md` | Korrektur dazu | gilt, ist hier eingearbeitet |
| `ZAHLUNG_EINRICHTEN.md` | Anleitung PayPal und PayMongo | gilt weiterhin, gute Detailanleitung |
| `HANDOVER.md` | Stand 07.08. | überholt |
| `README.md` | Projektübersicht | nennt noch Stripe statt PayPal |
| `BUILD_SUMMARY.md`, `DELIVERY_SUMMARY.md`, `FRONTEND_STATUS.md`, `TEST_LOCAL.md`, `VERIFICATION.md` | aus der Bauphase | überholt |
