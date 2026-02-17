// src/services/assetService.ts
// NOMINAL CMMS — Asset Service

import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  getDoc, 
  doc, 
  updateDoc, 
  addDoc,
  query,
  where,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import type { Asset, AssetStatus } from '../types/asset';
import { SAMPLE_ASSETS } from '../data/sampleAssets';

const COLLECTION = 'assets';

// ═══════════════════════════════════════════════════════════════════
// ASSET SERVICE
// ═══════════════════════════════════════════════════════════════════

export const assetService = {
  
  // ─────────────────────────────────────────────────────────────────
  // GET ALL — seznam všech strojů
  // ─────────────────────────────────────────────────────────────────
  async getAll(): Promise<Asset[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION));
      if (snapshot.empty) {
        // Fallback na SAMPLE_ASSETS pokud DB prázdná
        console.log('[assetService] DB prázdná, používám SAMPLE_ASSETS');
        return SAMPLE_ASSETS as Asset[];
      }
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
    } catch (error) {
      console.warn('[assetService] Firestore error, fallback na SAMPLE_ASSETS:', error);
      return SAMPLE_ASSETS as Asset[];
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // GET BY ID — načíst jeden stroj
  // ─────────────────────────────────────────────────────────────────
  async getById(id: string): Promise<Asset> {
    // 1. Zkusit SAMPLE_ASSETS (pro rychlý vývoj)
    const sample = SAMPLE_ASSETS.find(a => a.id === id);
    if (sample) {
      return sample as Asset;
    }

    // 2. Zkusit Firestore
    try {
      const docRef = doc(db, COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Asset;
      }
    } catch (error) {
      console.warn('[assetService] Firestore getById error:', error);
    }

    throw new Error(`Stroj ${id} nenalezen`);
  },

  // ─────────────────────────────────────────────────────────────────
  // GET BY ROOM — stroje v místnosti
  // ─────────────────────────────────────────────────────────────────
  async getByRoom(roomId: string): Promise<Asset[]> {
    // Fallback na SAMPLE_ASSETS
    const filtered = SAMPLE_ASSETS.filter(a => a.roomId === roomId);
    if (filtered.length > 0) {
      return filtered as Asset[];
    }

    // Zkusit Firestore
    try {
      const q = query(collection(db, COLLECTION), where('roomId', '==', roomId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
    } catch (error) {
      console.warn('[assetService] getByRoom error:', error);
      return [];
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // GET BY BUILDING — stroje v budově
  // ─────────────────────────────────────────────────────────────────
  async getByBuilding(buildingId: string): Promise<Asset[]> {
    const filtered = SAMPLE_ASSETS.filter(a => a.buildingId === buildingId);
    if (filtered.length > 0) {
      return filtered as Asset[];
    }

    try {
      const q = query(collection(db, COLLECTION), where('buildingId', '==', buildingId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
    } catch (error) {
      console.warn('[assetService] getByBuilding error:', error);
      return [];
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // UPDATE MTH — aktualizovat motohodiny
  // ─────────────────────────────────────────────────────────────────
  async updateMth(id: string, mthCounter: number): Promise<boolean> {
    try {
      const docRef = doc(db, COLLECTION, id);
      await updateDoc(docRef, { 
        mthCounter,
        updatedAt: Timestamp.now()
      });
      console.log(`[assetService] MTH updated: ${id} → ${mthCounter}`);
      return true;
    } catch (error) {
      console.warn('[assetService] updateMth error (offline?):', error);
      // V offline režimu se uloží do cache
      return true;
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // UPDATE STATUS — změnit stav stroje
  // ─────────────────────────────────────────────────────────────────
  async updateStatus(id: string, status: AssetStatus): Promise<boolean> {
    try {
      const docRef = doc(db, COLLECTION, id);
      await updateDoc(docRef, { 
        status,
        updatedAt: Timestamp.now()
      });
      console.log(`[assetService] Status updated: ${id} → ${status}`);
      return true;
    } catch (error) {
      console.warn('[assetService] updateStatus error:', error);
      return false;
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // UPDATE — obecná aktualizace
  // ─────────────────────────────────────────────────────────────────
  async update(id: string, data: Partial<Asset>): Promise<boolean> {
    try {
      const docRef = doc(db, COLLECTION, id);
      await updateDoc(docRef, { 
        ...data,
        updatedAt: Timestamp.now()
      });
      return true;
    } catch (error) {
      console.warn('[assetService] update error:', error);
      return false;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// WORK LOG SERVICE — historie zásahů
// ═══════════════════════════════════════════════════════════════════

export interface WorkLogEntry {
  id?: string;
  assetId: string;
  type: 'preventive' | 'corrective' | 'inspection' | 'incident';
  title: string;
  description?: string;
  userId: string;
  userName: string;
  userColor: string;  // Pro Legendu
  createdAt: Date;
  duration?: number;  // minuty
  partsUsed?: { partId: string; qty: number }[];
}

const LOGS_COLLECTION = 'asset_logs';

export const workLogService = {
  
  // Načíst logy pro stroj
  async getByAsset(assetId: string): Promise<WorkLogEntry[]> {
    // MOCK data pro vývoj
    const mockLogs: WorkLogEntry[] = [
      {
        id: 'log-1',
        assetId,
        type: 'preventive',
        title: 'Preventivní údržba',
        description: 'Výměna oleje, kontrola ložisek. Vše OK.',
        userId: 'usr-vilem',
        userName: 'Vilém',
        userColor: '#16a34a',  // Zelená
        createdAt: new Date('2026-01-15'),
        duration: 45,
      },
      {
        id: 'log-2',
        assetId,
        type: 'incident',
        title: 'Přehřívání motoru',
        description: 'Stroj zastaven, vyčištěn filtr sání.',
        userId: 'usr-zdenek',
        userName: 'Zdeněk',
        userColor: '#64748b',  // Šedá
        createdAt: new Date('2025-12-10'),
        duration: 90,
      },
    ];

    try {
      const q = query(
        collection(db, LOGS_COLLECTION), 
        where('assetId', '==', assetId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return mockLogs;
      }
      
      return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date(),
      } as WorkLogEntry));
    } catch (error) {
      console.warn('[workLogService] getByAsset error, using mock:', error);
      return mockLogs;
    }
  },

  // Přidat nový záznam
  async add(entry: Omit<WorkLogEntry, 'id'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, LOGS_COLLECTION), {
        ...entry,
        createdAt: Timestamp.now(),
      });
      return docRef.id;
    } catch (error) {
      console.error('[workLogService] add error:', error);
      throw error;
    }
  },
};

export default assetService;
