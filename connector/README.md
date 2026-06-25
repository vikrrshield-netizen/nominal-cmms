# nominal-cmms — Claude konektor (MCP)

Malý server, přes který se **Claude** napojí na databázi appky (Firestore) a umí se ptát na stav, audity a historii.

- **Fáze 1 (tady):** jen **čtení** — 6 nástrojů, nic nemění.
- **Fáze 2 (později):** zápis (Deník, úkoly).

## Nástroje (Fáze 1)
- `get_machine_status` — stav strojů (běží/porucha/údržba/stop).
- `list_open_tasks` — otevřené úkoly.
- `list_overdue_checks` — propadlé/blížící se termíny (kalibrace, kontroly, údržba).
- `audit_readiness` — audit přehled (IFS/BRC/Tesco).
- `search_worklogs` — hledání v Deníku.
- `get_asset_detail` — detail zařízení (stav, termíny, poslední práce).

## Spuštění lokálně (test)
```
cd connector
npm install
# klíč service accountu (viz SETUP-GOOGLE-CLOUD.md):
set GOOGLE_APPLICATION_CREDENTIALS=C:\cesta\k\klici.json   # Windows
set TENANT_ID=main_firm
npm run dev
```
Server běží na `http://localhost:8080`. Test přes **MCP Inspector**:
```
npx @modelcontextprotocol/inspector
```
→ připoj `http://localhost:8080/mcp` (Streamable HTTP).

## Nasazení (Cloud Run) — až s tvým OK
Build kontejneru z `Dockerfile`, deploy do projektu `vikrr-asset-shield`. Server poběží jako service account (žádný klíč v kódu).

## Bezpečnost
- Fáze 1 server **fyzicky neumí zapisovat**.
- `CONNECTOR_TOKEN` (env) = jednoduchá ochrana pro test; pro claude.ai přidáme **OAuth** (Fáze 1b).
- Klíč service accountu nikdy necommituj (viz `.gitignore`).
