# Souhrn stavu projektu NOMINAL CMMS (2026-02-17)

## Co to je
CMMS systém pro potravinářský závod. Česká UI, PIN přihlášení, 6 rolí, kiosk mód pro tablety ve výrobě.

## Stack
React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS v4 + Firebase (Auth, Firestore, Storage). Nasazeno na `https://nominal-cmms.web.app`.

## Co funguje
- **Přihlášení** — PIN klávesnice, 4místné kódy, role-based přístup
- **Dashboard** — navigace do všech modulů
- **Úkoly (Tasks)** — seznam, filtrování, dokončovací modal
- **Inventář** — seznam dílů, klikací detail modal
- **Flotila** — seznam vozidel, klikací detail modal
- **Revize** — seznam revizí, klikací detail modal
- **Odpadové hospodářství** — kontejnery, klikací detail modal
- **Kalendář** — denní/týdenní pohled, backlog
- **Mapa** — interaktivní SVG půdorys 2. NP s klikacími zónami a bottom sheet detaily strojů
- **Inspekce budov** — checklisty s OK/Problém tlačítky
- **TrustBox** — anonymní schránka + admin pohled
- **Loupárna** — výroba, sila, logování
- **Reporty** — statistiky a grafy
- **Admin** — správa uživatelů s detail modalem
- **AI Asistent** — chatbot s hlasovými příkazy (mock odpovědi)
- **Kiosk mód** — operátorský tablet režim
- **Notifikace** — přehled s akcemi

## Co nefunguje / chybí
- **Žádné testy** — není nastavený testovací framework
- **FacilityListPage + FacilityDetailPage** — existují v `src/pages/`, ale nemají routy v `App.tsx` (osiřelé stránky)
- **Data** — Firestore integrace pokročilá (RBAC seedy, inventář, flotila, odpady, kalendář naplněny)
- **Build warning** — chunk `index.js` má 922 kB (> 500 kB limit), potřebuje code splitting

## Změny provedené dnes (2026-02-16)
1. **`src/index.css`** — Přidány globální dark theme CSS overrides s `!important` (`.bg-white`, `.bg-gray-*`, `.text-gray-*`, `.border-gray-*`, barevné `-50/-100` varianty) → dark mód funguje na všech stránkách
2. **`CLAUDE.md`** — Vytvořen od nuly s dokumentací projektu (příkazy, architektura, doménové koncepty, styling)
3. **`CLAUDE.md`** — Přidáno pravidlo o komunikaci v češtině
4. **Záloha** — Složka `zaloha/src/` vytvořena jako snapshot funkčního stavu (57 souborů)
5. **Deploy** — Build + `firebase deploy --only hosting` proběhl úspěšně
6. **Oprava onClick handlerů** — audit všech 20 stránek v `src/pages/`, nalezeno a opraveno 8 nefunkčních tlačítek:
   - **`AssetCardPage.tsx`** (5 oprav):
     - Dropdown "Fotka" — přidán onClick (zavře dropdown + alert)
     - Dropdown "QR kód" — přidán onClick (zavře dropdown + alert)
     - Tab Díly "Přiřadit díl" — přidán onClick → `navigate('/inventory')`
     - Tab Dokumenty "Nahrát" — přidán onClick (alert)
     - DocCard komponenta — přidán onClick (alert s názvem dokumentu)
   - **`LouparnaPage.tsx`** (3 opravy):
     - "Zahájit čištění" — nahrazen prázdný onClick → najde zastavenou linku a přepne na čištění
     - "Příjem suroviny" — nahrazen prázdný onClick → najde nejprázdnější silo a otevře editaci
     - "Přidat kontrolní bod" — přidán onClick (alert)
7. **Deploy** — Druhý deploy s opravami onClick handlerů
8. **Dark mód opravy pro modaly** — audit všech modalů a detail sheetů na 9 stránkách, nalezeno 7 problémů s čitelností:
   - **`src/index.css`** — rozšířeny CSS overrides o chybějící třídy:
     - Barevné texty (tmavé -700/-800 odstíny zesvětleny): `text-blue-700/800` → `#93c5fd`, `text-emerald-700` → `#6ee7b7`, `text-red-700/800` → `#fca5a5`, `text-amber-700/800` → `#fcd34d`, `text-orange-700` → `#fdba74`
     - Barevné bordery (ztlumeny): `border-blue-200/300`, `border-emerald-200`, `border-red-200`, `border-amber-200`, `border-purple-300` → rgba s nízkou opacitou
     - Hover stavy: `hover:bg-emerald-200`, `hover:bg-red-200`, `hover:bg-blue-100`, `hover:bg-slate-100`
   - Dotčené stránky: FleetPage, InventoryPage, AssetCardPage, WastePage, CalendarPage, RevisionsPage, TrustBoxPage
   - Stránky s hardcoded dark stylem (OK, bez opravy): AdminPage, MapPage, TasksPage, BottomSheet
9. **Deploy** — Třetí deploy s dark mód opravami
10. **Oprava input fieldů pro dark mód** — audit všech input/textarea/select elementů napříč celým projektem:
    - **`AssetCardPage.tsx`** (14 elementů) — inputy v modálech (Edit, AddLog, ReportIssue) neměly `bg-*` třídu → bílé pozadí + světlý text = nečitelné. Přidán `bg-white text-white placeholder-slate-400`. Selecty doplněny o `text-white`. Motohodiny input doplněn o `text-white`.
    - Ostatní stránky OK (KioskPage, MapPage, AIAssistantPage, LouparnaPage, TrustBoxPage, BottomSheet — všechny mají hardcoded dark styling)
11. **Deploy** — Čtvrtý deploy s opravou inputů
12. **Oprava mobilní responsivity** — audit všech 18 stránek, nalezeno 17 kritických problémů, opraveno 10 v 8 souborech:
    - **Blur kruhy 500px → responsive** (5 stránek): DashboardPage, NotificationsPage, ReportsPage, AdminPage, AIAssistantPage — `w-[300px] md:w-[500px]`
    - **DashboardPage.tsx** — grid `minmax(280px)` přetékal na mobilu → `minmax(min(100%, 280px), 1fr)`
    - **AssetCardPage.tsx** — tab texty přetékaly na mobilu → `hidden sm:inline` na labely (ikony zůstávají)
    - **WastePage.tsx** — capacity bar `w-24` pevná šířka → `w-20 md:w-24`
    - **BuildingInspectionPage.tsx** — `text-[9px]`/`text-[10px]` nečitelné → minimum `text-[11px]`
    - **LouparnaPage.tsx** — silo vizuál `h-40` stěsnaný na mobilu → `h-32 md:h-40`
    - Stránky bez zásahu (dobrý responsive): FleetPage, MapPage, TasksPage, LoginPage, TrustBoxPage, KioskPage, CalendarPage
13. **Deploy** — Pátý deploy s opravami responsivity
14. **Interaktivní mapa závodu** — import nových souborů z ZIP archivu:
    - **`src/components/maps/FloorPlan2NP.tsx`** — nový SVG komponent půdorysu 2. NP (15 kB)
    - **`src/pages/MapPage.tsx`** — přepsána novou verzí s interaktivním půdorysem (31 kB)
15. **Deploy** — Šestý deploy s interaktivní mapou
16. **Bezpečnostní protokol** — import z ZIP archivu:
    - **`firestore.rules`** — kompletní Firestore security rules (291 řádků, 12 kolekcí, role-based přístup, soft delete, audit_logs append-only, catch-all deny)
    - **`src/hooks/useFirestoreAction.ts`** — React hook pro bezpečné Firestore operace (create, update, softDelete, restore, hardDelete, batchUpdate) s auto timestamps a audit logging
    - **`BACKUP-STRATEGY.md`** — dokumentace zálohovací strategie Firestore (denní zálohy přes Cloud Scheduler, EU region, 90denní retence)
    - **`firebase deploy --only firestore:rules`** — rules nasazeny (4 nekritické warningy, kompilace OK)
17. **Oprava `useFirestoreAction.ts`** — 3 TypeScript chyby kvůli odlišnostem od projektu:
    - Odstraněn nepoužitý import `Timestamp`
    - `useAuth` → `useAuthContext` (správný název exportu v projektu)
    - `user.uid` → `user.id`, odstraněn `user.email` (projekt používá vlastní typ `User` s `id` a `displayName`, bez `email`)
18. **Deploy** — Sedmý deploy s opraveným hookem

## Změny provedené 2026-02-17
19. **Oprava Firestore permission crash** — stránky Stroje a Úkoly padaly kvůli novým rules (isAnyRole vyžaduje users/{uid} dokument):
    - **`firestore.rules`** — `isAnyRole()` rozšířena o `exists()` fallback pro uživatele bez Firestore profilu
    - **`MapPage.tsx`** — error handler v onSnapshot resetuje na `[]` místo crash
    - **`TasksPage.tsx`** — stejný fix
    - **`DashboardPage.tsx`** — přidány error handlery na assets a revisions onSnapshot
20. **Deploy** — Osmý deploy s opravou permissions
21. **NOMINAL-UPDATE11** — velká aktualizace z ZIP archivu (16 souborů):
    - **`src/context/AuthContext.tsx`** — rozšířen o RBAC (roleIds, primaryRoleId, customPermissions, hasPermission s granulárními právy)
    - **`src/types/rbac.ts`** — nový typ pro RBAC systém (Role, Permission, CustomPermissions)
    - **`src/types/inventory.ts`** — nový typ pro inventář (InventoryItem, InventoryTransaction, PurchaseOrder)
    - **`src/hooks/usePermissions.ts`** — nový hook pro kontrolu oprávnění
    - **`src/hooks/useInventory.ts`** — nový hook pro Firestore CRUD inventáře
    - **`src/hooks/useReports.ts`** — nový hook pro reporty s XLSX exportem
    - **`src/hooks/useFirestoreAction.ts`** — přepsán novou verzí
    - **`src/pages/CalendarPage.tsx`** — přepsána novou verzí (Firestore LIVE, drag & drop plánování)
    - **`firestore.rules`** — aktualizovány
    - **`BACKUP-STRATEGY.md`** — aktualizován
    - **`scripts/seed-rbac.ts`** — nový seed skript (38 permissions, 6 rolí, 8 uživatelů)
    - **`scripts/seed-calendar.ts`** — nový seed skript (scheduledDate pro 6 tasků)
    - Závislosti: `xlsx`, `file-saver`, `@types/file-saver`
    - TypeScript opravy: `useAuth` → `useAuthContext`, odstraněn `Timestamp` a `user.email`, nepoužité importy v useInventory/useReports/CalendarPage
22. **Seed RBAC** — 38 permissions, 6 rolí, 8 uživatelů aktualizováno ve Firestore
23. **Seed Calendar** — 6 tasků dostalo scheduledDate
24. **NOMINAL-SEED-OPS** — operační seed z ZIP archivu:
    - **`scripts/seed-operations.ts`** — seed pro inventory (16 položek), fleet (6 vozidel), waste (6 kontejnerů), kiosk (4 konfigurace)
25. **Deploy** — Devátý deploy s kompletní aktualizací
26. **NOMINAL-UPDATE12-PAGES** — aktualizace stránek z ZIP archivu (5 souborů):
    - **`src/hooks/useWaste.ts`** — nový hook pro Firestore CRUD odpadů
    - **`src/hooks/useFleet.ts`** — nový hook pro Firestore CRUD flotily
    - **`src/pages/WastePage.tsx`** — přepsána (Firestore LIVE)
    - **`src/pages/FleetPage.tsx`** — přepsána (Firestore LIVE)
    - **`src/pages/InventoryPage.tsx`** — přepsána (Firestore LIVE)
    - TypeScript oprava: 2 nepoužité parametry ve FleetPage (`onUpdateCounter`, `onUpdateFuel`)
27. **Deploy** — Desátý deploy
28. **Oprava App.tsx** — poškozená syntaxe řádku 58 (`` `n ``) opravena + routa `/asset/:id` → `/asset/:assetId`
29. **NOMINAL-UPDATE13-REVISIONS** — aktualizace revizí z ZIP archivu (4 soubory):
    - **`src/hooks/useRevisions.ts`** — nový hook pro Firestore CRUD revizí
    - **`src/pages/RevisionsPage.tsx`** — přepsána (Firestore LIVE)
    - **`src/pages/AssetCardPage.tsx`** — přepsána (integrace revizí)
    - **`scripts/seed-revisions.ts`** — seed 10 revizí (5 platných, 3 končí brzy, 2 prošlé)
    - TypeScript opravy: nepoužité importy (Calendar, ChevronRight, FileText, MapPin, Plus, expiringRevisions, showLogModal)
30. **Deploy** — Jedenáctý deploy
31. **NOMINAL-UPDATE14-LOUPARNA** — aktualizace loupárny z ZIP archivu (3 soubory):
    - **`src/hooks/useLouparna.ts`** — nový hook pro Firestore CRUD loupárny (sila, šarže, plevy, stanice)
    - **`src/pages/LouparnaPage.tsx`** — přepsána (Firestore LIVE)
    - **`scripts/seed-louparna.ts`** — seed 4 sila, 5 šarží, 4 plevy, 2 stanice (celkem 7929 kg výroba, 85% výtěžnost)
    - TypeScript opravy: 7 nepoužitých importů/parametrů
32. **Deploy** — Dvanáctý deploy
33. **Firestore rules** — přidány pravidla pro 4 loupárna kolekce (`louparna_silos`, `louparna_production`, `louparna_waste`, `louparna_machines`)
34. **NOMINAL-SURGICAL-FIXES** — 3 chirurgické integrace do TasksPage.tsx:
    - **`src/hooks/useFormDraft.ts`** — nový hook pro persistenci rozpracovaných formulářů do localStorage
    - **`src/components/ui/CompleteTaskModal.tsx`** — nový modal s povinnými poli (resolution, durationMinutes) při dokončení úkolu
    - **TasksPage.tsx integrace 1: SAVE DRAFT** — formulář nového úkolu používá `useFormDraft`, draft přežije refresh
    - **TasksPage.tsx integrace 2: MANDATORY FIELDS** — dokončení úkolu přes `CompleteTaskModal` místo jednoduchého potvrzení
    - **TasksPage.tsx integrace 3: STATUS LOCK** — dokončené úkoly mají `isDone: true`, DoneCard je read-only s "✓ Uzavřeno"
    - **`firestore.rules`** — tasks blok přepsán na Status Lock logiku (isDone blokuje editaci, jen SUPERADMIN bypass)
35. **Deploy** — Třináctý deploy
36. **Kosmetické úpravy TasksPage.tsx** — 4 CSS změny:
    - Fonty zvětšeny o stupeň (priority badge `text-sm`, title `text-lg font-bold`, meta `text-sm`)
    - Border-left podle priority (P1 red, P2 orange, P3 blue, P4 gray) v `PRIORITY_CONFIG.borderLeft`
    - Resolution display pod kartu když `isDone && resolution`
    - Hover efekt: `hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20 duration-200`
37. **Deploy** — Čtrnáctý deploy
38. **Dashboard "Velín"** — kompletní přepis `DashboardPage.tsx` (nový layout):
    - Quick Action: červené tlačítko "NAHLÁSIT PORUCHU" → `/kiosk`
    - Hlavní grid (lg:3 sloupce): Mapa areálu (6 budov A,B,C,D,E,L) + Kalendář "Dnes" (scheduledDate = dnes)
    - 6 stat karet (grid 2/3/6): Úkoly, Revize, Sklad, Odpady, Vozidla, Loupárna
    - Data z LIVE Firestore hooků: `useFleet`, `useWaste`, `useInventory`, `useLouparna`, `useRevisions`
    - KioskDashboard (OPERATOR role) zachován beze změn
39. **Deploy** — Patnáctý deploy
40. **NOMINAL-INSPECTIONS** — import z ZIP archivu (3 soubory):
    - **`src/hooks/useInspections.ts`** — nový hook pro kontrolní body budovy (měsíční checklist, grouped by building+floor)
    - **`src/pages/InspectionsPage.tsx`** — nová stránka (progress bar, filtr OK/závada/čeká, defect modal, grouped accordion)
    - **`scripts/seed-inspections-client.ts`** — klientský seed (46 šablon + 46 logů pro únor 2026, 10 OK, 2 závady, 34 čeká)
    - **`App.tsx`** — přidána routa `/inspections` → `InspectionsPage`
    - TypeScript opravy: `useAuth` → `useAuthContext`, nepoužité importy (CheckCircle2, Clock), nepoužitá `logs`, type-only import `InspectionLog`
41. **Firestore rules** — přidány 4 nové kolekce:
    - `roles` — read/write: `request.auth != null`
    - `permissions` — read/write: `request.auth != null`
    - `inspection_templates` — read/write: `request.auth != null`
    - `inspection_logs` — read/write: `request.auth != null`
42. **KRITICKÝ FIX — Firestore permissions** — Kiosk/TasksPage nemohly zapisovat:
    - **Příčina**: `isAnyRole()` volá `get()` na `users/{uid}` dokument → pokud neexistuje, rule DENIED
    - **`firestore.rules`** — tasks create: `isAnyRole() && hasTimestamp()` → `request.auth != null`
    - Deploy rules + hosting
43. **Seed Inspections** — 46 šablon (inspection_templates) + 46 logů (inspection_logs) pro únor 2026
44. **Deploy** — Šestnáctý deploy (rules + hosting)

## Záloha
`zaloha/src/` + `zaloha/firestore.rules` + `zaloha/scripts/` — kompletní kopie aktualizována po všech opravách.
