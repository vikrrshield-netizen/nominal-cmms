// src/hooks/usePestControl.ts
// VIKRR — Asset Shield — Pest control (Hmyzolapače) hook — pest_logs sub-collection

import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, Timestamp, limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

export interface PestLog {
  id: string;
  count: number;
  photoUrl?: string;
  isCritical: boolean;
  note?: string;
  loggedBy: string;
  loggedAt: Timestamp;
}

const CRITICAL_THRESHOLD = 10;

export function usePestControl(assetId: string | null) {
  const [logs, setLogs] = useState<PestLog[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthContext();

  // Realtime listener for pest_logs sub-collection
  useEffect(() => {
    if (!assetId) { setLogs([]); return; }
    setLoading(true);

    const q = query(
      collection(db, 'assets', assetId, 'pest_logs'),
      orderBy('loggedAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PestLog)));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [assetId]);

  // Add a new pest count log
  const addPestLog = useCallback(
    async (count: number, photoFile?: File, note?: string) => {
      if (!assetId) return;

      let photoUrl: string | undefined;

      // Upload photo to Firebase Storage if provided
      if (photoFile) {
        const storageRef = ref(storage, `pest_photos/${assetId}/${Date.now()}_${photoFile.name}`);
        const snap = await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(snap.ref);
      }

      const isCritical = count > CRITICAL_THRESHOLD;

      await addDoc(collection(db, 'assets', assetId, 'pest_logs'), {
        count,
        photoUrl: photoUrl || null,
        isCritical,
        note: note || '',
        loggedBy: user?.displayName || 'Neznámý',
        loggedAt: serverTimestamp(),
      });

      return { isCritical };
    },
    [assetId, user]
  );

  // Latest log
  const latestLog = logs.length > 0 ? logs[0] : null;
  const isCritical = latestLog?.isCritical || false;

  return {
    logs,
    loading,
    latestLog,
    isCritical,
    addPestLog,
    CRITICAL_THRESHOLD,
  };
}
