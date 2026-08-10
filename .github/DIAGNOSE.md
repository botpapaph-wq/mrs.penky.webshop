# Selbstdiagnose des Deployments

Lauf: 2026-08-10 01:46 UTC  ·  Commit `a41b296`

## Ergebnis Durchgang 1

- Repo ist oeffentlich, `has_pages: false`
- `POST /pages` -> 403 "Resource not accessible by integration"
- GitHub Pages laesst sich per Workflow NICHT einschalten
- Schreiben ins Repo funktioniert (diese Datei ist der Beweis)

## Durchgang 2: welche Secrets sind hinterlegt?

| Secret | gesetzt | Laenge |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | nein | - |
| `CLOUDFLARE_ACCOUNT_ID` | nein | - |
| `CF_API_TOKEN` | nein | - |
| `CF_ACCOUNT_ID` | nein | - |
| `CLOUDFLARE_TOKEN` | nein | - |
| `SUPABASE_ACCESS_TOKEN` | nein | - |
| `SUPABASE_SERVICE_ROLE_KEY` | nein | - |
| `PAGES_DEPLOY_HOOK` | nein | - |

Steht bei CLOUDFLARE_API_TOKEN (oder CF_API_TOKEN) ein JA, kann der
naechste Lauf mit `wrangler pages deploy src` direkt auf mrspenky.shop
veroeffentlichen -- ohne Dashboard, ohne Klick.
