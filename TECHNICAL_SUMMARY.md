# Nominal CMMS — Comprehensive Technical & Functional Summary

> **Generated**: 2026-02-18
> **Purpose**: Context document for collaborating AI assistants
> **Project**: VIKRR Asset Shield (Nominal CMMS)
> **Version**: v2.0

---

## 1. Architecture & Tech Stack

### Core Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 19 |
| Language | TypeScript | 5.9 |
| Build Tool | Vite | 7 |
| CSS | Tailwind CSS | v4 (`@tailwindcss/vite` plugin, no `tailwind.config`) |
| Backend | Firebase (Auth, Firestore, Storage) | latest |
| Routing | React Router DOM | v7 |
| Icons | Lucide React | latest |

### Key Architecture Decisions

- **Offline-first**: `enableIndexedDbPersistence()` for Firestore — app works without internet
- **Real-time**: All pages use `onSnapshot` listeners for live data updates
- **PIN-based auth**: 4-digit PINs mapped to `pin_XXXX@nominal.local` Firebase Auth accounts (password = PIN + "00")
- **Dark theme**: Enforced globally via CSS `!important` overrides in `src/index.css`, base background `#0f172a` (slate-900)
- **Czech language UI**: All user-facing text is in Czech. Code identifiers are in English.
- **No test framework**: No unit/integration tests configured.

### Project Structure

```
src/
├── pages/              # 23 route-level components (20 routed + 2 WIP + LoginPage)
├── components/         # Shared components
│   ├── ui/             # Primitives: BottomSheet, FormField, SubmitButton, Badge, etc.
│   │                   # Barrel export from ui/index.tsx
│   └── dashboard/      # Widget system components (15 files)
├── context/            # AuthContext (PIN auth + RBAC), GlobalStateContext (zones + shifts)
├── hooks/              # useAuth, useFirestore (useDocument, useCollection), useStats, useDashboardConfig
├── services/           # Domain logic: assetService, taskService, fleetService, workLogService, workOrderService
├── types/              # TypeScript interfaces: user.ts, firestore.ts, rbac.ts, dashboard.ts
├── config/             # widgetRegistry.ts (dashboard widget definitions)
├── data/               # Static/mock data: factory.ts, sampleAssets.ts
├── lib/                # firebase.ts — init, signInWithPin(), exports: auth, db, storage
├── utils/              # seedInspections.ts, vikrr_migration.ts
├── App.tsx             # BrowserRouter → AuthProvider → ProtectedRoutes
├── main.tsx            # Entry point
└── index.css           # Global dark theme overrides
```

### Data Flow Pattern

```
User Action → Service Function → Firestore write
                                      ↓
                               onSnapshot listener → React state → UI re-render
```

### Branding Constants (`src/appConfig.ts`)

```
BRAND_NAME:         'VIKRR'
PRODUCT_NAME:       'VIKRR Asset Shield'
APP_NAME_SHORT:     'VIKRR'
COMPANY_ADDRESS:    'Kozlov 68, 594 51'
DOMAIN:             'shield.vikrr.com'
PRIMARY_COLOR:      '#1e3a5f'   (Deep Blue)
ACCENT_COLOR:       '#3b82f6'   (Blue-500)
VERSION:            'v2.0'
```

---

## 2. Core Modules

### 2.1 Dashboard (`src/pages/DashboardPage.tsx`)

The dashboard is the main entry point. It uses a **JSON-config-driven modular widget system**:

- **DashboardGrid** renders widgets in two zones: full-width blocks (admin-only) and a responsive tile grid (2-col mobile, 3-col tablet+)
- **useDashboardConfig** hook persists layout to Firestore `dashboard_configs/{userId}` with localStorage fallback
- **Edit mode**: Tiles jiggle with CSS animation. Users can reorder, hide, and restore widgets. A "Knihovna" (Library) panel shows hidden widgets.
- **KioskDashboard**: Separate simplified view for OPERATOR role (factory-floor tablets)

**Widget types**:
- `tile` (17): Navigational cards with gradient backgrounds — fault, tasks, map, revisions, inventory, waste, fleet, louparna, inspections, calendar, ai, reports, idea, request, noticeboard, academy, admin
- `widget` (4): Full-width analytical blocks — Semaphore (traffic-light status), OperationalHUD (MTTR, active tickets, work distribution), Top5Tasks, LemonList (worst assets)
- `action`: Quick-action tiles that open modals (fault report, idea, request, waste, AI)

**5 Quick-Action Modals** (standalone components in `components/dashboard/`):
- FaultReportModal — creates a P2 corrective task
- IdeaModal — submits idea with anonymous/identified mode + user_engagement tracking
- RequestModal — tool/material request (type: nastroj/material/jine)
- WasteModal — waste report (plevy/popelnice/kontejner)
- AiModal — AI assistant placeholder

### 2.2 Tasks / Work Orders (`src/pages/TasksPage.tsx`, `src/services/taskService.ts`)

**Code format**: `WO-{YYYY}-{NNN}` (auto-incremented per year)

**Status flow**:
```
backlog → planned → in_progress → paused → completed
                                        → cancelled
```

**Priorities**: P1 (Havárie/emergency), P2 (Urgent), P3 (Standard), P4 (Nápad/improvement)

**Task types**: `corrective | preventive | inspection | improvement`

**Task sources**: `kiosk | web | scheduled | ai | inspection`

**Key features**:
- Weekly planning with week strings (`"2026-W07"`)
- Task assignment to users
- Approval workflow (approvedBy fields)
- Resolution tracking with actual vs estimated minutes
- Status Lock in Firestore rules: once `isDone=true`, only SUPERADMIN can modify

**Service functions**:
- CRUD: `createTask()`, `updateTask()`, `deleteTask()`, `getTask()`
- Status transitions: `startTask()`, `pauseTask()`, `completeTask()`, `cancelTask()`, `approveTask()`
- Weekly: `planTaskForWeek()`, `planMultipleTasks()` (batch)
- Real-time: `subscribeToTasksByStatus()`, `subscribeToP1Tasks()`, `subscribeToActiveTasks()`

### 2.3 Assets (`src/services/assetService.ts`)

**Types**: `machine | vehicle | tool | infrastructure`
**Statuses**: `operational | maintenance | breakdown | offline`
**Code format**: `EXT-001`
**Buildings**: A (Admin), B (Connector), C (Locker rooms), D (PRODUCTION - main), E (Workshop + Warehouse), L (Loupárna/Mill)

Sub-collections per asset:
- `pest_logs` — pest trap monitoring entries
- `empty_logs` — waste container emptying records

### 2.4 Inventory / Spare Parts (`src/pages/InventoryPage.tsx`)

**Categories**: bearing, belt, filter, electrical, lubricant, tool, safety, other

**Transaction tracking** (sub-collection `transactions/`):
- Types: consume, restock, adjust, return
- Each transaction records: quantity change, previous/new qty, reason, linked taskId, user

**Alerts**: `minQuantity` threshold triggers restock warnings

### 2.5 Fleet (`src/pages/FleetPage.tsx`, `src/services/fleetService.ts`)

**Vehicle types**: forklift, tractor, loader, mower, car, trailer
**Statuses**: available, in_use, maintenance, broken
**Code format**: `VZV-01`
**Tracking**: hoursTotal (Mth), service intervals, fuel type

### 2.6 Revisions (`src/pages/RevisionsPage.tsx`)

**Revision types**: FIRE, ELEC, PRESSURE, LIFT, GAS, CALIBRATION
**Statuses**: OK, WARNING, CRITICAL, EXPIRED
**Features**: intervalMonths for scheduling, provider/contact info, history sub-collection, document attachments sub-collection

### 2.7 Waste Management (`src/pages/WastePage.tsx`)

**Waste types**: municipal, plastic, paper, bio, metal, hazardous
**Semaphore system** (traffic-light status): green → yellow → red based on `currentFill` (0-100%)
**Scheduling**: collectionDay (0-6), collectionTime, reminderDaysBefore

### 2.8 Building Inspection (`src/pages/BuildingInspectionPage.tsx`)

Template-based inspection system:
- `inspection_templates/{docId}` — defines inspection points
- `inspection_logs/{docId}` — completed inspection records

### 2.9 Loupárna (Mill) (`src/pages/LouparnaPage.tsx`)

Specialized module for grain processing:
- `louparna_silos/{siloId}` — silo status and levels
- `louparna_production/{batchId}` — production batch records
- `louparna_waste/{wasteId}` — mill waste tracking
- `louparna_machines/{machineId}` — mill machinery

### 2.10 TrustBox (Anonymous Suggestion Box) (`src/pages/TrustBoxPage.tsx`)

**Dual-collection architecture** (designed for anonymization):
1. `trustbox_ingress` — "Black hole": write-only, nobody can read (prepared for Synology mixer)
2. `trustbox_public` — Management reads anonymized messages

**Current fallback** (Synology mixer not yet connected):
- `trustbox/{messageId}` — direct read/write with management-only reading
- Categories: safety, workplace, management, other
- Response workflow: status new → read → resolved

### 2.11 Noticeboard (`src/pages/NoticeboardPage.tsx`)

Team bulletin board: management creates posts, all roles can read.

### 2.12 Calendar (`src/pages/CalendarPage.tsx`)

Unified calendar view aggregating tasks, revisions, and fleet service schedules.

### 2.13 Map (`src/pages/MapPage.tsx`)

Interactive facility area map with asset locations.

### 2.14 Reports (`src/pages/ReportsPage.tsx`)

Analytics and reporting dashboard with export capabilities.

### 2.15 AI Assistant (`src/pages/AIAssistantPage.tsx`)

AI-powered assistant for maintenance recommendations.

### 2.16 Admin (`src/pages/AdminPage.tsx`)

User management, role configuration, system settings.

### 2.17 Notifications (`src/pages/NotificationsPage.tsx`)

Per-user notification system:
- Types: task, revision, inventory, system, reminder
- Priorities: low, medium, high, critical
- Targeting: specific user or role-based
- Read tracking with timestamps

### 2.18 Academy (`src/pages/AcademyPage.tsx`)

Training and knowledge base module.

### 2.19 Kiosk (`src/pages/KioskPage.tsx`)

Dedicated tablet mode for OPERATOR role:
- Locked to KioskPage only (no navigation)
- Multi-view state machine: MENU → BREAKDOWN → ORDER → PREFILTER → etc.
- Quick reporting of breakdowns, part orders, prefilter changes

---

## 3. Data Model (Firestore Schema)

### Collections Overview

| Collection | Document Type | Description |
|---|---|---|
| `users/{userId}` | UserDoc | User profiles with role, PIN, building assignment |
| `assets/{assetId}` | AssetDoc | Machines, tools, infrastructure |
| `assets/{assetId}/pest_logs/{logId}` | — | Pest trap monitoring |
| `assets/{assetId}/empty_logs/{logId}` | — | Waste container emptying |
| `tasks/{taskId}` | TaskDoc | Work orders with full lifecycle |
| `inventory/{itemId}` | InventoryDoc | Spare parts with min/max quantities |
| `inventory/{itemId}/transactions/{txId}` | InventoryTransactionDoc | Stock movements |
| `fleet/{vehicleId}` | FleetDoc | Vehicles with service tracking |
| `revisions/{revisionId}` | RevisionDoc | Compliance revisions |
| `revisions/.../history/{historyId}` | — | Revision history |
| `revisions/.../documents/{docId}` | — | Attached documents |
| `waste/{wasteId}` | WasteDoc | Waste containers with semaphore |
| `trustbox/{messageId}` | TrustboxDoc | Anonymous suggestions (fallback) |
| `trustbox_ingress/{docId}` | — | Write-only ingress (future) |
| `trustbox_public/{docId}` | — | Anonymized public board (future) |
| `notifications/{notifId}` | NotificationDoc | User notifications |
| `audit_logs/{logId}` | AuditLogDoc | Append-only audit trail |
| `settings/{settingId}` | SettingsDoc | System configuration |
| `areas/{areaId}` | — | Rooms and zones |
| `louparna_silos/{siloId}` | — | Mill silos |
| `louparna_production/{batchId}` | — | Mill production batches |
| `louparna_waste/{wasteId}` | — | Mill waste |
| `louparna_machines/{machineId}` | — | Mill machinery |
| `inspection_templates/{docId}` | — | Inspection templates |
| `inspection_logs/{docId}` | — | Completed inspections |
| `roles/{roleId}` | Role | Dynamic RBAC role definitions |
| `permissions/{permId}` | — | Permission definitions |
| `entities/{entityId}` | — | Universal entities (Matryoshka system) |
| `blueprints/{blueprintId}` | — | Entity type templates |
| `entity_logs/{logId}` | — | Entity audit trail (immutable) |
| `noticeboard/{msgId}` | — | Team bulletin posts |
| `user_engagement/{docId}` | — | Engagement tracking (append-only) |
| `stats_aggregates/{docId}` | — | Pre-computed statistics |
| `dashboard_configs/{userId}` | DashboardConfig | Per-user dashboard layout |
| `dashboard_defaults/{role}` | — | Default dashboard per role |

### Key Document Schemas

#### TaskDoc (most complex)
```typescript
{
  id: string;
  code: string;                    // "WO-2026-001"
  title: string;
  description?: string;
  type: 'corrective' | 'preventive' | 'inspection' | 'improvement';
  status: 'backlog' | 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  source: 'kiosk' | 'web' | 'scheduled' | 'ai' | 'inspection';
  assetId?: string;
  assetName?: string;
  buildingId?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  createdById: string;
  createdByName: string;
  createdAt: Timestamp;
  plannedWeek?: string;            // "2026-W07"
  plannedDate?: Timestamp;
  dueDate?: Timestamp;
  startedAt?: Timestamp;
  pausedAt?: Timestamp;
  completedAt?: Timestamp;
  estimatedMinutes?: number;
  actualMinutes?: number;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  closedById?: string;
  closedByName?: string;
  closedAt?: Timestamp;
  resolution?: string;
  isDone: boolean;                 // Status lock flag
  isDeleted: boolean;              // Soft delete
  updatedAt: Timestamp;
  updatedBy: string;
}
```

#### AssetDoc
```typescript
{
  id: string;
  code: string;                    // "EXT-001"
  name: string;
  type: 'machine' | 'vehicle' | 'tool' | 'infrastructure';
  status: 'operational' | 'maintenance' | 'breakdown' | 'offline';
  buildingId: 'A' | 'B' | 'C' | 'D' | 'E' | 'L';
  areaId?: string;
  areaName?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: Timestamp;
  warrantyUntil?: Timestamp;
  lastMaintenanceAt?: Timestamp;
  nextMaintenanceAt?: Timestamp;
  specifications?: Record<string, string>;
  imageUrl?: string;
  isDeleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### InventoryDoc
```typescript
{
  id: string;
  code: string;
  name: string;
  category: 'bearing' | 'belt' | 'filter' | 'electrical' | 'lubricant' | 'tool' | 'safety' | 'other';
  quantity: number;
  minQuantity: number;
  maxQuantity?: number;
  unit: string;
  location?: string;
  supplier?: string;
  supplierCode?: string;
  price?: number;
  currency?: string;
  compatibleAssets?: string[];
  linkedMachineIds?: string[];
  lastRestockAt?: Timestamp;
  lastConsumedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 4. Domain Specifics (Food Manufacturing)

### Buildings

| ID | Name | Purpose |
|---|---|---|
| A | Administrativa | Office building |
| B | Spojovací | Connector between buildings |
| C | Šatny | Locker rooms, sanitary facilities |
| D | VÝROBA | **Main production hall** — primary focus |
| E | Dílna + Sklad | Workshop and warehouse |
| L | Loupárna | Grain mill (specialized module) |

### Zone Management (Food Safety Critical)

The system enforces **zone modes** for food safety compliance:

| Zone | Color | Description |
|---|---|---|
| `GLUTEN` | Amber | Standard gluten processing zone |
| `GLUTEN_FREE` | Green | Gluten-free zone — strict allergen separation |
| `SANITATION_LOCKDOWN` | Red | Sanitation mode — system locked, no production operations |

Zone mode is global (affects all users) and displayed via `ZoneBanner` component at the top of the UI.

### Shift System (Auto-detected)

| Shift | Czech Name | Hours |
|---|---|---|
| RANNI | Ranní | 06:00 – 13:59 |
| ODPOLEDNI | Odpolední | 14:00 – 21:59 |
| NOCNI | Noční | 22:00 – 05:59 |

Shift is auto-calculated from system time, refreshed every 60 seconds.

### Food Industry-Specific Features

1. **Pest Trap Monitoring** (`assets/{id}/pest_logs/`) — Required by food safety regulations. Tracks insect trap inspections per asset.
2. **Waste Semaphore System** — Traffic-light (green/yellow/red) status for waste containers based on fill percentage (0-100%). Critical for HACCP compliance.
3. **Prefilter Tracking** — Records when air/water prefilters are changed (kiosk quick-action for operators).
4. **Loupárna (Mill) Module** — Specialized tracking for grain processing: silos, production batches, mill waste (chaff/husks), mill machinery status.
5. **Gluten/Gluten-Free Zones** — Allergen separation enforcement at system level.
6. **Sanitation Lockdown** — System-wide lock during sanitation procedures.
7. **Anonymous TrustBox** — Designed with anonymization layer for employee feedback in food manufacturing environment.

---

## 5. Role System (RBAC)

### Dual-Layer Architecture

The system uses **two parallel permission mechanisms**:

1. **Legacy Static RBAC** (`src/types/user.ts`):
   - Hardcoded `ROLE_PERMISSIONS` map: `Record<UserRole, Permission[]>`
   - Simple lookup: `hasPermission(role, permission)`
   - 6 fixed roles, 43 permissions

2. **Dynamic Firestore RBAC** (`src/types/rbac.ts`):
   - Roles stored in `roles/{roleId}` collection with permission arrays
   - Users can have multiple `roleIds`
   - Per-user `CustomPermissions` (grant/revoke overrides)
   - Per-user `UserScope` (building/area filtering)
   - `computeEffectivePermissions()` merges all role permissions + grants - revokes

Both systems are checked in `AuthContext.hasPermission()` — a permission passes if **either** system grants it.

### 6 User Roles

| Role | Czech Label | Icon | Description | Special Flags |
|---|---|---|---|---|
| `MAJITEL` | Majitel (Owner) | 👑 | Sees everything, cannot modify | `isReadOnly: true` |
| `VEDENI` | Vedení (CEO) | 🏢 | Executive management, HR, finance | Full management access |
| `SUPERADMIN` | Superadmin | 🛠️ | Technical system admin | No finance access, full tech control |
| `UDRZBA` | Údržba (Maintenance) | 🔧 | Machines, warehouse, repairs | Technician group |
| `VYROBA` | Výroba (Production) | 🏭 | Zones, production priorities | Technician group |
| `OPERATOR` | Operátor | 👷 | Kiosk tablet — fault reporting only | `isKiosk: true`, locked to KioskPage |

### Role Groups (used in Firestore rules)

```
isAdmin()      = SUPERADMIN || MAJITEL
isManagement() = isAdmin() || VEDENI
isTechnician() = UDRZBA || VYROBA
isAnyRole()    = any of the 6 roles
```

### Permission Categories (43 total)

| Category | Permissions |
|---|---|
| Work Orders | `wo.create`, `wo.update`, `wo.delete`, `wo.read`, `wo.approve`, `wo.close`, `wo.plan`, `wo.assign` |
| Assets | `asset.create`, `asset.update`, `asset.delete`, `asset.read` |
| Inventory | `inv.consume`, `inv.restock`, `inv.manage`, `inv.approve`, `inv.order` |
| Fleet | `fleet.manage`, `fleet.read` |
| Users | `user.manage`, `user.read` |
| Zones | `zone.change` |
| Reports | `report.read`, `report.export`, `audit.read` |
| Weekly Planning | `weekly.modify` |
| Finance | `finance.view` |
| TrustBox | `secretbox.view` |
| Purchases | `purchase.approve` |
| AI | `ai.use` |

### Permission Matrix (Key Permissions)

| Permission | MAJITEL | VEDENI | SUPERADMIN | UDRZBA | VYROBA | OPERATOR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| wo.create | | | ✓ | ✓ | ✓ | ✓ |
| wo.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| wo.approve | | ✓ | ✓ | | ✓ | |
| asset.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| asset.update | | | ✓ | ✓ | | |
| inv.consume | | | ✓ | ✓ | | |
| finance.view | ✓ | ✓ | | | | |
| user.manage | | ✓ | ✓ | | | |
| ai.use | ✓ | ✓ | ✓ | ✓ | | |
| zone.change | | | ✓ | | ✓ | |

### User Scope (Building/Area Filtering)

```typescript
interface UserScope {
  buildings: string[];   // ["D", "E"] or ["*"] for all
  areas: string[];       // ["D2.08"] or ["*"] for all
}
```

`canSeeBuilding(buildingId)` and `canSeeArea(areaId)` checks in AuthContext filter data visibility per user.

### Firestore Security Rules Enforcement

Rules in `firestore.rules` enforce RBAC at the database level:
- Helper functions: `isAuth()`, `getUserDoc()`, `userRole()`, `isSuperAdmin()`, `isManagement()`, `isTechnician()`, `isAnyRole()`
- Write validation: `hasTimestamp()` (updatedAt must be present), `hasValidAuthor()` (updatedBy must match auth.uid)
- Soft delete pattern: `isSoftDelete()` — operators can mark assets as deleted but not hard-delete
- Status Lock: completed tasks (`isDone=true`) can only be modified by SUPERADMIN
- Audit logs: append-only (no update, no delete — ever)
- Catch-all: `match /{document=**} { allow read, write: if false; }` — deny by default

---

## 6. Unique Logic & Algorithms

### 6.1 MTBF — Mean Time Between Failures

**Location**: `src/hooks/useStats.ts`

**Algorithm**:
1. Filter tasks: `type === 'corrective'` AND `priority === 'P1'` (only emergency failures count)
2. Group by `assetId`
3. For each asset: sort incidents by `createdAt`, compute time gaps between consecutive incidents
4. MTBF = average of all gaps (in hours)
5. Requires minimum 2 incidents per asset (otherwise returns -1 = insufficient data)

**Output**: Per-asset MTBF in `LemonEntry.mtbfHours`

### 6.2 MTTR — Mean Time To Repair

**Location**: `src/hooks/useStats.ts`

**Algorithm**:
1. Filter tasks: `status === 'completed'` AND `type === 'corrective'`
2. Compute: `completedAt - createdAt` for each task (in minutes)
3. MTTR = average across all matching tasks

**Output**: `StatsData.mttrMinutes`

### 6.3 Lemon List (Top 5 Worst Assets)

**Location**: `src/hooks/useStats.ts`

**Algorithm**:
1. Filter tasks: `priority in ['P1', 'P2']` AND `createdAt` within last 30 days
2. Group by `assetId`, count incidents
3. Sort descending by count
4. Take top 5
5. For each: compute MTBF using the per-asset algorithm above

**Output**: `LemonEntry[]` — displayed in LemonListWidget on dashboard

### 6.4 Work Order Code Generation

**Location**: `src/services/taskService.ts`

**Algorithm**:
1. Query all tasks where `code` starts with `WO-{currentYear}-`
2. Extract numeric suffixes, find maximum
3. New code = `WO-{year}-{max + 1}` (zero-padded to 3 digits)
4. Example sequence: `WO-2026-001`, `WO-2026-002`, ...

### 6.5 Priority System

| Priority | Czech Label | Use Case | Color |
|---|---|---|---|
| P1 | Havárie | Emergency breakdown — production stopped | Red |
| P2 | Urgentní | Urgent — affects production within 24h | Orange |
| P3 | Standardní | Standard maintenance task | Blue |
| P4 | Nápad | Improvement idea — low priority | Gray |

P1 tasks trigger the Semaphore widget (red traffic light) and appear in critical ticket counts.

### 6.6 Semaphore Widget Logic

**Three traffic lights**:
1. **Breakdown** (🔴): Count of assets with `status === 'breakdown'`
2. **Critical Tasks** (🟡): Count of active P1 tasks
3. **Waste** (🔴): Count of waste containers with `status === 'red'`

Each light shows green (0), yellow (1-2), or red (3+) based on counts.

### 6.7 Work Type Distribution

Groups active tasks by `workType` field (corrective, preventive, inspection, improvement) and computes percentage distribution — displayed as a horizontal bar in OperationalHUD.

### 6.8 Dashboard Config Persistence

**Location**: `src/hooks/useDashboardConfig.ts`

**Three-tier fallback**:
1. **Firestore** `dashboard_configs/{userId}` — primary (real-time via onSnapshot)
2. **localStorage** `vikrr-dash-v1` — offline fallback
3. **Registry defaults** `getDefaultConfig(role)` — if both empty

**Migration**: Detects old localStorage format `{tileOrder[], hiddenTiles[]}` → converts to new `WidgetInstance[]` format → writes to Firestore → clears old key.

**Write strategy**: Every config change writes to both Firestore AND localStorage simultaneously for offline resilience.

**New widget detection**: When widgets are added to the registry, the hook detects missing IDs and appends them as hidden widgets to existing configs.

### 6.9 Status Lock (Firestore Rules)

Once a task has `isDone === true`:
- Only SUPERADMIN can modify it
- All other users are blocked at the Firestore rules level
- Exception: the transition from `isDone: false → true` (closing a task) is always allowed

### 6.10 Soft Delete Pattern

Assets use soft delete:
- `isDeleted: true` marks an asset as deleted
- OPERATOR can soft-delete (report decommissioning) but cannot hard-delete
- Only SUPERADMIN can hard-delete (actual document removal)

### 6.11 Audit Trail

`audit_logs` collection is strictly append-only:
- `allow create: if isAnyRole()` — anyone can write
- `allow update: if false` — nobody can edit
- `allow delete: if false` — nobody can delete
- Records: action, collection, documentId, userId, before/after snapshots

---

## Appendix A: File Index (Key Files)

| Purpose | Path |
|---|---|
| App entry | `src/App.tsx` |
| Auth context | `src/context/AuthContext.tsx` |
| Global state (zones, shifts) | `src/context/GlobalStateContext.tsx` |
| Firebase init | `src/lib/firebase.ts` |
| Branding config | `src/appConfig.ts` |
| User types & permissions | `src/types/user.ts` |
| Firestore document types | `src/types/firestore.ts` |
| Dynamic RBAC types | `src/types/rbac.ts` |
| Dashboard widget types | `src/types/dashboard.ts` |
| Widget registry & defaults | `src/config/widgetRegistry.ts` |
| Dashboard config hook | `src/hooks/useDashboardConfig.ts` |
| Stats hook (MTBF/MTTR/Lemon) | `src/hooks/useStats.ts` |
| Task service (WO CRUD) | `src/services/taskService.ts` |
| Asset service | `src/services/assetService.ts` |
| Fleet service | `src/services/fleetService.ts` |
| Work log service | `src/services/workLogService.ts` |
| Firestore security rules | `firestore.rules` |
| Global CSS overrides | `src/index.css` |

## Appendix B: Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # tsc -b && vite build → dist/
npm run lint         # ESLint
npm run preview      # Preview production build locally
firebase deploy --only hosting           # Deploy to https://nominal-cmms.web.app
firebase emulators:start                 # Auth:9099, Firestore:8080, Storage:9199, UI:4000
```

## Appendix C: Environment Variables

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_USE_EMULATORS               # "true" → connects to local emulators
```
