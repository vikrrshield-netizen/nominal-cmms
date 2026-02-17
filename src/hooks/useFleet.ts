// src/hooks/useFleet.ts
// NOMINAL CMMS — Vozový park hook (Firestore realtime)

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type VehicleType = 'tractor' | 'forklift' | 'mower' | 'loader' | 'car';
export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'broken';

export interface ServiceRecord {
  date: Timestamp;
  type: string;
  mth?: number;
  description: string;
  cost: number;
  performedBy: string;
}

export interface FleetVehicle {
  id: string;
  assetId?: string;
  name: string;
  type: VehicleType;
  status: VehicleStatus;
  assignedUserId?: string | null;
  assignedUserName: string;
  keysLocation?: string;
  currentMth?: number | null;
  currentKm?: number | null;
  fuelLevel?: number | null;
  batteryLevel?: number | null;
  nextServiceMth?: number | null;
  nextServiceAt?: Timestamp | null;
  serviceHistory: ServiceRecord[];
  stkExpiry?: Timestamp | null;
  insuranceExpiry?: Timestamp | null;
  licensePlate?: string | null;
  isDeleted: boolean;
  updatedAt: Timestamp;
}

export const TYPE_CONFIG: Record<VehicleType, { label: string; icon: string }> = {
  tractor: { label: 'Traktor', icon: '🚜' },
  forklift: { label: 'VZV', icon: '🏗️' },
  mower: { label: 'Sekačka', icon: '🌿' },
  loader: { label: 'Nakladač', icon: '🦺' },
  car: { label: 'Osobní', icon: '🚗' },
};

export const STATUS_CONFIG: Record<VehicleStatus, { label: string; color: string; bgColor: string }> = {
  available: { label: 'Volný', color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
  in_use: { label: 'V provozu', color: 'text-blue-600', bgColor: 'bg-blue-500' },
  maintenance: { label: 'Servis', color: 'text-amber-600', bgColor: 'bg-amber-500' },
  broken: { label: 'Porucha', color: 'text-red-600', bgColor: 'bg-red-500' },
};

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useFleet() {
  const { user } = useAuthContext();
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Realtime listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'fleet'),
      (snap) => {
        setVehicles(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as FleetVehicle))
            .filter((v) => !v.isDeleted)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useFleet]', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Aktualizovat Mth/Km
  const updateCounter = useCallback(
    async (vehicleId: string, field: 'currentMth' | 'currentKm', value: number) => {
      await updateDoc(doc(db, 'fleet', vehicleId), {
        [field]: value,
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  // Změnit status
  const updateStatus = useCallback(
    async (vehicleId: string, status: VehicleStatus) => {
      const updates: Record<string, any> = {
        status,
        updatedAt: serverTimestamp(),
      };
      if (status === 'in_use' && user) {
        updates.assignedUserId = user.uid;
        updates.assignedUserName = user.displayName;
      }
      if (status === 'available') {
        updates.assignedUserId = null;
        updates.assignedUserName = 'Pool (sdílený)';
      }
      await updateDoc(doc(db, 'fleet', vehicleId), updates);
    },
    [user]
  );

  // Zapsat palivo/baterii
  const updateFuel = useCallback(
    async (vehicleId: string, level: number) => {
      await updateDoc(doc(db, 'fleet', vehicleId), {
        fuelLevel: level,
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  // Stats
  const stats = {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === 'available').length,
    inUse: vehicles.filter((v) => v.status === 'in_use').length,
    issues: vehicles.filter((v) => ['maintenance', 'broken'].includes(v.status)).length,
  };

  // Blížící se STK
  const stkWarnings = vehicles.filter((v) => {
    if (!v.stkExpiry) return false;
    const expiry = v.stkExpiry.toDate();
    const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft <= 60 && daysLeft > 0;
  });

  // Blížící se servis (Mth)
  const serviceWarnings = vehicles.filter((v) => {
    if (!v.currentMth || !v.nextServiceMth) return false;
    return v.nextServiceMth - v.currentMth <= 200;
  });

  return {
    vehicles,
    loading,
    error,
    stats,
    stkWarnings,
    serviceWarnings,
    updateCounter,
    updateStatus,
    updateFuel,
  };
}
