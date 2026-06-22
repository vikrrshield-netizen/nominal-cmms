# Role a oprávnění

Zdroj pravdy: `src/types/user.ts` (`UserRole`, `ROLE_META`, `ROLE_PERMISSIONS`,
`ROLE_FLAGS`). Oprávnění se ověřuje přes `hasPermission(role, permission)`.

Přihlášení je **PIN-based** (4místný kód → účet `pin_XXXX@nominal.local` ve
Firebase Auth). 40+ granulárních oprávnění.

## Role

| Role | Label | Popis | Příznaky |
|------|-------|-------|----------|
| **MAJITEL** | Majitel | 👑 Vidí vše, ale **read-only** | `isReadOnly` |
| **VEDENI** | Vedení | 🏢 Management — HR, finance | — |
| **SUPERADMIN** | Superadmin | 🛠️ Technická správa, bez financí | — |
| **UDRZBA** | Údržba | 🔧 Stroje, sklad | — |
| **VYROBA** | Výroba | 🏭 Zóny, priority | — |
| **OPERATOR** | Operátor | 👷 Pouze kiosk (tablet na zdi) | `isKiosk` |

## Kiosk (OPERATOR)

- Operátor je po přihlášení **zamčený v `KioskPage`** — nevidí plnou aplikaci.
- Slouží k rychlému hlášení z výrobní haly: poruchy, objednávky dílů, výměna
  předfiltrů.
- Stavový automat více pohledů (MENU → BREAKDOWN → ORDER → …).

## Pravidla pro vývoj

- Akce měnící data ochraň přes `hasPermission(...)`.
- MAJITEL nesmí nikde editovat (read-only) — respektuj `ROLE_FLAGS.isReadOnly`.
- Nové stránky nesmí být dostupné OPERATORovi mimo kiosk.

## Související

- [[domena]] — kdo smí vytvářet/dokončovat úkoly
- [[glosar]] — zkratky rolí
