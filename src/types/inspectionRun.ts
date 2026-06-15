import type { Timestamp } from 'firebase/firestore';
import type { TaskPriority } from './firestore';

export type InspectionRunStatus = 'draft' | 'closed';
export type InspectionRunItemStatus = 'pending' | 'ok' | 'defect';
export type InspectionRunItemFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type InspectionRunAuditAction = 'created' | 'closed' | 'reopened';

export interface InspectionRunItem {
  id: string;
  logId: string;
  templateId: string;
  building: string;
  floor: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  checkPoints: string;
  frequency?: InspectionRunItemFrequency;
  status: InspectionRunItemStatus;
  defectNote: string;
  inspectionNote?: string;
  completedBy: string;
  completedById?: string;
  completedAt: Timestamp | null;
  taskId?: string;
  taskPriority?: TaskPriority;
  sortOrder?: number;
  sourceAssetId?: string | null;
  foodSafetyRisk?: boolean;
  foodSafetyHazardType?: string;
  foodSafetyImpact?: string;
}

export interface InspectionRunSummary {
  total: number;
  ok: number;
  defect: number;
  pending: number;
  percentDone: number;
  taskCount: number;
}

export interface InspectionRunAuditEntry {
  action: InspectionRunAuditAction;
  at: string;
  byId: string;
  byName: string;
  note?: string;
}

export interface InspectionRun {
  id: string;
  month: string;
  status: InspectionRunStatus;
  items: InspectionRunItem[];
  summary: InspectionRunSummary;
  startedAt?: Timestamp;
  startedById: string;
  startedByName: string;
  closedAt?: Timestamp;
  closedById?: string;
  closedByName?: string;
  reopenedAt?: Timestamp;
  reopenedById?: string;
  reopenedByName?: string;
  buildingScope?: string[];
  taskIds?: string[];
  auditTrail?: InspectionRunAuditEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
