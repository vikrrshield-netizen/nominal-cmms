import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createTask } from './taskService';
import type { Asset } from '../types/asset';
import type { DataloggerTemperatureLog } from '../types/datalogger';
import type { TaskSource } from '../types/firestore';

type AppUser = {
  uid?: string;
  id?: string;
  displayName?: string;
  tenantId?: string;
};

type DataloggerLimitBreach = {
  direction: 'low' | 'high';
  limit: number;
  min: number | null;
  max: number | null;
};

type DataloggerAlertRecipient = {
  id: string;
  name: string;
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

function customFieldText(asset: Asset, keys: string[]): string {
  const normalizedKeys = keys.map(normalizeDataloggerText);
  const field = (asset.customFields || []).find((item) => {
    const label = normalizeDataloggerText(`${item.key} ${item.label}`);
    return normalizedKeys.some((key) => label.includes(key));
  });
  return field?.value === undefined || field.value === null ? '' : String(field.value);
}

function customFieldNumber(asset: Asset, keys: string[]): number | null {
  const raw = customFieldText(asset, keys);
  if (!raw) return null;
  const value = Number(raw.replace(',', '.').replace(/[^\d.-]+/g, ''));
  return Number.isFinite(value) ? value : null;
}

function dataloggerLimitBreach(asset: Asset, temperatureC: number): DataloggerLimitBreach | null {
  const min = customFieldNumber(asset, ['min', 'minimum', 'min teplota', 'dolni limit']);
  const max = customFieldNumber(asset, ['max', 'maximum', 'max teplota', 'horni limit']);
  if (min !== null && temperatureC < min) return { direction: 'low', limit: min, min, max };
  if (max !== null && temperatureC > max) return { direction: 'high', limit: max, min, max };
  return null;
}

function formatMeasuredAt(value: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

async function hasOpenDataloggerLimitTask(assetId: string): Promise<boolean> {
  const snap = await getDocs(query(
    collection(db, 'tasks'),
    where('assetId', '==', assetId),
    limit(50),
  ));

  return snap.docs.some((item) => {
    const task = item.data() as { status?: string; sourceRefType?: string; sourceRefId?: string };
    return task.sourceRefType === 'datalogger_temperature'
      && task.sourceRefId === assetId
      && task.status !== 'completed'
      && task.status !== 'cancelled';
  });
}

async function getDataloggerAlertRecipients(fallbackUser?: AppUser | null): Promise<DataloggerAlertRecipient[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const recipients = snap.docs
      .map((item) => {
        const data = item.data() as { role?: string; displayName?: string; active?: boolean; isActive?: boolean };
        return {
          id: item.id,
          name: data.displayName || item.id,
          role: data.role || '',
          active: data.active !== false && data.isActive !== false,
        };
      })
      .filter((item) => item.active && ['UDRZBA', 'SUPERADMIN', 'VEDENI', 'SKLADNIK'].includes(item.role));

    if (recipients.length > 0) {
      const seen = new Set<string>();
      return recipients.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    }
  } catch (error) {
    console.warn('[dataloggerService] Datalogger alert recipients were not loaded:', error);
  }

  const fallbackId = userId(fallbackUser);
  if (!fallbackId || fallbackId === 'unknown') return [];
  return [{ id: fallbackId, name: userName(fallbackUser) }];
}

async function createDataloggerLimitNotifications(input: {
  datalogger: Asset;
  user?: AppUser | null;
  temperatureC: number;
  humidityPct?: number;
  rawMaterial?: string;
  measuredAt: Date;
  roomName: string;
}, breach: DataloggerLimitBreach) {
  const recipients = await getDataloggerAlertRecipients(input.user);
  if (recipients.length === 0) return;

  const directionText = breach.direction === 'low'
    ? `pod minimem ${breach.limit} °C`
    : `nad maximem ${breach.limit} °C`;
  const roomName = input.roomName || 'umístění není vyplněné';
  const rawMaterial = input.rawMaterial?.trim() || '';
  const message = [
    `${input.datalogger.name}: ${input.temperatureC} °C (${directionText}).`,
    `Umístění: ${roomName}.`,
    typeof input.humidityPct === 'number' ? `Vlhkost: ${input.humidityPct} %.` : '',
    rawMaterial ? `Surovina: ${rawMaterial}.` : '',
    `Měřeno: ${formatMeasuredAt(input.measuredAt)}.`,
  ].filter(Boolean).join(' ');

  const createdBy = userId(input.user);
  await Promise.all(recipients.map((recipient) => addDoc(collection(db, 'notifications'), {
    userId: recipient.id,
    createdBy,
    type: 'system',
    priority: 'critical',
    severity: 'critical',
    title: `Datalogger mimo limit: ${input.datalogger.name}`,
    message,
    body: message,
    actionUrl: '/dataloggers',
    actionLabel: 'Otevřít dataloggery',
    read: false,
    isRead: false,
    generated: true,
    assetId: input.datalogger.id,
    assetName: input.datalogger.name,
    sourceRefType: 'datalogger_temperature',
    sourceRefId: input.datalogger.id,
    createdAt: serverTimestamp(),
  })));
}

async function createDataloggerLimitTask(input: {
  datalogger: Asset;
  user?: AppUser | null;
  temperatureC: number;
  humidityPct?: number;
  rawMaterial?: string;
  measuredAt: Date;
  roomName: string;
  note?: string;
  source?: TaskSource;
}, breach: DataloggerLimitBreach) {
  const directionText = breach.direction === 'low'
    ? `pod minimem ${breach.limit} °C`
    : `nad maximem ${breach.limit} °C`;
  const rangeText = breach.min !== null && breach.max !== null
    ? `Limit: ${breach.min} až ${breach.max} °C.`
    : breach.min !== null
      ? `Limit: min. ${breach.min} °C.`
      : `Limit: max. ${breach.max} °C.`;
  const rawMaterial = input.rawMaterial?.trim() || '';
  const code = input.datalogger.code ? ` (${input.datalogger.code})` : '';

  await createTask({
    title: `Mimo limit teploty: ${input.datalogger.name}`,
    description: [
      `Naměřená teplota: ${input.temperatureC} °C (${directionText}).`,
      rangeText,
      `Datalogger: ${input.datalogger.name}${code}.`,
      `Umístění: ${input.roomName || 'nevyplněno'}.`,
      typeof input.humidityPct === 'number' ? `Vlhkost: ${input.humidityPct} %.` : '',
      rawMaterial ? `Surovina: ${rawMaterial}.` : '',
      `Měřeno: ${formatMeasuredAt(input.measuredAt)}.`,
      input.note?.trim() ? `Poznámka: ${input.note.trim()}` : '',
      'Automaticky založeno po zápisu teploty dataloggeru mimo limit.',
    ].filter(Boolean).join('\n'),
    type: 'corrective',
    priority: 'P2',
    source: input.source || 'web',
    sourceRefType: 'datalogger_temperature',
    sourceRefId: input.datalogger.id,
    assetId: input.datalogger.id,
    assetName: input.datalogger.name,
    buildingId: input.datalogger.buildingId,
    foodSafetyRisk: true,
    foodSafetyHazardType: 'biological',
    foodSafetyImpact: 'Teplota skladování mimo limit. Ověřit surovinu, prostor a provést nápravné opatření.',
    createdById: userId(input.user),
    createdByName: userName(input.user),
  });
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
  source?: TaskSource;
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

  const breach = dataloggerLimitBreach(input.datalogger, input.temperatureC);
  if (!breach) return;

  try {
    const alreadyOpen = await hasOpenDataloggerLimitTask(input.datalogger.id);
    if (!alreadyOpen) {
      try {
        await createDataloggerLimitNotifications({ ...input, roomName, rawMaterial }, breach);
      } catch (notificationError) {
        console.warn('[dataloggerService] Temperature limit notification was not created:', notificationError);
      }
      try {
        await createDataloggerLimitTask({ ...input, roomName, rawMaterial }, breach);
      } catch (taskError) {
        console.warn('[dataloggerService] Temperature limit task was not created:', taskError);
      }
    }
  } catch (error) {
    console.warn('[dataloggerService] Temperature limit alert dedup failed:', error);
  }
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
