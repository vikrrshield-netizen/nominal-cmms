// connector/src/firestore.ts
// Přístup k Firestore přes Firebase Admin SDK (čtení, Fáze 1).
// Na Cloud Run běží jako service account (ADC) — žádný klíč v kódu.
// Lokálně: nastav GOOGLE_APPLICATION_CREDENTIALS na cestu k JSON klíči service accountu.

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

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
    return rows.filter(belongsToTenant).slice(0, opts.limit ?? 50);
  }
  const snap = await db.collection('workLogs').orderBy('createdAt', 'desc').limit(opts.limit ?? 200).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkLog, 'id'>) })).filter(belongsToTenant);
}

const OPEN_TASK = (s?: string) =>
  !['done', 'completed', 'closed', 'hotovo', 'uzavreno', 'uzavřeno', 'cancelled', 'zruseno'].includes((s || '').toLowerCase());

export async function getOpenTasks(): Promise<Task[]> {
  const snap = await db.collection('tasks').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }))
    .filter((t) => belongsToTenant(t) && OPEN_TASK(t.status));
}

// ─────────────────────────────────────────────────────────────
// ZÁPIS (Fáze 2) — aktivní jen když MCP_ALLOW_WRITE=true (viz tools.ts).
// Píše přes Firebase Admin SDK (obchází firestore.rules — proto opatrně + jen na pokyn).
// Tenant zafixovaný; tvary odpovídají appce (workLogs, tasks, assets); zdroj označen.
// ─────────────────────────────────────────────────────────────

export async function findAssetByName(name: string): Promise<Asset | null> {
  const all = await getAssets();
  const q = name.toLowerCase();
  return all.find((a) => (a.name ?? '').toLowerCase() === q)
    ?? all.find((a) => (a.name ?? '').toLowerCase().includes(q))
    ?? null;
}

export async function addWorkLogEntry(input: { assetId?: string; assetName?: string; content: string; workType?: string; worker?: string }): Promise<string> {
  const data: Record<string, unknown> = {
    userId: 'mcp-connector',
    userName: input.worker || 'AI asistent',
    type: 'maintenance',
    content: input.content,
    auditReady: true,
    source: 'connector',
    tenantId: TENANT_ID,
    performedAt: Timestamp.now(),
    createdAt: FieldValue.serverTimestamp(),
  };
  if (input.workType) data.workType = input.workType;
  if (input.worker) data.workerNames = [input.worker];
  if (input.assetId) data.assetId = input.assetId;
  if (input.assetName) data.assetName = input.assetName;
  const ref = await db.collection('workLogs').add(data);
  return ref.id;
}

export async function createTaskEntry(input: { title: string; description?: string; priority?: string; assetId?: string; assetName?: string }): Promise<{ id: string; code: string }> {
  const year = new Date().getFullYear();
  const code = `WO-${year}-AI${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const priority = input.priority && /^P[1-4]$/.test(input.priority) ? input.priority : 'P3';
  const data: Record<string, unknown> = {
    code,
    title: input.title,
    type: 'corrective',
    status: 'backlog',
    priority,
    source: 'ai',
    createdById: 'mcp-connector',
    createdByName: 'AI asistent',
    tenantId: TENANT_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.description) data.description = input.description;
  if (input.assetId) data.assetId = input.assetId;
  if (input.assetName) data.assetName = input.assetName;
  const ref = await db.collection('tasks').add(data);
  return { id: ref.id, code };
}

export async function createAssetEntry(input: { name: string; entityType?: string; category?: string; status?: string; parentId?: string; location?: string }): Promise<string> {
  const data: Record<string, unknown> = {
    name: input.name,
    entityType: input.entityType || 'Zařízení',
    status: input.status || 'operational',
    parentId: input.parentId ?? null,
    tenantId: TENANT_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.category) data.category = input.category;
  if (input.location) data.location = input.location;
  const ref = await db.collection('assets').add(data);
  return ref.id;
}
