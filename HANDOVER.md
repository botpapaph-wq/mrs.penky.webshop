# Handover — Mrs. Penky Webshop

Stand: 2026-08-07. Für die Fortsetzung in einer neuen Sitzung.

---

## 1. Repo-Status

**Remote:** `https://github.com/botpapaph-wq/mrs.penky.webshop`, Branch `main`

| Commit | Inhalt |
|---|---|
| `3a75e18` | Ausgangsstand (vorher vorhanden) |
| `1237908` | CJ-Dropshipping-Integration, Legal-Seiten, Frontend-Updates |
| `c20e2d5` | `.gitkeep`-Platzhalter für leere Ordner |
| `8195b41` | **Ordnerstruktur wiederhergestellt** (aktueller Stand) |

Lokaler Arbeitsordner `...\Claude Cowork\BOT PAPA AI Voiceassistants\Mrs.Penky.com` ist sauberes Git-Repo auf `main`, Tracking auf `origin/main`, Working Tree clean.

### Struktur

```
src/                          Frontend + Bild-Assets (Cloudflare-Bucket)
  index.html, mrspenky-home.html, checkout.html,
  success.html, cancel.html, terms.html, privacy.html,
  refund.html, chat-widget.js,
  logo-header.png, logo-large.png, portrait-hero.png,
  Mrs. Penky Logo.png
functions/
  _shared/                    cj-client.ts, types.ts, zoho.ts
  api/                        chat.js            (Cloudflare Pages Function)
  payment-webhook/            index.ts           (Supabase Edge Function)
  create-checkout-session/    index.ts
  sync-products/              index.ts
  forward-order/              index.ts
docs/                         SETUP.md, PAYMENTS.md, ZOHO.md
supabase/migrations/          001_init_schema.sql, 002_cj_dropshipping.sql
pics/                         LEER — siehe offene Punkte
README.md, wrangler.toml, .env.example, .gitignore
BUILD_SUMMARY.md, DELIVERY_SUMMARY.md, FRONTEND_STATUS.md,
TEST_LOCAL.md, VERIFICATION.md
```

---

## 2. Offene Punkte

### 2.1 Zwei Bilddateien fehlen im Repo

`E:\Mrs.Penky.com\pics\FB Titel.jpg` und `FB profile.jpg` liegen nur auf dem Backup-Stick. Ziel: `...\Mrs.Penky.com\pics\`.

Nicht erledigt, weil Binärdateien nur per Explorer kopierbar sind und die Freigabe dafür in einen temporären Serverfehler lief. Nächste Sitzung: per Explorer kopieren, dann `git add pics/ && git commit && git push`.

### 2.2 Falsche Aussage „handcrafted"

Die Produkte kommen aus CJ-Dropshipping, sind also **nicht** handgefertigt. Die Behauptung steht an vier Stellen — alle müssen weg, die Legal-Texte sind rechtlich relevant:

| Datei | Zeile | Text |
|---|---|---|
| `src/index.html` | 107 | `Faith, handcrafted<br/>with grace —<br/>blessed for you.` |
| `src/mrspenky-home.html` | 107 | identisch |
| `src/refund.html` | 64 | „…some are handcrafted or made to order…" |
| `src/terms.html` | 68 | „…due to the handcrafted nature of some items." |

**Vorschläge für die Hero-Zeile** (Rhythmus der Vorlage beibehalten, ohne Fertigungsbehauptung):

1. `Faith, carried<br/>with grace —<br/>blessed for you.`
2. `Devotion, chosen<br/>with care —<br/>blessed for you.`
3. `Faith, worn<br/>with grace —<br/>blessed for you.`
4. `Symbols of faith,<br/>chosen with care —<br/>blessed for you.`

Für `refund.html` Z. 64 und `terms.html` Z. 68: „handcrafted or made to order" → „devotional or made to order"; „due to the handcrafted nature of some items" → „due to the nature of the materials used".

Hinweis: „blessed" ist ebenfalls eine Tatsachenbehauptung. Falls die Ware nicht tatsächlich gesegnet wird, sollte auch das geprüft werden.

### 2.3 Footer-Links setzen

`src/index.html` Zeile 201:

```html
<p>Crosses</p><p>Rosaries</p><p>Bracelets</p><p>Lights</p>
```

Reiner Text, keine Links. Sollen auf die Kategoriefilter zeigen. Vorhandene Mechanik in Zeile 165–167:

```html
<button onclick="filterCategory('crosses')">Crosses</button>
<button onclick="filterCategory('rosaries')">Rosaries</button>
<button onclick="filterCategory('bracelets')">Bracelets</button>
```

**Achtung — Inkonsistenz:** Der Footer listet vier Kategorien, die Filterleiste hat nur drei. Für **Lights** existiert kein Filter-Button. Vor dem Verlinken klären: Kategorie ergänzen oder aus dem Footer streichen?

Der Header-Link `Shop` (Zeile 87) zeigt auf den Anker `#shop` — auf der Startseite korrekt, auf Unterseiten (`terms.html` etc.) läuft er ins Leere. Dort muss es `index.html#shop` heißen.

### 2.4 Domain mrspenky.shop

Wird gerade bei GoDaddy gekauft. Zu tun: DNS auf das Cloudflare-Pages-Projekt zeigen, Custom Domain in Cloudflare hinterlegen, Redirect von `www` festlegen, SSL prüfen.

`wrangler.toml` enthält aktuell noch `route = "https://mrs.penky.com/*"` sowie Platzhalter `YOUR_CLOUDFLARE_ACCOUNT_ID` / `YOUR_CLOUDFLARE_ZONE_ID` — beides an die neue Domain anpassen.

### 2.5 GitHub-Token

Fine-grained PAT `cowork-push` (Contents: Read and write, nur dieses Repo, Ablauf 06.10.2026) wurde für die Pushes verwendet. **Er steht im Chatverlauf der Sitzung vom 07.08.2026 im Klartext.** Empfehlung: unter `github.com/settings/personal-access-tokens` löschen und bei Bedarf neu erzeugen. Er ist **nicht** in `.git/config` gespeichert.

---

## 3. Technische Stolpersteine (bereits verifiziert)

- **`E:\` lässt sich nicht in die Bash-Sandbox mounten.** Zugriff nur über Read/Write/Edit/Grep/Glob auf dem Host-Pfad. Für Shell-Arbeit erst in den Arbeitsordner kopieren.
- **Der Datei-Upload des Browser-Tools scheitert an Leerzeichen im Pfad.** `...\Claude Cowork\BOT PAPA AI Voiceassistants\...` wird verworfen. Kein Workaround gefunden (Kurznamen `CLAUDE~1` greifen nicht, die Allowlist löst sie nicht auf).
- **Kein GitHub-MCP-Konnektor** in der Registry. `plugin:engineering:github` braucht OAuth, in nicht-interaktiven Sitzungen nicht durchführbar. Push läuft über `git push https://x-access-token:<PAT>@github.com/...`.
- **OneDrive-Ordner ist cloud-synchronisiert.** Dateien, die nur in der Cloud liegen, sieht Bash nicht — dann Read verwenden.
- **`wrangler.toml`** verweist auf `main = "src/index.js"` und `[build.upload] main = "./src/index.js"`. Diese Datei existiert nicht. Vorbestehend, nicht von mir verändert — vor dem nächsten Deployment prüfen.
- **Keine echte `.env`** im Projekt, nur `.env.example`. `.gitignore` schließt `.env` aus.

---

## 4. Empfohlene Reihenfolge für die nächste Sitzung

1. FB-Bilder vom Stick nach `pics/` kopieren, committen, pushen
2. „handcrafted" an allen vier Stellen ersetzen (Hero + zwei Legal-Texte)
3. Footer-Kategorien verlinken — vorher klären, was mit **Lights** passiert
4. `Shop`-Link auf Unterseiten auf `index.html#shop` korrigieren
5. Domain `mrspenky.shop` in Cloudflare einbinden, `wrangler.toml` anpassen
6. Token widerrufen

---

Erstellt von Claude für Bodo Kopplin, 07.08.2026.
