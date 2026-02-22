// src/services/assetService.ts
// VIKRR Asset Shield — Asset Service
// v2 — tenant-aware, rekurzivní strom, parentId model
import { db } from '../lib/firebase';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { Asset, AssetStatus } from '../types/asset';
// ── Helpers ──────────────────────────────────────────────────────────
const tenantCol = (tenantId: string) =>
  collection(db, 'tenants', tenantId, 'assets');
const tenantDoc = (tenantId: string, assetId: string) =>
  doc(db, 'tenants', tenantId, 'assets', assetId);
const toAsset = (d: any): Asset => ({
  id: d.id,
  ...d.data(),
  createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
  updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? d.data().updatedAt,
});
// ── Asset Service ─────────────────────────────────────────────────────
export const assetService = {
  // Všechny entity tenantu
  async getAll(tenantId: string): Promise<Asset[]> {
    const snapshot = await getDocs(tenantCol(tenantId));
    return snapshot.docs.map(toAsset);
  },
  // Přímé děti (strom)
  async getChildren(tenantId: string, parentId: string | null): Promise<Asset[]> {
    const q = parentId === null
      ? query(tenantCol(tenantId), where('parentId', '==', null))
      : query(tenantCol(tenantId), where('parentId', '==', parentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(toAsset);
  },
  // Jeden asset
  async getById(tenantId: string, assetId: string): Promise<Asset> {
    const docSnap = await getDoc(tenantDoc(tenantId, assetId));
    if (!docSnap.exists()) throw new Error(`Asset ${assetId} nenalezen`);
    return toAsset(docSnap);
  },
  // Přidat nový asset
  async add(tenantId: string, data: Omit<Asset, 'id'>): Promise<string> {
    const docRef = await addDoc(tenantCol(tenantId), {
      ...data,
      tenantId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  },
  // Aktualizovat asset
  async update(tenantId: string, assetId: string, data: Partial<Asset>): Promise<void> {
    await updateDoc(tenantDoc(tenantId, assetId), {
      ...data,
      updatedAt: Timestamp.now(),
    });
  },
  // Smazat asset
  async delete(tenantId: string, assetId: string): Promise<void> {
    await deleteDoc(tenantDoc(tenantId, assetId));
  },
  // Zkratka — update status
  async updateStatus(tenantId: string, assetId: string, status: AssetStatus): Promise<void> {
    await assetService.update(tenantId, assetId, { status });
  },
};
export default assetService;
