export type VacationPlanStatus = 'planned' | 'cancelled';
export type VacationPlanKind = 'vacation' | 'doctor' | 'sick' | 'training' | 'other';

export interface VacationPlan {
  id: string;
  tenantId?: string;
  workerName: string;
  kind?: VacationPlanKind;
  startDate: any;
  endDate: any;
  note?: string;
  status: VacationPlanStatus;
  createdBy?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;
}
