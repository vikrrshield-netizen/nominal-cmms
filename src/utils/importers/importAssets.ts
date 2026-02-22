// src/utils/importers/importAssets.ts
// VIKRR — Asset Shield — Bulk asset importer (v2 tenant-aware)
//
// Validates rows, resolves parent-child hierarchy, and batch-writes
// into tenants/{tenantId}/assets collection.

import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { validateExcelData, ASSET_SCHEMA, type ValidationResult } from './validateExcelData';
import type { AssetStatus, AssetCriticality } from '../../types/asset';

export interface ImportResult {
  validation: ValidationResult;
  imported: number;
  failed: number;
  errors: string[];
}

// Valid enum values for normalization
const VALID_STATUSES: AssetStatus[] = ['operational', 'maintenance', 'broken', 'stopped'];
const VALID_CRITICALITIES: AssetCriticality[] = ['low', 'medium', 'high', 'critical'];

/**
 * Normalize status string to valid AssetStatus.
 * Handles Czech labels and common variations.
 */
function normalizeStatus(raw?: unknown): AssetStatus {
  if (!raw) return 'operational';
  const s = String(raw).toLowerCase().trim();
  if (VALID_STATUSES.includes(s as AssetStatus)) return s as AssetStatus;
  if (s.includes('provoz') || s === 'ok') return 'operational';
  if (s.includes('údrž') || s.includes('udrz') || s.includes('maint')) return 'maintenance';
  if (s.includes('poruch') || s.includes('broken') || s.includes('havár')) return 'broken';
  if (s.includes('zastav') || s.includes('stop') || s.includes('idle')) return 'stopped';
  return 'operational';
}

/**
 * Normalize criticality string to valid AssetCriticality.
 */
function normalizeCriticality(raw?: unknown): AssetCriticality {
  if (!raw) return 'medium';
  const s = String(raw).toLowerCase().trim();
  if (VALID_CRITICALITIES.includes(s as AssetCriticality)) return s as AssetCriticality;
  if (s.includes('nízk') || s.includes('nizk') || s === 'low') return 'low';
  if (s.includes('střed') || s.includes('stred') || s === 'med') return 'medium';
  if (s.includes('vysok') || s === 'high') return 'high';
  if (s.includes('krit') || s === 'critical') return 'critical';
  return 'medium';
}

/**
 * Validates and imports asset rows into Firestore tenant collection.
 * Resolves parent-child hierarchy via parentName field.
 * Uses batched writes for efficiency (max 500 per batch).
 */
export async function importAssets(
  rows: Record<string, unknown>[],
  tenantId: string
): Promise<ImportResult> {
  // 1. Validate
  const validation = validateExcelData(rows, ASSET_SCHEMA);

  if (!validation.valid && validation.validRowCount === 0) {
    return {
      validation,
      imported: 0,
      failed: rows.length,
      errors: validation.errors.map((e) => `Řádek ${e.row}: ${e.message}`),
    };
  }

  // 2. Separate root vs child rows (by parentName presence)
  const rootRows: { idx: number; row: Record<string, unknown> }[] = [];
  const childRows: { idx: number; row: Record<string, unknown> }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parentName = row.parentName ? String(row.parentName).trim() : '';
    if (parentName) {
      childRows.push({ idx: i, row });
    } else {
      rootRows.push({ idx: i, row });
    }
  }

  // 3. Import in 2 passes — roots first, then children
  const nameToIdMap = new Map<string, string>(); // name → Firestore doc ID
  const tenantCollection = collection(db, 'tenants', tenantId, 'assets');
  const BATCH_SIZE = 500;
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  // --- Pass 1: root assets ---
  for (let i = 0; i < rootRows.length; i += BATCH_SIZE) {
    const chunk = rootRows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const { row } of chunk) {
      try {
        const name = String(row.name || '').trim();
        if (!name) { failed++; continue; }

        const ref = doc(tenantCollection);
        batch.set(ref, {
          name,
          code: row.code ? String(row.code).trim() : '',
          entityType: row.entityType ? String(row.entityType).trim() : 'Stroj',
          status: normalizeStatus(row.status),
          criticality: normalizeCriticality(row.criticality),
          parentId: null,
          tenantId,
          manufacturer: row.manufacturer ? String(row.manufacturer).trim() : '',
          model: row.model ? String(row.model).trim() : '',
          serialNumber: row.serialNumber ? String(row.serialNumber).trim() : '',
          year: row.year ? Number(row.year) || null : null,
          location: row.location ? String(row.location).trim() : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        nameToIdMap.set(name.toLowerCase(), ref.id);
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
      errors.push(`Batch write (root) selhal: ${err}`);
    }
  }

  // --- Pass 2: child assets ---
  for (let i = 0; i < childRows.length; i += BATCH_SIZE) {
    const chunk = childRows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const { row } of chunk) {
      try {
        const name = String(row.name || '').trim();
        if (!name) { failed++; continue; }

        // Resolve parent by name
        const parentName = String(row.parentName || '').trim().toLowerCase();
        let parentId: string | null = nameToIdMap.get(parentName) || null;

        if (!parentId && parentName) {
          // Warning: parent not found, import as root
          errors.push(`Řádek "${name}": nadřazený „${row.parentName}" nenalezen — importováno jako root`);
        }

        const ref = doc(tenantCollection);
        batch.set(ref, {
          name,
          code: row.code ? String(row.code).trim() : '',
          entityType: row.entityType ? String(row.entityType).trim() : 'Stroj',
          status: normalizeStatus(row.status),
          criticality: normalizeCriticality(row.criticality),
          parentId,
          tenantId,
          manufacturer: row.manufacturer ? String(row.manufacturer).trim() : '',
          model: row.model ? String(row.model).trim() : '',
          serialNumber: row.serialNumber ? String(row.serialNumber).trim() : '',
          year: row.year ? Number(row.year) || null : null,
          location: row.location ? String(row.location).trim() : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        nameToIdMap.set(name.toLowerCase(), ref.id);
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
      errors.push(`Batch write (child) selhal: ${err}`);
    }
  }

  return { validation, imported, failed, errors };
}
