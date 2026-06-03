import type { Timestamp } from 'firebase/firestore';

export interface DataloggerTemperatureLog {
  id: string;
  tenantId: string;
  dataloggerId: string;
  dataloggerName: string;
  location?: string;
  temperatureC: number;
  measuredAt: Date | Timestamp;
  userId: string;
  userName: string;
  note?: string;
  createdAt: Date | Timestamp;
}

export type DataloggerTemperatureLevel = 'ok' | 'warning' | 'critical' | 'missing' | 'not_required';
