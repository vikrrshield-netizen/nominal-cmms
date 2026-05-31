// src/pages/KioskPage.tsx
// VIKRSHIELD - kiosk pro rychlé hlášení z výroby.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Camera,
  Filter,
  HelpCircle,
  Lightbulb,
  Loader2,
  LogOut,
  Package,
  Search,
  Send,
  ShieldCheck,
  Thermometer,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { createTask } from '../services/taskService';
import { addWorkLog } from '../services/workLogService';
import { addGearboxTemperatureLog, isGearboxAsset } from '../services/gearboxService';
import type { Asset } from '../types/asset';

type ViewState = 'MENU' | 'BREAKDOWN' | 'ORDER' | 'IDEA' | 'MESSAGE' | 'PREFILTER' | 'GEARBOX_TEMP' | 'ASSISTANT' | 'HANDOVER';

interface QuickOption {
  id: string;
  label: string;
}

interface ShiftNote {
  id: string;
  author: string;
  text: string;
  time: string;
  priority: string;
}

interface PrefilterLog {
  id: string;
  assetId: string;
  assetName: string;
  changedAt: Date;
  changedByName: string;
}

interface KioskTodayAction {
  id: string;
  type: 'gearbox_temperature' | 'prefilter';
  assetId: string;
  title: string;
  detail: string;
  tone: 'red' | 'amber' | 'violet';
}

const QUICK_BREAKDOWNS: QuickOption[] = [
  { id: 'stuck', label: 'Zaseknutý materiál' },
  { id: 'noise', label: 'Hluk nebo vibrace' },
  { id: 'leak', label: 'Únik oleje / kapaliny' },
  { id: 'temp', label: 'Přehřívání' },
  { id: 'electric', label: 'Elektrická závada' },
  { id: 'sensor', label: 'Chyba čidla' },
  { id: 'belt', label: 'Poškozený pás / řemen' },
  { id: 'other', label: 'Jiné' },
];

const QUICK_PARTS: QuickOption[] = [
  { id: 'brush', label: 'Kartáč' },
  { id: 'ejector', label: 'Vyrážeč' },
  { id: 'blade', label: 'Nůž / čepel' },
  { id: 'bearing', label: 'Ložisko' },
  { id: 'belt', label: 'Řemen' },
  { id: 'filter', label: 'Filtr' },
  { id: 'lubricant', label: 'Mazivo' },
  { id: 'tool', label: 'Nářadí' },
  { id: 'other', label: 'Jiné' },
];

const QUICK_GEARBOX_ISSUES: QuickOption[] = [
  { id: 'noise', label: 'Neobvyklý zvuk' },
  { id: 'vibration', label: 'Vibrace' },
  { id: 'leak', label: 'Únik oleje' },
  { id: 'overheating', label: 'Přehřívání' },
  { id: 'other', label: 'Jiný problém' },
];

const ASSISTANT_TIPS = [
  { title: 'P1 - havárie', steps: ['Zastavit stroj.', 'Nahlásit poruchu přes kiosk.', 'Zavolat údržbu.', 'Nepouštět nikoho do rizikového místa.'] },
  { title: 'P2 - vážná závada', steps: ['Pokud je to bezpečné, dokončete sérii.', 'Nahlaste závadu.', 'Označte stroj.', 'Čekejte na pokyn údržby.'] },
  { title: 'P3 - běžná údržba', steps: ['Nahlaste požadavek.', 'Údržba ho naplánuje.', 'Pokud se stav zhoršuje, nahlaste znovu jako P2/P1.'] },
];

const normalize = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isEntity = (asset: Asset, words: string[]) => {
  const entity = normalize(asset.entityType);
  const category = normalize(asset.category);
  return words.some((word) => entity.includes(word) || category.includes(word));
};

const isBuilding = (asset: Asset) => isEntity(asset, ['budova', 'building']);
const isRoom = (asset: Asset) => isEntity(asset, ['mistnost', 'room', 'prostor']);
const isControl = (asset: Asset) => isEntity(asset, ['kontrola', 'kontrolni']);
const isExtruderAsset = (asset: Asset) => {
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category}`);
  return text.includes('extruder') || text.includes('extrud');
};

const getAssetBuilding = (asset: Asset, allAssets: Asset[]) => {
  if (asset.buildingId) return asset.buildingId;
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    if (parent.buildingId) return parent.buildingId;
    const match = parent.name.match(/Budova\s+([A-Z0-9]+)/i);
    if (match?.[1]) return match[1].toUpperCase();
    parentId = parent.parentId;
  }
  return '';
};

const getAssetRoom = (asset: Asset, allAssets: Asset[]) => {
  if (asset.areaName) return asset.areaName;
  if (asset.location) return asset.location;
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    if (isRoom(parent)) return parent.name;
    if (parent.areaName) return parent.areaName;
    parentId = parent.parentId;
  }
  return '';
};

const shouldHideFromKiosk = (asset: Asset) => {
  const text = normalize(`${asset.name} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName}`);
  return text.includes('odpad') || text.includes('louparna');
};

const assetLabel = (asset: Asset, allAssets: Asset[]) => {
  const parts = [asset.name];
  const code = asset.code?.trim();
  const room = getAssetRoom(asset, allAssets);
  const building = getAssetBuilding(asset, allAssets);
  if (code) parts.push(code);
  if (room) parts.push(room);
  if (building) parts.push(`Budova ${building}`);
  return parts.join(' | ');
};

const clampTemperature = (value: number) => Math.max(20, Math.min(120, Math.round(value)));

const PREFILTER_WARNING_DAYS = 5;
const PREFILTER_OVERDUE_DAYS = 7;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const parseAssetDate = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};

const temperatureStatus = (asset: Asset | null, temperature: number) => {
  const warning = asset?.gearboxWarningTemperatureC ?? 70;
  const critical = asset?.gearboxCriticalTemperatureC ?? 85;
  if (temperature >= critical) return { label: 'Kritická teplota', color: 'text-red-200', bg: 'bg-red-500/20', border: 'border-red-400/40' };
  if (temperature >= warning) return { label: 'Varování', color: 'text-amber-100', bg: 'bg-amber-500/20', border: 'border-amber-400/40' };
  return { label: 'V pořádku', color: 'text-emerald-100', bg: 'bg-emerald-500/20', border: 'border-emerald-400/40' };
};

// VIKRSHIELD — lokální skóre provozní důležitosti zařízení pro výběr v "Nahlásit poruchu".
// Nemění Firestore schéma; pouze klasifikuje podle názvu/kategorie. Menší číslo = výš v seznamu.
// Pořadí kategorií: 0 extrudery → 1 převodovky na extruderu → 2 dopravníky/násypky →
// 3 metal detekce → 4 měřidla/kontrolní body → 5 ostatní → 6 odpojené převodovky.
const kioskDeviceCategory = (asset: Asset): number => {
  if (isExtruderAsset(asset)) return 0;
  if (isGearboxAsset(asset)) {
    const linked = Boolean(asset.currentExtruderId || asset.currentExtruderName || asset.gearboxStatus === 'installed');
    return linked ? 1 : 6;
  }
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName}`);
  if (/(dopravnik|dopravn|pasov|nasyp|hopper|conveyor)/.test(text)) return 2;
  if (/(metal|detek)/.test(text)) return 3;
  if (/(meridl|merak|merici|merid|kontrol|snimac|cidlo|senzor|vaha)/.test(text)) return 4;
  return 5;
};

// Závažnost stavu (jen z polí, která máme lokálně) — kritická 2, varování 1, jinak 0.
const kioskDeviceSeverity = (asset: Asset): number => {
  const temp = typeof asset.lastTemperatureC === 'number' ? asset.lastTemperatureC : null;
  if (temp != null) {
    const warning = asset.gearboxWarningTemperatureC ?? 70;
    const critical = asset.gearboxCriticalTemperatureC ?? 85;
    if (temp >= critical) return 2;
    if (temp >= warning) return 1;
  }
  const status = normalize((asset as any).status || (asset as any).operationalStatus || (asset as any).healthStatus);
  if (/(havari|critical|kritick|porucha|fault|red)/.test(status)) return 2;
  if (/(warning|varovani|pozor|amber|orange)/.test(status)) return 1;
  return 0;
};

// Výsledné skóre: kategorie dominuje (×100), závažnost a vybraná místnost jen jemně posouvají.
const getKioskDevicePriority = (
  asset: Asset,
  allAssets: Asset[],
  options?: { room?: string },
): number => {
  let score = kioskDeviceCategory(asset) * 100;
  score -= kioskDeviceSeverity(asset) * 20;
  if (options?.room && getAssetRoom(asset, allAssets) === options.room) score -= 10;
  return score;
};

export default function KioskPage() {
  const navigate = useNavigate();
  const { user, logout, canSeeBuilding } = useAuthContext();

  const [activeView, setActiveView] = useState<ViewState>('MENU');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Odesláno');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showTodayActions, setShowTodayActions] = useState(false);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [prefilterAllExtruders, setPrefilterAllExtruders] = useState(false);
  const [breakdownFloor, setBreakdownFloor] = useState('');
  const [breakdownRoom, setBreakdownRoom] = useState('');
  const [selectedQuickOption, setSelectedQuickOption] = useState('');
  const [customText, setCustomText] = useState('');
  const [prefilterDate, setPrefilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [gearboxTemperature, setGearboxTemperature] = useState('');
  const [gearboxMeasuredAt, setGearboxMeasuredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [gearboxNote, setGearboxNote] = useState('');
  const [gearboxPhotoFile, setGearboxPhotoFile] = useState<File | null>(null);
  const gearboxPhotoInputRef = useRef<HTMLInputElement>(null);
  const [gearboxProblemOpen, setGearboxProblemOpen] = useState(false);
  const [gearboxProblemOption, setGearboxProblemOption] = useState('');
  const [gearboxProblemPriority, setGearboxProblemPriority] = useState<'P1' | 'P2'>('P2');
  const [gearboxProblemNote, setGearboxProblemNote] = useState('');

  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  const [prefilterLogs, setPrefilterLogs] = useState<PrefilterLog[]>([]);
  const [handoverText, setHandoverText] = useState('');
  const [handoverPriority, setHandoverPriority] = useState<'normal' | 'important'>('normal');

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'assets'),
      (snapshot) => {
        setAssets(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Asset)));
      },
      () => setAssets([])
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const notesQuery = query(collection(db, 'shiftNotes'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        setShiftNotes(
          snapshot.docs.map((document) => {
            const data = document.data();
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
            return {
              id: document.id,
              author: data.author || 'Kiosk',
              text: data.text || '',
              time: createdAt.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }),
              priority: data.priority || 'normal',
            };
          })
        );
      },
      () => setShiftNotes([])
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const prefilterQuery = query(collection(db, 'prefilters'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(
      prefilterQuery,
      (snapshot) => {
        setPrefilterLogs(snapshot.docs.map((document) => {
          const data = document.data();
          const changedAt = data.changedAt?.toDate ? data.changedAt.toDate() : new Date(data.changedAt || Date.now());
          return {
            id: document.id,
            assetId: data.assetId || '',
            assetName: data.assetName || '',
            changedAt,
            changedByName: data.changedByName || 'Kiosk',
          };
        }));
      },
      () => setPrefilterLogs([])
    );
    return () => unsubscribe();
  }, []);

  const equipmentAssets = useMemo(() => {
    return assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => asset.tenantId === user?.tenantId || !asset.tenantId || !user?.tenantId)
      .filter((asset) => !isBuilding(asset) && !isRoom(asset) && !isControl(asset))
      .filter((asset) => !shouldHideFromKiosk(asset))
      .filter((asset) => {
        const building = getAssetBuilding(asset, assets);
        return !building || canSeeBuilding(building);
      })
      .sort((a, b) => assetLabel(a, assets).localeCompare(assetLabel(b, assets), 'cs'));
  }, [assets, canSeeBuilding, user?.tenantId]);

  const buildings = useMemo(() => {
    return Array.from(new Set(equipmentAssets.map((asset) => getAssetBuilding(asset, assets)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [assets, equipmentAssets]);

  const gearboxAssets = useMemo(() => equipmentAssets.filter((asset) => isGearboxAsset(asset)), [equipmentAssets]);
  const activeGearboxAssets = useMemo(() => {
    const installed = gearboxAssets.filter((asset) => Boolean(asset.currentExtruderId || asset.currentExtruderName || asset.gearboxStatus === 'installed'));
    return installed.length ? installed : gearboxAssets;
  }, [gearboxAssets]);
  const extruderAssets = useMemo(() => equipmentAssets.filter((asset) => isExtruderAsset(asset)), [equipmentAssets]);

  const latestPrefilterByAsset = useMemo(() => {
    const map = new Map<string, PrefilterLog>();
    for (const log of prefilterLogs) {
      if (!log.assetId) continue;
      const existing = map.get(log.assetId);
      if (!existing || log.changedAt.getTime() > existing.changedAt.getTime()) {
        map.set(log.assetId, log);
      }
    }
    return map;
  }, [prefilterLogs]);

  const getPrefilterStatus = (asset: Asset) => {
    const last = latestPrefilterByAsset.get(asset.id);
    if (!last) return { state: 'overdue', label: 'Chybí výměna', days: null as number | null, last };
    const days = Math.floor((currentTime.getTime() - last.changedAt.getTime()) / 86400000);
    if (days >= PREFILTER_OVERDUE_DAYS) return { state: 'overdue', label: `${days} dnů bez výměny`, days, last };
    if (days >= PREFILTER_WARNING_DAYS) return { state: 'warning', label: `${days} dnů od výměny`, days, last };
    return { state: 'ok', label: `OK, ${days} dnů`, days, last };
  };

  const prefilterAlerts = useMemo(() => {
    const statuses = extruderAssets.map((asset) => ({ asset, status: getPrefilterStatus(asset) }));
    return {
      overdue: statuses.filter((item) => item.status.state === 'overdue'),
      warning: statuses.filter((item) => item.status.state === 'warning'),
      ok: statuses.filter((item) => item.status.state === 'ok'),
    };
  }, [currentTime, extruderAssets, latestPrefilterByAsset]);

  const getGearboxDailyTemperatureStatus = (asset: Asset) => {
    const last = parseAssetDate(asset.lastTemperatureAt);
    if (last && startOfDay(last) === startOfDay(currentTime)) {
      return {
        state: 'ok',
        label: `Dnes zapsáno${asset.lastTemperatureC != null ? `: ${asset.lastTemperatureC} °C` : ''}`,
        last,
      };
    }
    if (!last) return { state: 'overdue', label: 'Dnes chybí teplota', last };
    const days = Math.max(1, Math.floor((startOfDay(currentTime) - startOfDay(last)) / 86400000));
    return { state: 'overdue', label: `Chybí dnešní teplota, poslední před ${days} dny`, last };
  };

  const gearboxTemperatureAlerts = useMemo(() => {
    const statuses = activeGearboxAssets.map((asset) => ({ asset, status: getGearboxDailyTemperatureStatus(asset) }));
    return {
      missing: statuses.filter((item) => item.status.state !== 'ok'),
      ok: statuses.filter((item) => item.status.state === 'ok'),
    };
  }, [activeGearboxAssets, currentTime]);

  const todayActions = useMemo<KioskTodayAction[]>(() => {
    const gearboxActions = gearboxTemperatureAlerts.missing.map(({ asset, status }) => ({
      id: `gearbox-${asset.id}`,
      type: 'gearbox_temperature' as const,
      assetId: asset.id,
      title: `Zapsat teplotu: ${asset.name}`,
      detail: `${asset.currentExtruderName || getAssetRoom(asset, assets) || 'Převodovka'} | ${status.label}`,
      tone: 'violet' as const,
    }));

    const overduePrefilters = prefilterAlerts.overdue.map(({ asset, status }) => ({
      id: `prefilter-overdue-${asset.id}`,
      type: 'prefilter' as const,
      assetId: asset.id,
      title: `Výměna předfiltru: ${asset.name}`,
      detail: `${getAssetRoom(asset, assets) || 'Extruder'} | ${status.label}`,
      tone: 'red' as const,
    }));

    const warningPrefilters = prefilterAlerts.warning.map(({ asset, status }) => ({
      id: `prefilter-warning-${asset.id}`,
      type: 'prefilter' as const,
      assetId: asset.id,
      title: `Zkontrolovat předfiltr: ${asset.name}`,
      detail: `${getAssetRoom(asset, assets) || 'Extruder'} | ${status.label}`,
      tone: 'amber' as const,
    }));

    return [...gearboxActions, ...overduePrefilters, ...warningPrefilters];
  }, [assets, gearboxTemperatureAlerts.missing, prefilterAlerts.overdue, prefilterAlerts.warning]);

  const filteredAssets = useMemo(() => {
    const queryText = normalize(assetSearch);
    return equipmentAssets
      .filter((asset) => !selectedBuilding || getAssetBuilding(asset, assets) === selectedBuilding)
      .filter((asset) => {
        if (!queryText) return true;
        return normalize(assetLabel(asset, assets)).includes(queryText);
      })
      .slice(0, 30);
  }, [assetSearch, assets, equipmentAssets, selectedBuilding]);

  const filteredExtruderAssets = useMemo(() => {
    const queryText = normalize(assetSearch);
    return extruderAssets
      .filter((asset) => !selectedBuilding || getAssetBuilding(asset, assets) === selectedBuilding)
      .filter((asset) => {
        if (!queryText) return true;
        return normalize(assetLabel(asset, assets)).includes(queryText);
      })
      .slice(0, 40);
  }, [assetSearch, assets, extruderAssets, selectedBuilding]);

  const breakdownAssets = useMemo(() => {
    const queryText = normalize(assetSearch);
    return equipmentAssets
      .filter((asset) => getAssetBuilding(asset, assets) === 'D')
      .filter((asset) => !breakdownFloor || asset.floor === breakdownFloor)
      .filter((asset) => !breakdownRoom || getAssetRoom(asset, assets) === breakdownRoom)
      .filter((asset) => {
        if (!queryText) return true;
        return normalize(assetLabel(asset, assets)).includes(queryText);
      })
      .sort((a, b) => {
        const pa = getKioskDevicePriority(a, assets, { room: breakdownRoom });
        const pb = getKioskDevicePriority(b, assets, { room: breakdownRoom });
        return pa - pb || assetLabel(a, assets).localeCompare(assetLabel(b, assets), 'cs');
      })
      .slice(0, 40);
  }, [assetSearch, assets, breakdownFloor, breakdownRoom, equipmentAssets]);

  const breakdownFloors = useMemo(() => (
    Array.from(new Set(
      equipmentAssets
        .filter((asset) => getAssetBuilding(asset, assets) === 'D')
        .map((asset) => asset.floor || '')
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'cs'))
  ), [assets, equipmentAssets]);

  const breakdownRooms = useMemo(() => (
    Array.from(new Set(
      equipmentAssets
        .filter((asset) => getAssetBuilding(asset, assets) === 'D')
        .filter((asset) => !breakdownFloor || asset.floor === breakdownFloor)
        .map((asset) => getAssetRoom(asset, assets))
        .filter(Boolean)
    ))
      .filter((room) => normalize(room).includes('extrud'))
      .sort((a, b) => a.localeCompare(b, 'cs'))
  ), [assets, breakdownFloor, equipmentAssets]);

  const selectedAsset = useMemo(
    () => equipmentAssets.find((asset) => asset.id === selectedAssetId) || null,
    [equipmentAssets, selectedAssetId]
  );

  const resetForm = () => {
    setAssetSearch('');
    setSelectedAssetId('');
    setPrefilterAllExtruders(false);
    setBreakdownFloor('');
    setBreakdownRoom('');
    setSelectedQuickOption('');
    setCustomText('');
    setPrefilterDate(new Date().toISOString().slice(0, 10));
    setGearboxTemperature('');
    setGearboxMeasuredAt(new Date().toISOString().slice(0, 16));
    setGearboxNote('');
    setGearboxPhotoFile(null);
    setGearboxProblemOpen(false);
    setGearboxProblemOption('');
    setGearboxProblemPriority('P2');
    setGearboxProblemNote('');
    setSubmitError('');
  };

  const openTodayAction = (action: KioskTodayAction) => {
    resetForm();
    setSelectedAssetId(action.assetId);
    setAssetSearch('');
    if (action.type === 'gearbox_temperature') {
      setActiveView('GEARBOX_TEMP');
      return;
    }
    setActiveView('PREFILTER');
  };

  const showSuccessAndReset = (message: string) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    resetForm();
    setActiveView('MENU');
    setIsSubmitting(false);
    window.setTimeout(() => setShowSuccess(false), 3500);
  };

  const handleBreakdownSubmit = async (problem: string) => {
    if (isSubmitting || !problem.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const buildingId = selectedAsset ? getAssetBuilding(selectedAsset, assets) : selectedBuilding;
      const roomName = selectedAsset ? getAssetRoom(selectedAsset, assets) : '';
      const assetName = selectedAsset?.name || assetSearch.trim() || 'Neurčené zařízení';
      const description = [
        'Nahlášeno z kiosku.',
        buildingId ? `Budova: ${buildingId}.` : '',
        roomName ? `Místnost: ${roomName}.` : '',
        `Problém: ${problem.trim()}.`,
      ].filter(Boolean).join(' ');

      await createTask({
        title: `${assetName}: ${problem.trim()}`,
        description,
        type: 'corrective',
        priority: 'P1',
        source: 'kiosk',
        sourceRefType: selectedAsset ? 'asset' : 'manual',
        sourceRefId: selectedAsset?.id,
        assetId: selectedAsset?.id,
        assetName,
        buildingId,
        createdById: user?.id || 'kiosk',
        createdByName: user?.displayName || 'Kiosk',
      });

      showSuccessAndReset('Porucha nahlášena');
    } catch (err) {
      console.error('Kiosk breakdown error:', err);
      setSubmitError('Nepodařilo se odeslat poruchu. Zkuste to znovu nebo volejte údržbu.');
      setIsSubmitting(false);
    }
  };

  const handleOrderSubmit = async (partName: string) => {
    if (isSubmitting || !partName.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await createTask({
        title: `Požadavek na díl: ${partName.trim()}`,
        description: `Požadavek z kiosku: ${partName.trim()}`,
        type: 'corrective',
        priority: 'P3',
        source: 'kiosk',
        createdById: user?.id || 'kiosk',
        createdByName: user?.displayName || 'Kiosk',
      });
      showSuccessAndReset('Požadavek odeslán');
    } catch (err) {
      console.error('Kiosk order error:', err);
      setSubmitError('Požadavek se nepodařilo odeslat.');
      setIsSubmitting(false);
    }
  };

  const handlePrefilterSubmit = async () => {
    const targets = prefilterAllExtruders ? extruderAssets : selectedAsset ? [selectedAsset] : [];
    if (isSubmitting || targets.length === 0) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await Promise.all(targets.map(async (asset) => {
        const buildingId = getAssetBuilding(asset, assets);
        const roomName = getAssetRoom(asset, assets);
        const changedAt = new Date(`${prefilterDate}T12:00:00`);
        const changedByName = user?.displayName || 'Kiosk';
        const location = [buildingId ? `Budova ${buildingId}` : '', roomName].filter(Boolean).join(' | ');

        await addDoc(collection(db, 'prefilters'), {
          assetId: asset.id,
          assetName: asset.name,
          buildingId,
          roomName,
          changedAt,
          changedById: user?.id || 'kiosk',
          changedByName,
          batchType: prefilterAllExtruders ? 'all_extruders' : 'single_extruder',
          notes: 'Výměna předfiltru z kiosku',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await addWorkLog({
          userId: user?.id || user?.uid || 'kiosk',
          userName: changedByName,
          workerNames: [changedByName],
          type: 'maintenance',
          workType: 'Výměna předfiltru',
          content: [
            'Výměna předfiltru potvrzena z kiosku.',
            `Zařízení: ${asset.name}`,
            location ? `Umístění: ${location}` : '',
          ].filter(Boolean).join('\n'),
          assetId: asset.id,
          assetName: asset.name,
          location: location || undefined,
          performedAt: changedAt,
          auditReady: true,
        });
      }));
      showSuccessAndReset(prefilterAllExtruders ? `Výměna zapsána pro ${targets.length} extruderů` : 'Výměna zaznamenána');
    } catch (err) {
      console.error('Kiosk prefilter error:', err);
      setSubmitError('Záznam se nepodařilo uložit.');
      setIsSubmitting(false);
    }
  };

  const currentGearboxTemperature = () => {
    const parsed = Number(String(gearboxTemperature).replace(',', '.'));
    if (Number.isFinite(parsed)) return clampTemperature(parsed);
    return clampTemperature(selectedAsset?.lastTemperatureC ?? 60);
  };

  const setTemperatureValue = (value: number) => {
    setGearboxTemperature(String(clampTemperature(value)));
  };

  const handleGearboxTemperatureSubmit = async () => {
    const temperatureC = currentGearboxTemperature();
    if (isSubmitting || !selectedAsset || !Number.isFinite(temperatureC) || !gearboxMeasuredAt) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await addGearboxTemperatureLog({
        tenantId: user?.tenantId || selectedAsset.tenantId || 'main_firm',
        gearbox: selectedAsset,
        user,
        temperatureC,
        measuredAt: new Date(gearboxMeasuredAt),
        note: gearboxNote.trim(),
        photoFile: gearboxPhotoFile,
      });
      showSuccessAndReset('Teplota převodovky zapsána');
    } catch (err) {
      console.error('Kiosk gearbox temperature error:', err);
      setSubmitError('Teplotu se nepodařilo uložit.');
      setIsSubmitting(false);
    }
  };

  const handleGearboxProblemSubmit = async () => {
    const note = gearboxProblemNote.trim();
    if (isSubmitting || !selectedAsset || !gearboxProblemOption) return;
    if (gearboxProblemOption === 'Jiný problém' && !note) {
      setSubmitError('Popište prosím problém.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const buildingId = getAssetBuilding(selectedAsset, assets);
      const description = [
        'Nahlášeno z kiosku (převodovka).',
        `Problém: ${gearboxProblemOption}.`,
        selectedAsset.currentExtruderName ? `Extruder: ${selectedAsset.currentExtruderName}.` : '',
        note ? `Poznámka: ${note}.` : '',
      ].filter(Boolean).join(' ');

      await createTask({
        title: `Převodovka ${selectedAsset.name}: ${gearboxProblemOption}`,
        description,
        type: 'corrective',
        priority: gearboxProblemPriority,
        source: 'kiosk',
        sourceRefType: 'asset',
        sourceRefId: selectedAsset.id,
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        buildingId,
        createdById: user?.id || 'kiosk',
        createdByName: user?.displayName || 'Kiosk',
      });

      showSuccessAndReset('Problém s převodovkou nahlášen');
    } catch (err) {
      console.error('Kiosk gearbox problem error:', err);
      setSubmitError('Hlášení se nepodařilo odeslat.');
      setIsSubmitting(false);
    }
  };

  const handleIdeaSubmit = async (idea: string) => {
    if (isSubmitting || !idea.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await createTask({
        title: `Nápad: ${idea.trim().slice(0, 60)}${idea.trim().length > 60 ? '...' : ''}`,
        description: idea.trim(),
        type: 'improvement',
        priority: 'P4',
        source: 'kiosk',
        createdById: user?.id || 'kiosk',
        createdByName: user?.displayName || 'Kiosk',
      });
      showSuccessAndReset('Nápad odeslán');
    } catch (err) {
      console.error('Kiosk idea error:', err);
      setSubmitError('Nápad se nepodařilo odeslat.');
      setIsSubmitting(false);
    }
  };

  const handleMessageSubmit = async (message: string) => {
    if (isSubmitting || !message.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await addDoc(collection(db, 'trustbox'), {
        message: message.trim(),
        category: 'other',
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showSuccessAndReset('Zpráva odeslána');
    } catch (err) {
      console.error('Kiosk trustbox error:', err);
      setSubmitError('Zprávu se nepodařilo odeslat.');
      setIsSubmitting(false);
    }
  };

  const handleHandoverSubmit = async () => {
    if (isSubmitting || !handoverText.trim()) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await addDoc(collection(db, 'shiftNotes'), {
        text: handoverText.trim(),
        author: user?.displayName || 'Kiosk',
        priority: handoverPriority,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setHandoverText('');
      setHandoverPriority('normal');
      showSuccessAndReset('Poznámka přidána');
    } catch (err) {
      console.error('Handover error:', err);
      setSubmitError('Poznámku se nepodařilo uložit.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    setHandoverText('');
    setHandoverPriority('normal');
    setActiveView('MENU');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const renderClock = () => (
    <div className="text-center">
      <div className="text-4xl md:text-6xl font-mono font-bold text-white tracking-wide">
        {currentTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-base md:text-lg text-slate-300 mt-1">
        {currentTime.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
        <CheckCircle2 className="w-7 h-7" />
        <span className="text-lg md:text-xl font-bold">{successMessage}</span>
      </div>
    </div>
  );

  const renderError = () => submitError ? (
    <div className="bg-red-950/70 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mb-4 text-center text-base md:text-lg">
      {submitError}
    </div>
  ) : null;

  const renderSubmitting = () => isSubmitting ? (
    <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center">
      <div className="bg-slate-800 px-8 py-6 rounded-2xl flex items-center gap-4 border border-white/10">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="text-xl text-white">Odesílám...</span>
      </div>
    </div>
  ) : null;

  const renderAssetPicker = (title = 'Vyberte zařízení') => (
    <div className="space-y-4">
      <h3 className="text-xl text-slate-200 font-bold">{title}</h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedBuilding('')}
          className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${!selectedBuilding ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
        >
              Vše
        </button>
        {buildings.map((building) => (
          <button
            key={building}
            onClick={() => setSelectedBuilding(building)}
            className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${selectedBuilding === building ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
          >
            Budova {building}
          </button>
        ))}
      </div>
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          value={assetSearch}
          onChange={(event) => {
            setAssetSearch(event.target.value);
            setSelectedAssetId('');
          }}
          placeholder="Hledat stroj, místnost nebo kód..."
          className="w-full bg-slate-950 border border-white/10 text-white text-lg rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-blue-400"
        />
      </label>
      {selectedAsset && (
        <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4">
          <div>
            <div className="text-white font-bold text-lg">{selectedAsset.name}</div>
            <div className="text-sm text-emerald-100/80">{assetLabel(selectedAsset, assets)}</div>
          </div>
          <button onClick={() => setSelectedAssetId('')} className="min-h-12 min-w-12 flex items-center justify-center p-2 rounded-xl bg-white/10 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      {!selectedAsset && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
          {filteredAssets.length === 0 ? (
            <div className="col-span-full text-center text-slate-400 py-8 text-lg">Z kartotéky se nenašlo žádné zařízení.</div>
          ) : (
            filteredAssets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id);
                  setAssetSearch('');
                }}
                className="text-left bg-slate-900 hover:bg-slate-700 active:scale-[0.99] border border-white/10 rounded-2xl p-4 transition min-h-[88px]"
              >
                <div className="text-white text-lg font-black leading-snug break-words">{asset.name}</div>
                <div className="text-sm text-slate-300 mt-1 leading-snug break-words">{assetLabel(asset, assets)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderBreakdownPicker = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl text-slate-200 font-bold">1. Kde je porucha?</h3>
        <div className="mt-2 inline-flex rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-3 text-base font-bold text-blue-100">
          Budova D
        </div>
      </div>

      {breakdownFloors.length > 0 && (
        <div>
          <div className="text-base font-black text-slate-200 mb-2">Patro</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setBreakdownFloor('');
                setBreakdownRoom('');
                setSelectedAssetId('');
              }}
              className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${!breakdownFloor ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
            >
              Všechna
            </button>
            {breakdownFloors.map((floor) => (
              <button
                key={floor}
                type="button"
                onClick={() => {
                  setBreakdownFloor(floor);
                  setBreakdownRoom('');
                  setSelectedAssetId('');
                }}
                className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${breakdownFloor === floor ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
              >
                {floor}
              </button>
            ))}
          </div>
        </div>
      )}

      {breakdownRooms.length > 0 && (
        <div>
          <div className="text-base font-black text-slate-200 mb-2">Extrudovna</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {breakdownRooms.map((room) => (
              <button
                key={room}
                type="button"
                onClick={() => {
                  setBreakdownRoom(room);
                  setSelectedAssetId('');
                }}
                className={`min-h-14 rounded-xl border px-4 text-left text-base font-bold ${breakdownRoom === room ? 'bg-cyan-700 border-cyan-300 text-white' : 'bg-slate-900 border-white/10 text-slate-200'}`}
              >
                {room}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="relative block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          value={assetSearch}
          onChange={(event) => {
            setAssetSearch(event.target.value);
            setSelectedAssetId('');
          }}
          placeholder="Hledat zařízení v budově D..."
          className="w-full bg-slate-950 border border-white/10 text-white text-lg rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-red-400"
        />
      </label>

      {selectedAsset ? (
        <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4">
          <div>
            <div className="text-white font-bold text-lg">{selectedAsset.name}</div>
            <div className="text-sm text-emerald-100/80">{assetLabel(selectedAsset, assets)}</div>
          </div>
          <button onClick={() => setSelectedAssetId('')} className="min-h-12 min-w-12 flex items-center justify-center p-2 rounded-xl bg-white/10 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
          {breakdownAssets.length === 0 ? (
            <div className="col-span-full text-center text-slate-400 py-8 text-lg">Pro tento výběr se nenašlo žádné zařízení.</div>
          ) : (
            breakdownAssets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id);
                  setAssetSearch('');
                }}
                className="text-left bg-slate-900 hover:bg-slate-700 active:scale-[0.99] border border-white/10 rounded-2xl p-4 transition min-h-[88px]"
              >
                <div className="text-white text-lg font-black leading-snug break-words">{asset.name}</div>
                <div className="text-sm text-slate-300 mt-1 leading-snug break-words">{assetLabel(asset, assets)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderPrefilterPicker = () => (
    <div className="space-y-4">
      <h3 className="text-xl text-slate-200 font-bold">1. Vyber extruder</h3>
      <button
        type="button"
        onClick={() => {
          setPrefilterAllExtruders(true);
          setSelectedAssetId('');
          setAssetSearch('');
        }}
        className={`w-full min-h-20 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
          prefilterAllExtruders
            ? 'bg-cyan-700 border-cyan-300 text-white'
            : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-100'
        }`}
      >
        <div className="text-xl font-black">Všechny extrudery</div>
        <div className="text-sm opacity-80">
          Zapíše výměnu předfiltru ke každému extruderu s přiřazeným předfiltrem.
          {prefilterAlerts.overdue.length > 0 && ` Chybí u ${prefilterAlerts.overdue.length} předfiltrů.`}
        </div>
      </button>

      {prefilterAllExtruders && (
        <div className="flex items-center justify-between gap-3 bg-cyan-500/10 border border-cyan-400/30 rounded-2xl p-4">
          <div>
            <div className="text-white font-bold text-lg">Vybráno: všechny extrudery</div>
            <div className="text-sm text-cyan-100/80">{extruderAssets.length} extruderů</div>
          </div>
          <button onClick={() => setPrefilterAllExtruders(false)} className="min-h-12 min-w-12 flex items-center justify-center p-2 rounded-xl bg-white/10 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {!prefilterAllExtruders && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedBuilding('')}
              className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${!selectedBuilding ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
            >
              Vše
            </button>
            {buildings.map((building) => (
              <button
                key={building}
                onClick={() => setSelectedBuilding(building)}
                className={`px-4 py-3 rounded-xl text-base font-bold whitespace-nowrap border ${selectedBuilding === building ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-slate-300 border-white/10'}`}
              >
                Budova {building}
              </button>
            ))}
          </div>

          <label className="relative block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              value={assetSearch}
              onChange={(event) => {
                setAssetSearch(event.target.value);
                setSelectedAssetId('');
              }}
              placeholder="Hledat extruder nebo kód..."
              className="w-full bg-slate-950 border border-white/10 text-white text-lg rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-cyan-400"
            />
          </label>

          {selectedAsset ? (
            <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4">
              <div>
                <div className="text-white font-bold text-lg">{selectedAsset.name}</div>
                <div className="text-sm text-emerald-100/80">{assetLabel(selectedAsset, assets)}</div>
                <div className="mt-2 text-sm font-black text-cyan-100">{getPrefilterStatus(selectedAsset).label}</div>
              </div>
              <button onClick={() => setSelectedAssetId('')} className="min-h-12 min-w-12 flex items-center justify-center p-2 rounded-xl bg-white/10 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
              {filteredExtruderAssets.length === 0 ? (
                <div className="col-span-full text-center text-slate-400 py-8 text-lg">V kartotéce se nenašel žádný extruder s předfiltrem.</div>
              ) : (
                filteredExtruderAssets.map((asset) => {
                  const status = getPrefilterStatus(asset);
                  const isOverdue = status.state === 'overdue';
                  const isWarning = status.state === 'warning';
                  return (
                    <button
                      key={asset.id}
                      onClick={() => {
                        setSelectedAssetId(asset.id);
                        setAssetSearch('');
                      }}
                      className={`text-left active:scale-[0.99] border rounded-2xl p-4 transition min-h-[96px] ${
                        isOverdue
                          ? 'bg-red-600/20 hover:bg-red-600/30 border-red-400/50'
                          : isWarning
                            ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40'
                            : 'bg-slate-900 hover:bg-slate-700 border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {(isOverdue || isWarning) && <AlertTriangle className={`mt-1 h-5 w-5 shrink-0 ${isOverdue ? 'text-red-200' : 'text-amber-200'}`} />}
                        <div className="min-w-0">
                          <div className="text-white text-lg font-black leading-snug break-words">{asset.name}</div>
                          <div className="text-sm text-slate-300 mt-1 leading-snug break-words">{assetLabel(asset, assets)}</div>
                          <div className={`mt-2 text-sm font-black ${isOverdue ? 'text-red-100' : isWarning ? 'text-amber-100' : 'text-emerald-100'}`}>
                            {status.label}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderGearboxPicker = () => (
    <div className="space-y-4">
      <h3 className="text-xl text-slate-100 font-black leading-tight">1. Vyberte převodovku</h3>
      {gearboxTemperatureAlerts.missing.length > 0 && (
        <div className="rounded-2xl border border-violet-300/40 bg-violet-600/20 p-4">
          <div className="flex items-center gap-3">
            <Thermometer className="h-6 w-6 text-violet-100" />
            <div>
              <div className="text-lg font-black text-white">Dnešní teploty ještě nejsou kompletní</div>
              <div className="text-sm font-bold text-violet-100">{gearboxTemperatureAlerts.missing.length} převodovek čeká na zápis.</div>
            </div>
          </div>
        </div>
      )}
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          value={assetSearch}
          onChange={(event) => {
            setAssetSearch(event.target.value);
            setSelectedAssetId('');
          }}
          placeholder="Hledat převodovku, extruder nebo kód..."
          className="w-full bg-slate-950 border border-white/10 text-white text-lg rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-violet-400"
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
        {activeGearboxAssets
          .filter((asset) => !assetSearch || normalize(assetLabel(asset, assets)).includes(normalize(assetSearch)))
          .slice(0, 30)
          .map((asset) => {
            const dailyStatus = getGearboxDailyTemperatureStatus(asset);
            const missing = dailyStatus.state !== 'ok';
            return (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id);
                  setAssetSearch('');
                }}
                className={`text-left active:scale-[0.99] border rounded-2xl p-4 transition min-h-[98px] ${
                  missing
                    ? 'bg-violet-600/20 hover:bg-violet-600/30 border-violet-300/50'
                    : 'bg-slate-900 hover:bg-slate-700 border-white/10'
                }`}
              >
                <div className="flex items-start gap-2">
                  {missing && <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-violet-100" />}
                  <div className="min-w-0">
                    <div className="text-white text-lg font-black leading-snug break-words">{asset.name}</div>
                    <div className="text-sm text-slate-300 mt-1 leading-snug break-words">{asset.currentExtruderName || assetLabel(asset, assets)}</div>
                    <div className={`mt-2 text-sm font-black ${missing ? 'text-violet-100' : 'text-emerald-100'}`}>
                      {dailyStatus.label}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        {activeGearboxAssets.length === 0 && (
          <div className="col-span-full text-center text-slate-400 py-8 text-lg">V kartotéce zatím není žádná převodovka.</div>
        )}
      </div>
    </div>
  );

  const renderMenu = () => (
    <div className="w-full max-w-6xl space-y-5">
      {renderClock()}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white text-center mb-2 leading-tight">Kiosk výroby</h1>
        <p className="text-slate-300 text-center mb-6 text-base md:text-lg leading-snug">Rychlé hlášení pro údržbu a předání směny.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MenuButton icon={<AlertTriangle className="w-12 h-12" />} label="Nahlásit poruchu" color="bg-red-600 hover:bg-red-500" onClick={() => setActiveView('BREAKDOWN')} />
          <MenuButton icon={<Package className="w-12 h-12" />} label="Požadavek na díl" color="bg-blue-600 hover:bg-blue-500" onClick={() => setActiveView('ORDER')} />
          <MenuButton icon={<ClipboardList className="w-12 h-12" />} label="Předání směny" color="bg-indigo-600 hover:bg-indigo-500" onClick={() => setActiveView('HANDOVER')} />
          <MenuButton icon={<Filter className="w-12 h-12" />} label="Výměna předfiltru" color="bg-cyan-700 hover:bg-cyan-600" badge={prefilterAlerts.overdue.length + prefilterAlerts.warning.length} onClick={() => setActiveView('PREFILTER')} />
          <MenuButton icon={<Thermometer className="w-12 h-12" />} label="Teplota převodovky" color="bg-violet-700 hover:bg-violet-600" badge={gearboxTemperatureAlerts.missing.length} onClick={() => setActiveView('GEARBOX_TEMP')} />
          <MenuButton icon={<Lightbulb className="w-12 h-12" />} label="Nápad" color="bg-emerald-700 hover:bg-emerald-600" onClick={() => setActiveView('IDEA')} />
          <MenuButton icon={<HelpCircle className="w-12 h-12" />} label="Jak postupovat" color="bg-amber-700 hover:bg-amber-600" onClick={() => setActiveView('ASSISTANT')} />
          <MenuButton icon={<ShieldCheck className="w-12 h-12" />} label="Zpráva vedení" color="bg-purple-700 hover:bg-purple-600" onClick={() => setActiveView('MESSAGE')} />
        </div>
      </div>
      <section className="rounded-2xl border border-white/10 bg-slate-900/55 p-2">
        <button
          type="button"
          onClick={() => setShowTodayActions((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left active:scale-[0.99]"
        >
          <span className="min-w-0 text-base font-black text-white">Úkoly na dnešek</span>
          <span className="flex items-center gap-2">
            <span className={`flex h-8 min-w-8 items-center justify-center rounded-xl px-2 text-sm font-black ${
              todayActions.length ? 'bg-red-500 text-white' : 'bg-emerald-500/20 text-emerald-100'
            }`}>
              {todayActions.length}
            </span>
            <ChevronRight className={`h-5 w-5 shrink-0 text-slate-300 transition ${showTodayActions ? 'rotate-90' : ''}`} />
          </span>
        </button>

        {showTodayActions && (
          <div className="mt-2 space-y-2">
            {todayActions.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">
                Předfiltry i teploty převodovek jsou dnes v pořádku.
              </div>
            ) : (
              <>
                {todayActions.slice(0, 6).map((action) => {
                  const toneClass = action.tone === 'red'
                    ? 'border-red-400/45 bg-red-600/15 text-red-50'
                    : action.tone === 'amber'
                      ? 'border-amber-400/45 bg-amber-500/12 text-amber-50'
                      : 'border-violet-300/45 bg-violet-600/15 text-violet-50';
                  const Icon = action.type === 'gearbox_temperature' ? Thermometer : Filter;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => openTodayAction(action)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left active:scale-[0.99] ${toneClass}`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{action.title}</span>
                        <span className="mt-0.5 block text-sm font-bold">{action.detail}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 opacity-70" />
                    </button>
                  );
                })}
                {todayActions.length > 6 && (
                  <div className="px-2 pt-1 text-sm font-bold text-slate-300">
                    Dalších {todayActions.length - 6} položek je v příslušném modulu.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
      <button onClick={handleLogout} className="mx-auto text-slate-300 hover:text-white flex items-center gap-2 text-base transition py-3 px-4 rounded-xl">
        <LogOut className="w-5 h-5" />
        Odhlásit terminál
      </button>
    </div>
  );

  const renderBreakdown = () => (
    <FormWrapper title="Nahlásit poruchu" onCancel={handleCancel}>
      {renderError()}
      {!selectedAsset && renderBreakdownPicker()}
      {selectedAsset && !selectedQuickOption && (
        <div className="space-y-4">
          {renderAssetPicker('1. Vybrané zařízení')}
          <h3 className="text-xl text-slate-100 font-black leading-tight">2. Co se děje?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {QUICK_BREAKDOWNS.map((option) => (
              <QuickButton
                key={option.id}
                label={option.label}
                selected={selectedQuickOption === option.id}
                onClick={() => {
                  setSelectedQuickOption(option.id);
                  if (option.id !== 'other') void handleBreakdownSubmit(option.label);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {selectedAsset && selectedQuickOption === 'other' && (
        <div>
          <h3 className="text-xl text-slate-100 mb-4 font-black leading-tight">3. Popište problém</h3>
          <textarea
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="Co se děje?"
            autoFocus
            className="w-full h-40 bg-slate-950 text-white text-xl p-4 rounded-2xl border-2 border-white/10 focus:border-red-400 outline-none resize-none mb-4"
          />
          <button
            onClick={() => void handleBreakdownSubmit(customText)}
            disabled={!customText.trim() || isSubmitting}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"
          >
            <Send className="w-6 h-6" />
            Odeslat hlášení
          </button>
        </div>
      )}
    </FormWrapper>
  );

  const renderOrder = () => (
    <FormWrapper title="Požadavek na díl" onCancel={handleCancel}>
      {renderError()}
      {!selectedQuickOption && (
        <div>
          <h3 className="text-xl text-slate-100 mb-4 font-black leading-tight">Co potřebujete?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {QUICK_PARTS.map((option) => (
              <QuickButton
                key={option.id}
                label={option.label}
                selected={selectedQuickOption === option.id}
                onClick={() => {
                  setSelectedQuickOption(option.id);
                  if (option.id !== 'other') void handleOrderSubmit(option.label);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {selectedQuickOption === 'other' && (
        <div>
          <h3 className="text-xl text-slate-100 mb-4 font-black leading-tight">Upřesněte požadavek</h3>
          <textarea
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="Jaký díl nebo materiál potřebujete?"
            autoFocus
            className="w-full h-40 bg-slate-950 text-white text-xl p-4 rounded-2xl border-2 border-white/10 focus:border-blue-400 outline-none resize-none mb-4"
          />
          <button onClick={() => void handleOrderSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3">
            <Send className="w-6 h-6" />
            Odeslat požadavek
          </button>
        </div>
      )}
    </FormWrapper>
  );

  const renderPrefilter = () => (
    <FormWrapper title="Výměna předfiltru" onCancel={handleCancel}>
      {renderError()}
      {!selectedAsset && !prefilterAllExtruders && renderPrefilterPicker()}
      {(selectedAsset || prefilterAllExtruders) && (
        <div className="space-y-5">
          {renderPrefilterPicker()}
          <label className="block">
            <span className="block text-slate-200 text-base font-black mb-2">Datum výměny</span>
            <input
              type="date"
              value={prefilterDate}
              onChange={(event) => setPrefilterDate(event.target.value)}
              className="w-full bg-slate-950 text-white text-xl p-4 rounded-2xl border border-white/10"
            />
          </label>
          <button onClick={() => void handlePrefilterSubmit()} disabled={isSubmitting} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3">
            <CheckCircle2 className="w-6 h-6" />
            Potvrdit výměnu
          </button>
        </div>
      )}
    </FormWrapper>
  );

  const renderGearboxTemperature = () => (
    <FormWrapper title="Teplota převodovky" onCancel={handleCancel}>
      {renderError()}
      {!selectedAsset && renderGearboxPicker()}
      {selectedAsset && (() => {
        const temperature = currentGearboxTemperature();
        const status = temperatureStatus(selectedAsset, temperature);
        return (
        <div className="space-y-5">
          <div className="bg-violet-500/10 border border-violet-400/30 rounded-2xl p-4">
            <div className="text-white text-xl font-bold">{selectedAsset.name}</div>
            <div className="text-sm text-violet-100/80 mt-1">{selectedAsset.currentExtruderName || assetLabel(selectedAsset, assets)}</div>
            <button onClick={() => setSelectedAssetId('')} className="mt-3 text-sm text-violet-200 underline">Vybrat jinou převodovku</button>
          </div>

          <div className={`rounded-3xl border ${status.border} ${status.bg} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-300">Teplota</div>
                <div className="text-6xl font-black text-white leading-none">{temperature}<span className="text-3xl"> °C</span></div>
              </div>
              <div className={`rounded-2xl border ${status.border} px-3 py-2 text-sm font-black ${status.color}`}>{status.label}</div>
            </div>
            <input
              type="range"
              min={20}
              max={120}
              step={1}
              value={temperature}
              onChange={(event) => setTemperatureValue(Number(event.target.value))}
              className="mt-5 w-full accent-violet-500"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => setTemperatureValue(temperature + delta)}
                  className="min-h-12 rounded-xl border border-white/10 bg-slate-950/60 text-lg font-black text-white active:scale-[0.98]"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[50, 60, 70, 80].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTemperatureValue(preset)}
                  className="min-h-12 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-200 active:scale-[0.98]"
                >
                  {preset} °C
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-slate-200 text-base font-black mb-2">Datum a čas měření</span>
            <input
              type="datetime-local"
              value={gearboxMeasuredAt}
              onChange={(event) => setGearboxMeasuredAt(event.target.value)}
              className="w-full bg-slate-950 text-white text-lg p-4 rounded-2xl border border-white/10"
            />
          </label>
          <label className="block">
            <span className="block text-slate-200 text-base font-black mb-2">Poznámka</span>
            <textarea
              value={gearboxNote}
              onChange={(event) => setGearboxNote(event.target.value)}
              placeholder="Volitelně: zvuk, únik oleje, vibrace..."
              className="w-full h-28 bg-slate-950 text-white text-lg p-4 rounded-2xl border border-white/10 outline-none focus:border-violet-400 resize-none"
            />
          </label>
          <div>
            <input
              ref={gearboxPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setGearboxPhotoFile(event.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => gearboxPhotoInputRef.current?.click()}
              className="w-full border border-dashed border-white/20 text-slate-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3"
            >
              <Camera className="w-5 h-5" />
              {gearboxPhotoFile ? gearboxPhotoFile.name : 'Přidat fotku'}
            </button>
          </div>
          <button
            onClick={() => void handleGearboxTemperatureSubmit()}
            disabled={!gearboxMeasuredAt || isSubmitting}
            className="w-full bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"
          >
            <Thermometer className="w-6 h-6" />
            Zapsat teplotu
          </button>

          <div className="border-t border-white/10 pt-4">
            {!gearboxProblemOpen ? (
              <button
                type="button"
                onClick={() => setGearboxProblemOpen(true)}
                className="w-full border border-red-400/40 bg-red-500/10 text-red-100 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <AlertTriangle className="w-5 h-5" />
                Nahlásit problém
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl text-slate-100 font-black leading-tight">Nahlásit problém s převodovkou</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setGearboxProblemOpen(false);
                      setGearboxProblemOption('');
                      setGearboxProblemPriority('P2');
                      setGearboxProblemNote('');
                      setSubmitError('');
                    }}
                    className="min-h-12 min-w-12 flex items-center justify-center p-2 rounded-xl bg-white/10 text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGearboxProblemPriority('P2')}
                    className={`min-h-14 rounded-xl border px-4 text-base font-black ${gearboxProblemPriority === 'P2' ? 'bg-amber-600 border-amber-300 text-white' : 'bg-slate-900 border-white/10 text-slate-200'}`}
                  >
                    Závada (P2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGearboxProblemPriority('P1')}
                    className={`min-h-14 rounded-xl border px-4 text-base font-black ${gearboxProblemPriority === 'P1' ? 'bg-red-600 border-red-300 text-white' : 'bg-slate-900 border-white/10 text-slate-200'}`}
                  >
                    Havárie (P1)
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {QUICK_GEARBOX_ISSUES.map((option) => (
                    <QuickButton
                      key={option.id}
                      label={option.label}
                      selected={gearboxProblemOption === option.label}
                      onClick={() => setGearboxProblemOption(option.label)}
                    />
                  ))}
                </div>

                <label className="block">
                  <span className="block text-slate-200 text-base font-black mb-2">
                    {gearboxProblemOption === 'Jiný problém' ? 'Popište problém' : 'Poznámka (volitelně)'}
                  </span>
                  <textarea
                    value={gearboxProblemNote}
                    onChange={(event) => setGearboxProblemNote(event.target.value)}
                    placeholder="Co se děje s převodovkou?"
                    className="w-full h-28 bg-slate-950 text-white text-lg p-4 rounded-2xl border border-white/10 outline-none focus:border-red-400 resize-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleGearboxProblemSubmit()}
                  disabled={isSubmitting || !gearboxProblemOption || (gearboxProblemOption === 'Jiný problém' && !gearboxProblemNote.trim())}
                  className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3"
                >
                  <Send className="w-6 h-6" />
                  Odeslat hlášení
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </FormWrapper>
  );

  const renderIdea = () => (
    <FormWrapper title="Nápad na zlepšení" onCancel={handleCancel}>
      {renderError()}
      <textarea value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Váš nápad..." autoFocus className="w-full h-48 bg-slate-950 text-white text-xl p-4 rounded-2xl border-2 border-white/10 focus:border-emerald-400 outline-none resize-none mb-4" />
      <button onClick={() => void handleIdeaSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3">
        <Send className="w-6 h-6" />
        Odeslat nápad
      </button>
    </FormWrapper>
  );

  const renderMessage = () => (
    <FormWrapper title="Zpráva vedení" onCancel={handleCancel}>
      {renderError()}
      <p className="text-slate-300 text-center mb-4 text-base leading-snug">Zpráva se uloží bez jména operátora.</p>
      <textarea value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Vaše zpráva..." autoFocus className="w-full h-48 bg-slate-950 text-white text-xl p-4 rounded-2xl border-2 border-white/10 focus:border-purple-400 outline-none resize-none mb-4" />
      <button onClick={() => void handleMessageSubmit(customText)} disabled={!customText.trim() || isSubmitting} className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3">
        <ShieldCheck className="w-6 h-6" />
        Odeslat zprávu
      </button>
    </FormWrapper>
  );

  const renderAssistant = () => (
    <FormWrapper title="Jak postupovat při poruše" onCancel={handleCancel}>
      <div className="space-y-4 overflow-y-auto max-h-[60vh]">
        {ASSISTANT_TIPS.map((tip) => (
          <div key={tip.title} className="bg-slate-900 border border-white/10 rounded-2xl p-4">
            <h3 className="text-xl font-bold text-white mb-3">{tip.title}</h3>
            <ul className="space-y-2">
              {tip.steps.map((step) => (
                <li key={step} className="text-lg text-slate-300 flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </FormWrapper>
  );

  const renderHandover = () => (
    <FormWrapper title="Předání směny" onCancel={handleCancel}>
      {renderError()}
      <div className="space-y-3 mb-4 max-h-[38vh] overflow-y-auto">
        {shiftNotes.length === 0 ? (
          <div className="text-center text-slate-400 py-8 text-lg">Zatím žádné poznámky</div>
        ) : (
          shiftNotes.map((note) => (
            <div key={note.id} className={`rounded-xl p-4 border ${note.priority === 'important' ? 'bg-red-950/40 border-red-500/30' : 'bg-slate-900 border-white/10'}`}>
              <div className="flex items-center justify-between mb-1 gap-3">
                <span className="text-sm font-bold text-white">{note.author}</span>
                <span className="text-sm text-slate-300">{note.time}</span>
              </div>
              <p className="text-lg text-slate-300">{note.text}</p>
              {note.priority === 'important' && <span className="inline-block mt-2 text-xs bg-red-500/20 text-red-200 px-2 py-1 rounded-full font-bold">Důležité</span>}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-white/10 pt-4">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setHandoverPriority('normal')} className={`py-3 rounded-xl text-lg font-bold transition ${handoverPriority === 'normal' ? 'bg-slate-600 text-white' : 'bg-slate-900 text-slate-300'}`}>Běžný zápis</button>
          <button onClick={() => setHandoverPriority('important')} className={`py-3 rounded-xl text-lg font-bold transition ${handoverPriority === 'important' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-300'}`}>Důležité</button>
        </div>
        <textarea value={handoverText} onChange={(event) => setHandoverText(event.target.value)} placeholder="Zpráva pro další směnu..." className="w-full h-32 bg-slate-950 text-white text-xl p-4 rounded-2xl border-2 border-white/10 focus:border-indigo-400 outline-none resize-none mb-3" />
        <button onClick={() => void handleHandoverSubmit()} disabled={!handoverText.trim() || isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3">
          <Send className="w-6 h-6" />
          Přidat poznámku
        </button>
      </div>
    </FormWrapper>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start overflow-y-auto p-3 md:p-6 relative">
      {renderSubmitting()}
      {showSuccess && renderSuccess()}
      {activeView === 'MENU' && renderMenu()}
      {activeView === 'BREAKDOWN' && renderBreakdown()}
      {activeView === 'ORDER' && renderOrder()}
      {activeView === 'PREFILTER' && renderPrefilter()}
      {activeView === 'GEARBOX_TEMP' && renderGearboxTemperature()}
      {activeView === 'IDEA' && renderIdea()}
      {activeView === 'MESSAGE' && renderMessage()}
      {activeView === 'ASSISTANT' && renderAssistant()}
      {activeView === 'HANDOVER' && renderHandover()}
    </div>
  );
}

function MenuButton({ icon, label, color, badge, onClick }: { icon: React.ReactNode; label: string; color: string; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${color} relative text-white rounded-2xl p-4 md:p-5 flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 min-h-[118px] md:min-h-[148px] border border-white/10 overflow-hidden`}>
      {Boolean(badge) && (
        <span className="absolute right-3 top-3 flex min-h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-sm font-black text-white shadow-lg">
          {badge && badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className="shrink-0">{icon}</span>
      <span className="text-base md:text-lg font-black text-center mt-3 leading-snug break-words max-w-full">{label}</span>
    </button>
  );
}

function QuickButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`min-h-16 px-4 py-4 rounded-xl text-base md:text-lg font-black leading-snug transition active:scale-95 border break-words ${selected ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 text-white hover:bg-slate-700 border-white/10'}`}>
      {label}
    </button>
  );
}

function FormWrapper({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-5xl max-h-[calc(100vh-24px)] overflow-y-auto bg-slate-800 p-4 md:p-6 rounded-3xl shadow-2xl border border-white/10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="min-h-12 min-w-12 flex items-center justify-center p-3 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white transition">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl md:text-3xl font-black text-white leading-tight break-words">{title}</h2>
      </div>
      {children}
    </div>
  );
}
