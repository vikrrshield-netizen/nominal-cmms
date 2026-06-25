# ⚠️ Google Cloud — krok za krokem (dělá majitel)

Cílem je vytvořit „robotí účet" (service account), kterým server **čte** tvoji databázi. Je to klikání v Google konzoli. Trvá ~5 minut.

## A) Vytvoř service account (robotí účet)

1. Otevři **console.cloud.google.com** a přihlas se (stejný účet jako appka).
2. Úplně nahoře vyber projekt **nominal-cmms**. (Pozn.: „vikrr-asset-shield" je jen název webu/hostingu, ne projektu.)
3. Vlevo nahoře **☰ menu → IAM & Admin → Service Accounts**.
4. Klikni **+ CREATE SERVICE ACCOUNT** (Vytvořit servisní účet).
5. **Name (název):** napiš `cmms-connector`. Klikni **CREATE AND CONTINUE**.
6. **Role:** klikni do pole a vyber **Cloud Datastore Viewer** (= jen čtení Firestore). Klikni **CONTINUE**, pak **DONE**.

> Proč „Viewer": pro Fázi 1 chceme, aby účet uměl **jen číst**. Zápis (Fáze 2) přidáme změnou role později.

## B) Stáhni klíč (jen pro test na tvém PC)

7. V seznamu klikni na účet **cmms-connector@…**.
8. Nahoře záložka **KEYS → ADD KEY → Create new key → JSON → CREATE**.
9. Stáhne se **soubor `.json`**. **Je tajný** — nikam ho neposílej veřejně, nedávej do gitu.
10. Ulož ho na svém počítači (klidně mimo projekt, např. `C:\vikrr\cmms-connector-key.json`) a **napiš mi tu cestu** — já s ním otestuju Fázi 1 lokálně.

## C) Co bude dál (já + ty)

- Já s tím klíčem **otestuju**, že čtení funguje (přes MCP Inspector).
- Pak ti řeknu, až budeme **nasazovat na Cloud Run** — tam už klíč nebude potřeba (server poběží přímo jako tenhle účet). Na deploy si vyžádám tvoje **✅ POTVRĎ**.
- Nakonec ty v **Claude → Settings → Connectors → Add custom connector** vložíš URL, kterou ti dám, a projdeš **jedním přihlášením** (OAuth).

## Časté otázky
- **Stojí to něco?** Ne. Free tier pokryje provoz pohodlně.
- **Je to bezpečné?** Účet umí jen číst (Fáze 1) a klíč/URL máš jen ty.
- **Můžu to vzít zpět?** Ano — účet i klíč jdou kdykoliv smazat v té samé konzoli.
