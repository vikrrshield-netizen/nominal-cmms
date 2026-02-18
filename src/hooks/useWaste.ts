// src/hooks/useWaste.ts
// VIKRR — Asset Shield — Odpadové hospodářství hook (Firestore realtime)

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type WasteType = 'mixed' | 'plastic' | 'paper' | 'metal' | 'hazardous' | 'bio' | 'glass';
export type FillLevel = 'green' | 'yellow' | 'red';

export interface WasteSchedule {
  dayOfWeek: number; // 0=na objednávku, 1=Po, 2=Út, 3=St, 4=Čt, 5=Pá, 6=So
  company: string;
  notifyDayBefore: number;
  notifyTime: string;
}

export interface WasteContainer {
  id: string;
  type: WasteType;
  name: string;
  location: string;
  fillLevel: FillLevel;
  lastEmptiedAt?: Timestamp;
  schedule: WasteSchedule;
  notifyRoleIds: string[];
  isDeleted: boolean;
  updatedAt: Timestamp;
}

export const WASTE_CONFIG: Record<WasteType, { label: string; icon: string; color: string }> = {
  mixed: { label: 'Směsný', icon: '🗑️', color: 'bg-gray-500' },
  plastic: { label: 'Plast', icon: '♻️', color: 'bg-yellow-500' },
  paper: { label: 'Papír', icon: '📄', color: 'bg-blue-500' },
  glass: { label: 'Sklo', icon: '🫙', color: 'bg-green-500' },
  metal: { label: 'Kov', icon: '🔩', color: 'bg-gray-600' },
  bio: { label: 'Bio', icon: '🌿', color: 'bg-amber-600' },
  hazardous: { label: 'Nebezpečný', icon: '☢️', color: 'bg-red-600' },
};

export const FILL_CONFIG: Record<FillLevel, { label: string; color: string; bgColor: string; percent: number }> = {
  green: { label: 'OK', color: 'text-emerald-600', bgColor: 'bg-emerald-100', percent: 30 },
  yellow: { label: 'Pozor', color: 'text-amber-600', bgColor: 'bg-amber-100', percent: 65 },
  red: { label: 'Plný', color: 'text-red-600', bgColor: 'bg-red-100', percent: 95 },
};

const DAY_NAMES = ['Na obj.', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useWaste() {
  const [containers, setContainers] = useState<WasteContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Realtime listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'waste'),
      (snap) => {
        setContainers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as WasteContainer))
            .filter((c) => !c.isDeleted)
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useWaste]', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Aktualizovat stav naplnění
  const updateFillLevel = useCallback(
    async (containerId: string, level: FillLevel) => {
      await updateDoc(doc(db, 'waste', containerId), {
        fillLevel: level,
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  // Označit jako vyvezený
  const markEmptied = useCallback(
    async (containerId: string) => {
      await updateDoc(doc(db, 'waste', containerId), {
        fillLevel: 'green',
        lastEmptiedAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });
    },
    []
  );

  // Stats
  const stats = {
    total: containers.length,
    green: containers.filter((c) => c.fillLevel === 'green').length,
    yellow: containers.filter((c) => c.fillLevel === 'yellow').length,
    red: containers.filter((c) => c.fillLevel === 'red').length,
  };

  // Kontrola středeční notifikace (komunál = čtvrtek)
  const shouldNotify = (() => {
    const now = new Date();
    return containers.some((c) => {
      if (!c.schedule) return false;
      const pickupDay = c.schedule.dayOfWeek;
      const notifyDayBefore = c.schedule.notifyDayBefore || 1;
      const today = now.getDay() === 0 ? 7 : now.getDay(); // 1=Po, 7=Ne
      const notifyDay = pickupDay - notifyDayBefore;
      return today === notifyDay && now.getHours() >= 15;
    });
  })();

  // Příští svoz
  const getNextPickup = useCallback(() => {
    const today = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const upcoming = containers
      .filter((c) => c.schedule && c.schedule.dayOfWeek > 0)
      .sort((a, b) => {
        const dayA = a.schedule.dayOfWeek >= today ? a.schedule.dayOfWeek : a.schedule.dayOfWeek + 7;
        const dayB = b.schedule.dayOfWeek >= today ? b.schedule.dayOfWeek : b.schedule.dayOfWeek + 7;
        return dayA - dayB;
      });
    return upcoming[0] || null;
  }, [containers]);

  // Formátování dne
  const formatDay = (dayOfWeek: number) => DAY_NAMES[dayOfWeek] || '?';

  return {
    containers,
    loading,
    error,
    stats,
    shouldNotify,
    getNextPickup,
    updateFillLevel,
    markEmptied,
    formatDay,
  };
}
