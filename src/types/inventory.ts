// src/types/inventory.ts
// NOMINAL CMMS — Skladové typy

import type { Timestamp } from 'firebase/firestore';

export type ItemCategory =
  | 'bearings'   // Ložiska
  | 'belts'      // Řemeny
  | 'seals'      // Těsnění
  | 'oils'       // Oleje a maziva
  | 'filters'    // Filtry (VZT, stroje)
  | 'electrical' // Elektro
  | 'other';

export type ItemStatus = 'ok' | 'low' | 'critical' | 'out';

export type TransactionType = 'issue' | 'receive' | 'adjust' | 'return';

export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'delivered'
  | 'cancelled';

// ═══════════════════════════════════════════
// INVENTORY ITEM (skladová položka)
// ═══════════════════════════════════════════

export interface InventoryItem {
  id: string;
  name: string;               // "Ložisko 6205-2RS"
  code: string;               // "LOZ-6205"
  category: ItemCategory;
  quantity: number;
  unit: string;               // "ks", "l", "kg", "m"
  minQuantity: number;        // pod tímto → notifikace
  maxQuantity?: number;
  location: string;           // "E-Regál 3-Pozice B"
  buildingId: string;         // "E"
  supplier?: string;
  supplierCode?: string;
  unitPrice?: number;
  currency?: string;
  compatibleAssetIds: string[];
  compatibleAssetNames: string[];
  filterSpec?: {
    dimensions: string;       // "592x592x48"
    typeCode: string;         // "F03"
    filterClass: string;      // "G4", "F7"
  };
  qrCode?: string;
  status: ItemStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
}

// ═══════════════════════════════════════════
// TRANSACTION (pohyb na skladu)
// ═══════════════════════════════════════════

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantity: number;           // kladné = příjem, záporné = výdej
  taskId?: string;            // vazba na work order
  taskTitle?: string;
  orderId?: string;           // vazba na objednávku
  performedBy: string;
  performedByName: string;
  performedAt: Timestamp;
  note?: string;
  quantityAfter: number;      // stav po transakci
}

// ═══════════════════════════════════════════
// PURCHASE ORDER (objednávka)
// ═══════════════════════════════════════════

export interface PurchaseOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface PurchaseOrder {
  id: string;
  title: string;
  status: OrderStatus;
  items: PurchaseOrderItem[];
  totalPrice?: number;
  supplier?: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: Timestamp;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  note?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
}

// ═══════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════

export function calcItemStatus(quantity: number, minQuantity: number): ItemStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= minQuantity * 0.5) return 'critical';
  if (quantity <= minQuantity) return 'low';
  return 'ok';
}
