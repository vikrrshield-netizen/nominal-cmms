# NOMINAL CMMS — Handoff Brief UPDATE 11

**Datum:** 17.02.2026 | **Verze:** Fáze 9 → Architecture Blueprint | **Pro:** Nový chat

---

## 1. CO JE HOTOVO ✅

### Firebase LIVE:
| Služba | Stav |
|--------|------|
| Authentication | ✅ 8 uživatelů (PIN login) |
| Firestore | ✅ 250+ docs (assets, areas, revisions, users, settings, tasks, roles, permissions) |
| Security Rules | ✅ Deployed (RBAC + audit + TrustBox dual-kolekce) |
| Hosting | ✅ (starší build) |

### Napojeno na Firestore:
| Stránka | Status | Detail |
|---------|--------|--------|
| Login | ✅ Firebase Auth | signInWithPin → Firebase Auth |
| Dashboard | ✅ Firestore LIVE | Stats z tasks, assets, revisions |
| MapPage | ✅ Firestore LIVE | 145 zařízení, budova D = SVG půdorys 2.NP |
| TasksPage | ✅ Firestore LIVE | 15 úkolů, two-column layout, asset picker |
| CalendarPage | ✅ Firestore LIVE | Flexibilní týdenní plán, backlog→den, real-time |

### Firestore kolekce:
| Kolekce | Počet docs | Použito |
|---------|-----------|---------|
| users | 8 | ✅ AuthContext (s RBAC poli) |
| assets | 145 | ✅ Dashboard, MapPage, TasksPage |
| areas | 38 | ✅ MapPage |
| revisions | 8 | ✅ Dashboard |
| settings | 1 | ❌ |
| tasks | 15 | ✅ TasksPage, CalendarPage, Dashboard |
| roles | 6 | ✅ AuthContext (dynamický RBAC) |
| permissions | 40 | ✅ AuthContext (granulární oprávnění) |
| audit_logs | — | ✅ useFirestoreAction hook píše sem |

---

## 2. ARCHITEKTURA (Blueprint v1.0) ✅

### Dynamický RBAC systém:
```
users/{uid}
  ├── roleIds: ["role_udrzba"]         ← přiřazené role
  ├── primaryRoleId: "role_udrzba"     ← hlavní role
  ├── customPermissions:
  │   ├── granted: ["inventory.approve"] ← individuální navíc
  │   └── revoked: []                    ← individuální odebrané
  └── scope:
      ├── buildings: ["*"]              ← viditelnost budov
      └── areas: ["*"]                  ← viditelnost místností
```

### Role v systému:
| Role ID | Název | Pro koho |
|---------|-------|----------|
| role_superadmin | Super Admin | Vilém (PIN 3333) |
| role_majitel | Majitel | Milan (PIN 1111) |
| role_vedeni | Vedení | Martina (PIN 2222) |
| role_vyroba | Výroba | Pavla (PIN 4444) |
| role_udrzba | Údržba | Zdeněk, Petr, Filip |
| role_operator | Operátor | Kiosk (PIN 0000) |

### Individuální výjimky:
- Petr Volf (6666): role_udrzba + **inventory.approve** (hybridní)
- Filip Novák (7777): role_udrzba + **fleet.assign** (fleet focus)

### AuthContext — dynamický hasPermission():
```typescript
// Staré (hardcoded):
ROLE_PERMISSIONS['UDRZBA'].includes('wo.create')

// Nové (z Firestore):
computeEffectivePermissions(user.roleIds, allRoles, user.customPermissions)
// → sloučí role permissions + granted - revoked
```

Zpětná kompatibilita zachována — staré stránky fungují, nové funkce se aktivují po seed-rbac.

---

## 3. BEZPEČNOST ✅

### firestore.rules (deployed):
- Hard delete: POUZE SUPERADMIN
- Soft delete: oprávnění uživatelé (isDeleted: true)
- audit_logs: append-only (nikdo nemůže editovat/mazat)
- TrustBox dual-kolekce: trustbox_ingress (černá díra) + trustbox_public (veřejná)
- hasTimestamp() povinné na každém write
- Role-based access pro všechny kolekce

### useFirestoreAction.ts hook:
- create/update/softDelete/restore/hardDelete + batchUpdate
- Automatický audit logging
- Auto timestamps (createdAt/updatedAt/createdBy)

### Synology NAS balíček (připraveno, neinstalováno):
- Uložen v `infrastructure/synology-nominal.zip`
- backup.js: denní záloha Firestore (3:00)
- trustbox-mixer.js: anonymizační relay (Fisher-Yates shuffle)
- **Připomenout ve finální fázi před spuštěním!**

---

## 4. NOVÉ SOUBORY (Update 11) 📁

### Types:
| Soubor | Cesta | Obsah |
|--------|-------|-------|
| rbac.ts | src/types/ | Role, Permission, UserScope, CustomPermissions, computeEffectivePermissions() |
| inventory.ts | src/types/ | InventoryItem, Transaction, PurchaseOrder, calcItemStatus() |

### Hooks:
| Soubor | Cesta | Obsah |
|--------|-------|-------|
| usePermissions.ts | src/hooks/ | Standalone RBAC hook (realtime roles z Firestore) |
| useInventory.ts | src/hooks/ | Sklad: issue/receive/adjust + completeTaskWithParts (auto-odpis) + createOrder/approveOrder |
| useReports.ts | src/hooks/ | Export XLSX (SheetJS) + PDF (HTML→print): servisní list, předávací protokol, revizní zpráva, stav skladu |
| useFirestoreAction.ts | src/hooks/ | CRUD + audit (z předchozího update) |

### Context:
| Soubor | Cesta | Změna |
|--------|-------|-------|
| AuthContext.tsx | src/context/ | Přepsán: dynamický RBAC, hasAnyPermission, hasAllPermissions, canSeeBuilding, canSeeArea |

### Scripts:
| Soubor | Cesta | Obsah |
|--------|-------|-------|
| seed-rbac.ts | scripts/ | Seed: 40 permissions + 6 rolí + update 8 users s RBAC poli |
| seed-calendar.ts | scripts/ | Přidá scheduledDate k existujícím tasks |

### Stránky:
| Soubor | Cesta | Změna |
|--------|-------|-------|
| CalendarPage.tsx | src/pages/ | Přepsán: Firestore LIVE, flexibilní plán, dark theme, bez zamykání |

---

## 5. CO ZBÝVÁ ❌

### PRIORITA 1: Seed zbývajících kolekcí
| Kolekce | Obsah | Stav |
|---------|-------|------|
| inventory | Ložiska, řemeny, filtry, oleje | ❌ seed potřeba |
| fleet | JCB, New Holland, Shibaura, VZV | ❌ seed potřeba |
| waste | Kontejnery + harmonogram | ❌ seed potřeba |
| kiosk_configs | Tlačítka per lokace | ❌ seed potřeba |
| notifications | — | ❌ prázdná |

### PRIORITA 2: Napojit stránky na Firestore
| Stránka | Soubor | Hook/Kolekce |
|---------|--------|-------------|
| Inventory | InventoryPage.tsx | useInventory → inventory |
| Fleet | FleetPage.tsx | fleet kolekce |
| Waste | WastePage.tsx | waste kolekce |
| Revisions | RevisionsPage.tsx | revisions |
| TrustBox | TrustBoxPage.tsx | trustbox_ingress/public |
| Admin | AdminPage.tsx | users + roles + permissions (RBAC CRUD) |
| AssetCard | AssetCardPage.tsx | assets (detail) |
| Reports | ReportsPage.tsx | useReports hook |
| Kiosk | KioskPage.tsx | kiosk_configs |

### PRIORITA 3: MapPage 1.NP půdorys
- Budova D 1.NP SVG (mlýn, míchárna, balírna, kotelna, kompresory)
- Floor switcher mezi 1.NP/2.NP již existuje

### PRIORITA 4: Deploy
```powershell
npm run build
firebase deploy --only hosting
```

---

## 6. TECHNICKÉ DETAILY

### Stack:
| Komponenta | Technologie |
|------------|-------------|
| Frontend | React 19 + Vite 7.3.1 + TypeScript |
| Styling | Tailwind CSS v4 (dark glassmorphism) |
| Backend | Firebase (Auth, Firestore, Storage, Hosting) |
| Export | SheetJS (xlsx) + file-saver (XLSX) + HTML→print (PDF) |
| Node | v25.6.1 |

### Cesta k projektu:
```
C:\Utrizene_Soubory\04_Projekty\nominal-cmms
```

### Struktura (aktuální):
```
nominal-cmms/
├── src/
│   ├── pages/              → 17+ stránek
│   ├── components/ui/      → Reusable komponenty
│   ├── context/
│   │   └── AuthContext.tsx  → ✅ DYNAMICKÝ RBAC (roles + permissions z Firestore)
│   ├── hooks/
│   │   ├── useFirestore.ts      → Generic CRUD
│   │   ├── useFirestoreAction.ts → CRUD + audit log
│   │   ├── usePermissions.ts     → Standalone RBAC check
│   │   ├── useInventory.ts       → Sklad: auto-odpis + objednávky
│   │   └── useReports.ts         → XLSX + PDF export
│   ├── services/
│   │   ├── taskService.ts   → Task CRUD
│   │   ├── assetService.ts  → Asset queries
│   │   ├── fleetService.ts
│   │   ├── workLogService.ts
│   │   └── workOrderService.ts
│   ├── types/
│   │   ├── firestore.ts     → Firestore typy
│   │   ├── user.ts          → UserRole + ROLE_META (legacy)
│   │   ├── rbac.ts          → ✅ Role, Permission, UserScope (nový!)
│   │   └── inventory.ts     → ✅ InventoryItem, Transaction (nový!)
│   ├── lib/
│   │   └── firebase.ts      → Unified init
│   └── App.tsx              → Routing
├── scripts/
│   ├── sync-users.ts        → Auth + Firestore sync
│   ├── seed-production.ts   → 145 zařízení + 38 místností
│   ├── seed-rbac.ts         → ✅ 40 permissions + 6 rolí + user update
│   └── seed-calendar.ts     → ✅ scheduledDate pro tasks
├── infrastructure/
│   └── synology-nominal.zip → Backup + TrustBox mixer (finální fáze!)
├── .env.local
├── firestore.rules          → ✅ RBAC + audit + TrustBox dual-kolekce
├── BACKUP-STRATEGY.md
└── firebase.json
```

### Auth uživatelé (8):
| PIN | Jméno | Legacy role | RBAC role | Custom perms |
|-----|-------|------------|-----------|-------------|
| 0000 | Kiosk Velin | OPERATOR | role_operator | — |
| 1111 | Milan Novak | MAJITEL | role_majitel | — |
| 2222 | Martina | VEDENI | role_vedeni | — |
| 3333 | Vilem | SUPERADMIN | role_superadmin | — |
| 4444 | Pavla Drapelova | VYROBA | role_vyroba | — |
| 5555 | Zdenek Micka | UDRZBA | role_udrzba | — |
| 6666 | Petr Volf | UDRZBA | role_udrzba | +inventory.approve |
| 7777 | Filip Novak | UDRZBA | role_udrzba | +fleet.assign |

### Workflow pravidla:
- Poruchy VÝHRADNĚ přes app (ne telefon!)
- Týdenní plán = flexibilní kalendář (upravuje se denně)
- Milan schvaluje priority, individuálně nastavitelné pravomoce
- Pavla = asistentka výroby (plán balení, sanitace lepek/bezlepek)
- P1=havárie, P2=tento týden, P3=běžná, P4=nápady (vidí údržba+office)
- Schránka důvěry = konfigurovatelný přístup (zvolení lidé)

### Known issues:
- `enableIndexedDbPersistence()` deprecated warning → kosmetické
- Persistence multi-tab conflict warning → neškodné
- České znaky v seed datech mají mojibake → kosmetické
- Legacy user.ts (ROLE_META, ROLE_PERMISSIONS) stále existuje jako fallback

---

## 7. INSTRUKCE PRO CLAUDE

> **Claude, pokračuješ v projektu NOMINAL CMMS — Update 11.**
>
> Uživatel = Vilém, solo developer + údržba v potravinářské firmě NOMINAL s.r.o.
>
> **Stav:** Firebase LIVE. RBAC systém implementován (dynamické role + permissions). Login, Dashboard, MapPage, TasksPage a CalendarPage napojeny na Firestore. Architecture Blueprint hotový.
>
> **Cesta:** `C:\Utrizene_Soubory\04_Projekty\nominal-cmms`
>
> **DŮLEŽITÉ:**
> - Uživatel chce hotové soubory — ne po částech!
> - Komunikuj ČESKY
> - Nerestartuj projekt — ROZŠIŘUJ stávající kód
> - Zpětná kompatibilita je kritická
>
> **Příští kroky:**
> 1. Seed: inventory, fleet, waste, kiosk_configs
> 2. Napojit InventoryPage, FleetPage, WastePage na Firestore
> 3. Admin page — RBAC CRUD (správa rolí a oprávnění)
> 4. ReportsPage — napojit useReports hook
> 5. MapPage 1.NP půdorys
> 6. Deploy na hosting
>
> **Firebase účet:** nominal.cmms@gmail.com
> **Synology NAS:** Připomenout ve finální fázi!
