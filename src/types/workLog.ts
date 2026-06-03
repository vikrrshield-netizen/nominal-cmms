// src/types/workLog.ts
export interface WorkLog {
  id: string;
  workOrderId?: string;
  taskId?: string;
  taskTitle?: string;
  assetId?: string;
  assetName?: string;
  location?: string;
  userId: string;
  userName: string;
  workerNames?: string[];
  completedByNames?: string[];
  type: 'note' | 'status_change' | 'part_used' | 'time_log' | 'maintenance' | 'repair' | 'inspection' | 'cleaning';
  content: string;
  hoursWorked?: number;
  workType?: string;
  relatedWorkLogId?: string;
  relatedWorkLogRole?: 'gearbox_source' | 'extruder_shadow';
  relatedAssetId?: string;
  relatedAssetName?: string;
  auditReady?: boolean;
  cleaningStatus?: 'done' | 'not_applicable';
  cleaningDone?: boolean;
  cleaningChecked?: boolean;
  cleaningNotApplicable?: boolean;
  cleaningNote?: string;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
  performedAt?: Date;
  createdAt: Date;
}

export const LOG_TYPE_CONFIG = {
  note: { label: 'Poznámka', icon: '📝', color: 'bg-blue-500' },
  status_change: { label: 'Změna stavu', icon: '🔄', color: 'bg-purple-500' },
  part_used: { label: 'Použitý díl', icon: '🔧', color: 'bg-amber-500' },
  time_log: { label: 'Čas práce', icon: '⏱️', color: 'bg-green-500' },
  cleaning: { label: 'Úklid', icon: '✓', color: 'bg-emerald-500' },
};
