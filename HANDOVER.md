# Handover — Mrs. Penky Webshop

Stand: 2026-08-07, nach Commit `e632836`.

---

## 0. Wichtig: es wird parallel gearbeitet

Mehrere Sitzungen pushen auf denselben Branch `main`. Regel für alle:

```bash
git fetch origin main
git rebase origin/main
git push origin main
```

**Niemals `--force`.** Ein Konflikt ist bereits aufgetreten (`mrspenky-home.html` gelöscht vs. geändert) und wurde per Rebase zugunsten der Löschung aufgelöst.

---

## 1. Repo-Status

**Remote:** `https://github.com/botpapaph-wq/mrs.penky.webshop`, Branch `main`

Lokaler Arbeitsordner `...\Claude Cowork\BOT PAPA AI Voiceassistants\Mrs.Penky.com` ist synchron (0/0).

### Struktur

```
src/     index.html, checkout.html, success.html, cancel.html,
         about.html, contact.html, shipping.html, faq.html,
         terms.html, privacy.html, refund.html,
         chat-widget.js,
         logo-header.png, logo-large.png, portrait-hero.png,
         Mrs. Penky Logo.png
functions/
  _shared/                    cj-client.ts, types.ts, zoho.ts
  api/                        chat.js
  payment-webhook/            index.ts
  create-checkout-session/    index.ts
  sync-products/              index.ts
  forward-order/              index.ts
docs/                         SETUP.md, PAYMENTS.md, ZOHO.md
supabase/migrations/          001_init_schema.sql, 002_cj_dropshipping.sql
pics/                         LEER — siehe 3.1
README.md, wrangler.toml, .env.example, .gitignore, HANDOVER.md
BUILD_SUMMARY.md, DELIVERY_SUMMARY.md, FRONTEND_STATUS.md,
TEST_LOCAL.md, VERIFICATION.md
```

`mrspenky-home.html` wurde von einer Parallelsitzung gelöscht (Duplikat von `index.html`).

---

## 2. Feste Daten

**Anbieter / Impressum**

```
remoteSalesForce.asia
Penky Benaning Kopplin — Founder & Managing Director
Purok 20, Acacia Street, Mandaguit Compound
Calinan, 8000 Davao City, Philippinen
https://remotesalesforce.asia/
```

Mrs. Penky's Webshop ist ein Projekt der remoteSalesForce.asia.

**Support-E-Mail:** `mrs.penkys.webshop@gmail.com` — eingetragen in `contact.html`, `refund.html`, `privacy.html`, `terms.html`.

**Social:**
Instagram `https://www.instagram.com/mrs.penkys.webshop/`
Facebook `https://www.facebook.com/profile.php?id=61592692544140`
Verlinkt im Footer von index, about, contact, shipping, faq, privacy, refund, terms.

**Domain:** `mrspenky.shop`, gekauft bei GoDaddy. Noch nicht eingerichtet.

---

## 3. Offene Punkte

### 3.1 Zwei Bilddateien fehlen

`E:\Mrs.Penky.com\pics\FB Titel.jpg` und `FB profile.jpg` → Ziel `...\Mrs.Penky.com\pics\`.

Binärdateien lassen sich nur per Explorer kopieren. Zwei Versuche gescheitert: die Pfadeingabe im Explorer läuft über die Zwischenablage und überschreibt dabei den Kopiervorgang. Manuell hinüberziehen, dann committen.

### 3.2 Lieferzeiten unbekannt

`src/shipping.html` Zeile 65 trägt einen markierten Platzhalter. `cjdropshipping.com/calculation.html` leitet auf eine Bot-Prüfung um und ist nicht abrufbar. Zahlen müssen aus dem CJ-Konto kommen. **Keine Lieferzeiten erfinden** — falsche Angaben führen zu Rückbuchungen.

### 3.3 Kontaktformular nicht angebunden

`src/contact.html` enthält `const CONTACT_ENDPOINT = '';`. Solange leer, fällt das Formular auf einen Mailto-Link zurück. Für den echten Betrieb fehlen:

- Supabase Edge Function `contact-message` (Tabelle + Insert + Benachrichtigung)
- Migration für die Nachrichtentabelle
- `CONTACT_ENDPOINT` auf `https://<project-ref>.supabase.co/functions/v1/contact-message` setzen

### 3.4 Domain einrichten

DNS von GoDaddy auf Cloudflare Pages, Custom Domain hinterlegen, `www`-Redirect, SSL prüfen.

`wrangler.toml` enthält noch `route = "https://mrs.penky.com/*"` sowie `YOUR_CLOUDFLARE_ACCOUNT_ID` und `YOUR_CLOUDFLARE_ZONE_ID`. Alles auf `mrspenky.shop` anpassen.

### 3.5 GitHub-Token

Fine-grained PAT wurde für die Pushes verwendet und steht im Chatverlauf im Klartext. Nach dem Deployment unter `github.com/settings/personal-access-tokens` löschen. Nicht in `.git/config` gespeichert.

---

## 4. Erledigt (Historie)

- Repo-Struktur wiederhergestellt (`git mv`, Historie erhalten), Imports auf `../_shared/` umgestellt
- Alle unbelegten Produktaussagen entfernt: „handcrafted", „handmade", „not mass-produced", „blessed" — 24 Stellen in 6 Dateien. Hero lautet jetzt „Faith, carried / with grace — / close to the heart."
- Footer-Kategorien Crosses/Rosaries/Bracelets/Lights verlinkt; von den Rechtsseiten über `index.html?cat=<name>#shop`, das `index.html` beim Laden auswertet
- Filter-Button **Lights** ergänzt (fehlte, obwohl die Kategorie existiert)
- Tote Nav-Anker `#collections`, `#story`, `#contact` existierten auf keiner Seite — IDs an die passenden Abschnitte gehängt
- Footer-Logo: `filter: brightness(0) invert(1)` machte daraus einen weißen Block, entfernt
- `mrspenky-home.html` referenzierte `../pics/` — alle Bilder tot; korrigiert, Datei danach von Parallelsitzung entfernt
- Vier neue Seiten: About, Contact, Shipping, FAQ

---

## 5. Technische Stolpersteine

- **`E:\` lässt sich nicht in die Bash-Sandbox mounten.** Nur Read/Write/Edit/Grep/Glob auf dem Host-Pfad.
- **Datei-Upload des Browser-Tools scheitert an Leerzeichen im Pfad.** Kein Workaround gefunden.
- **Explorer-Steuerung:** Tippen läuft über die Zwischenablage und zerstört einen laufenden Kopiervorgang. Navigation stattdessen über die Seitenleiste.
- **Kein GitHub-MCP-Konnektor.** Push über `git push https://x-access-token:<PAT>@github.com/...`.
- **OneDrive-Ordner ist cloud-synchronisiert.** Nur in der Cloud liegende Dateien sieht Bash nicht.
- **`wrangler.toml`** verweist auf `main = "src/index.js"` — diese Datei existiert nicht. Vorbestehend, vor dem Deployment prüfen.
- **`index.html` lädt Produkte aus Supabase.** Lokal geöffnet bleibt das Raster leer; Layout und Footer rendern trotzdem.

---

Erstellt von Claude für Bodo Kopplin, 07.08.2026.
