// src/hooks/useLouparna.ts
// VIKRR — Asset Shield — Loupárna hook (sila + výroba + plevy + stanice)

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc, addDoc,
  serverTimestamp, Timestamp, query, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export interface Silo {
  id: string;
  name: string;
  capacityTons: number;
  currentLevel: number;       // 0-100 %
  material: string;
  materialCode: string;
  temperature?: number;
  lastFilledAt?: Timestamp | null;
  lastCleanedAt?: Timestamp | null;
  buildingId: string;
  notes?: string | null;
  updatedAt: Timestamp;
}

export type BatchStatus = 'running' | 'completed' | 'cancelled';

export interface ProductionBatch {
  id: string;
  batchCode: string;
  material: string;
  inputSiloId: string;
  inputKg: number;
  outputKg: number | null;
  outputKs: number | null;
  wasteKg: number | null;
  yieldPercent: number | null;
  status: BatchStatus;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  operatorName: string;
  notes?: string | null;
  updatedAt: Timestamp;
}

export type WasteTicketStatus = 'pending' | 'in_progress' | 'completed';

export interface WasteTicket {
  id: string;
  type: 'plevy';
  batchId: string;
  batchCode: string;
  weightKg: number;
  status: WasteTicketStatus;
  requestedBy: string;
  requestedAt: Timestamp;
  pickedUpBy?: string | null;
  pickedUpAt?: Timestamp | null;
  vehicleUsed?: string | null;
  destinationNote?: string | null;
  buildingId: string;
  updatedAt: Timestamp;
}

export type MachineStatus = 'running' | 'stopped' | 'cleaning' | 'maintenance';

export interface LouparnaMachine {
  id: string;
  name: string;
  status: MachineStatus;
  currentBatchId?: string | null;
  currentBatchCode?: string | null;
  lastMaintenanceAt?: Timestamp | null;
  buildingId: string;
  notes?: string | null;
  updatedAt: Timestamp;
}

export const SILO_LEVEL_CONFIG = {
  high: { label: 'Plné', color: 'bg-emerald-500', threshold: 70 },
  medium: { label: 'Střední', color: 'bg-amber-500', threshold: 30 },
  low: { label: 'Nízký', color: 'bg-red-500', threshold: 0 },
};

export const MACHINE_STATUS_CONFIG: Record<MachineStatus, { label: string; color: string }> = {
  running: { label: 'V provozu', color: 'bg-emerald-500' },
  stopped: { label: 'Zastaveno', color: 'bg-slate-500' },
  cleaning: { label: 'Čištění', color: 'bg-blue-500' },
  maintenance: { label: 'Údržba', color: 'bg-amber-500' },
};

export function getSiloLevelColor(level: number): string {
  if (level >= 70) return 'bg-emerald-500';
  if (level >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

export function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('cs-CZ');
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useLouparna() {
  const { user } = useAuthContext();

  const [silos, setSilos] = useState<Silo[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [wasteTickets, setWasteTickets] = useState<WasteTicket[]>([]);
  const [machines, setMachines] = useState<LouparnaMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─────────────────────────────────────────
  // REALTIME LISTENERS (4 kolekce)
  // ─────────────────────────────────────────
  useEffect(() => {
    let loaded = 0;
    const checkLoaded = () => { loaded++; if (loaded >= 4) setLoading(false); };

    const unsub1 = onSnapshot(
      collection(db, 'louparna_silos'),
      (snap) => {
        setSilos(snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Silo))
          .filter((s) => !(s as any).isDeleted)
          .sort((a, b) => a.name.localeCompare(b.name))
        );
        checkLoaded();
      },
      (err) => { setError(err.message); checkLoaded(); }
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'louparna_production'), orderBy('startedAt', 'desc'), limit(20)),
      (snap) => {
        setBatches(snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ProductionBatch))
          .filter((b) => !(b as any).isDeleted)
        );
        checkLoaded();
      },
      (err) => { setError(err.message); checkLoaded(); }
    );

    const unsub3 = onSnapshot(
      query(collection(db, 'louparna_waste'), orderBy('requestedAt', 'desc'), limit(20)),
      (snap) => {
        setWasteTickets(snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WasteTicket))
          .filter((w) => !(w as any).isDeleted)
        );
        checkLoaded();
      },
      (err) => { setError(err.message); checkLoaded(); }
    );

    const unsub4 = onSnapshot(
      collection(db, 'louparna_machines'),
      (snap) => {
        setMachines(snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LouparnaMachine))
          .filter((m) => !(m as any).isDeleted)
        );
        checkLoaded();
      },
      (err) => { setError(err.message); checkLoaded(); }
    );

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  // ─────────────────────────────────────────
  // SILO ACTIONS
  // ─────────────────────────────────────────
  const updateSilo = useCallback(
    async (siloId: string, data: Partial<Pick<Silo, 'currentLevel' | 'material' | 'materialCode' | 'temperature' | 'notes'>>) => {
      await updateDoc(doc(db, 'louparna_silos', siloId), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  const markSiloFilled = useCallback(
    async (siloId: string, material: string, materialCode: string) => {
      await updateDoc(doc(db, 'louparna_silos', siloId), {
        currentLevel: 100,
        material,
        materialCode,
        lastFilledAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  const markSiloCleaned = useCallback(
    async (siloId: string) => {
      await updateDoc(doc(db, 'louparna_silos', siloId), {
        lastCleanedAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  // ─────────────────────────────────────────
  // PRODUCTION ACTIONS
  // ─────────────────────────────────────────
  const startBatch = useCallback(
    async (data: {
      material: string;
      inputSiloId: string;
      inputKg: number;
      batchCode: string;
    }) => {
      const ref = await addDoc(collection(db, 'louparna_production'), {
        ...data,
        outputKg: null,
        outputKs: null,
        wasteKg: null,
        yieldPercent: null,
        status: 'running',
        startedAt: Timestamp.now(),
        completedAt: null,
        operatorName: user?.displayName || 'Neznámý',
        notes: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });

      // Update machine
      const runningMachine = machines.find((m) => m.id === 'louparna_linka');
      if (runningMachine) {
        await updateDoc(doc(db, 'louparna_machines', 'louparna_linka'), {
          status: 'running',
          currentBatchId: ref.id,
          currentBatchCode: data.batchCode,
          updatedAt: serverTimestamp(),
        });
      }

      return ref.id;
    },
    [user, machines]
  );

  const completeBatch = useCallback(
    async (batchId: string, data: {
      outputKg: number;
      outputKs: number;
      wasteKg: number;
    }) => {
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) throw new Error('Šarže nenalezena');

      const yieldPercent = Math.round((data.outputKg / batch.inputKg) * 100);

      await updateDoc(doc(db, 'louparna_production', batchId), {
        outputKg: data.outputKg,
        outputKs: data.outputKs,
        wasteKg: data.wasteKg,
        yieldPercent,
        status: 'completed',
        completedAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });

      // Auto-vytvořit waste ticket pro plevy
      if (data.wasteKg > 0) {
        await addDoc(collection(db, 'louparna_waste'), {
          type: 'plevy',
          batchId,
          batchCode: batch.batchCode,
          weightKg: data.wasteKg,
          status: 'pending',
          requestedBy: user?.displayName || 'Neznámý',
          requestedAt: Timestamp.now(),
          pickedUpBy: null,
          pickedUpAt: null,
          vehicleUsed: null,
          destinationNote: null,
          buildingId: 'L',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isDeleted: false,
        });
      }

      // Stop machine
      await updateDoc(doc(db, 'louparna_machines', 'louparna_linka'), {
        status: 'stopped',
        currentBatchId: null,
        currentBatchCode: null,
        updatedAt: serverTimestamp(),
      });
    },
    [batches, user]
  );

  // ─────────────────────────────────────────
  // WASTE (PLEVY) ACTIONS
  // ─────────────────────────────────────────
  const requestPlevyPickup = useCallback(
    async (batchId: string, weightKg: number, batchCode: string) => {
      await addDoc(collection(db, 'louparna_waste'), {
        type: 'plevy',
        batchId,
        batchCode,
        weightKg,
        status: 'pending',
        requestedBy: user?.displayName || 'Neznámý',
        requestedAt: Timestamp.now(),
        pickedUpBy: null,
        pickedUpAt: null,
        vehicleUsed: null,
        destinationNote: null,
        buildingId: 'L',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });
    },
    [user]
  );

  const confirmPlevyPickup = useCallback(
    async (ticketId: string, vehicleUsed: string, destinationNote?: string) => {
      await updateDoc(doc(db, 'louparna_waste', ticketId), {
        status: 'completed',
        pickedUpBy: user?.displayName || 'Neznámý',
        pickedUpAt: Timestamp.now(),
        vehicleUsed,
        ...(destinationNote && { destinationNote }),
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  // ─────────────────────────────────────────
  // MACHINE ACTIONS
  // ─────────────────────────────────────────
  const updateMachineStatus = useCallback(
    async (machineId: string, status: MachineStatus) => {
      const updates: Record<string, any> = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (status !== 'running') {
        updates.currentBatchId = null;
        updates.currentBatchCode = null;
      }
      await updateDoc(doc(db, 'louparna_machines', machineId), updates);
    },
    []
  );

  // ─────────────────────────────────────────
  // COMPUTED STATS
  // ─────────────────────────────────────────
  const currentBatch = batches.find((b) => b.status === 'running') || null;
  const completedBatches = batches.filter((b) => b.status === 'completed');
  const pendingWaste = wasteTickets.filter((w) => w.status === 'pending');

  const productionStats = {
    totalOutputKg: completedBatches.reduce((sum, b) => sum + (b.outputKg || 0), 0),
    totalWasteKg: completedBatches.reduce((sum, b) => sum + (b.wasteKg || 0), 0),
    avgYield: completedBatches.length > 0
      ? Math.round(completedBatches.reduce((sum, b) => sum + (b.yieldPercent || 0), 0) / completedBatches.length)
      : 0,
    batchCount: completedBatches.length,
    pendingWasteCount: pendingWaste.length,
    pendingWasteKg: pendingWaste.reduce((sum, w) => sum + w.weightKg, 0),
  };

  return {
    // Data
    silos,
    batches,
    wasteTickets,
    machines,
    loading,
    error,

    // Computed
    currentBatch,
    completedBatches,
    pendingWaste,
    productionStats,

    // Actions — Sila
    updateSilo,
    markSiloFilled,
    markSiloCleaned,

    // Actions — Výroba
    startBatch,
    completeBatch,

    // Actions — Plevy
    requestPlevyPickup,
    confirmPlevyPickup,

    // Actions — Stroje
    updateMachineStatus,

    // Helpers
    formatTs,
    getSiloLevelColor,
  };
}
