# NOMINAL CMMS — Nightly Build Report

**Date:** 2026-02-17
**Build Status:** SUCCESS (0 TS errors, 0 Vite errors)
**Build Time:** ~9s
**Output Size:** 1,023 kB (JS) + 110 kB (CSS)

---

## Changes Summary

### STEP 1: Security & Access Repair
**Commit:** `4c4ec99`

| File | Change |
|------|--------|
| `src/context/AuthContext.tsx` | `hasPermission()` now checks both dynamic RBAC AND legacy `ROLE_PERMISSIONS` (union approach). Eliminates access denied when Firestore roles collection is empty. |
| `src/pages/AdminPage.tsx` | Hardened access: explicit `SUPERADMIN`/`VEDENI` role bypass + `hasPermission('user.manage')`. NewUserModal now persists to Firestore with loading/error states. |
| `src/pages/MapPage.tsx` | Add modal: error display (`addError` state), building code validation (max 5 chars), user-visible error messages on failure. |

### STEP 2: Data Relations
**Commit:** `93300fd`

| File | Change |
|------|--------|
| `src/types/inventory.ts` | Added `linkedMachineIds: string[]` to `InventoryItem` interface for direct machine-part binding. |
| `src/types/firestore.ts` | Added `linkedMachineIds?: string[]` to `InventoryDoc`. |
| `src/hooks/useInventory.ts` | Default empty arrays for `linkedMachineIds`, `compatibleAssetIds`, `compatibleAssetNames` when reading from Firestore. |

### STEP 3: UI/UX Global Standardization
**Commit:** `2b88391`

| File | Change |
|------|--------|
| `src/pages/TasksPage.tsx` | Added `Edit2` icon button in `TaskRow` + new `EditTaskSheet` component (edit title, priority, status, assignee via BottomSheet). Table now has "Akce" column. |
| `src/pages/InventoryPage.tsx` | Replaced `ChevronRight` with `Edit2` icon on inventory list items. |
| `src/pages/WastePage.tsx` | Added `Edit2` icon on waste container cards. |
| `src/pages/RevisionsPage.tsx` | Replaced `ChevronRight` with `Edit2` icon on revision cards. |

### STEP 4: Prep for AI Architect
**Commit:** `c71df34`

| File | Change |
|------|--------|
| `src/utils/importers/validateExcelData.ts` | Schema-based data validator with predefined `ASSET_SCHEMA`, `INVENTORY_SCHEMA`, `TASK_SCHEMA`. Validates required fields, types, enums, ranges, patterns. |
| `src/utils/importers/importAssets.ts` | Bulk asset importer with Firestore batched writes (max 500/batch). |
| `src/utils/importers/importInventory.ts` | Bulk inventory importer with auto status calculation. |
| `src/utils/importers/index.ts` | Barrel export for all importers. |
| `src/pages/AIAssistantPage.tsx` | Expanded AI system prompt: all modules, machine codes, role descriptions, building info. |

---

## Architecture Notes

- **Auth**: Dual-layer permission system (Dynamic RBAC + Legacy fallback) ensures no role is locked out
- **Data Relations**: `linkedMachineIds[]` on inventory enables future machine-part mapping UI
- **Importers**: Ready for Excel bulk import via `xlsx` library (already in deps)
- **AI**: System prompt now covers all 8 modules, 6 buildings, machine types, and user roles

## Known Issues

- Chunk size warning (1,023 kB) — consider code-splitting with `React.lazy()`
- `FleetPage` inline edit uses `Pencil` icon (different from `Edit2` used elsewhere) — minor inconsistency
- `AdminPage` user list still uses mock `INITIAL_USERS` array alongside Firestore writes
- `react-refresh/only-export-components` ESLint warning in AuthContext (structural, non-blocking)

## Next Steps

1. Wire `linkedMachineIds` UI in InventoryPage detail modal
2. Add Excel import UI (file upload + preview + validate + import)
3. Code-split large pages with `React.lazy`
4. Deploy to https://nominal-cmms.web.app
