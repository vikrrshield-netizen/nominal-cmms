// src/hooks/useRevisions.ts
// NOMINAL CMMS — Revize hook (Firestore realtime)

import { useState, useEffect, useCallback } from 'react';
import {
  collection, onSnapshot, doc, updateDoc,
  serverTimestamp, Timestamp, addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type RevisionType = 'electrical' | 'gas' | 'pressure' | 'lifting' | 'fire' | 'other';
export type RevisionStatus = 'valid' | 'expiring' | 'expired';

export interface Revision {
  id: string;
  title: string;
  type: RevisionType;
  assetId?: string | null;
  assetName: string;
  buildingId: string;
  areaName: string;
  intervalMonths: number;
  lastRevisionDate: Timestamp;
  nextRevisionDate: Timestamp;
  revisionCompany: string;
  technicianName: string;
  certificateNumber: string;
  notes?: string;
  status: RevisionStatus; // ze seedu — přepočítáme dynamicky
  isDeleted: boolean;
  updatedAt: Timestamp;
}

export const TYPE_CONFIG: Record<RevisionType, { label: string; icon: string; color: string }> = {
  electrical: { label: 'Elektro', icon: '⚡', color: 'bg-blue-500' },
  gas: { label: 'Plyn', icon: '🔥', color: 'bg-orange-500' },
  pressure: { label: 'Tlakové nádoby', icon: '🔵', color: 'bg-cyan-500' },
  lifting: { label: 'Zvedací zařízení', icon: '🏗️', color: 'bg-purple-500' },
  fire: { label: 'Požární', icon: '🧯', color: 'bg-red-500' },
  other: { label: 'Ostatní', icon: '📋', color: 'bg-gray-500' },
};

export const STATUS_CONFIG: Record<RevisionStatus, { label: string; color: string; bgColor: string }> = {
  valid: { label: 'Platná', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  expiring: { label: 'Končí brzy', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  expired: { label: 'Prošlá', color: 'text-red-600', bgColor: 'bg-red-50' },
};

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const EXPIRING_THRESHOLD_DAYS = 30;

export function computeRevisionStatus(nextDate: Timestamp): RevisionStatus {
  const next = nextDate.toDate();
  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return 'expired';
  if (diffDays <= EXPIRING_THRESHOLD_DAYS) return 'expiring';
  return 'valid';
}

export function daysUntilRevision(nextDate: Timestamp): number {
  const next = nextDate.toDate();
  return Math.round((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatRevisionDate(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('cs-CZ');
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useRevisions(filterAssetId?: string) {
  const { user } = useAuthContext();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Realtime listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'revisions'),
      (snap) => {
        let items = snap.docs
          .map((d) => {
            const data = d.data();
            // Dynamický přepočet statusu
            const computedStatus = data.nextRevisionDate
              ? computeRevisionStatus(data.nextRevisionDate)
              : 'expired';
            return {
              id: d.id,
              ...data,
              status: computedStatus,
            } as Revision;
          })
          .filter((r) => !r.isDeleted);

        // Filtr podle assetId (pro AssetCardPage)
        if (filterAssetId) {
          items = items.filter((r) => r.assetId === filterAssetId);
        }

        // Seřadit: expired → expiring → valid, pak podle data
        items.sort((a, b) => {
          const order: Record<RevisionStatus, number> = { expired: 0, expiring: 1, valid: 2 };
          const diff = order[a.status] - order[b.status];
          if (diff !== 0) return diff;
          return daysUntilRevision(a.nextRevisionDate) - daysUntilRevision(b.nextRevisionDate);
        });

        setRevisions(items);
        setLoading(false);
      },
      (err) => {
        console.error('[useRevisions]', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [filterAssetId]);

  // Zapsat novou revizi (prodloužit platnost)
  const logRevision = useCallback(
    async (
      revisionId: string,
      data: {
        date: Date;
        certificateNumber: string;
        technicianName?: string;
        notes?: string;
      }
    ) => {
      const rev = revisions.find((r) => r.id === revisionId);
      if (!rev) throw new Error('Revize nenalezena');

      // Vypočítat příští datum
      const nextDate = new Date(data.date);
      nextDate.setMonth(nextDate.getMonth() + rev.intervalMonths);

      // Update revize
      await updateDoc(doc(db, 'revisions', revisionId), {
        lastRevisionDate: Timestamp.fromDate(data.date),
        nextRevisionDate: Timestamp.fromDate(nextDate),
        certificateNumber: data.certificateNumber,
        ...(data.technicianName && { technicianName: data.technicianName }),
        ...(data.notes && { notes: data.notes }),
        updatedAt: serverTimestamp(),
      });

      // Audit log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'revision.logged',
        targetCollection: 'revisions',
        targetId: revisionId,
        performedBy: user?.uid || 'unknown',
        performedByName: user?.displayName || 'unknown',
        details: {
          title: rev.title,
          date: data.date.toISOString(),
          certificateNumber: data.certificateNumber,
          nextDate: nextDate.toISOString(),
        },
        timestamp: serverTimestamp(),
      });
    },
    [revisions, user]
  );

  // Stats
  const stats = {
    total: revisions.length,
    valid: revisions.filter((r) => r.status === 'valid').length,
    expiring: revisions.filter((r) => r.status === 'expiring').length,
    expired: revisions.filter((r) => r.status === 'expired').length,
  };

  return {
    revisions,
    loading,
    error,
    stats,
    logRevision,
    daysUntilRevision,
    formatRevisionDate,
  };
}
