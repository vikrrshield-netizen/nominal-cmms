// src/types/firestore.ts
// VIKRR — Asset Shield — Firestore Schema (všechny kolekce)

import { Timestamp } from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════════

export type UserRole = 'MAJITEL' | 'VEDENI' | 'SUPERADMIN' | 'UDRZBA' | 'VYROBA' | 'OPERATOR';
export type BuildingId = 'A' | 'B' | 'C' | 'D' | 'E' | 'L';

// ═══════════════════════════════════════════════════════════════════
// USERS — /users/{userId}
// ═══════════════════════════════════════════════════════════════════

export interface UserDoc {
  id: string;
  displayName: string;
  pin: string;                    // Hashed PIN
  role: UserRole;
  email?: string;
  phone?: string;
  buildingId?: BuildingId;
  color: string;                  // Avatar barva
  active: boolean;
  createdAt: Timestamp;
  lastLoginAt?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// ASSETS — /assets/{assetId}
// ═══════════════════════════════════════════════════════════════════

export type AssetStatus = 'operational' | 'maintenance' | 'breakdown' | 'offline';
export type AssetType = 'machine' | 'vehicle' | 'tool' | 'infrastructure';

export interface AssetDoc {
  id: string;
  code: string;                   // Např. "EXT-001"
  name: string;
  type: AssetType;
  status: AssetStatus;
  buildingId: BuildingId;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// TASKS (Work Orders) — /tasks/{taskId}
// ═══════════════════════════════════════════════════════════════════

export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export type TaskPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TaskType = 'corrective' | 'preventive' | 'inspection' | 'improvement';
export type TaskSource = 'kiosk' | 'web' | 'scheduled' | 'ai' | 'inspection';

export interface TaskDoc {
  id: string;
  code: string;                   // "WO-2026-001"
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  
  // Vztahy
  assetId?: string;
  assetName?: string;
  buildingId?: BuildingId;
  
  // Přiřazení
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  
  // Vytvořeno
  createdById: string;
  createdByName: string;
  createdAt: Timestamp;
  
  // Plánování
  plannedWeek?: string;           // "2026-W07"
  plannedDate?: Timestamp;
  dueDate?: Timestamp;
  
  // Časy
  startedAt?: Timestamp;
  pausedAt?: Timestamp;
  completedAt?: Timestamp;
  
  // Trvání
  estimatedMinutes?: number;
  actualMinutes?: number;
  
  // Schválení
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  
  // Uzavření
  closedById?: string;
  closedByName?: string;
  closedAt?: Timestamp;
  resolution?: string;
}

// ═══════════════════════════════════════════════════════════════════
// INVENTORY — /inventory/{itemId}
// ═══════════════════════════════════════════════════════════════════

export type InventoryCategory = 'bearing' | 'belt' | 'filter' | 'electrical' | 'lubricant' | 'tool' | 'safety' | 'other';

export interface InventoryDoc {
  id: string;
  code: string;                   // Katalogové číslo
  name: string;
  category: InventoryCategory;
  quantity: number;
  minQuantity: number;
  maxQuantity?: number;
  unit: string;                   // "ks", "l", "m"
  location?: string;              // Pozice ve skladu
  supplier?: string;
  supplierCode?: string;
  price?: number;
  currency?: string;
  
  // Vztahy na stroje
  compatibleAssets?: string[];    // Asset IDs — kompatibilní stroje
  linkedMachineIds?: string[];    // Asset IDs — přímá vazba (nainstalován/přiřazen)

  lastRestockAt?: Timestamp;
  lastConsumedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Sub-collection: /inventory/{itemId}/transactions/{txId}
export interface InventoryTransactionDoc {
  id: string;
  type: 'consume' | 'restock' | 'adjust' | 'return';
  quantity: number;               // + nebo -
  previousQty: number;
  newQty: number;
  reason?: string;
  taskId?: string;                // Souvisejicí úkol
  userId: string;
  userName: string;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// FLEET — /fleet/{vehicleId}
// ═══════════════════════════════════════════════════════════════════

export type VehicleType = 'forklift' | 'tractor' | 'loader' | 'mower' | 'car' | 'trailer';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'broken';

export interface FleetDoc {
  id: string;
  code: string;                   // "VZV-01"
  name: string;
  type: VehicleType;
  status: VehicleStatus;
  
  // Umístění
  buildingId?: BuildingId;
  areaName?: string;
  
  // Detail
  manufacturer?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  
  // Provoz
  hoursTotal?: number;
  lastServiceAt?: Timestamp;
  nextServiceAt?: Timestamp;
  fuelType?: string;
  
  imageUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// REVISIONS — /revisions/{revisionId}
// ═══════════════════════════════════════════════════════════════════

export type RevisionType = 'FIRE' | 'ELEC' | 'PRESSURE' | 'LIFT' | 'GAS' | 'CALIBRATION';
export type RevisionStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'EXPIRED';

export interface RevisionDoc {
  id: string;
  type: RevisionType;
  name: string;
  assetId?: string;
  assetName?: string;
  buildingId: BuildingId;
  
  // Termíny
  lastRevisionAt?: Timestamp;
  nextRevisionAt: Timestamp;
  intervalMonths: number;
  
  // Dodavatel
  provider?: string;
  providerContact?: string;
  
  // Odpovědnost
  assigneeId?: string;
  assigneeName?: string;
  
  notes?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Sub-collection: /revisions/{revisionId}/history/{historyId}
export interface RevisionHistoryDoc {
  id: string;
  date: Timestamp;
  provider: string;
  result: 'pass' | 'fail' | 'conditional';
  notes?: string;
  documentUrl?: string;
  createdById: string;
  createdByName: string;
  createdAt: Timestamp;
}

// Sub-collection: /revisions/{revisionId}/documents/{docId}
export interface RevisionDocumentDoc {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'img';
  url: string;
  size?: number;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// PREFILTERS — /prefilters/{logId}
// ═══════════════════════════════════════════════════════════════════

export interface PrefilterDoc {
  id: string;
  assetId: string;
  assetName: string;              // "Extruder 1", "Míchárna 2"
  changedAt: Timestamp;
  changedById: string;
  changedByName: string;
  notes?: string;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// TRUSTBOX — /trustbox/{messageId}
// ═══════════════════════════════════════════════════════════════════

export interface TrustboxDoc {
  id: string;
  message: string;
  category?: 'safety' | 'workplace' | 'management' | 'other';
  status: 'new' | 'read' | 'resolved';
  
  // Anonymní = žádné user ID
  createdAt: Timestamp;
  
  // Odpověď vedení
  response?: string;
  respondedById?: string;
  respondedByName?: string;
  respondedAt?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS — /notifications/{notificationId}
// ═══════════════════════════════════════════════════════════════════

export type NotificationType = 'task' | 'revision' | 'inventory' | 'system' | 'reminder';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationDoc {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  
  // Cílový uživatel (nebo všichni pokud null)
  targetUserId?: string;
  targetRole?: UserRole;
  
  // Akce
  actionUrl?: string;
  actionLabel?: string;
  
  // Stav
  read: boolean;
  readAt?: Timestamp;
  
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// WORK LOGS — /workLogs/{logId}
// ═══════════════════════════════════════════════════════════════════

export type WorkLogType = 'maintenance' | 'repair' | 'inspection' | 'note';

export interface WorkLogDoc {
  id: string;
  assetId: string;
  taskId?: string;
  
  type: WorkLogType;
  description: string;
  
  // Kdo a kdy
  userId: string;
  userName: string;
  userColor: string;
  
  // Čas práce
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  durationMinutes?: number;
  
  // Použité díly
  partsUsed?: {
    itemId: string;
    itemName: string;
    quantity: number;
  }[];
  
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// WASTE — /waste/{scheduleId}
// ═══════════════════════════════════════════════════════════════════

export type WasteType = 'municipal' | 'plastic' | 'paper' | 'bio' | 'metal' | 'hazardous';
export type WasteStatus = 'green' | 'yellow' | 'red';

export interface WasteDoc {
  id: string;
  type: WasteType;
  name: string;
  
  // Harmonogram
  collectionDay: number;          // 0-6 (neděle-sobota)
  collectionTime?: string;        // "06:00"
  reminderDaysBefore: number;     // Kolik dní předem upozornit
  
  // Stav
  status: WasteStatus;
  currentFill?: number;           // 0-100%
  
  notes?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG — /auditLog/{logId}
// ═══════════════════════════════════════════════════════════════════

export interface AuditLogDoc {
  id: string;
  action: string;                 // "task.create", "inventory.consume"
  collection: string;
  documentId: string;
  
  // Kdo
  userId: string;
  userName: string;
  userRole: UserRole;
  
  // Co
  before?: Record<string, any>;
  after?: Record<string, any>;
  
  // Kdy
  createdAt: Timestamp;
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS — /settings/{settingId}
// ═══════════════════════════════════════════════════════════════════

export interface SettingsDoc {
  id: string;
  
  // Gluten/Bezlepek zóna
  currentZone?: 'gluten' | 'gluten_free';
  zoneChangedAt?: Timestamp;
  zoneChangedById?: string;
  
  // Pondělní plán
  currentWeek?: string;           // "2026-W07"
  weekPlanLocked?: boolean;
  weekPlanLockedAt?: Timestamp;
  weekPlanLockedById?: string;
  
  // Systém
  maintenanceMode?: boolean;
  
  updatedAt: Timestamp;
}
