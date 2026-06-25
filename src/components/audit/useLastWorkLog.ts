// src/components/audit/useLastWorkLog.ts
// VIKRR — Asset Shield — Hook: poslední zápis práce (z Deníku / workLogs) pro dané zařízení a typ práce.
// Čte posledních ~300 záznamů (řazené nejnovější první) a hledá nejbližší shodu podle assetId (+ workType).

import { useCallback, useEffect, useState } from 'react';
import { subscribeToRecentWorkLogs } from '../../services/workLogService';
import type { WorkLog } from '../../types/workLog';

const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function useLastWorkLog() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  useEffect(() => subscribeToRecentWorkLogs(setLogs, 300), []);
  return useCallback(
    (assetId: string, workType?: string): WorkLog | undefined =>
      logs.find((l) => l.assetId === assetId && (!workType || norm(l.workType) === norm(workType))),
    [logs],
  );
}

export const logDateCz = (l: WorkLog): string => {
  const raw = l.performedAt || l.createdAt;
  if (!raw) return '';
  const d = raw instanceof Date ? raw : new Date(raw as unknown as string);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
};
