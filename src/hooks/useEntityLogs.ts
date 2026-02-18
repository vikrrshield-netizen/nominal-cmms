// src/hooks/useEntityLogs.ts
// VIKRR — Asset Shield — Entity logs hook (realtime, audit-proof)

import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type LogType = 'status_change' | 'maintenance' | 'inspection' | 'handover' | 'note' | 'photo' | 'document';

export interface EntityLog {
  id: string;
  entityId: string;
  userId: string;
  userInitials: string;
  type: LogType;
  text: string;
  data?: Record<string, any>;
  attachments?: string[];
  createdAt: any; // Timestamp
  isDeleted: boolean;
}

const COLLECTION = 'entity_logs';

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useEntityLogs(entityId: string | null) {
  const { user } = useAuthContext();
  const [logs, setLogs] = useState<EntityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Realtime listener
  useEffect(() => {
    if (!entityId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION),
      where('entityId', '==', entityId),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EntityLog)));
      setLoading(false);
    }, (err) => {
      console.error('[useEntityLogs]', err);
      setLoading(false);
    });

    return () => unsub();
  }, [entityId]);

  // Přidat log — automaticky přidá userId, userInitials, serverTimestamp
  const addLog = useCallback(
    async (type: LogType, text: string, data?: Record<string, any>) => {
      if (!entityId || !user) return;

      const initials = (user.displayName || '')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      await addDoc(collection(db, COLLECTION), {
        entityId,
        userId: user.id,
        userInitials: initials || '??',
        type,
        text,
        data: data || {},
        attachments: [],
        createdAt: serverTimestamp(), // NEUPRAVITELNÝ — serverTimestamp
        isDeleted: false,
      });
    },
    [entityId, user]
  );

  return { logs, loading, addLog };
}
