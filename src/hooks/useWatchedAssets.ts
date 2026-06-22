// src/hooks/useWatchedAssets.ts
// VIKRR — Asset Shield — „Moje sledování" strojů. Seznam ID sledovaných assetů.
// Ukládá se do localStorage (jako stávající dash:watchOrder) → žádná Firestore změna ani pravidla.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'vikrr:watchedAssets';
const EVT = 'vikrr-watched-changed';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useWatchedAssets() {
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    const handler = () => setIds(read());
    window.addEventListener(EVT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const toggle = useCallback((assetId: string) => {
    const cur = read();
    const next = cur.includes(assetId) ? cur.filter((x) => x !== assetId) : [...cur, assetId];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
  }, []);

  const isWatched = useCallback((assetId: string) => ids.includes(assetId), [ids]);

  return { watchedIds: ids, toggle, isWatched };
}
