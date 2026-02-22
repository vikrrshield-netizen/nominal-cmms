// src/types/asset.ts
// VIKRR Asset Shield — Asset types
// v2 — rekurzivní strom, tenant-aware
export type AssetStatus = 'operational' | 'maintenance' | 'broken' | 'stopped';
export const ASSET_STATUS_CONFIG: Record<AssetStatus, {
  label: string; color: string; icon: string
}> = {
  operational: { label: 'V provozu',  color: 'bg-green-500', icon: '✅' },
  maintenance:  { label: 'Údržba',    color: 'bg-amber-500', icon: '🔧' },
  broken:       { label: 'Porucha',   color: 'bg-red-500',   icon: '❌' },
  stopped:      { label: 'Zastaveno', color: 'bg-gray-500',  icon: '⏸️' },
};
export type AssetCriticality = 'low' | 'medium' | 'high' | 'critical';
export const CRITICALITY_CONFIG: Record<AssetCriticality, {
  label: string; color: string; icon: string
}> = {
  low:      { label: 'Nízká',    color: 'bg-gray-400',   icon: '🟢' },
  medium:   { label: 'Střední',  color: 'bg-blue-500',   icon: '🔵' },
  high:     { label: 'Vysoká',   color: 'bg-orange-500', icon: '🟠' },
  critical: { label: 'Kritická', color: 'bg-red-600',    icon: '🔴' },
};
export interface AssetEvent {
  id: string;
  name: string;
  eventType: string;
  frequencyDays?: number;
  lastDate?: string;
  nextDate?: string;
  instructions?: string;
}
export interface RepairLogEntry {
  id: string;
  date: string;
  description: string;
  technicianId?: string;
  technicianName?: string;
  cost?: number;
  parts?: string[];
}
export interface CustomField {
  key: string;
  label: string;
  value: string | number | boolean;
}
export interface Asset {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  entityType: string;
  code?: string;
  status: AssetStatus;
  criticality: AssetCriticality;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  year?: number;
  location?: string;
  linkedTo?: string[];
  customFields?: CustomField[];
  mthCounter?: number;
  kmCounter?: number;
  lastService?: string;
  nextService?: string;
  events?: AssetEvent[];
  repairLog?: RepairLogEntry[];
  notes?: string;
  image?: string;
  documents?: string[];
  createdAt?: string;
  updatedAt?: string;
  // Legacy fields (backward compat — used by AssetList, AssetDetail, sampleAssets)
  category?: string;
  roomId?: string;
  buildingId?: string;
}

// Legacy category config (backward compat)
export type AssetCategory = 'extruder' | 'mixer' | 'packer' | 'compressor' | 'boiler' | 'forklift' | 'agri' | 'other';
export const ASSET_CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  extruder:   { label: 'Extruder',    icon: '🏭' },
  mixer:      { label: 'Míchačka',    icon: '🔄' },
  packer:     { label: 'Balička',     icon: '📦' },
  compressor: { label: 'Kompresor',   icon: '💨' },
  boiler:     { label: 'Kotel',       icon: '🔥' },
  forklift:   { label: 'VZV',         icon: '🚜' },
  agri:       { label: 'Zemědělská',  icon: '🌾' },
  other:      { label: 'Ostatní',     icon: '⚙️' },
};
export const getStatusConfig = (status: AssetStatus) =>
  ASSET_STATUS_CONFIG[status] ?? ASSET_STATUS_CONFIG.operational;
export const getCriticalityConfig = (criticality: AssetCriticality) =>
  CRITICALITY_CONFIG[criticality] ?? CRITICALITY_CONFIG.medium;
