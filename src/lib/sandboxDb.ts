// src/lib/sandboxDb.ts
// Nominal CMMS — Sandbox Data Interceptor
// Wraps Firestore write operations; in sandbox mode, saves to in-memory store only.

import {
  addDoc, updateDoc, deleteDoc,
  type DocumentReference, type CollectionReference, type UpdateData,
} from 'firebase/firestore';
import { showToast } from '../components/ui/Toast';

// ═══════════════════════════════════════════════════════
// SANDBOX STATE
// ═══════════════════════════════════════════════════════

export function isSandboxMode(): boolean {
  return sessionStorage.getItem('nominal-sandbox') === 'true';
}

// In-memory store for sandbox writes
const _memoryStore: Record<string, Record<string, unknown>[]> = {};
let _idCounter = 1;

export function getSandboxStore(): Record<string, Record<string, unknown>[]> {
  return _memoryStore;
}

export function getSandboxCollection(path: string): Record<string, unknown>[] {
  return _memoryStore[path] || [];
}

// ═══════════════════════════════════════════════════════
// WRAPPED FIRESTORE OPERATIONS
// ═══════════════════════════════════════════════════════

export async function safeAddDoc<T extends Record<string, unknown>>(
  ref: CollectionReference,
  data: T,
): Promise<DocumentReference | null> {
  if (isSandboxMode()) {
    const collPath = ref.path;
    if (!_memoryStore[collPath]) _memoryStore[collPath] = [];
    const fakeId = `sandbox-${_idCounter++}`;
    _memoryStore[collPath].push({ _id: fakeId, ...data, _createdAt: new Date().toISOString() });
    showToast('REŽIM UČNĚ: Změny se ukládají pouze dočasně.', 'success');
    return null;
  }
  return addDoc(ref, data);
}

export async function safeUpdateDoc(
  ref: DocumentReference,
  data: UpdateData<Record<string, unknown>>,
): Promise<void> {
  if (isSandboxMode()) {
    const collPath = ref.parent.path;
    const docId = ref.id;
    const coll = _memoryStore[collPath];
    if (coll) {
      const idx = coll.findIndex((d) => d._id === docId);
      if (idx >= 0) coll[idx] = { ...coll[idx], ...data };
    }
    showToast('REŽIM UČNĚ: Změny se ukládají pouze dočasně.', 'success');
    return;
  }
  return updateDoc(ref, data);
}

export async function safeDeleteDoc(ref: DocumentReference): Promise<void> {
  if (isSandboxMode()) {
    const collPath = ref.parent.path;
    const docId = ref.id;
    const coll = _memoryStore[collPath];
    if (coll) {
      const idx = coll.findIndex((d) => d._id === docId);
      if (idx >= 0) coll.splice(idx, 1);
    }
    showToast('REŽIM UČNĚ: Změny se ukládají pouze dočasně.', 'success');
    return;
  }
  return deleteDoc(ref);
}

// ═══════════════════════════════════════════════════════
// MOCK DATA (auto-populated in sandbox)
// ═══════════════════════════════════════════════════════

export const SANDBOX_MOCK_TASKS = [
  {
    _id: 'mock-task-1',
    title: 'Výměna ložisek — Extrudér E1',
    description: 'Vibrace při 1200 RPM, ložiska hlučí.',
    status: 'in_progress',
    priority: 'P1',
    buildingId: 'D',
    assignedTo: 'sandbox-user',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-task-2',
    title: 'Kalibrace váhy — Balička B3',
    description: 'Odchylka +15g na 500g balení.',
    status: 'planned',
    priority: 'P2',
    buildingId: 'D',
    assignedTo: '',
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-task-3',
    title: 'Čištění sil po směně',
    description: 'Standardní sanitace sil S1-S3 po noční směně.',
    status: 'backlog',
    priority: 'P3',
    buildingId: 'L',
    assignedTo: '',
    createdAt: new Date().toISOString(),
  },
];

export const SANDBOX_MOCK_BATCHES = [
  {
    _id: 'mock-batch-1',
    machineId: 'E1',
    machineName: 'Extrudér E1',
    product: 'Kukuřičné křupky 80g',
    targetKg: 500,
    producedKg: 320,
    status: 'running',
    startedAt: new Date().toISOString(),
  },
  {
    _id: 'mock-batch-2',
    machineId: 'E2',
    machineName: 'Extrudér E2',
    product: 'Arašídové tyčinky 100g',
    targetKg: 300,
    producedKg: 0,
    status: 'planned',
    startedAt: '',
  },
];

export const SANDBOX_MOCK_RECEIPTS = [
  {
    _id: 'mock-receipt-1',
    materialName: 'Kukuřičná mouka — 25kg',
    supplier: 'AgriCorn s.r.o.',
    quantity: 40,
    unit: 'pytel',
    receivedAt: new Date().toISOString(),
    receivedByName: 'Učeň (Demo)',
    status: 'received',
  },
];

// Initialize mock data into memory store
export function initSandboxMockData() {
  _memoryStore['tasks'] = [...SANDBOX_MOCK_TASKS];
  _memoryStore['extrusion_batches'] = [...SANDBOX_MOCK_BATCHES];
  _memoryStore['warehouse_receipts'] = [...SANDBOX_MOCK_RECEIPTS];
}

// Mock dashboard stats for sandbox mode
export const SANDBOX_STATS = {
  openTasks: 3,
  criticalTasks: 1,
  urgentTasks: 1,
  newReports: 1,
  totalAssets: 12,
  operationalAssets: 9,
  maintenanceAssets: 2,
  breakdownAssets: 1,
  upcomingRevisions: 2,
  inProgress: 1,
  loading: false,
};
