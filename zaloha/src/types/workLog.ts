// src/types/workLog.ts
export interface WorkLog {
  id: string;
  workOrderId: string;
  userId: string;
  userName: string;
  type: 'note' | 'status_change' | 'part_used' | 'time_log';
  content: string;
  hoursWorked?: number;
  createdAt: Date;
}

export const LOG_TYPE_CONFIG = {
  note: { label: 'Poznámka', icon: '📝', color: 'bg-blue-500' },
  status_change: { label: 'Změna stavu', icon: '🔄', color: 'bg-purple-500' },
  part_used: { label: 'Použitý díl', icon: '🔧', color: 'bg-amber-500' },
  time_log: { label: 'Čas práce', icon: '⏱️', color: 'bg-green-500' },
};
