// src/utils/importers/importInventory.ts
// VIKRR — Asset Shield — Bulk inventory importer

import { writeBatch, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { validateExcelData, INVENTORY_SCHEMA, type ValidationResult } from './validateExcelData';
import { calcItemStatus } from '../../types/inventory';

export interface InventoryImportRow {
  name: string;
  code: string;
  category?: string;
  quantity: number;
  unit: string;
  minQuantity?: number;
  location?: string;
  buildingId?: string;
  supplier?: string;
}

export interface ImportResult {
  validation: ValidationResult;
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Validates and imports inventory rows into Firestore.
 */
export async function importInventory(rows: InventoryImportRow[]): Promise<ImportResult> {
  const validation = validateExcelData(rows as unknown as Record<string, unknown>[], INVENTORY_SCHEMA);

  if (!validation.valid) {
    return {
      validation,
      imported: 0,
      failed: rows.length,
      errors: validation.errors.map((e) => `Řádek ${e.row}: ${e.message}`),
    };
  }

  const BATCH_SIZE = 500;
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const row of chunk) {
      try {
        const qty = Number(row.quantity) || 0;
        const minQty = Number(row.minQuantity) || 5;
        const ref = doc(collection(db, 'inventory'));
        batch.set(ref, {
          name: row.name,
          code: row.code,
          category: row.category || 'other',
          quantity: qty,
          unit: row.unit || 'ks',
          minQuantity: minQty,
          location: row.location || '',
          buildingId: row.buildingId || 'E',
          supplier: row.supplier || '',
          status: calcItemStatus(qty, minQty),
          compatibleAssetIds: [],
          compatibleAssetNames: [],
          linkedMachineIds: [],
          isDeleted: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        imported++;
      } catch (err) {
        failed++;
        errors.push(`Chyba: ${row.name} — ${err}`);
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      failed += chunk.length;
      imported -= chunk.length;
      errors.push(`Batch write selhal: ${err}`);
    }
  }

  return { validation, imported, failed, errors };
}
