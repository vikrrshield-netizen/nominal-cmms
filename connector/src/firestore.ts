// connector/src/firestore.ts
// Přístup k Firestore přes Firebase Admin SDK (čtení, Fáze 1).
// Na Cloud Run běží jako service account (ADC) — žádný klíč v kódu.
// Lokálně: nastav GOOGLE_APPLICATION_CREDENTIALS na cestu k JSON klíči service accountu.

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}
export const db = getFirestore();

// Firma (tenant) je zafixovaná — konektor čte jen pro jednu firmu.
export const TENANT_ID = process.env.TENANT_ID || 'main_firm';

export interface AssetEvent {
  id?: string; name?: string; eventType?: string; frequencyDays?: number; lastDate?: string; nextDate?: string;
}
export interface Asset {
  id: string; name?: string; code?: string; entityType?: string; category?: string;
  status?: string; location?: string; areaName?: string; buildingId?: string;
  parentId?: string | null; isDeleted?: boolean; tenantId?: string; events?: AssetEvent[];
}
export interface WorkLog {
  id: string; assetId?: string; assetName?: string; userName?: string; type?: string;
  workType?: string; content?: string; performedAt?: Timestamp; createdAt?: Timestamp; tenantId?: string;
}
export interface Task {
  id: string; title?: string; status?: string; priority?: string; assetId?: string;
  assetName?: string; assignedToName?: string; dueDate?: string; tenantId?: string;
}

const belongsToTenant = (x: { tenantId?: string }) => !x.tenantId || x.tenantId === TENANT_ID;

export async function getAssets(): Promise<Asset[]> {
  const snap = await db.collection('assets').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Asset, 'id'>) }))
    .filter((a) => belongsToTenant(a) && !a.isDeleted);
}

export async function getAssetById(id: string): Promise<Asset | null> {
  const doc = await db.collection('assets').doc(id).get();
  if (!doc.exists) return null;
  const a = { id: doc.id, ...(doc.data() as Omit<Asset, 'id'>) };
  return belongsToTenant(a) && !a.isDeleted ? a : null;
}

export async function getWorkLogs(opts: { assetId?: string; limit?: number }): Promise<WorkLog[]> {
  if (opts.assetId) {
    const snap = await db.collection('workLogs').where('assetId', '==', opts.assetId).limit(200).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkLog, 'id'>) }));
    rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return rows.slice(0, opts.limit ?? 50);
  }
  const snap = await db.collection('workLogs').orderBy('createdAt', 'desc').limit(opts.limit ?? 200).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkLog, 'id'>) }));
}

const OPEN_TASK = (s?: string) =>
  !['done', 'completed', 'closed', 'hotovo', 'uzavreno', 'uzavřeno', 'cancelled', 'zruseno'].includes((s || '').toLowerCase());

export async function getOpenTasks(): Promise<Task[]> {
  const snap = await db.collection('tasks').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }))
    .filter((t) => belongsToTenant(t) && OPEN_TASK(t.status));
}
