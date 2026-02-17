// src/types/asset.ts
// NOMINAL CMMS — Asset typy

export type AssetStatus = 'operational' | 'maintenance' | 'broken' | 'stopped';

export const ASSET_STATUS_CONFIG: Record<AssetStatus, { label: string; color: string; icon: string }> = {
  operational: { label: 'V provozu', color: 'bg-green-500', icon: '✅' },
  maintenance: { label: 'Údržba', color: 'bg-amber-500', icon: '🔧' },
  broken: { label: 'Porucha', color: 'bg-red-500', icon: '❌' },
  stopped: { label: 'Zastaveno', color: 'bg-gray-500', icon: '⏸️' },
};

export type AssetCategory = 
  | 'extruder' | 'mixer' | 'packer' | 'compressor' | 'boiler' 
  | 'forklift' | 'agri' | 'conveyor' | 'hvac' | 'electrical' | 'other';

export const ASSET_CATEGORY_CONFIG: Record<AssetCategory, { label: string; color: string; icon: string }> = {
  extruder:   { label: 'Extruder', color: 'bg-purple-500', icon: '🔄' },
  mixer:      { label: 'Míchačka', color: 'bg-blue-500', icon: '🌀' },
  packer:     { label: 'Balička', color: 'bg-green-500', icon: '📦' },
  compressor: { label: 'Kompresor', color: 'bg-cyan-500', icon: '💨' },
  boiler:     { label: 'Kotel', color: 'bg-orange-500', icon: '🔥' },
  forklift:   { label: 'VZV', color: 'bg-yellow-500', icon: '🚜' },
  agri:       { label: 'Zemědělská', color: 'bg-lime-500', icon: '🚛' },
  conveyor:   { label: 'Dopravník', color: 'bg-indigo-500', icon: '➡️' },
  hvac:       { label: 'VZT', color: 'bg-sky-500', icon: '❄️' },
  electrical: { label: 'Elektro', color: 'bg-amber-500', icon: '⚡' },
  other:      { label: 'Ostatní', color: 'bg-slate-500', icon: '📋' },
};

export type AssetCriticality = 'low' | 'medium' | 'high' | 'critical';

export const CRITICALITY_CONFIG: Record<AssetCriticality, { label: string; color: string; icon: string }> = {
  low:      { label: 'Nízká', color: 'bg-gray-400', icon: '🟢' },
  medium:   { label: 'Střední', color: 'bg-blue-500', icon: '🔵' },
  high:     { label: 'Vysoká', color: 'bg-orange-500', icon: '🟠' },
  critical: { label: 'Kritická', color: 'bg-red-600', icon: '🔴' },
};

export interface Asset {
  id: string;
  code: string;
  name: string;
  type?: string;
  category: AssetCategory;
  criticality: AssetCriticality;
  status: AssetStatus;
  buildingId?: string;
  roomId?: string;
  locationId?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  year?: number;
  mthCounter?: number;
  kmCounter?: number;
  lastService?: string;
  nextService?: string;
  notes?: string;
  image?: string;
  x?: number;
  y?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const getStatusConfig = (status: AssetStatus) => 
  ASSET_STATUS_CONFIG[status] || ASSET_STATUS_CONFIG.operational;

export const getCategoryConfig = (category: AssetCategory) => 
  ASSET_CATEGORY_CONFIG[category] || ASSET_CATEGORY_CONFIG.other;

export const getCriticalityConfig = (criticality: AssetCriticality) => 
  CRITICALITY_CONFIG[criticality] || CRITICALITY_CONFIG.medium;
