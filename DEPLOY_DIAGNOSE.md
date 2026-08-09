# Warum die Seite alt bleibt

Stand: 09.08.2026, 03:35. Alle Angaben nachgemessen, nichts geraten.

---

## Der Befund in einem Satz

**Die Live-Seite hängt seit dem 08.08. um 04:25 Uhr auf Commit `587c786` fest.**
Nicht seit heute Nacht — seit gestern früh. Alles, was seitdem gepusht wurde,
ist auf GitHub, aber nie ausgeliefert worden.

---

## Wie ich darauf komme

| Was ich geprüft habe | Ergebnis |
|---|---|
| Chat-Begrüßung live | „I'm here to help you look for…" — die Fassung **vor** Commit `3548bdf` (08.08. 04:29) |
| Checkout-Layout live | das alte, zentrierte Logo — **vor** `071580d` (08.08. 04:50) |
| robots.txt live | die deutsche Content-Signals-Fassung = `587c786` (08.08. 04:25) |
| `mrspenky.shop/cookie-consent.js` | antwortet mit der Startseite → die Datei liegt gar nicht auf dem Server |
| Code auf GitHub | vorhanden, geprüft über `raw.githubusercontent.com` |

Der letzte ausgelieferte Stand liegt damit zwischen 04:25 und 04:29 am 08.08.

---

## Was es NICHT ist

- **Kein Browser-Cache.** Ein Abruf ohne Browser, ohne Cache, mit
  Cache-Buster-Parameter liefert denselben alten Inhalt.
- **Nicht die Domain, kein Worker davor, kein Zonen-Cache.** Auch die
  projekteigene Adresse **`mrs-penky-webshop.pages.dev`** zeigt den alten
  Stand. Die liegt vor allem, was auf `mrspenky.shop` konfiguriert ist.
- **Kein fehlgeschlagener Push.** `origin/main` steht auf `ad444c4`.

---

## Was es sein muss

Das Pages-Projekt `mrs-penky-webshop` selbst hält eine alte Version.
Dafür gibt es genau zwei Erklärungen:

1. **Das Projekt hängt nicht am GitHub-Repo**, sondern wurde per *Direct
   Upload* befüllt. Dann lösen Pushes gar keinen Build aus. Dafür spricht:
   `main.mrs-penky-webshop.pages.dev` löst nicht auf — diesen Branch-Alias
   legt Pages nur für Git-verbundene Projekte an.
2. **Die Builds schlagen fehl.** Pages liefert dann kommentarlos das letzte
   erfolgreiche Deployment weiter aus; auf der Seite ist nichts zu sehen.

**Beides steht im selben Fenster:** dash.cloudflare.com → Workers & Pages →
`mrs-penky-webshop` → **Deployments**.

- Stehen dort Einträge mit „Direct Upload" und keine Commit-Hashes → Fall 1.
  Dann: *Settings → Builds & deployments → Connect to Git*, Repo
  `botpapaph-wq/mrs.penky.webshop`, Branch `main`, Build-Befehl **leer**,
  Build-Ausgabeverzeichnis **`src`**.
- Stehen dort Commit-Hashes mit „Failed" → Fall 2. Das Build-Log nennt den
  Grund.

---

## Zwei Bauhindernisse habe ich schon beseitigt

Unabhängig davon, welcher Fall zutrifft: sobald ein Build läuft, wäre er an
diesen zwei Dingen gescheitert. Beide sind mit Commit `ad444c4` erledigt.

**1. `/functions` gehört Cloudflare, nicht Supabase.**
Ein Verzeichnis `functions/` im Wurzelverzeichnis ist bei Pages reserviert —
alles darin wird als Pages Function kompiliert. Dort lagen sechs
Supabase-Edge-Functions in Deno: `Deno.serve`, `Deno.env`, Importe von
`https://esm.sh/…`. Die Laufzeit von Pages ist workerd, kennt kein `Deno` und
kann keine Remote-Importe auflösen → Build bricht ab.
Sie liegen jetzt unter `supabase/functions/` — dort, wo die Supabase-CLI sie
ohnehin erwartet. Die relativen `../_shared/`-Importe stimmen weiterhin, weil
der ganze Baum zusammen umgezogen ist. `functions/api/chat.js` bleibt liegen,
das ist die echte Pages Function hinter `/api/chat`.

**2. `wrangler.toml` gelöscht.**
Sie beschrieb eine Workers Site (`site = { bucket = "src" }`), zeigte mit
`main` auf `src/index.js` — Datei existiert nicht — und deklarierte
`command = "npm run build"` ohne package.json im Repo. Ein `wrangler.toml`
mit `site` weist Pages rundheraus zurück. Für ein Projekt, das im Dashboard
konfiguriert ist, wird die Datei nicht gebraucht.

---

## Danach prüfen

Wenn ein Deployment durchgelaufen ist, sagen diese drei Abrufe sofort, ob es
der neue Stand ist:

```
https://www.mrspenky.shop/cookie-consent.js   -> muss JavaScript liefern, nicht die Startseite
https://www.mrspenky.shop/                    -> Badge sagt "Free shipping from PHP 800", nicht "Fall Collection"
https://www.mrspenky.shop/checkout.html       -> dunkelblaues Kopfband, zweispaltig
```

---

## Was danach noch offen bleibt

Ohne Eile bis 1. September, und unabhängig vom Aussehen:

1. Migration `006_catalogue_cleanup.sql` im Supabase-SQL-Editor ausführen.
2. `shipping-quote` und `create-checkout-session` neu deployen — die live
   laufende Fassung liest `penky_store_settings` als Key/Value-Tabelle, die
   es so nicht gibt, und stürzt beim Versandpreis ab. Der Fix ist committet.
3. PayPal-Checkout einrichten.

Erst wenn 1 und 2 erledigt sind, kommt eine Testbestellung bis zur Zahlung.
