// src/utils/importers/importAssets.ts
// VIKRR — Asset Shield — Bulk asset importer
//
// Reads validated rows and creates asset documents in Firestore.

import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { validateExcelData, ASSET_SCHEMA, type ValidationResult } from './validateExcelData';

export interface AssetImportRow {
  name: string;
  code?: string;
  buildingId: string;
  areaName?: string;
  status?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
}

export interface ImportResult {
  validation: ValidationResult;
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Validates and imports asset rows into Firestore.
 * Uses batched writes for efficiency (max 500 per batch).
 */
export async function importAssets(rows: AssetImportRow[]): Promise<ImportResult> {
  // 1. Validate
  const validation = validateExcelData(rows as unknown as Record<string, unknown>[], ASSET_SCHEMA);

  if (!validation.valid) {
    return {
      validation,
      imported: 0,
      failed: rows.length,
      errors: validation.errors.map((e) => `Řádek ${e.row}: ${e.message}`),
    };
  }

  // 2. Batch import
  const BATCH_SIZE = 500;
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const row of chunk) {
      try {
        const ref = doc(collection(db, 'assets'));
        batch.set(ref, {
          name: row.name,
          code: row.code || '',
          buildingId: row.buildingId,
          areaName: row.areaName || 'Ostatní',
          status: row.status || 'operational',
          category: row.category || '',
          manufacturer: row.manufacturer || '',
          model: row.model || '',
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
