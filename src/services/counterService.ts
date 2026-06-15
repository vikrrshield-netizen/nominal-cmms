import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function nextCounterValue(counterId: string): Promise<number> {
  const ref = doc(db, 'counters', counterId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? Number(snapshot.data().value || 0) : 0;
    const next = current + 1;

    transaction.set(ref, {
      value: next,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return next;
  });
}

export function formatCounter(value: number, width = 3): string {
  return String(value).padStart(width, '0');
}
