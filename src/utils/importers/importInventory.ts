// src/utils/importers/importInventory.ts
// VIKRR — Asset Shield — Bulk inventory importer

import { writeBatch, doc, collection, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { validateExcelData, INVENTORY_SCHEMA, type ValidationResult } from './validateExcelData';
import { calcItemStatus } from '../../types/inventory';

const codeKey = (v: unknown) => String(v ?? '').trim().toUpperCase();

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
  updated: number;
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
      updated: 0,
      failed: rows.length,
      errors: validation.errors.map((e) => `Řádek ${e.row}: ${e.message}`),
    };
  }

  // Dedup podle KÓDU: načti existující položky (kód → doc ID). Když kód už existuje,
  // řádek se PŘEPÍŠE (aktualizace stavu), ne založí znovu → opakovaný import nezduplikuje sklad.
  const existing = new Map<string, string>();
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    snap.forEach((d) => {
      const data = d.data() as { code?: unknown; isDeleted?: boolean };
      const k = codeKey(data.code);
      if (k && !data.isDeleted && !existing.has(k)) existing.set(k, d.id);
    });
  } catch (err) {
    return { validation, imported: 0, updated: 0, failed: rows.length, errors: [`Nepodařilo se načíst stávající sklad: ${err}`] };
  }

  const BATCH_SIZE: number = 400;
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const seenInFile = new Set<string>();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    let created = 0, upd = 0;

    for (const row of chunk) {
      try {
        const qty = Number(row.quantity) || 0;
        const minQty = Number(row.minQuantity) || 5;
        const key = codeKey(row.code);

        // Duplicita ve stejném souboru → zapiš jen jednou.
        if (key && seenInFile.has(key)) {
          errors.push(`Řádek "${row.name}": kód ${row.code} je v souboru vícekrát — použit jen první.`);
          continue;
        }
        if (key) seenInFile.add(key);

        const base = {
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
          updatedAt: serverTimestamp(),
        };

        const existingId = key ? existing.get(key) : undefined;
        if (existingId) {
          // AKTUALIZUJ existující (zachová vazby na stroje, historii, createdAt).
          batch.update(doc(db, 'inventory', existingId), base);
          upd++;
        } else {
          const ref = doc(collection(db, 'inventory'));
          batch.set(ref, {
            ...base,
            compatibleAssetIds: [],
            compatibleAssetNames: [],
            linkedMachineIds: [],
            isDeleted: false,
            createdAt: serverTimestamp(),
          });
          if (key) existing.set(key, ref.id); // ať se stejný kód dál v souboru nezaloží dvakrát
          created++;
        }
      } catch (err) {
        failed++;
        errors.push(`Chyba: ${row.name} — ${err}`);
      }
    }

    try {
      await batch.commit();
      imported += created;
      updated += upd;
    } catch (err) {
      failed += created + upd;
      errors.push(`Batch write selhal: ${err}`);
    }
  }

  return { validation, imported, updated, failed, errors };
}
