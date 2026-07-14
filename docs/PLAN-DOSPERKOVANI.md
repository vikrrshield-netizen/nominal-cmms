# PLÁN DOŠPERKOVÁNÍ — kuchařka pro provádějící model

> Tento plán je psaný tak, aby ho zvládl i levnější model (Sonnet/Haiku) po malých dávkách.
> Sestavil Opus/Fable 2026-07-04 na základě auditů a plánovací příručky (skill `planovani-cmms`).
> **Dělej VŽDY jen JEDNU dávku najednou.** Po každé: build → ověř → nasaď → commit+push → krátká zpráva uživateli.

---

## 0) ZLATÁ PRAVIDLA (přečti před KAŽDOU dávkou)

- **Složka:** `C:\Users\bsvk\Documents\Codex\2026-04-26\github-plugin-github-openai-curated-nominal\nominal-cmms` — NIKDY Utrizene.
- **Uživatel:** není programátor, dyslektik. Odpovídej česky, formát `## 👉 Pro tebe` (krátce, odrážky, tučné klíčové slovo) + `## 🔧 Detail (nemusíš číst)`. Rozhodnutí dávej jako klikací otázky (AskUserQuestion), ne text.
- **Build web:** `npm run build` · **Build funkce:** `npm --prefix functions run build` (TS! bez buildu se nasadí stará lib/).
- **Deploy web:** `firebase deploy --only hosting --project nominal-cmms --non-interactive` (nasadí OBA weby — app.vikrr.com je site `nominal-cmms`).
- **Deploy funkce:** `firebase deploy --only functions:NAZEV --project nominal-cmms --non-interactive`. **NIKDY `--force`.**
- **Po deployi čehokoliv kolem přihlašování** VŽDY smoke test:
  `curl -X POST https://us-central1-nominal-cmms.cloudfunctions.net/loginWithPin -H "Content-Type: application/json" -d '{"data":{"pin":"999999","deviceId":"smoke-test-device-0123456789abcd"}}'`
  → musí vrátit **401 „Nespravny PIN."**, NE 500.
- **Záloha:** po každé dávce `git add` (jen změněné soubory) + commit česky + `git push`.
- **NIKDY bez výslovného souhlasu uživatele:** firestore.rules / storage.rules, auth/PIN logika, mazání dat/funkcí, změna modelu AI.
- **NIKDY:** Firestore doc ID tvaru `__něco__` (rezervované — shodilo login); `window.confirm/alert` (používej `useConfirm` → `ask`/`notify`); nové barvy mimo emerald+stavové (viz skill `vzhled`/`trendy-ui`); dotykové terče < 44 px.
- **Funkce importují `firebase-functions/v1`** (gen1!) — nikdy holé `firebase-functions`.
- **Paměť:** na začátku session si přečti `MEMORY.md` v paměťové složce projektu (index) — hlavně `audit-findings-backlog`, `in-app-ai-assistant`, `code-map`.
- **UI úpravy:** mockup/náhled NEJDŘÍV, kód až po odsouhlasení. U logiky si nech plán odsouhlasit.
- Ověření bez dat: dev server (launch config `nominal`, port 5173) má demo login **PIN 0000** — demo účet ale nevidí data (permission-denied je OK) a nevidí tlačítka vyžadující práva. Reálný test dělá uživatel na app.vikrr.com.

---

## DÁVKA 0 — Opravit zbylé potvrzené nálezy z auditů ✅ prerekvizita
**Cíl:** čistý stůl před novými funkcemi.
**Zdroj:** paměť `audit-findings-backlog.md` — sekce „AUDIT LOGIKY (2026-07-04)" a novější (sklad už je opravený 2026-07-04, NEDĚLAT znovu). Pokud je v paměti sekce „AUDIT LOGIKY 2", oprav nálezy s confidence high; medium probrat s uživatelem.
**Postup:** každý nález = samostatný mini-fix: přečti uvedený soubor:řádek → oprav minimálně → build → nasaď → commit.
**NEDĚLAT:** rules hardening (jen s uživatelem u obrazovky), gearbox montáž race (chce změnu modelu).

## DÁVKA 1 — ✅ HOTOVO 2026-07-04 — „Stroje bez preventivního plánu" v Kontrole kartotéky
**Cíl:** audit chce PPM na VŠECHNY stroje → doktor kartotéky ukáže, kterým chybí.
**Soubor:** `src/pages/KartotekaPage.tsx` → memo `healthReport` (hledej `🩺 Kontrola kartotéky`).
**Postup:** do `healthReport` přidej info-check: spočítej stroje (`!isBuildingAsset && !isRoomAsset`, ne virtuální), které NEMAJÍ žádnou událost s `frequencyDays > 0` (pole `asset.events`). Přidej `issues.push({ level: 'info', text: 'N× stroj bez preventivního plánu (Události + frekvence)' })` + po kliku vysvětli, jak plán nastavit (rodný list → Potřeby → Události).
**Ověření:** node mini-test logiky (vzor: scratchpad testy), build, demo render.
**Rozsah:** ~30 řádků. Bez backendu.

## DÁVKA 2 — ✅ HOTOVO 2026-07-04 (stránka /kalibrace + AI type=meridlo) — Kalibrace měřidel (audit MUST — BRCGS/Tesco S28)
**Cíl:** registr měřidel s termíny kalibrace a hlídáním expirace — DOLOŽITELNÉ auditorovi.
**Jak stavět (využít co existuje, NEstavět modul od nuly):**
1. Měřidlo = položka kartotéky s `entityType: 'Měřidlo'` (kartotéka i AI ji už unesou).
2. Kalibrace = událost v `asset.events` (`eventType: 'kalibrace'`, `frequencyDays` 365 apod.) → **preventivní údržba už sama založí úkol** (functions/src/preventive.ts — hotové, nesahat).
3. Certifikáty = upload do Storage jako u revizí (`revisions/` cesta, cap 20 MB existuje) — na kartě zařízení sekce Dokumenty už existuje.
4. NOVÉ: stránka/záložka „Měřidla" = filtrovaný pohled kartotéky (`typeFilter`-like výběr entityType Měřidlo) se sloupci: název, umístění, poslední/další kalibrace, stav (propadlé červeně). Nejjednodušší: nová route `/meridla` se seznamem z `assetService.getAll` + filtr; vzor stránky: `LabelsPage.tsx` (jednoduchá struktura).
**Rozhodnutí uživatele předem:** chce samostatnou stránku, nebo stačí filtr v Kartotéce? (AskUserQuestion)
**Rozsah:** střední. Bez rules změn (kolekce assets už práva má).

## DÁVKA 3 — ✅ KÓD HOTOV 2026-07-14 (commit 4fd7e85) — ⚠️ NENASAZENO (majitel: nasadit později, třeba s D5)
Registr skla dotažen: `BreakageSheet` (co/kdy/kdo/popis/opatření, validace) + `AuditRegister`
s volitelnou `config.incident` (červené tlačítko — smí wo.create/wo.update; historie z workLogs
where workType „Rozbití skla", bez složeného indexu). Zápis do Deníku s `auditReady`, žádné nové
rules. Ověřeno buildem + náhledem. Deploy = jen hosting.

## DÁVKA 4 — ✅ HOTOVO 2026-07-04 (stránka /detektory + AI type=detektor) — Detektory cizích těles (audit MUST — IFS v8 povinné!)
**Cíl:** evidence detektorů (magnety, síta, kovodetektor…) + test funkčnosti min. 1× za 12 měsíců.
**Postup:** stejný vzor jako měřidla: `entityType: 'Detektor'` + událost `test_funkcnosti` s `frequencyDays: 365` → auto-úkoly zadarmo. Přidej do Kontroly kartotéky check „detektor bez testu >12 měsíců" (z `events` lastDate). Se souhlasem uživatele seedni reálné detektory (zeptej se, jaké mají).
**Rozsah:** malá.

## DÁVKA 5 — Hygienické uvolnění po údržbě (audit MUST — BRCGS 4.7.4) ⚠️ logika
**Cíl:** po dokončení údržbového úkolu na stroji potvrdit „stroj očištěn a uvolněn do provozu".
**Postup (nech si odsouhlasit!):** do dokončení úkolu (`src/services/taskService.ts` completeTask — POZOR, je v runTransaction; a `useInventory.completeTaskWithParts`) přidat volitelný krok: když má úkol `assetId` a typ údržby, klient se PŘED dokončením zeptá (useConfirm) „Stroj je čistý a uvolněný do provozu?" a zapíše do task dokumentu `hygieneRelease: { by, byName, at }`. Jen klientská pole — žádné rules změny. UI: TasksPage tlačítko dokončení.
**NEDĚLAT:** povinnost/blokaci bez souhlasu uživatele (ať si vybere: volitelné vs povinné).
**Rozsah:** střední, citlivá (dotýká se dokončování úkolů) — pečlivě testovat.

## DÁVKA 6 — Dočasné opravy s expirací (audit SHOULD — BRCGS 4.7.3)
**Cíl:** úkol jde označit „dočasná oprava" s termínem, do kdy musí přijít trvalá; po termínu se sám založí následný úkol.
**Postup:** 1) klient: checkbox „dočasná oprava" + datum při zakládání/dokončení úkolu → pole `temporaryFix: { until: 'YYYY-MM-DD' }`. 2) backend: rozšíř `functions/src/preventive.ts` denní běh — najdi dokončené úkoly s `temporaryFix.until <= dnes` bez follow-upu → založ úkol „Trvalá oprava: …" (dedup přes `followUpOf: taskId`).
**Rozsah:** střední. Funkce: build + deploy `functions:generatePreventiveTasks`.

## DÁVKA 7 — ✅ HOTOVO 2026-07-04 — Audit balíček (export pro auditora)
**Cíl:** jedním klikem XLSX: stroje + jejich PPM plány + poslední provedení, propadlé termíny, kalibrace, detektory, rozbití skla.
**Postup:** využij `src/hooks/useReports.ts` (exportXLSX existuje — podívej se, jak ho volá InventoryPage/Reporty). Nová položka v Reportech „Audit balíček (IFS/BRC)": posbírej data z `assets` (events+lastDate/nextDate), `tasks` (source preventive, completed), workLogs. Jen čtení + export, žádné zápisy.
**Rozsah:** střední, bezpečná (read-only).

## DÁVKA 8 — Tmavé stránky → světlý vzhled (průběžně, po JEDNÉ stránce)
**Cíl:** sjednotit zbývající tmavé stránky do světlého „Denní provoz" vzhledu.
**Postup:** 1) zjisti aktuální seznam tmavých stránek (grep `bg-slate-9`, `bg-gray-9`, `bg-black` v src/pages); 2) VŽDY jen jedna stránka na dávku; 3) drž skill `vzhled` + `trendy-ui`: sand/bílá základna, emerald akcent, barva jen pro stav, terče ≥44 px, `vik-card`/`BottomSheet`; 4) mockup → schválit → kód. **JEN vzhled, žádná logika.**

## DÁVKA 9 — Offline režim (velká — až budou hotové dávky výš, fázovat!)
**Cíl:** appka v hale bez signálu aspoň ČTE (kartotéka, úkoly) a hlášení poruchy se frontuje.
**Fáze A (bezpečná):** zapnout Firestore offline persistence (`persistentLocalCache` v `src/lib/firebase.ts` initializeFirestore) → čtení z cache funguje samo; otestovat, že nic nespadlo.
**Fáze B:** service worker pro cache statických assetů (vite-plugin-pwa, `registerType: 'autoUpdate'`) — POZOR: SW mění doručování verzí; testovat, že update appky po deployi stále dojde (dnes je no-cache + reload).
**Fáze C (jen po dohodě):** fronta zápisů offline (Firestore to z velké části umí samo — mutace se pošlou po připojení; ověřit chování PIN loginu offline).
**Rozsah:** velká, po fázích, každá zvlášť schválit.

---

## Co v plánu ZÁMĚRNĚ NENÍ (nedělat bez uživatele)
- **Firestore/Storage rules hardening** — jen attended s živým testem (rozbité rules = nefunkční appka).
- **Nová firma (white-label)** — startuje uživatel („zakládáme firmu X"), kuchařka: `vikrr-web/docs/ONBOARDING-NOVA-FIRMA.md`.
- **OEE/KPI dashboard pro vedení** — uživatel zatím nevybral; nabídnout po dávce 7.
- **IIoT senzory, digital twin** — overkill pro velikost firmy (viz skill).

## Pořadí a odhad
| Dávka | Velikost | Hodnota | Pozn. |
|---|---|---|---|
| 0 audit-fixy | S–M | vysoká | nejdřív |
| 1 PPM check | S | vysoká | rychlá výhra |
| 2 kalibrace | M | audit MUST | |
| 3 sklo | S–M | audit MUST | z velké části existuje |
| 4 detektory | S | audit MUST (IFS v8) | |
| 5 hygienické uvolnění | M ⚠️ | audit MUST | citlivé — schválit postup |
| 6 dočasné opravy | M | audit SHOULD | |
| 7 audit balíček | M | vysoká (auditor) | read-only |
| 8 světlé stránky | S×N | střední | průběžně |
| 9 offline | L | vysoká | po fázích |
