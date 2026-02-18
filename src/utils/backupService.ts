// src/utils/backupService.ts
// VIKRR — Asset Shield — Auto-backup service
// Saves snapshots to LocalStorage before destructive operations.
// Can also push to Firestore _backups collection for persistence.

import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const LS_KEY = 'nominal-cmms-backup';
const COLLECTIONS_TO_BACKUP = ['assets', 'inventory', 'tasks', 'fleet', 'revisions', 'waste'];

export interface Snapshot {
  id: string;
  createdAt: string;
  collections: Record<string, Record<string, unknown>[]>;
}

/**
 * Creates a full snapshot of key Firestore collections.
 * Saves to LocalStorage and optionally to Firestore _backups collection.
 */
export async function createSnapshot(opts?: { saveToFirestore?: boolean }): Promise<Snapshot> {
  const snapshot: Snapshot = {
    id: `backup_${Date.now()}`,
    createdAt: new Date().toISOString(),
    collections: {},
  };

  for (const col of COLLECTIONS_TO_BACKUP) {
    try {
      const snap = await getDocs(collection(db, col));
      snapshot.collections[col] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    } catch (err) {
      console.warn(`[Backup] Failed to read ${col}:`, err);
      snapshot.collections[col] = [];
    }
  }

  // Save to LocalStorage
  try {
    const existing = getStoredSnapshots();
    existing.unshift(snapshot);
    // Keep only last 5 backups
    const trimmed = existing.slice(0, 5);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    console.log(`[Backup] Snapshot ${snapshot.id} saved (${Object.keys(snapshot.collections).length} collections)`);
  } catch (err) {
    console.error('[Backup] LocalStorage save failed:', err);
  }

  // Optionally save to Firestore
  if (opts?.saveToFirestore) {
    try {
      await setDoc(doc(db, '_backups', snapshot.id), {
        ...snapshot,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Backup] Firestore save failed:', err);
    }
  }

  return snapshot;
}

/**
 * Restores a snapshot — writes all documents back to Firestore.
 * WARNING: This overwrites current data!
 */
export async function restoreSnapshot(snapshotId: string): Promise<{ restored: number; errors: number }> {
  const snapshots = getStoredSnapshots();
  const snapshot = snapshots.find((s) => s.id === snapshotId);

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  let restored = 0;
  let errors = 0;

  for (const [colName, docs] of Object.entries(snapshot.collections)) {
    for (const docData of docs) {
      try {
        const { id, ...data } = docData as { id: string; [key: string]: unknown };
        await setDoc(doc(db, colName, id), data);
        restored++;
      } catch (err) {
        console.error(`[Restore] Failed ${colName}/${(docData as { id: string }).id}:`, err);
        errors++;
      }
    }
  }

  console.log(`[Restore] Done: ${restored} restored, ${errors} errors`);
  return { restored, errors };
}

/**
 * Lists all stored snapshots.
 */
export function getStoredSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

/**
 * Deletes a stored snapshot.
 */
export function deleteSnapshot(snapshotId: string): void {
  const snapshots = getStoredSnapshots().filter((s) => s.id !== snapshotId);
  localStorage.setItem(LS_KEY, JSON.stringify(snapshots));
}
