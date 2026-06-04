import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Asset } from '../types/asset';
import type { DataloggerTemperatureLog } from '../types/datalogger';

type AppUser = {
  uid?: string;
  id?: string;
  displayName?: string;
  tenantId?: string;
};

export function normalizeDataloggerText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isDataloggerAsset(asset?: Partial<Asset> | null): boolean {
  if (!asset) return false;
  const text = normalizeDataloggerText([
    asset.entityType,
    asset.category,
    asset.name,
    asset.code,
    asset.location,
    asset.areaName,
    asset.notes,
    ...(asset.customFields || []).map((field) => `${field.key} ${field.label} ${field.value}`),
  ].filter(Boolean).join(' '));

  return text.includes('datalogger')
    || text.includes('dataloger')
    || text.includes('data logger')
    || text.includes('logger teplot')
    || text.includes('teplotni logger')
    || text.includes('teplotni zaznamnik')
    || text.includes('teplomer')
    || text.includes('teploměr');
}

function userId(user?: AppUser | null): string {
  return user?.uid || user?.id || 'unknown';
}

function userName(user?: AppUser | null): string {
  return user?.displayName || 'Neznámý';
}

function dataloggerRoom(asset: Asset): string {
  return asset.areaName || asset.roomId || asset.location || '';
}

export async function addDataloggerTemperatureLog(input: {
  tenantId: string;
  datalogger: Asset;
  user?: AppUser | null;
  temperatureC: number;
  humidityPct?: number;
  rawMaterial?: string;
  measuredAt: Date;
  roomName?: string;
  note?: string;
}) {
  const roomName = input.roomName?.trim() || dataloggerRoom(input.datalogger);
  const rawMaterial = input.rawMaterial?.trim() || '';
  await addDoc(collection(db, 'datalogger_temperature_logs'), {
    tenantId: input.tenantId,
    dataloggerId: input.datalogger.id,
    dataloggerName: input.datalogger.name,
    buildingId: input.datalogger.buildingId || '',
    roomName,
    location: input.datalogger.location || input.datalogger.areaName || '',
    temperatureC: input.temperatureC,
    ...(typeof input.humidityPct === 'number' ? { humidityPct: input.humidityPct } : {}),
    ...(rawMaterial ? { rawMaterial } : {}),
    measuredAt: Timestamp.fromDate(input.measuredAt),
    userId: userId(input.user),
    userName: userName(input.user),
    note: input.note || '',
    createdAt: serverTimestamp(),
  });
}

export function subscribeDataloggerTemperatureLogs(
  callback: (logs: DataloggerTemperatureLog[]) => void,
  maxLogs = 1000,
) {
  const q = query(
    collection(db, 'datalogger_temperature_logs'),
    orderBy('measuredAt', 'desc'),
    limit(maxLogs),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as DataloggerTemperatureLog)));
  });
}
