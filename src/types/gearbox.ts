import type { Timestamp } from 'firebase/firestore';

export type GearboxStatus = 'in_stock' | 'installed' | 'service';
export type GearboxInstallationAction = 'installed' | 'returned_to_stock' | 'service' | 'ready_for_stock';

export interface GearboxTemperatureLog {
  id: string;
  tenantId: string;
  gearboxId: string;
  gearboxName: string;
  extruderId?: string | null;
  extruderName?: string | null;
  temperatureC: number;
  motorLoadPercent?: number | null;
  measuredAt: Timestamp;
  userId: string;
  userName: string;
  rawMaterial?: string;
  note?: string;
  photoUrl?: string;
  createdAt: Timestamp;
}

export interface GearboxInstallationEvent {
  id: string;
  tenantId: string;
  gearboxId: string;
  gearboxName: string;
  action: GearboxInstallationAction;
  extruderId?: string | null;
  extruderName?: string | null;
  previousExtruderId?: string | null;
  previousExtruderName?: string | null;
  userId: string;
  userName: string;
  note?: string;
  performedAt: Timestamp;
  createdAt: Timestamp;
}

export const GEARBOX_STATUS_LABEL: Record<GearboxStatus, string> = {
  in_stock: 'Ve skladu',
  installed: 'Namontovana',
  service: 'V servisu',
};
