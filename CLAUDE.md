# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Znalostní báze (`docs/`)

Doménové detaily (továrna, role/oprávnění, work ordery, glosář) jsou v markdown
vaultu `docs/` (viz `docs/README.md`). Slouží jako kontext pro Claude Code i jako
Obsidian vault. Tento `CLAUDE.md` drž krátký a operační; doménovou encyklopedii
piš do `docs/` a při změně doménového konceptu v kódu aktualizuj i příslušnou poznámku.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm run test:smoke   # Playwright smoke testy (tests/smoke/)
npm run seed:empty   # Seed prázdné instance
npm run seed:demo    # Seed demo dat
firebase deploy --only hosting   # Deploy to https://nominal-cmms.web.app
firebase emulators:start         # Auth:9099, Firestore:8080, Storage:9199, UI:4000
```

Testy: pouze Playwright **smoke** testy (`tests/smoke/`, config `playwright.smoke.config.ts`).
Vyžadují prohlížeč (`npx playwright install chromium`) a běh proti URL — buď lokální
dev server, nebo externí přes `SMOKE_BASE_URL`. Některé scénáře potřebují přihlašovací
PINy z env (bez nich se přeskočí). Žádné unit/integration testy nejsou.

## What This Is

Nominal CMMS — a maintenance management system for a food manufacturing plant. Czech-language UI. PIN-based login (4-digit codes mapped to `pin_XXXX@nominal.local` Firebase Auth accounts). Six user roles with 40+ granular permissions. Dedicated kiosk mode for factory-floor tablets (OPERATOR role).

## Stack

React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS v4 (`@tailwindcss/vite` plugin, no `tailwind.config`) + Firebase (Auth, Firestore, Storage). React Router DOM v7. Offline-first via `enableIndexedDbPersistence`.

## Architecture

```
src/
├── pages/          # 16 route-level components (1 per page)
├── components/     # Shared components + ui/ primitives (barrel export from ui/index.tsx)
├── context/        # AuthContext (PIN auth + roles), GlobalStateContext
├── hooks/          # useAuth, useFirestore (generic CRUD: useDocument, useCollection)
├── services/       # Domain logic — assetService, taskService, fleetService, workLogService, workOrderService
├── types/          # TypeScript interfaces per domain + firestore.ts (complete schema)
├── data/           # Static/mock data (factory.ts, sampleAssets.ts)
├── lib/            # firebase.ts — init, signInWithPin(), exports: auth, db, storage
├── utils/          # seedInspections.ts
├── App.tsx         # BrowserRouter → AuthProvider → ProtectedRoutes
├── main.tsx        # Entry point
└── index.css       # Globální theme (béžový/světlý) + motion utility
```

## Routing & Auth Flow

`App.tsx` → `ProtectedRoutes` component handles:
- Not authenticated → `LoginPage` (PIN keypad)
- OPERATOR role → `KioskPage` only (locked)
- Authenticated → full route tree (`/`, `/tasks`, `/inventory`, `/fleet`, `/revisions`, `/waste`, `/calendar`, `/admin`, `/ai`, `/map`, `/reports`, `/trustbox`, `/notifications`, `/louparna`, `/inspection`, `/asset/:id`)

## Data Flow Pattern

```
User Action → Service Function → Firestore write
                                     ↓
                              onSnapshot listener → React state → UI re-render
```

Services wrap Firestore operations. Pages use `onSnapshot` for real-time updates. Some pages still fall back to `SAMPLE_ASSETS` when Firestore is empty.

## Key Domain Concepts

- **Tasks/Work Orders**: Code format `WO-2026-001`. Statuses: backlog → planned → in_progress → paused → completed/cancelled. Priority P1 (havárie) through P4 (nápad).
- **Buildings**: A, B, C, D, E, L — each asset/revision is assigned to a building.
- **Roles**: MAJITEL, VEDENI, SUPERADMIN, UDRZBA, VYROBA, OPERATOR. Permissions checked via `hasPermission(role, permission)` from `types/user.ts`.
- **Kiosk**: Tablet mode for operators — quick reporting of breakdowns, part orders, prefilter changes. Multi-view state machine (MENU → BREAKDOWN → ORDER → etc.).

## Styling

Béžový/světlý theme. Barevné tokeny i Tailwindové barvy jsou v `src/index.css`
předefinované do béžovo-zelené palety přes `@theme` (např. base background
`#f1ece3`, primary `#1a6b4f`). Sdílené třídy: `.vik-card`, `.vik-button`,
`.vik-input`, `.vik-chip`, `.btn-b`, `.eyebrow`. Při nových stránkách používej tyto
třídy nebo Tailwind utility — barvy se mapují automaticky.

**Motion:** preferuj připravené utility v `index.css` — `.vik-fade-in`,
`.vik-slide-up`, `.vik-scale-in`, `.vik-stagger` (proměnná `--i` na položkách) a
`.vik-skeleton` / `<Skeleton>` / `<SkeletonList>` pro načítací stavy. Animuj jen
`transform` + `opacity` (plynulé i na továrních tabletech), timing přes proměnné
`--dur-fast/base/slow`. `prefers-reduced-motion` je globálně respektován.

## Claude Code na webu

`.claude/settings.json` registruje **SessionStart hook** (`.claude/hooks/session-start.sh`),
který v remote prostředí spustí `npm install`. Lokální nastavení (permissions,
PostToolUse lint) je v `.claude/settings.local.json`. Pozn.: stažení Playwright
prohlížeče vyžaduje `cdn.playwright.dev` v egress allowlistu prostředí.

## Firebase Config

Environment variables in `.env.local` (see `.env.example`). `VITE_USE_EMULATORS` flag switches to local emulators. Firestore security rules in `firestore.rules` enforce role-based access with helper functions (`isSignedIn()`, `getUserRole()`, `hasRole()`, `isAdmin()`).

## Language

All UI text, labels, and user-facing strings are in Czech. Code identifiers (variable names, function names, type names) are in English.

**DŮLEŽITÉ: Vždy komunikuj s uživatelem v češtině.** Všechny odpovědi, vysvětlení a komentáře piš česky.
