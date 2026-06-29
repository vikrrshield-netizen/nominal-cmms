# Úkoly pro Codex — nominal-cmms (UI dávka)

> Připravil Claude 2026-06-18. Předáno Codexu k implementaci.
> Repo: tento workspace (Codex path). Větev: **`feature/light-polish`**.

## Globální pravidla (platí pro VŠECHNY úkoly)
- **JEN UI / vzhled + drobné napojení existujících služeb.** NEMĚNIT: auth, PIN login, Firestore rules, Cloud Functions, datové modely, podpisy služeb. (Výjimka: úkoly výslovně označené „LOGIKA" — ty NEDĚLAT bez potvrzení.)
- **Světlý vzhled „Denní provoz":** pozadí sand `#f1ece3`, bílé karty, šalvěj `#1a6b4f`, klidné barvy (max 1 výrazný akcent + sémantická červená/jantarová/zelená/modrá). Žádné duhové sady.
- **Sdílené prvky:** modály = `src/components/ui/BottomSheet`; tlačítka/inputy ve stylu appky (`vik-button`, `vik-input`, `vik-card`). Ikony = `lucide-react`, NE emoji.
- **Pozor na emoji v `<option>`** — do `<select><option>` nejde vložit SVG ikonu; tam emoji buď nechat, nebo zobrazit jen text.
- **Po každém úkolu:** `npx tsc -b` (musí projít) + `npm run build` (musí projít). Commit s krátkou zprávou. **NENASAZOVAT** (deploy dělá majitel přes Firebase na pokyn).
- Orientace v kódu: viz dále u každého úkolu konkrétní soubor + kotvy.

---

## SKUPINA 1 — HOTOVÉ K IMPLEMENTACI (UI, malé riziko)

### T1 — Karta zařízení: tlačítko „Zapsat" do hlavní lišty
**Problém:** na kartě zařízení (`/asset/:id`) chybí v horní liště obyčejný zápis do historie (deník/práce). Modál na to UŽ existuje (`GearboxRepairModal`, stav `repairOpen`), ale tlačítko je schované uvnitř sekce převodovky (jen `canAssignGearbox`, jen určitá záložka).
**Soubor:** `src/pages/AssetCardPage.tsx` (lišta akcí ~ř.1024–1091; `repairOpen` ř.252; modál render ř.1513).
**Udělat:**
1. Přidat do hlavní lišty tlačítko **„Zapsat"** (ikona `FileText`, neutrální bílý styl jako ostatní) hned za „Nový úkol", `onClick={() => setRepairOpen(true)}`. Zobrazit pro **každý asset** (ne jen gearbox).
2. Zobecnit `src/components/gearbox/GearboxRepairModal.tsx` název/texty na asset-neutrální („Zápis do historie", typy Oprava/Úprava/Kontrola nech). Modál už volá `addWorkLog` — službu NEMĚNIT.
**Hotovo když:** z libovolné karty zařízení jde „Zapsat", po uložení se zápis objeví v záložce Historie.

### T2 — Modul Převodovky: tlačítko „Přiřadit" na kartě v seznamu
**Problém:** na stránce Převodovky (kompaktní karty) chybí přiřazení k extruderu (jde jen z karty zařízení).
**Soubor:** `src/pages/GearboxesPage.tsx` (komponenta `GearboxCard`, lišta tlačítek souhrnu — Karta/Zapsat/Nahlásit/Oprava).
**Udělat:** přidat tlačítko **„Přiřadit"** (ikona `Cog`/`Link`), `onClick={() => onOpen()}`-stylem navigovat na `/asset/${asset.id}?action=assign` (karta už `action=assign` umí — `AssetCardPage` ř.313 otevře `GearboxAssignModal`). Zobrazit jen pro gearbox.
**Hotovo když:** z Převodovek jde u karty kliknout „Přiřadit" a otevře se přiřazení k extruderu.

### T3 — Fáze 1: doladit klidné barvy (zbytek)
**Standard:** 1 styl tlačítek + max 2–3 barvy; pryč duhové tinty.
- `src/pages/TasksPage.tsx` — summary bar (~ř.489) má 5 barev → zredukovat na 2–3 (zbytek šedá); footer tlačítka úkolu (Přebírám/Zápis/Dokončit) sjednotit (neutrální + Dokončit zelené).
- `src/pages/AIAssistantPage.tsx` — pozadí `blur-[120px]` amber/orange (~ř.287) → jeden klidný tón; user bublina `from-amber-400 to-orange-500` (~ř.403) → neutrální (bílá/šedá), bot bublina nech.
- `src/pages/AdminPage.tsx` — editační modál: tlačítka blue/red/emerald (~ř.823/830/843) → neutrální + 1 akcent. (ROLE_CONFIG emoji NEMĚNIT — jsou v `<option>`.)
- `src/pages/InventoryPage.tsx` — tlačítka `bg-sky-600`/`bg-emerald-600/700` → sjednotit na 1 styl + 1 akcent.
**Hotovo když:** žádné duhové sady, tsc+build OK.

### T4 — Fáze 1: emoji → lucide (case-by-case, pozor na `<option>`)
- `src/pages/InventoryPage.tsx` — `CATEGORIES` (ř.30–38) emoji `⚙️🔗⭕🛢️🌀⚡📦`. V chipu (ř.428) a v detailu (ř.936) nahradit lucide; v `<option>` (ř.728) **odebrat ikonu, nechat jen text** (komponenta tam nejde).
- `src/pages/ReportsPage.tsx` — `FAILURE_KEYWORDS` (ř.885) emoji u `icon`. **`kw.key` je matching — NEMĚNIT!** Jen `kw.icon` (display ve `FailureHeatmap`) → lucide.
- `src/pages/FleetPage.tsx` — vlastní Toast s emoji `✅❌ℹ️` → lucide ikony (CheckCircle2/XCircle/Info).
**Hotovo když:** v těchto místech nejsou emoji, dropdowny fungují, tsc+build OK.

### T5 — Fáze 2: kompaktní karty (velké karty → čisté řádky)
Vzor hotov: `GearboxCard` v `GearboxesPage.tsx` (souhrn + „Detail ▾").
- `src/pages/TasksPage.tsx` — TaskCard: 3 barevné boxy (Problém/Týká se/Aktualizace ~ř.712) → řádky s linkou.
- `src/pages/InspectionsPage.tsx` — 4-sloupcový grid karet (~ř.755) → kompaktní řádky.
- `src/pages/CalendarPage.tsx` — CalendarTaskCard (~ř.295) 4 řádky → 2 (priorita + název).
- `src/pages/ProductionPage.tsx` — karty 4-col grid (Výrobek/Surovina/Hmotnost/Stroj) → 2-řádkový seznam.
- `src/pages/WorkDiaryPage.tsx` — boxy `p-3 space-y-3` (~ř.1118) → řádky `divide-y`.
- `src/pages/MasterDataPage.tsx` — `DetailPanel` přeplněný (20+ labelů) → sekce s vizuálním oddělením.
**Hotovo když:** karty nižší/čitelnější, funkce zachované, tsc+build OK.

---

## SKUPINA 2 — POZDĚJI / OPATRNĚ (NE bez potvrzení majitele)

### T6 — Fáze 3: modály → sdílený BottomSheet + dotykové cíle
- Vlastní `fixed inset-0` modály → `BottomSheet`: `KartotekaPage` (`.k-modal-overlay`), `CalendarPage` (BacklogPanel, VacationModal), `AdminPage` (~ř.741), `NoticeboardPage` (2×: nová zpráva ~ř.461, shift ~ř.546). Ověřit `WarehousePage` `ModalShell`.
- Dotyk ≥44px: `KartotekaPage` (tlačítka 26px), `HvacPage` (min-h-10→11), `BuildingInspectionPage` (admin w-8 h-8).

### T7 — Fáze 4: Kartotéka (velký kus)
`src/pages/KartotekaPage.tsx` (+ `.css`, ~1685 ř.) má vlastní těžký styl ještě z tmavého motivu → převést na standard (vik-card/BottomSheet), zachovat přepínač Strom/Dlaždice/Trasa. Velký, řešit zvlášť (nejdřív návrh).

### T8 — LOGIKA (NEDĚLAT — řeší Claude po schválení): Monitoring strojů (Fáze B)
Obecná měření na asset (teplota=převodovka, ampéry=stroj), per-stroj normál, nová kolekce `asset_measurements` + **Firestore rules + index**. Mění datový model → vyžaduje rozhodnutí majitele a NEPATŘÍ do této dávky.

---

## Pořadí: T1, T2 (rychlé, žádané) → T3, T4 → T5. Skupina 2 až po potvrzení.
