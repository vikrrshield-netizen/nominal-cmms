// src/services/assetService.ts
// VIKRR Asset Shield - Asset Service
// Tenant-aware facade over the canonical top-level assets collection.
import { db } from '../lib/firebase';
import {
  collection,
  type DocumentData,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Asset, AssetStatus } from '../types/asset';

type NullableAssetFields =
  'code' | 'manufacturer' | 'model' | 'serialNumber' | 'year' | 'location';

type AssetUpdate = Partial<Omit<Asset, NullableAssetFields>> & {
  code?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  year?: number | null;
  location?: string | null;
};

const assetsCol = () => collection(db, 'assets');
const assetDoc = (assetId: string) => doc(db, 'assets', assetId);

// Firestore neumí uložit `undefined` ani vnořené v polích/objektech (např. events[].nextDate).
// Hloubkově odstraní undefined; Timestamp/Date a jiné instance tříd nechá beze změny.
const deepStrip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(deepStrip);
  if (
    value && typeof value === 'object'
    && !(value instanceof Timestamp) && !(value instanceof Date)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, deepStrip(v)]),
    );
  }
  return value;
};

const withoutUndefined = <T extends Record<string, unknown>>(data: T): Partial<T> =>
  deepStrip(data) as Partial<T>;

const toIso = (value: unknown) => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return value;
};

const toAsset = (snapshot: QueryDocumentSnapshot<DocumentData>): Asset => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  } as Asset;
};

const belongsToTenant = (asset: Asset, tenantId: string) =>
  asset.tenantId === tenantId || !asset.tenantId;

export const assetService = {
  async getAll(tenantId: string): Promise<Asset[]> {
    const snapshot = await getDocs(assetsCol());
    return snapshot.docs
      .map(toAsset)
      .filter((asset) => belongsToTenant(asset, tenantId) && !asset.isDeleted);
  },

  async getChildren(tenantId: string, parentId: string | null): Promise<Asset[]> {
    const assets = await assetService.getAll(tenantId);
    return assets.filter((asset) => (asset.parentId ?? null) === parentId);
  },

  async getById(tenantId: string, assetId: string): Promise<Asset> {
    const snapshot = await getDoc(assetDoc(assetId));
    if (!snapshot.exists()) throw new Error(`Asset ${assetId} nenalezen`);

    const data = snapshot.data();
    const asset = {
      id: snapshot.id,
      ...data,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    } as Asset;

    if (!belongsToTenant(asset, tenantId)) throw new Error(`Asset ${assetId} nenalezen`);
    return asset;
  },

  async add(tenantId: string, data: Omit<Asset, 'id'>): Promise<string> {
    const docRef = await addDoc(assetsCol(), withoutUndefined({
      ...data,
      tenantId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }));
    return docRef.id;
  },

  async update(tenantId: string, assetId: string, data: AssetUpdate): Promise<void> {
    await updateDoc(assetDoc(assetId), withoutUndefined({
      ...data,
      tenantId,
      updatedAt: Timestamp.now(),
    }));
  },

  async delete(tenantId: string, assetId: string): Promise<void> {
    await updateDoc(assetDoc(assetId), {
      tenantId,
      isDeleted: true,
      updatedAt: Timestamp.now(),
    });
  },

  async updateStatus(tenantId: string, assetId: string, status: AssetStatus): Promise<void> {
    await assetService.update(tenantId, assetId, { status });
  },
};

export default assetService;
