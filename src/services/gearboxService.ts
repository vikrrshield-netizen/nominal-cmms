import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { addWorkLog } from './workLogService';
import type { Asset } from '../types/asset';
import type { GearboxInstallationEvent, GearboxTemperatureLog } from '../types/gearbox';
import { GEARBOX_STATUS_LABEL, type GearboxStatus } from '../types/gearbox';

type AppUser = {
  uid?: string;
  id?: string;
  displayName?: string;
  tenantId?: string;
};

export function normalizeGearboxText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isGearboxAsset(asset?: Partial<Asset> | null): boolean {
  if (!asset) return false;
  const text = normalizeGearboxText([
    asset.entityType,
    asset.category,
    asset.name,
    asset.code,
  ].filter(Boolean).join(' '));
  return text.includes('prevodov') || text.includes('gearbox');
}

export function isExtruderAsset(asset?: Partial<Asset> | null): boolean {
  if (!asset) return false;
  const text = normalizeGearboxText([
    asset.entityType,
    asset.category,
    asset.name,
    asset.code,
  ].filter(Boolean).join(' '));
  return text.includes('extruder') || text.includes('extrud');
}

export function getGearboxStatus(asset?: Partial<Asset> | null): GearboxStatus {
  if (asset?.gearboxStatus === 'installed' || asset?.gearboxStatus === 'in_stock' || asset?.gearboxStatus === 'service') {
    return asset.gearboxStatus;
  }
  if (asset?.currentExtruderId) return 'installed';
  const place = normalizeGearboxText([asset?.location, asset?.areaName, asset?.status].filter(Boolean).join(' '));
  if (place.includes('servis') || place.includes('oprav') || place.includes('maintenance') || place.includes('broken')) {
    return 'service';
  }
  return 'in_stock';
}

export function getGearboxStatusLabel(asset?: Partial<Asset> | null): string {
  return GEARBOX_STATUS_LABEL[getGearboxStatus(asset)];
}

function userId(user?: AppUser | null): string {
  return user?.uid || user?.id || 'unknown';
}

function userName(user?: AppUser | null): string {
  return user?.displayName || 'Neznamy';
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function assetRef(assetId: string) {
  return doc(db, 'assets', assetId);
}

async function findInstalledGearboxesOnExtruder(extruderId: string, exceptGearboxId: string): Promise<Asset[]> {
  const snap = await getDocs(query(
    collection(db, 'assets'),
    where('currentExtruderId', '==', extruderId)
  ));

  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() } as Asset))
    .filter((asset) => asset.id !== exceptGearboxId)
    .filter((asset) => isGearboxAsset(asset) || asset.gearboxStatus === 'installed');
}

export async function assignGearboxToExtruder(input: {
  tenantId: string;
  gearbox: Asset;
  extruder: Asset;
  user?: AppUser | null;
  note?: string;
}) {
  const performedAt = Timestamp.now();
  const replacedGearboxes = await findInstalledGearboxesOnExtruder(input.extruder.id, input.gearbox.id);
  const batch = writeBatch(db);

  for (const replaced of replacedGearboxes) {
    batch.update(assetRef(replaced.id), {
      tenantId: input.tenantId,
      status: 'maintenance',
      gearboxStatus: 'service',
      currentExtruderId: null,
      currentExtruderName: null,
      location: 'Servis',
      updatedAt: performedAt,
    });
  }

  batch.update(assetRef(input.gearbox.id), {
    tenantId: input.tenantId,
    status: 'operational',
    gearboxStatus: 'installed',
    currentExtruderId: input.extruder.id,
    currentExtruderName: input.extruder.name,
    location: input.extruder.location || input.extruder.areaName || input.extruder.name,
    updatedAt: performedAt,
  });

  batch.set(doc(collection(db, 'gearbox_installation_events')), {
    tenantId: input.tenantId,
    gearboxId: input.gearbox.id,
    gearboxName: input.gearbox.name,
    action: 'installed',
    extruderId: input.extruder.id,
    extruderName: input.extruder.name,
    previousExtruderId: input.gearbox.currentExtruderId || null,
    previousExtruderName: input.gearbox.currentExtruderName || null,
    userId: userId(input.user),
    userName: userName(input.user),
    note: input.note || '',
    performedAt,
    createdAt: serverTimestamp(),
  });

  for (const replaced of replacedGearboxes) {
    batch.set(doc(collection(db, 'gearbox_installation_events')), {
      tenantId: input.tenantId,
      gearboxId: replaced.id,
      gearboxName: replaced.name,
      action: 'service',
      extruderId: null,
      extruderName: null,
      previousExtruderId: input.extruder.id,
      previousExtruderName: input.extruder.name,
      userId: userId(input.user),
      userName: userName(input.user),
      note: `Automaticky sundano pri montazi prevodovky ${input.gearbox.name}${input.note ? `\nPoznamka k vymene: ${input.note}` : ''}`,
      performedAt,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();

  try {
    await addWorkLog({
      assetId: input.gearbox.id,
      assetName: input.gearbox.name,
      location: input.extruder.name,
      userId: userId(input.user),
      userName: userName(input.user),
      type: 'maintenance',
      workType: 'gearbox_installation',
      auditReady: true,
      performedAt: performedAt.toDate(),
      content: `Prevodovka namontovana na extruder: ${input.extruder.name}${input.note ? `\nPoznamka: ${input.note}` : ''}`,
    });
  } catch (err) {
    console.warn('[Gearbox] Work log failed after successful assignment:', err);
  }

  for (const replaced of replacedGearboxes) {
    try {
      await addWorkLog({
        assetId: replaced.id,
        assetName: replaced.name,
        location: input.extruder.name,
        userId: userId(input.user),
        userName: userName(input.user),
        type: 'maintenance',
        workType: 'gearbox_service_status',
        auditReady: true,
        performedAt: performedAt.toDate(),
        content: `Prevodovka sundana z extruderu ${input.extruder.name} a presunuta do servisu pri montazi prevodovky ${input.gearbox.name}.`,
      });
    } catch (err) {
      console.warn('[Gearbox] Replacement work log failed after successful assignment:', err);
    }
  }
}

export async function returnGearboxToStock(input: {
  tenantId: string;
  gearbox: Asset;
  user?: AppUser | null;
  note?: string;
}) {
  const performedAt = Timestamp.now();
  const batch = writeBatch(db);

  batch.update(assetRef(input.gearbox.id), {
    tenantId: input.tenantId,
    status: 'operational',
    gearboxStatus: 'in_stock',
    currentExtruderId: null,
    currentExtruderName: null,
    location: 'Sklad ND',
    updatedAt: performedAt,
  });

  batch.set(doc(collection(db, 'gearbox_installation_events')), {
    tenantId: input.tenantId,
    gearboxId: input.gearbox.id,
    gearboxName: input.gearbox.name,
    action: 'returned_to_stock',
    extruderId: null,
    extruderName: null,
    previousExtruderId: input.gearbox.currentExtruderId || null,
    previousExtruderName: input.gearbox.currentExtruderName || null,
    userId: userId(input.user),
    userName: userName(input.user),
    note: input.note || '',
    performedAt,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  try {
    await addWorkLog({
      assetId: input.gearbox.id,
      assetName: input.gearbox.name,
      location: input.gearbox.currentExtruderName || 'Sklad ND',
      userId: userId(input.user),
      userName: userName(input.user),
      type: 'maintenance',
      workType: 'gearbox_return_to_stock',
      auditReady: true,
      performedAt: performedAt.toDate(),
      content: `Prevodovka vracena do skladu${input.gearbox.currentExtruderName ? ` z extruderu ${input.gearbox.currentExtruderName}` : ''}${input.note ? `\nPoznamka: ${input.note}` : ''}`,
    });
  } catch (err) {
    console.warn('[Gearbox] Work log failed after successful return to stock:', err);
  }
}

export async function setGearboxStockStatus(input: {
  tenantId: string;
  gearbox: Asset;
  status: Extract<GearboxStatus, 'in_stock' | 'service'>;
  user?: AppUser | null;
  note?: string;
}) {
  const performedAt = Timestamp.now();
  const isService = input.status === 'service';
  const location = isService ? 'Servis' : 'Sklad ND';
  const wasInstalled = Boolean(input.gearbox.currentExtruderId || input.gearbox.gearboxStatus === 'installed');
  const action = isService ? 'service' : wasInstalled ? 'returned_to_stock' : 'ready_for_stock';
  const batch = writeBatch(db);

  batch.update(assetRef(input.gearbox.id), {
    tenantId: input.tenantId,
    status: isService ? 'maintenance' : 'operational',
    gearboxStatus: input.status,
    currentExtruderId: null,
    currentExtruderName: null,
    location,
    updatedAt: performedAt,
  });

  batch.set(doc(collection(db, 'gearbox_installation_events')), {
    tenantId: input.tenantId,
    gearboxId: input.gearbox.id,
    gearboxName: input.gearbox.name,
    action,
    extruderId: null,
    extruderName: null,
    previousExtruderId: input.gearbox.currentExtruderId || null,
    previousExtruderName: input.gearbox.currentExtruderName || null,
    userId: userId(input.user),
    userName: userName(input.user),
    note: input.note || '',
    performedAt,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  try {
    await addWorkLog({
      assetId: input.gearbox.id,
      assetName: input.gearbox.name,
      location: input.gearbox.currentExtruderName || location,
      userId: userId(input.user),
      userName: userName(input.user),
      type: 'maintenance',
      workType: isService ? 'gearbox_service_status' : 'gearbox_ready_for_stock',
      auditReady: true,
      performedAt: performedAt.toDate(),
      content: [
        isService
          ? `Převodovka přesunuta do servisu${input.gearbox.currentExtruderName ? ` z extruderu ${input.gearbox.currentExtruderName}` : ''}.`
          : `Převodovka přesunuta do skladu${input.gearbox.currentExtruderName ? ` z extruderu ${input.gearbox.currentExtruderName}` : ''}.`,
        input.note ? `Poznámka: ${input.note}` : '',
      ].filter(Boolean).join('\n'),
    });
  } catch (err) {
    console.warn('[Gearbox] Work log failed after successful stock status change:', err);
  }
}

export async function addGearboxTemperatureLog(input: {
  tenantId: string;
  gearbox: Asset;
  user?: AppUser | null;
  temperatureC: number;
  motorLoadPercent?: number | null;
  measuredAt: Date;
  rawMaterial?: string;
  note?: string;
  photoFile?: File | null;
}) {
  let photoUrl = '';
  if (input.photoFile) {
    const path = `gearbox_checks/${input.gearbox.id}/${Date.now()}_${safeFileName(input.photoFile.name || 'photo.jpg')}`;
    const snap = await uploadBytes(ref(storage, path), input.photoFile);
    photoUrl = await getDownloadURL(snap.ref);
  }

  const measuredAt = Timestamp.fromDate(input.measuredAt);
  const rawMaterial = input.rawMaterial?.trim() || '';
  const motorLoadPercent = typeof input.motorLoadPercent === 'number' && Number.isFinite(input.motorLoadPercent)
    ? Math.max(0, Math.min(100, Math.round(input.motorLoadPercent)))
    : null;
  await addDoc(collection(db, 'gearbox_temperature_logs'), {
    tenantId: input.tenantId,
    gearboxId: input.gearbox.id,
    gearboxName: input.gearbox.name,
    extruderId: input.gearbox.currentExtruderId || null,
    extruderName: input.gearbox.currentExtruderName || null,
    temperatureC: input.temperatureC,
    motorLoadPercent,
    measuredAt,
    userId: userId(input.user),
    userName: userName(input.user),
    rawMaterial,
    note: input.note || '',
    photoUrl,
    createdAt: serverTimestamp(),
  });

  await updateDoc(assetRef(input.gearbox.id), {
    tenantId: input.tenantId,
    lastTemperatureC: input.temperatureC,
    lastTemperatureAt: input.measuredAt.toISOString(),
    lastMotorLoadPercent: motorLoadPercent,
    lastGearboxPhotoUrl: photoUrl || input.gearbox.lastGearboxPhotoUrl || null,
    updatedAt: Timestamp.now(),
  });

  await addWorkLog({
    assetId: input.gearbox.id,
    assetName: input.gearbox.name,
    location: input.gearbox.currentExtruderName || input.gearbox.location || 'Sklad ND',
    userId: userId(input.user),
    userName: userName(input.user),
    type: 'inspection',
    workType: 'gearbox_temperature',
    auditReady: true,
    performedAt: input.measuredAt,
    content: [
      `Zaznam teploty prevodovky: ${input.temperatureC} °C`,
      motorLoadPercent !== null ? `Zatez motoru: ${motorLoadPercent} %` : '',
      input.gearbox.currentExtruderName ? `Extruder: ${input.gearbox.currentExtruderName}` : '',
      rawMaterial ? `Surovina: ${rawMaterial}` : '',
      input.note ? `Poznamka: ${input.note}` : '',
      photoUrl ? 'Prilozena fotka kontroly.' : '',
    ].filter(Boolean).join('\n'),
  });
}

export function subscribeGearboxTemperatureLogs(
  gearboxId: string,
  callback: (logs: GearboxTemperatureLog[]) => void
) {
  const q = query(
    collection(db, 'gearbox_temperature_logs'),
    where('gearboxId', '==', gearboxId),
    orderBy('measuredAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxTemperatureLog)));
  });
}

export function subscribeGearboxInstallationEvents(
  gearboxId: string,
  callback: (events: GearboxInstallationEvent[]) => void
) {
  const q = query(
    collection(db, 'gearbox_installation_events'),
    where('gearboxId', '==', gearboxId),
    orderBy('performedAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxInstallationEvent)));
  });
}
