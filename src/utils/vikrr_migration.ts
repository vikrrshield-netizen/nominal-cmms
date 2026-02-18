// src/utils/vikrr_migration.ts
// VIKRR Migration Export Utility
// Exportuje všechna data z Firestore pro migraci na platformu VIKRR

import {
  collection,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface MigrationMetadata {
  exportDate: string;
  exportTimestamp: number;
  sourceProject: string;
  sourceProjectId: string;
  version: string;
  exportedBy: string;
  collections: string[];
  totalDocuments: number;
}

interface SubCollectionData {
  parentId: string;
  subCollection: string;
  documents: Record<string, any>[];
}

interface CollectionExport {
  name: string;
  documentCount: number;
  documents: Record<string, any>[];
  subCollections?: SubCollectionData[];
}

export interface MigrationExport {
  metadata: MigrationMetadata;
  data: Record<string, CollectionExport>;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function serializeDocument(data: Record<string, any>): Record<string, any> {
  const serialized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      serialized[key] = {
        _type: 'Timestamp',
        seconds: value.seconds,
        nanoseconds: value.nanoseconds,
        iso: value.toDate().toISOString(),
      };
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('seconds' in value && 'nanoseconds' in value && typeof value.toDate === 'function') {
        serialized[key] = {
          _type: 'Timestamp',
          seconds: value.seconds,
          nanoseconds: value.nanoseconds,
          iso: value.toDate().toISOString(),
        };
      } else {
        serialized[key] = serializeDocument(value);
      }
    } else if (Array.isArray(value)) {
      serialized[key] = value.map((item) =>
        item && typeof item === 'object' ? serializeDocument(item) : item
      );
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

async function exportCollection(collectionName: string): Promise<Record<string, any>[]> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map((d) => ({
      _id: d.id,
      _path: d.ref.path,
      ...serializeDocument(d.data()),
    }));
  } catch (error) {
    console.warn(`[Migration] Chyba při čtení kolekce "${collectionName}":`, error);
    return [];
  }
}

async function exportSubCollection(
  parentCollection: string,
  parentId: string,
  subCollectionName: string
): Promise<Record<string, any>[]> {
  try {
    const snap = await getDocs(
      collection(db, parentCollection, parentId, subCollectionName)
    );
    return snap.docs.map((d) => ({
      _id: d.id,
      _path: d.ref.path,
      _parentId: parentId,
      ...serializeDocument(d.data()),
    }));
  } catch (error) {
    console.warn(
      `[Migration] Chyba při čtení sub-kolekce "${parentCollection}/${parentId}/${subCollectionName}":`,
      error
    );
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// COLLECTION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

const TOP_LEVEL_COLLECTIONS = [
  'users', 'assets', 'tasks', 'inventory', 'fleet', 'revisions', 'waste',
  'inspections', 'inspection_templates', 'inspection_logs',
  'notifications', 'trustbox', 'trustbox_ingress', 'trustbox_public',
  'prefilters', 'shiftNotes',
  'settings', 'roles', 'permissions', 'audit_logs', 'stats_aggregates',
  'louparna_silos', 'louparna_production', 'louparna_waste', 'louparna_machines',
  'entities', 'blueprints', 'entity_logs',
  'areas', 'facilities', 'workLogs', 'purchase_orders', 'inventory_transactions',
  'noticeboard', 'user_engagement',
] as const;

const SUB_COLLECTIONS: Record<string, string[]> = {
  assets: ['pest_logs', 'empty_logs'],
  revisions: ['history', 'documents'],
  stats_aggregates: ['daily', 'weekly', 'monthly'],
};

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═══════════════════════════════════════════════════════════════════

export async function exportMigrationData(
  exportedBy: string = 'system',
  options: {
    skipCollections?: string[];
    includeSubCollections?: boolean;
    onProgress?: (message: string, current: number, total: number) => void;
  } = {}
): Promise<MigrationExport> {
  const {
    skipCollections = [],
    includeSubCollections = true,
    onProgress,
  } = options;

  const startTime = Date.now();
  const collectionsToExport = TOP_LEVEL_COLLECTIONS.filter(
    (c) => !skipCollections.includes(c)
  );

  const totalSteps = collectionsToExport.length;
  let currentStep = 0;
  let totalDocuments = 0;
  const data: Record<string, CollectionExport> = {};

  console.log(`[Migration] Zahajuji export ${collectionsToExport.length} kolekcí...`);

  for (const collectionName of collectionsToExport) {
    currentStep++;
    const stepMessage = `Exportuji kolekci: ${collectionName}`;
    console.log(`[Migration] [${currentStep}/${totalSteps}] ${stepMessage}`);
    onProgress?.(stepMessage, currentStep, totalSteps);

    const documents = await exportCollection(collectionName);
    totalDocuments += documents.length;

    const collectionExport: CollectionExport = {
      name: collectionName,
      documentCount: documents.length,
      documents,
    };

    if (includeSubCollections && SUB_COLLECTIONS[collectionName]) {
      const subCollectionNames = SUB_COLLECTIONS[collectionName];
      const allSubData: SubCollectionData[] = [];

      for (const parentDoc of documents) {
        for (const subName of subCollectionNames) {
          const subDocs = await exportSubCollection(collectionName, parentDoc._id, subName);
          if (subDocs.length > 0) {
            totalDocuments += subDocs.length;
            allSubData.push({ parentId: parentDoc._id, subCollection: subName, documents: subDocs });
          }
        }
      }

      if (allSubData.length > 0) {
        collectionExport.subCollections = allSubData;
      }
    }

    data[collectionName] = collectionExport;
  }

  const elapsedMs = Date.now() - startTime;

  const metadata: MigrationMetadata = {
    exportDate: new Date().toISOString(),
    exportTimestamp: Date.now(),
    sourceProject: 'Nominal CMMS',
    sourceProjectId: 'nominal-cmms',
    version: '1.0.0',
    exportedBy,
    collections: Object.keys(data),
    totalDocuments,
  };

  console.log(
    `[Migration] Export dokončen: ${totalDocuments} dokumentů z ${Object.keys(data).length} kolekcí za ${(elapsedMs / 1000).toFixed(1)}s`
  );

  return { metadata, data };
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Download as JSON file
// ═══════════════════════════════════════════════════════════════════

export function downloadMigrationJson(exportData: MigrationExport): void {
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `vikrr-migration-${timestamp}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[Migration] Soubor stažen: ${filename} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Validate export completeness
// ═══════════════════════════════════════════════════════════════════

export function validateExport(exportData: MigrationExport): {
  valid: boolean;
  warnings: string[];
  summary: Record<string, number>;
} {
  const criticalCollections = ['users', 'assets', 'tasks', 'inventory', 'revisions'];
  const warnings: string[] = [];
  const summary: Record<string, number> = {};

  for (const [name, col] of Object.entries(exportData.data)) {
    summary[name] = col.documentCount;
    if (criticalCollections.includes(name) && col.documentCount === 0) {
      warnings.push(`Kritická kolekce "${name}" je prázdná — zkontrolujte oprávnění.`);
    }
  }

  for (const expected of criticalCollections) {
    if (!exportData.data[expected]) {
      warnings.push(`Kritická kolekce "${expected}" chybí v exportu.`);
    }
  }

  return { valid: warnings.length === 0, warnings, summary };
}
