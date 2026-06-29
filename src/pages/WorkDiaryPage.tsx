import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, ClipboardList, FileSpreadsheet, FileText, Link2, Loader2, MapPin, Minus, NotebookPen, Plus, Search, ShieldCheck, User, Wrench } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { brandFilePrefix } from '../lib/branding';
import { useEmployeeNames } from '../hooks/useEmployeeDirectory';
import MicButton from '../components/ui/MicButton';
import { addWorkLog, subscribeToRecentWorkLogs, updateWorkLog } from '../services/workLogService';
import { createTask } from '../services/taskService';
import { assetService } from '../services/assetService';
import { isGearboxAsset } from '../services/gearboxService';
import { importWorkHistoryWorkbook } from '../utils/importers/importWorkHistory';
import BottomSheet from '../components/ui/BottomSheet';
import FAB from '../components/ui/FAB';
import type { WorkLog } from '../types/workLog';
import type { TaskPriority } from '../types/firestore';
import type { Asset } from '../types/asset';
import { showToast } from '../components/ui/Toast';

type WorkLogKind = 'maintenance' | 'repair' | 'inspection' | 'note' | 'cleaning';
type SuggestMode = 'location' | 'asset' | 'worker' | null;
type DiaryRange = 'today' | 'week' | 'month' | 'all';
type LocationOption = { label: string; search: string; rank: number };

const WORK_TYPES: { value: WorkLogKind; label: string; hint: string; icon: typeof Wrench; color: string }[] = [
  { value: 'maintenance', label: 'Údržba', hint: 'běžná práce', icon: Wrench, color: 'amber' },
  { value: 'repair', label: 'Oprava', hint: 'závada', icon: ShieldCheck, color: 'red' },
  { value: 'inspection', label: 'Kontrola', hint: 'obchůzka', icon: CheckCircle2, color: 'emerald' },
  { value: 'note', label: 'Poznámka', hint: 'info', icon: NotebookPen, color: 'sky' },
  { value: 'cleaning', label: 'Úklid', hint: 'provedeno', icon: CheckCircle2, color: 'emerald' },
];

const QUICK_MINUTES = ['15', '30', '45', '60', '90', '120'];

const PRIORITIES: { value: TaskPriority; label: string; hint: string; color: string }[] = [
  { value: 'P1', label: 'P1', hint: 'hned', color: 'red' },
  { value: 'P2', label: 'P2', hint: 'urgentní', color: 'orange' },
  { value: 'P3', label: 'P3', hint: 'plán', color: 'blue' },
  { value: 'P4', label: 'P4', hint: 'až bude čas', color: 'slate' },
];

function formatDate(date: Date) {
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' '
    + date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function typeLabel(type: WorkLog['type']) {
  if (type === 'time_log') return 'Práce z úkolu';
  if (type === 'status_change') return 'Změna stavu';
  if (type === 'part_used') return 'Použitý díl';
  return WORK_TYPES.find((item) => item.value === type)?.label || 'Zápis';
}

function formatDuration(minutes: number) {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function uniqueNames(values: Array<string | undefined | null>) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const cleanValue = value?.trim().replace(/\s+/g, ' ');
    if (!cleanValue) continue;
    const key = normalizeSearchText(cleanValue);
    if (!byKey.has(key)) {
      byKey.set(key, cleanValue);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'cs'));
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function samePerson(a?: string | null, b?: string | null) {
  return normalizeSearchText(a || '') === normalizeSearchText(b || '');
}

function isBuildingAsset(asset: Asset) {
  const type = normalizeSearchText(asset.entityType || '');
  return type === 'budova' || type === 'hala' || type === 'areal';
}

function isRoomAsset(asset: Asset) {
  const type = normalizeSearchText(asset.entityType || '');
  return type === 'mistnost' || type === 'room' || type === 'prostor';
}

function inferBuildingIdFromText(...values: Array<string | undefined | null>) {
  const joined = values.filter(Boolean).join(' ').toUpperCase();
  const explicit = joined.match(/\bBUDOVA\s*([A-Z0-9]{1,3})\b/);
  if (explicit) return explicit[1];
  const compact = joined.match(/\b([A-Z])\b/);
  return compact?.[1] || '';
}

function buildingLabelFromAsset(asset: Asset) {
  if (asset.buildingId) return `Budova ${asset.buildingId}`;
  if (isBuildingAsset(asset) && asset.name) return asset.name;
  const inferred = inferBuildingIdFromText(asset.code, asset.name);
  return inferred ? `Budova ${inferred}` : '';
}

function cleanLocationPart(value?: string | null, buildingCode?: string | null) {
  const code = buildingCode?.trim();
  let text = value?.trim().replace(/\s+/g, ' ') || '';
  if (!text) return '';

  text = text.replace(/^budova\s+[a-z0-9]{1,4}\s*[-–—:/]\s*/i, '');
  if (code) {
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escapedCode}\\s*[-–—:/]\\s*`, 'i'), '');
  }

  return text.trim();
}

function canonicalLocationKey(label: string, buildingCode?: string | null) {
  const cleanLabel = cleanLocationPart(label, buildingCode);
  return normalizeSearchText([buildingCode?.trim().toUpperCase(), cleanLabel].filter(Boolean).join(' - '));
}

function logDate(log: WorkLog) {
  return log.performedAt || log.createdAt;
}

function getDiaryRange(range: DiaryRange) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (range === 'all') return { start: new Date(2000, 0, 1), end, label: 'vse' };
  if (range === 'today') return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end, label: 'dnes' };
  if (range === 'week') {
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { start, end, label: '7 dni' };
  }
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return { start, end, label: '30 dni' };
}

function csvCell(value: unknown) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function cleaningEvidenceConfirmed(log: WorkLog) {
  return Boolean(
    (log.cleaningDone && log.cleaningChecked) ||
    log.cleaningStatus === 'done' ||
    log.cleaningStatus === 'not_applicable' ||
    log.cleaningNotApplicable
  );
}

function cleaningEvidenceLabel(log: WorkLog) {
  if (log.cleaningStatus === 'done' || (log.cleaningDone && log.cleaningChecked)) {
    return 'ANO - uklizeno a nic nezustalo na miste';
  }
  if (log.cleaningStatus === 'not_applicable' || log.cleaningNotApplicable) {
    return 'NETYKA SE';
  }
  return 'NE';
}

function exportDiaryCSV(logs: WorkLog[], label: string) {
  const rows = [
    ['Datum provedení', 'Datum zápisu', 'Typ', 'Kdo', 'Spolupracovali', 'Kde', 'Zařízení/věc', 'Čas', 'Úklid a kontrola', 'Obsah', 'Úkol'],
    ...logs.map((log) => [
      formatDate(logDate(log)),
      formatDate(log.createdAt),
      typeLabel(log.type),
      log.userName || '',
      uniqueNames(Array.isArray(log.workerNames) ? log.workerNames : []).filter((name) => !samePerson(name, log.userName)).join(', '),
      log.location || '',
      log.assetName || '',
      log.hoursWorked ? formatDuration(Math.round(log.hoursWorked * 60)) : '',
      cleaningEvidenceLabel(log),
      log.content || '',
      log.taskTitle || log.taskId || '',
    ]),
  ];
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${brandFilePrefix('Denik_udrzby')}_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function assetLocation(asset?: Asset) {
  if (!asset) return '';
  const roomLabel = cleanLocationPart(asset.areaName || asset.location, asset.buildingId);
  if (roomLabel && asset.buildingId) return `Budova ${asset.buildingId} - ${roomLabel}`;
  if (roomLabel) return roomLabel;
  const buildingLabel = buildingLabelFromAsset(asset);
  if (buildingLabel) return buildingLabel;
  return '';
}

function locationSearchTokens(selectedLocation: string) {
  const normalized = normalizeSearchText(selectedLocation);
  const withoutBuilding = normalizeSearchText(
    selectedLocation
      .replace(/^budova\s+[a-z0-9]{1,4}\s*[-–—:/]\s*/i, '')
      .replace(/^[a-z0-9]{1,4}\s*[-–—:/]\s*/i, '')
  );
  return uniqueNames([normalized, withoutBuilding]).filter((token) => token.length >= 2);
}

function assetBuildingCode(asset: Asset, allAssets: Asset[] = []) {
  if (asset.buildingId?.trim()) return asset.buildingId.trim().toUpperCase();
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((item) => item.id === parentId);
    if (!parent) break;
    if (parent.buildingId?.trim()) return parent.buildingId.trim().toUpperCase();
    const inferred = inferBuildingIdFromText(parent.name, parent.code);
    if (inferred) return inferred.toUpperCase();
    parentId = parent.parentId;
  }
  return inferBuildingIdFromText(asset.name, asset.code).toUpperCase();
}

function selectedLocationParts(selectedLocation: string) {
  const text = selectedLocation.trim();
  const buildingMatch = text.match(/\bbudova\s+([a-z0-9]{1,4})\b/i) || text.match(/^([a-z0-9]{1,4})\s*[-–—:/]\s*/i);
  const buildingCode = buildingMatch?.[1]?.toUpperCase() || '';
  const roomLabel = cleanLocationPart(text, buildingCode);
  const normalizedRoom = normalizeSearchText(roomLabel);
  const normalizedBuilding = normalizeSearchText(buildingCode ? `Budova ${buildingCode}` : '');
  const hasSpecificRoom = normalizedRoom.length >= 2 && normalizedRoom !== normalizedBuilding && !/^budova\s+[a-z0-9]{1,4}$/.test(normalizedRoom);
  return { buildingCode, roomLabel, normalizedRoom, hasSpecificRoom };
}

function assetRoomCandidates(asset: Asset, allAssets: Asset[] = []) {
  const buildingCode = assetBuildingCode(asset, allAssets);
  const parents: Asset[] = [];
  let parentId = asset.parentId;
  while (parentId) {
    const parent = allAssets.find((item) => item.id === parentId);
    if (!parent || parents.some((item) => item.id === parent.id)) break;
    parents.push(parent);
    parentId = parent.parentId;
  }
  const roomCandidates = [
    cleanLocationPart(asset.areaName, buildingCode),
    cleanLocationPart(asset.location, buildingCode),
    ...parents.flatMap((parent) => {
      const parentBuildingCode = assetBuildingCode(parent, allAssets) || buildingCode;
      return [
        isRoomAsset(parent) ? cleanLocationPart(parent.name, parentBuildingCode) : '',
        cleanLocationPart(parent.areaName, parentBuildingCode),
        cleanLocationPart(parent.location, parentBuildingCode),
      ];
    }),
  ];

  return uniqueNames(roomCandidates)
    .filter(Boolean)
    .map((value) => normalizeSearchText(String(value)));
}

function assetLocationCandidates(asset: Asset, allAssets: Asset[] = []) {
  const buildingCode = asset.buildingId?.trim();
  const roomLabel = cleanLocationPart(asset.areaName || asset.location, buildingCode);
  const buildingLabel = buildingLabelFromAsset(asset);
  const parent = asset.parentId ? allAssets.find((item) => item.id === asset.parentId) : undefined;
  const parentBuildingCode = parent?.buildingId?.trim() || buildingCode;
  const parentRoomLabel = parent
    ? cleanLocationPart(parent.name || parent.areaName || parent.location, parentBuildingCode)
    : '';

  const candidates = [
    asset.areaName,
    asset.location,
    asset.floor,
    buildingLabel,
    assetLocation(asset),
    buildingCode && roomLabel ? `${buildingCode} - ${roomLabel}` : '',
    buildingCode && roomLabel ? `Budova ${buildingCode} - ${roomLabel}` : '',
    parent?.name,
    parent?.areaName,
    parent?.location,
    parent ? assetLocation(parent) : '',
    parentBuildingCode && parentRoomLabel ? `${parentBuildingCode} - ${parentRoomLabel}` : '',
    parentBuildingCode && parentRoomLabel ? `Budova ${parentBuildingCode} - ${parentRoomLabel}` : '',
  ];

  return uniqueNames(candidates)
    .filter(Boolean)
    .map((value) => normalizeSearchText(String(value)));
}

function assetMatchesLocation(asset: Asset, selectedLocation: string, allAssets: Asset[] = []) {
  const parts = selectedLocationParts(selectedLocation);
  const buildingCode = assetBuildingCode(asset, allAssets);

  if (parts.buildingCode && buildingCode && buildingCode !== parts.buildingCode) {
    return false;
  }

  if (parts.hasSpecificRoom) {
    const roomCandidates = assetRoomCandidates(asset, allAssets);
    return roomCandidates.some((candidate) => candidate === parts.normalizedRoom);
  }

  const tokens = locationSearchTokens(selectedLocation);
  if (tokens.length === 0) return true;
  const candidates = assetLocationCandidates(asset, allAssets);
  return tokens.some((token) =>
    candidates.some((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate))
  );
}

function findAssetForWorkLog(log: WorkLog, assetOptions: Asset[], allAssets: Asset[]) {
  if (log.assetId) {
    const byId = assetOptions.find((asset) => asset.id === log.assetId);
    if (byId) return byId;
  }

  const assetText = normalizeSearchText(log.assetName || '');
  if (!assetText) return undefined;
  const locationText = log.location || '';

  const exact = assetOptions.find((asset) =>
    normalizeSearchText(asset.name) === assetText ||
    normalizeSearchText(asset.code || '') === assetText ||
    normalizeSearchText(`${asset.name} ${asset.code || ''}`) === assetText
  );
  if (exact && (!locationText || assetMatchesLocation(exact, locationText, allAssets))) return exact;

  const locationScoped = locationText
    ? assetOptions.filter((asset) => assetMatchesLocation(asset, locationText, allAssets))
    : assetOptions;

  return locationScoped.find((asset) => {
    const name = normalizeSearchText(asset.name);
    const code = normalizeSearchText(asset.code || '');
    return name.includes(assetText) || assetText.includes(name) || (code && assetText.includes(code));
  });
}

const suggestionPanelClass =
  'mt-2 z-30 max-h-[min(22rem,52vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl';

export default function WorkDiaryPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigation('/');
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const adminWorkerNames = useEmployeeNames({ tenantId });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingHistory, setImportingHistory] = useState(false);
  const [relinkSavingLogId, setRelinkSavingLogId] = useState('');
  const [type, setType] = useState<WorkLogKind>('maintenance');
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetId, setAssetId] = useState('');
  const [suggestMode, setSuggestMode] = useState<SuggestMode>(null);
  const [performedBy, setPerformedBy] = useState(user?.displayName || '');
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [workerInput, setWorkerInput] = useState('');
  const [performedDate, setPerformedDate] = useState(todayDateInput());
  const [backDateMode, setBackDateMode] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | WorkLogKind>('all');
  const [filterPerson, setFilterPerson] = useState('');
  const [filterRange, setFilterRange] = useState<DiaryRange>('month');
  const [filterCleanup, setFilterCleanup] = useState<'all' | 'confirmed' | 'missing'>('all');
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState('');
  const [editingLogId, setEditingLogId] = useState('');
  const [lastSavedLogId, setLastSavedLogId] = useState('');
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P3');
  const [dueDate, setDueDate] = useState('');
  const touchPick = useRef({ x: 0, y: 0, moved: false, suppressClick: false });
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeToRecentWorkLogs((items) => {
      setLogs(items);
      setLoading(false);
    }, 1000);
    return () => unsub();
  }, []);

  useEffect(() => {
    const logId = searchParams.get('log');
    if (!logId) return;
    setSearch(logId);
    setFilterRange('all');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setShowEntryModal(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('new');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    assetService.getAll(tenantId)
      .then((items) => {
        if (!cancelled) setAssets(items);
      })
      .catch((err) => {
        console.error('[WorkDiary] Asset suggestions failed:', err);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    if (!performedBy.trim() && user?.displayName) {
      setPerformedBy(user.displayName);
    }
  }, [performedBy, user?.displayName]);

  useEffect(() => {
    if (type === 'repair') {
      setCreateFollowUpTask(true);
      setTaskPriority((current) => current === 'P3' ? 'P2' : current);
    }
  }, [type]);

  const todaySummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = logs.filter((log) => (log.performedAt || log.createdAt).toISOString().slice(0, 10) === today);
    const hours = todayLogs.reduce((sum, log) => sum + (log.hoursWorked || 0), 0);
    return { count: todayLogs.length, hours };
  }, [logs]);

  const selectedType = WORK_TYPES.find((item) => item.value === type) || WORK_TYPES[0];
  const durationMinutes = Number(minutes) || 0;
  const technicianName = performedBy.trim() || user?.displayName || 'Neznamy';
  const allWorkerNames = uniqueNames([technicianName, ...workerNames]);
  const performedAtDate = performedDate ? new Date(`${performedDate}T12:00:00`) : new Date();
  const isBackdatedEntry = performedDate !== todayDateInput();
  const suggestedTaskTitle = taskTitle.trim()
    || assetName.trim()
    || content.trim().slice(0, 70)
    || 'Ukol z deniku udrzby';
  const assetOptions = useMemo(() => (
    assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => !isBuildingAsset(asset) && !isRoomAsset(asset))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
      .slice(0, 250)
  ), [assets]);
  const locationScopedAssetOptions = useMemo(() => {
    if (!location.trim()) return assetOptions;
    return assetOptions.filter((asset) => assetMatchesLocation(asset, location, assets));
  }, [assetOptions, assets, location]);
  const selectedAsset = useMemo(() => {
    if (assetId) {
      const byId = assets.find((asset) => asset.id === assetId);
      if (byId && (!location.trim() || assetMatchesLocation(byId, location, assets))) return byId;
    }
    const value = normalizeSearchText(assetName);
    if (!value) return undefined;
    return locationScopedAssetOptions.find((asset) =>
      normalizeSearchText(asset.name) === value ||
      normalizeSearchText(asset.code || '') === value ||
      normalizeSearchText(`${asset.name} ${asset.code || ''}`) === value
    );
  }, [assetId, assetName, assets, location, locationScopedAssetOptions]);

  const selectedGearboxExtruder = useMemo(() => {
    if (!selectedAsset || !isGearboxAsset(selectedAsset)) return undefined;
    const extruderId = selectedAsset.currentExtruderId || '';
    if (!extruderId) return undefined;
    return assets.find((asset) => asset.id === extruderId);
  }, [assets, selectedAsset]);

  const selectedGearboxExtruderName = selectedAsset && isGearboxAsset(selectedAsset)
    ? selectedAsset.currentExtruderName || selectedGearboxExtruder?.name || ''
    : '';

  const locationOptions = useMemo<LocationOption[]>(() => {
    const options = new Map<string, LocationOption>();
    const addOption = (
      label?: string | null,
      extraSearch: Array<string | undefined | null> = [],
      rank = 10,
      key?: string
    ) => {
      const cleanLabel = label?.trim();
      if (!cleanLabel) return;
      const search = normalizeSearchText([cleanLabel, ...extraSearch].filter(Boolean).join(' '));
      const optionKey = key || normalizeSearchText(cleanLabel);
      const existing = options.get(optionKey);
      if (existing) {
        existing.search = `${existing.search} ${search}`;
        existing.rank = Math.min(existing.rank, rank);
        return;
      }
      options.set(optionKey, { label: cleanLabel, search, rank });
    };

    assets
      .filter((asset) => !asset.isDeleted)
      .forEach((asset) => {
        const buildingCode = asset.buildingId?.trim();
        const buildingLabel = buildingLabelFromAsset(asset);
        const rawRoomLabel = isRoomAsset(asset)
          ? asset.name
          : asset.areaName || asset.location;
        const roomLabel = cleanLocationPart(rawRoomLabel, buildingCode);
        const commonSearch = [asset.name, asset.code, asset.entityType, asset.floor, buildingCode, buildingLabel, roomLabel];

        if (isBuildingAsset(asset)) {
          addOption(buildingLabel || asset.name, commonSearch, 0, canonicalLocationKey(buildingLabel || asset.name));
          return;
        }

        if (roomLabel) {
          const displayLabel = buildingCode ? `Budova ${buildingCode} - ${roomLabel}` : roomLabel;
          addOption(displayLabel, commonSearch, isRoomAsset(asset) ? 0 : 2, canonicalLocationKey(roomLabel, buildingCode));
          return;
        }

        if (buildingLabel) {
          addOption(buildingLabel, [buildingCode, asset.floor, asset.name, asset.code], 8, canonicalLocationKey(buildingLabel));
        }
      });

    return Array.from(options.values())
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'cs'))
      .slice(0, 250);
  }, [assets]);

  const filteredLocationOptions = useMemo(() => {
    const q = normalizeSearchText(location);
    return locationOptions
      .map((option) => {
        if (!q) return { option, score: option.rank };
        const label = normalizeSearchText(option.label);
        if (label.startsWith(q)) return { option, score: option.rank - 30 };
        if (label.includes(q)) return { option, score: option.rank - 20 };
        if (option.search.includes(q)) return { option, score: option.rank - 10 };
        return null;
      })
      .filter((item): item is { option: LocationOption; score: number } => Boolean(item))
      .sort((a, b) => a.score - b.score || a.option.label.localeCompare(b.option.label, 'cs'))
      .map((item) => item.option)
      .slice(0, 10);
  }, [location, locationOptions]);

  const filteredAssetOptions = useMemo(() => {
    const q = normalizeSearchText(assetName);
    const hasLocation = location.trim().length > 0;
    if (!hasLocation && q.length < 2) return [];

    return locationScopedAssetOptions
      .filter((asset) => {
        const text = [
          asset.name,
          asset.code,
          asset.entityType,
          assetLocation(asset),
        ].filter(Boolean).join(' ');
        const normalizedText = normalizeSearchText(text);
        return !q || normalizedText.includes(q);
      })
      .slice(0, 8);
  }, [assetName, location, locationScopedAssetOptions]);

  const selectableWorkerNames = useMemo(() => (
    uniqueNames([
      user?.displayName,
      ...adminWorkerNames,
    ])
  ), [adminWorkerNames, user?.displayName]);

  const personOptions = useMemo(() => {
    const primaryKeys = new Set(selectableWorkerNames.map((name) => normalizeSearchText(name)));
    const historyOnlyNames = uniqueNames(logs.flatMap((log) => [
      log.userName,
      ...(Array.isArray(log.workerNames) ? log.workerNames : []),
    ])).filter((name) => !primaryKeys.has(normalizeSearchText(name)));
    return uniqueNames([...selectableWorkerNames, ...historyOnlyNames]);
  }, [logs, selectableWorkerNames]);

  const filteredWorkerOptions = useMemo(() => {
    const q = normalizeSearchText(workerInput);
    return selectableWorkerNames
      .filter((name) => !samePerson(name, technicianName) && !workerNames.some((worker) => samePerson(worker, name)))
      .filter((name) => !q || normalizeSearchText(name).includes(q))
      .slice(0, 8);
  }, [selectableWorkerNames, technicianName, workerInput, workerNames]);

  const canonicalLocationFromText = (value?: string) => {
    const cleanValue = value?.trim();
    if (!cleanValue) return '';
    const tokens = locationSearchTokens(cleanValue);
    const exact = locationOptions.find((option) => normalizeSearchText(option.label) === normalizeSearchText(cleanValue));
    if (exact) return exact.label;
    const match = locationOptions.find((option) =>
      tokens.some((token) => option.search.includes(token) || normalizeSearchText(option.label).includes(token))
    );
    return match?.label || cleanValue;
  };

  const filteredLogs = useMemo(() => {
    const q = normalizeSearchText(search);
    const { start, end } = getDiaryRange(filterRange);
    return logs
      .filter((log) => {
        const date = logDate(log);
        const logWorkers = uniqueNames([
          log.userName,
          ...(Array.isArray(log.workerNames) ? log.workerNames : []),
        ]);
        const cleanupOk = cleaningEvidenceConfirmed(log);
        if (!date || date < start || date > end) return false;
        if (filterType !== 'all' && log.type !== filterType) return false;
        if (filterPerson && !logWorkers.some((worker) => samePerson(worker, filterPerson))) return false;
        if (filterCleanup === 'confirmed' && !cleanupOk) return false;
        if (filterCleanup === 'missing' && cleanupOk) return false;
        if (q) {
          const text = [
            log.content,
            log.id,
            log.taskId,
            log.location,
            log.assetName,
            log.userName,
            ...logWorkers,
            log.taskTitle,
            typeLabel(log.type),
            cleanupOk ? `uklid kontrola audit potvrzeno ${cleaningEvidenceLabel(log)}` : '',
          ].filter(Boolean).join(' ');
          const normalizedText = normalizeSearchText(text);
          if (!normalizedText.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => logDate(b).getTime() - logDate(a).getTime());
  }, [logs, search, filterType, filterPerson, filterRange, filterCleanup]);

  const filteredMinutes = useMemo(() => (
    filteredLogs.reduce((sum, log) => sum + Math.round((log.hoursWorked || 0) * 60), 0)
  ), [filteredLogs]);

  const cleanupStats = useMemo(() => {
    const confirmed = filteredLogs.filter((log) => cleaningEvidenceConfirmed(log)).length;
    return {
      confirmed,
      missing: filteredLogs.length - confirmed,
    };
  }, [filteredLogs]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      showToast('Neni co exportovat', 'error');
      return;
    }
    exportDiaryCSV(filteredLogs, getDiaryRange(filterRange).label);
    showToast('Export deniku pripraven', 'success');
  };

  const handleHistoryImportFile = async (file?: File | null) => {
    if (!file || importingHistory) return;
    setImportingHistory(true);
    try {
      const result = await importWorkHistoryWorkbook({
        arrayBuffer: await file.arrayBuffer(),
        tenantId,
        userId: user?.id || user?.uid || 'unknown',
        userName: user?.displayName || 'Import Excel',
        assets,
        existingLogs: logs,
      });
      showToast(
        `Historie importována: ${result.imported} zápisů, přeskočeno ${result.skippedDuplicates}`,
        result.failed ? 'error' : 'success'
      );
      if (result.errors.length) {
        console.error('[WorkDiary] History import errors:', result.errors);
      }
    } catch (err) {
      console.error('[WorkDiary] History import failed:', err);
      showToast('Import historie se nepodařil. Zkontroluj Excel a zkus to znovu.', 'error');
    } finally {
      setImportingHistory(false);
      if (historyImportInputRef.current) historyImportInputRef.current.value = '';
    }
  };

  const changeMinutes = (delta: number) => {
    const next = Math.max(0, Math.min(1440, (Number(minutes) || 0) + delta));
    setMinutes(String(next));
  };

  const addWorker = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const existingWorker = selectableWorkerNames.find((worker) => samePerson(worker, cleanName));
    if (!existingWorker) {
      showToast('Pracovníka nejdřív založ v administraci.', 'error');
      return;
    }
    setWorkerNames((current) => uniqueNames([...current, existingWorker]).filter((worker) => !samePerson(worker, technicianName)));
    setWorkerInput('');
    setSuggestMode(null);
  };

  const removeWorker = (name: string) => {
    setWorkerNames((current) => current.filter((worker) => !samePerson(worker, name)));
  };

  const focusSuggestionField = (mode: Exclude<SuggestMode, null>, input: HTMLInputElement) => {
    setSuggestMode(mode);

    const keepFieldVisible = () => {
      const viewport = window.visualViewport;
      const rect = input.getBoundingClientRect();
      const visibleBottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const topReserve = 92;
      const bottomReserve = 210;

      if (rect.top < topReserve) {
        window.scrollBy({ top: rect.top - topReserve, behavior: 'smooth' });
        return;
      }

      if (rect.bottom > visibleBottom - bottomReserve) {
        window.scrollBy({ top: rect.bottom - (visibleBottom - bottomReserve), behavior: 'smooth' });
      }
    };

    input.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.setTimeout(keepFieldVisible, 120);
    window.setTimeout(keepFieldVisible, 350);
    window.setTimeout(keepFieldVisible, 650);
  };

  const handleAssetNameChange = (value: string) => {
    setAssetName(value);
    const normalized = normalizeSearchText(value);
    const match = locationScopedAssetOptions.find((asset) =>
      normalizeSearchText(asset.name) === normalized ||
      normalizeSearchText(asset.code || '') === normalized
    );
    setAssetId(match?.id || '');
    const nextLocation = assetLocation(match);
    if (nextLocation && !location.trim()) {
      setLocation(nextLocation);
    }
  };

  const selectAsset = (asset: Asset) => {
    setAssetName(asset.name);
    setAssetId(asset.id);
    const nextLocation = assetLocation(asset);
    if (nextLocation) setLocation(nextLocation);
    setSuggestMode(null);
  };

  const selectLocation = (value: string) => {
    setLocation(value);
    const currentAsset = assetId
      ? assets.find((asset) => asset.id === assetId)
      : assetOptions.find((asset) =>
          normalizeSearchText(asset.name) === normalizeSearchText(assetName) ||
          normalizeSearchText(asset.code || '') === normalizeSearchText(assetName)
        );
    if (currentAsset && !assetMatchesLocation(currentAsset, value, assets)) {
      setAssetName('');
      setAssetId('');
    }
    setSuggestMode(null);
  };

  const applyCleaningShortcut = () => {
    setType('cleaning');
    setContent((current) => current.trim() || 'Proveden úklid.');
    setMinutes((current) => current || '15');
    setCleanupConfirmed(true);
    setCreateFollowUpTask(false);
  };

  const startTouchPick = (clientX: number, clientY: number) => {
    touchPick.current = { x: clientX, y: clientY, moved: false, suppressClick: false };
  };

  const moveTouchPick = (clientX: number, clientY: number) => {
    const dx = Math.abs(clientX - touchPick.current.x);
    const dy = Math.abs(clientY - touchPick.current.y);
    if (dx > 8 || dy > 8) {
      touchPick.current.moved = true;
    }
  };

  const endTouchPick = (select: () => void) => {
    touchPick.current.suppressClick = true;
    if (!touchPick.current.moved) {
      select();
    }
  };

  const clickPick = (select: () => void) => {
    if (touchPick.current.suppressClick) {
      touchPick.current.suppressClick = false;
      return;
    }
    select();
  };

  const resetEntryForm = () => {
    setContent('');
    setLocation('');
    setAssetName('');
    setAssetId('');
    setWorkerNames([]);
    setWorkerInput('');
    setMinutes('30');
    setCleanupConfirmed(false);
    setPerformedDate(todayDateInput());
    setBackDateMode(false);
    setType('maintenance');
    setCreateFollowUpTask(false);
    setTaskTitle('');
    setTaskPriority('P3');
    setDueDate('');
    setEditingLogId('');
    setSuggestMode(null);
  };

  const openEditLog = (log: WorkLog) => {
    const editableType = WORK_TYPES.some((item) => item.value === log.type)
      ? log.type as WorkLogKind
      : 'maintenance';
    const logWorkers = uniqueNames([
      log.userName,
      ...(Array.isArray(log.workerNames) ? log.workerNames : []),
    ]);

    setEditingLogId(log.id);
    setSelectedLogId(log.id);
    setType(editableType);
    setContent(log.content || '');
    const matchedAsset = findAssetForWorkLog(log, assetOptions, assets);
    const nextLocation = matchedAsset
      ? assetLocation(matchedAsset) || canonicalLocationFromText(log.location)
      : canonicalLocationFromText(log.location);
    setLocation(nextLocation);
    setAssetName(matchedAsset?.name || log.assetName || '');
    setAssetId(matchedAsset?.id || '');
    setPerformedBy(log.userName || user?.displayName || '');
    setWorkerNames(logWorkers.filter((name) => !samePerson(name, log.userName || user?.displayName || '')));
    setWorkerInput('');
    setPerformedDate(logDate(log).toISOString().slice(0, 10));
    setBackDateMode(true);
    setMinutes(String(Math.round((log.hoursWorked || 0.5) * 60)));
    setCleanupConfirmed(cleaningEvidenceConfirmed(log));
    setCreateFollowUpTask(false);
    setTaskTitle('');
    setTaskPriority('P3');
    setDueDate('');
    setSuggestMode(null);
    setShowEntryModal(true);
  };

  const repairWorkLogAssetLink = async (log: WorkLog) => {
    const matchedAsset = findAssetForWorkLog(log, assetOptions, assets);
    if (!matchedAsset) {
      showToast('Nenašel jsem jasnou kartu zařízení. Otevři opravu zápisu a vyber zařízení ručně.', 'error');
      return;
    }

    setRelinkSavingLogId(log.id);
    try {
      await updateWorkLog(log.id, {
        assetId: matchedAsset.id,
        assetName: matchedAsset.name,
        location: assetLocation(matchedAsset) || log.location,
        updatedBy: user?.id || user?.uid || 'unknown',
        updatedByName: user?.displayName || technicianName,
      });
      showToast('Zápis je napojený na kartu v kartotéce', 'success');
    } catch (err) {
      console.error('[WorkDiary] Relink work log failed:', err);
      showToast('Napojení zápisu se nepodařilo uložit', 'error');
    } finally {
      setRelinkSavingLogId('');
    }
  };

  const handleSave = async () => {
    if (!content.trim() && !createFollowUpTask) return;
    if (createFollowUpTask && !suggestedTaskTitle.trim()) return;
    if (!cleanupConfirmed) {
      showToast('Před uložením potvrď úklid a kontrolu pracoviště', 'error');
      return;
    }
    setSaving(true);
    try {
      const logInput = {
        userName: technicianName,
        workerNames: allWorkerNames.length ? allWorkerNames : undefined,
        type,
        content: content.trim(),
        location: location.trim() || undefined,
        assetId: selectedAsset?.id,
        assetName: assetName.trim() || undefined,
        hoursWorked: durationMinutes > 0 ? durationMinutes / 60 : undefined,
        performedAt: performedAtDate,
        auditReady: true,
        cleaningDone: cleanupConfirmed,
        cleaningChecked: cleanupConfirmed,
        cleaningNote: cleanupConfirmed ? 'Pracoviste uklizeno a zkontrolovano, ze na miste nic nezustalo.' : undefined,
        updatedBy: editingLogId ? (user?.id || user?.uid || 'unknown') : undefined,
        updatedByName: editingLogId ? (user?.displayName || technicianName) : undefined,
      };

	      let savedLogId = editingLogId;
        const linkedExtruderId = selectedAsset && isGearboxAsset(selectedAsset) ? selectedAsset.currentExtruderId || '' : '';
        const linkedExtruderName = selectedGearboxExtruder?.name || selectedAsset?.currentExtruderName || '';

	      if (editingLogId) {
	        await updateWorkLog(editingLogId, logInput);
	      } else {
	        const createdLogId = await addWorkLog({
	          ...logInput,
	          userId: user?.id || user?.uid || 'unknown',
            ...(selectedAsset && isGearboxAsset(selectedAsset) && linkedExtruderId && linkedExtruderName ? {
              relatedWorkLogRole: 'gearbox_source' as const,
              relatedAssetId: linkedExtruderId,
              relatedAssetName: linkedExtruderName,
            } : {}),
	        });
	        savedLogId = createdLogId;
          if (selectedAsset && isGearboxAsset(selectedAsset) && linkedExtruderId && linkedExtruderName) {
            const relatedLogId = await addWorkLog({
              ...logInput,
              userId: user?.id || user?.uid || 'unknown',
              assetId: linkedExtruderId,
              assetName: linkedExtruderName,
              location: linkedExtruderName,
              workType: 'gearbox_related_work',
              relatedWorkLogId: createdLogId,
              relatedWorkLogRole: 'extruder_shadow',
              relatedAssetId: selectedAsset.id,
              relatedAssetName: selectedAsset.name,
              content: [
                `Zápis práce na převodovce: ${selectedAsset.name}`,
                selectedAsset.code ? `Kód převodovky: ${selectedAsset.code}` : '',
                `Převodovka je namontovaná na extruderu: ${linkedExtruderName}`,
                content.trim(),
              ].filter(Boolean).join('\n'),
            });
            await updateWorkLog(createdLogId, {
              relatedWorkLogId: relatedLogId,
            });
          }
	        setEditingLogId('');
	        setSelectedLogId(createdLogId);
        if (createFollowUpTask) {
          const title = suggestedTaskTitle.trim();
          const descriptionParts = [
            content.trim() ? `Z deniku udrzby: ${content.trim()}` : '',
            location.trim() ? `Misto: ${location.trim()}` : '',
            assetName.trim() ? `Zarizeni / vec: ${assetName.trim()}` : '',
            durationMinutes > 0 ? `Odhad / zaznamenaný čas: ${formatDuration(durationMinutes)}` : '',
            allWorkerNames.length ? `Pracovali: ${allWorkerNames.join(', ')}` : '',
            `Zapsal / provedl: ${technicianName}`,
          ].filter(Boolean);

          await createTask({
            title,
            description: descriptionParts.join('\n'),
            type: type === 'inspection' ? 'inspection' : type === 'note' ? 'improvement' : 'corrective',
            priority: taskPriority,
            source: 'web',
            sourceRefType: 'work_log',
            sourceRefId: createdLogId,
            assetId: selectedAsset?.id,
            assetName: assetName.trim() || undefined,
            ...(selectedAsset && isGearboxAsset(selectedAsset) && linkedExtruderId && linkedExtruderName ? {
              relatedAssetId: linkedExtruderId,
              relatedAssetName: linkedExtruderName,
              relatedAssetRole: 'mounted_extruder',
            } : {}),
            assignedWorkerNames: allWorkerNames.length ? allWorkerNames : undefined,
            dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : undefined,
            estimatedMinutes: durationMinutes > 0 ? durationMinutes : undefined,
            createdById: user?.id || user?.uid || 'unknown',
            createdByName: user?.displayName || technicianName,
          });
        }
      }

      resetEntryForm();
      setSearch(savedLogId);
      setFilterType('all');
      setFilterPerson('');
      setFilterRange('all');
      setLastSavedLogId(savedLogId);
      setShowEntryModal(false);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      showToast(
        editingLogId ? 'Zápis práce opraven' : createFollowUpTask ? 'Zápis uložen a úkol založen' : 'Zápis práce uložen',
        'success'
      );
    } catch (err) {
      console.error('[WorkDiary] Save failed:', err);
      showToast('Zápis nebo úkol se nepodařilo uložit', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="vik-page pb-28">
      <header className="vik-page-header sticky top-0 z-30">
        <div className="vik-page-shell px-4 py-3 flex items-center gap-3">
          <button onClick={() => goBack()} className="vik-button w-11 h-11 p-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">Deník prací</h1>
            <p className="text-xs vik-muted">Rychlý zápis z telefonu</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-amber-300">{todaySummary.count}</div>
            <div className="text-xs vik-muted">dnes</div>
          </div>
        </div>
      </header>

      <main
        className="vik-page-shell max-w-5xl px-4 py-4 space-y-4"
        style={{ paddingBottom: suggestMode ? '24rem' : undefined }}
      >
        <div className="vik-card p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">Deník zapsané práce</div>
            <div className="text-xs vik-muted">Hotové zápisy jsou hned vidět tady v seznamu.</div>
          </div>
        </div>

        {lastSavedLogId && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Zápis je uložený.</div>
              <div className="text-emerald-700/80">Níže je zobrazený poslední uložený záznam. Můžeš se vrátit na zadání další práce.</div>
            </div>
          </div>
        )}

        <BottomSheet
          title={editingLogId ? 'Opravit zápis práce' : 'Nový zápis práce'}
          isOpen={showEntryModal}
          onClose={() => {
            setShowEntryModal(false);
            resetEntryForm();
          }}
        >
        <section className="-mx-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-950 shadow-inner sm:-mx-1">
          <div className="grid grid-cols-2 gap-2">
            {WORK_TYPES.map((item) => {
              const Icon = item.icon;
              const active = type === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setType(item.value)}
                  className={`min-h-16 rounded-xl border p-2.5 text-left active:scale-[0.98] transition ${
                    active ? 'bg-amber-500 text-slate-950 border-amber-300' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${active ? 'text-slate-950' : 'text-amber-300'}`} />
                    <span className="font-bold">{item.label}</span>
                  </div>
                  <div className={`text-xs mt-1 ${active ? 'text-slate-800' : 'text-slate-500'}`}>{item.hint}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600">Vybráno</div>
                <div className="font-bold text-amber-800">{selectedType.label}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600">Čas</div>
                <div className="font-bold">{formatDuration(durationMinutes)}</div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-950">Datum provedení</div>
                  <div className="mt-1 text-sm font-semibold text-amber-800">
                    {isBackdatedEntry ? performedDate : 'Dnes'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !backDateMode;
                    setBackDateMode(next);
                    if (!next) setPerformedDate(todayDateInput());
                  }}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-black active:scale-95 ${
                    backDateMode
                      ? 'border-amber-300 bg-amber-500 text-slate-950'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  Zpětný zápis
                </button>
              </div>

              {backDateMode && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-amber-900">Vyber datum, kdy byla práce provedena</span>
                    <input
                      type="date"
                      value={performedDate}
                      onChange={(e) => setPerformedDate(e.target.value)}
                      className="mt-2 w-full min-h-12 rounded-xl border border-amber-300 bg-white px-4 text-base font-bold text-slate-950 outline-none focus:border-amber-500"
                    />
                  </label>
                  <div className="mt-2 flex items-start gap-2 text-sm text-amber-900">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Potvrzuji zpětný zápis. Datum zapsání zůstane uložené zvlášť.</span>
                  </div>
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Kdo to provedl</span>
              <input
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                placeholder="jméno údržáře"
                className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
            </label>

            <div className="scroll-mt-24">
              <span className="text-sm font-semibold text-slate-600">Spolupracující kolegové</span>
              <div className="mt-2 flex gap-2">
                <input
                  value={workerInput}
                  onChange={(e) => {
                    setWorkerInput(e.target.value);
                    setSuggestMode('worker');
                  }}
                  onFocus={(e) => focusSuggestionField('worker', e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addWorker(workerInput);
                    }
                  }}
                  placeholder="přidat kolegu"
                  autoComplete="off"
                  enterKeyHint="done"
                  className="min-w-0 flex-1 min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => addWorker(workerInput)}
                  className="min-h-12 px-4 rounded-xl border border-slate-200 bg-slate-100 text-sm font-bold text-slate-800 active:scale-95"
                >
                  Přidat
                </button>
              </div>
              {suggestMode === 'worker' && filteredWorkerOptions.length > 0 && (
                <div className={suggestionPanelClass} style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                  {filteredWorkerOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => startTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchMove={(e) => moveTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchEnd={() => endTouchPick(() => addWorker(name))}
                      onClick={() => clickPick(() => addWorker(name))}
                      className="w-full min-h-14 rounded-xl px-4 py-3 text-left text-base font-black text-slate-950 active:bg-amber-50 touch-manipulation"
                    >
                      <span className="flex items-center gap-2">
                        <User className="w-4 h-4 text-amber-300 flex-shrink-0" />
                        <span className="break-words leading-snug">{name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {workerNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => removeWorker(name)}
                    className="min-h-12 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-800 active:scale-95"
                  >
                    {name} ×
                  </button>
                ))}
                {workerNames.length === 0 && (
                  <span className="text-xs text-slate-600">Když na práci dělal někdo další, přidej ho sem.</span>
                )}
              </div>
            </div>

            <label className="hidden">
              <span className="text-sm font-semibold text-slate-600">Kdy byla práce provedena</span>
              <input
                type="date"
                value={performedDate}
                onChange={(e) => setPerformedDate(e.target.value)}
                className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
              <span className="text-xs text-slate-400 mt-1 block">Pro dopsání práce zpětně. Datum zapsání zůstane uložené zvlášť.</span>
            </label>

            <label className="block scroll-mt-24">
              <span className="text-sm font-semibold text-slate-600">Kde</span>
              <input
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setSuggestMode('location');
                }}
                onFocus={(e) => focusSuggestionField('location', e.currentTarget)}
                placeholder="D1.23 expedice"
                autoComplete="off"
                enterKeyHint="next"
                className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
              {suggestMode === 'location' && filteredLocationOptions.length > 0 && (
                <div className={suggestionPanelClass} style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                  {filteredLocationOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => startTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchMove={(e) => moveTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchEnd={() => endTouchPick(() => selectLocation(option.label))}
                      onClick={() => clickPick(() => selectLocation(option.label))}
                      className="w-full min-h-14 rounded-xl px-4 py-3 text-left text-base font-black text-slate-950 active:bg-amber-50 touch-manipulation"
                    >
                      <span className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-300 flex-shrink-0" />
                        <span className="break-words leading-snug">{option.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label className="block scroll-mt-24">
              <span className="text-sm font-semibold text-slate-600">Zařízení / věc</span>
              {location.trim() && (
                <span className="mt-1 block text-xs text-amber-800">
                  Nabízím zařízení podle zvolené místnosti: {location}
                </span>
              )}
              <input
                value={assetName}
                onChange={(e) => {
                  handleAssetNameChange(e.target.value);
                  setSuggestMode('asset');
                }}
                onFocus={(e) => focusSuggestionField('asset', e.currentTarget)}
                placeholder="vrata 2, VZT, hadice"
                autoComplete="off"
                enterKeyHint="next"
                className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
              />
              {suggestMode === 'asset' && filteredAssetOptions.length > 0 && (
                <div className={suggestionPanelClass} style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                  {filteredAssetOptions.map((asset) => {
                    const loc = assetLocation(asset);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => startTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                        onTouchMove={(e) => moveTouchPick(e.touches[0].clientX, e.touches[0].clientY)}
                        onTouchEnd={() => endTouchPick(() => selectAsset(asset))}
                        onClick={() => clickPick(() => selectAsset(asset))}
                        className="w-full min-h-16 rounded-xl px-4 py-3 text-left active:bg-amber-50 touch-manipulation"
                      >
                        <div className="flex items-start gap-2">
                          <Wrench className="w-4 h-4 text-amber-300 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-base font-black text-slate-950 leading-snug break-words">{asset.name}</div>
                            <div className="text-sm text-slate-600 leading-snug break-words">
                              {[asset.code, loc].filter(Boolean).join(' - ') || asset.entityType}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {suggestMode === 'asset' && location.trim() && filteredAssetOptions.length === 0 && (
                <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
                  V této místnosti zatím nevidím žádné zařízení z kartotéky.
                </div>
              )}
              {selectedAsset && (
                <div className="mt-2 text-sm text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Napojeno na kartotéku: {selectedAsset.code ? `${selectedAsset.code} - ` : ''}{assetLocation(selectedAsset) || selectedAsset.entityType}
                </div>
              )}
              {selectedAsset && isGearboxAsset(selectedAsset) && selectedGearboxExtruderName && (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                  <div className="text-base font-black">Převodovka je namontovaná na extruderu</div>
                  <div className="mt-1 font-semibold">{selectedGearboxExtruderName}</div>
                  <div className="mt-1 text-sm font-semibold text-emerald-800">
                    Zápis se uloží do historie převodovky i do historie tohoto extruderu.
                  </div>
                </div>
              )}
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-600">Co se udělalo</span>
                <MicButton onTranscript={(text) => setContent((prev) => prev ? `${prev} ${text}` : text)} />
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Vyměněna prasklá hadice u vrat, kontrola těsnosti OK."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none placeholder:text-slate-400 resize-none focus:border-emerald-600"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-600">Cas prace</span>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-black text-amber-800">
                  {formatDuration(durationMinutes)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="480"
                step="5"
                value={durationMinutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full accent-amber-500"
                aria-label="Cas prace v minutach"
              />
              <div className="grid grid-cols-3 gap-2">
                {QUICK_MINUTES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMinutes(value)}
                    className={`min-h-10 rounded-xl border text-sm font-bold active:scale-95 transition ${
                      minutes === value ? 'bg-amber-500 text-slate-950 border-amber-300' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {formatDuration(Number(value))}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => changeMinutes(-15)}
                  className="min-h-10 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center gap-2 text-sm font-bold text-slate-800 active:scale-95"
                >
                  <Minus className="w-4 h-4" />
                  15 min
                </button>
                <button
                  type="button"
                  onClick={() => changeMinutes(15)}
                  className="min-h-10 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center gap-2 text-sm font-bold text-slate-800 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  15 min
                </button>
              </div>
            </div>

            {!editingLogId && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
              <button
                type="button"
                onClick={() => setCreateFollowUpTask((value) => !value)}
                className={`w-full min-h-12 rounded-xl border px-3 flex items-center justify-between gap-3 text-left active:scale-[0.98] transition ${
                  createFollowUpTask ? 'bg-amber-500 text-slate-950 border-amber-300' : 'bg-white text-slate-800 border-slate-200'
                }`}
              >
                <span className="flex items-center gap-2 font-bold">
                  <ClipboardList className="w-5 h-5" />
                  Založit z toho úkol
                </span>
                <span className="text-sm font-bold">{createFollowUpTask ? 'ANO' : 'NE'}</span>
              </button>

              {createFollowUpTask && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-600">Název úkolu</span>
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder={suggestedTaskTitle}
                      className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
                    />
                  </label>

                  <div>
                    <span className="text-sm font-semibold text-slate-600">Důležitost</span>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {PRIORITIES.map((priority) => (
                        <button
                          key={priority.value}
                          type="button"
                          onClick={() => setTaskPriority(priority.value)}
                          className={`min-h-14 rounded-xl border text-center active:scale-95 transition ${
                            taskPriority === priority.value ? 'bg-amber-500 text-slate-950 border-amber-300' : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="font-black">{priority.label}</div>
                          <div className="text-xs opacity-100">{priority.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-600">Termín, pokud je známý</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-2 w-full min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
                    />
                  </label>
                </div>
              )}
            </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
              <button
                type="button"
                onClick={applyCleaningShortcut}
                className="w-full min-h-11 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-left text-emerald-800 active:scale-95"
              >
                <div className="text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Proveden uklid
                </div>
                <div className="text-xs text-emerald-700">rychle predvyplni zapis</div>
              </button>

              <button
                type="button"
                onClick={() => setCleanupConfirmed((value) => !value)}
                className={`w-full rounded-xl border p-3 text-left active:scale-[0.98] transition ${
                  cleanupConfirmed
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-red-50 border-red-300 text-red-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                    cleanupConfirmed ? 'bg-emerald-500 border-emerald-300 text-slate-950' : 'border-red-400 text-transparent'
                  }`}>
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">Uklid a kontrola po praci</span>
                    <span className="block text-xs mt-1 text-slate-600">
                      Potvrzeni pro audit: po praci nezustalo naradi, dily ani material.
                    </span>
                    <span className={`mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${
                      cleanupConfirmed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                    }`}>
                      {cleanupConfirmed ? 'Potvrzeno' : 'Nutne potvrdit pred ulozenim'}
                    </span>
                  </span>
                </div>
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || (!content.trim() && !createFollowUpTask)}
              className="w-full min-h-14 rounded-2xl bg-amber-500 text-slate-950 font-black text-base flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-amber-400 active:scale-[0.98] transition"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
              {editingLogId ? 'Uložit opravu' : createFollowUpTask ? 'Uložit zápis a úkol' : 'Uložit zápis'}
            </button>
          </div>
        </section>
        </BottomSheet>

        <section className="space-y-3">
          <div className="vik-card p-3 space-y-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="font-bold">Hledání v deníku</div>
                <div className="text-xs vik-muted">
                  {filteredLogs.length} z {logs.length} zápisů, {formatDuration(filteredMinutes)}
                </div>
              </div>
              <div className="flex gap-2 lg:shrink-0">
                <input
                  ref={historyImportInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(event) => handleHistoryImportFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => historyImportInputRef.current?.click()}
                  disabled={importingHistory}
                  className="vik-button min-h-10 text-sm disabled:opacity-50"
                >
                  {importingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Import historie
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="vik-button min-h-10 text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV
                </button>
              </div>
            </div>

            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
            <label className="relative block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="hledat podle místa, věci, textu nebo člověka"
                className="vik-input min-h-10 pl-10 pr-4"
              />
            </label>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {([
                { value: 'today', label: 'Dnes' },
                { value: 'week', label: '7 dní' },
                { value: 'month', label: '30 dni' },
                { value: 'all', label: 'Vše' },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilterRange(item.value)}
                  className={`vik-chip justify-center ${
                    filterRange === item.value ? 'vik-chip-active' : ''
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            </div>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto]">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | WorkLogKind)}
                className="vik-input min-h-10"
              >
                <option value="all">Všechny typy</option>
                {WORK_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
                className="vik-input min-h-10"
              >
                <option value="">Všichni lidé</option>
                {personOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="vik-card-soft px-3 py-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-3 lg:shrink-0">
                <div>
                  <div className="text-sm font-bold text-slate-900">Audit úklidu</div>
                  <div className="text-xs text-slate-600">
                    Potvrzeno {cleanupStats.confirmed}, chybí {cleanupStats.missing}
                  </div>
                </div>
                {cleanupStats.missing > 0 && (
                  <span className="rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-xs font-bold text-red-700">
                    {cleanupStats.missing} chybí
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 lg:min-w-[320px]">
                {([
                  { value: 'all', label: 'Vše' },
                  { value: 'confirmed', label: 'Úklid OK' },
                  { value: 'missing', label: 'Chybí' },
                ] as const).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilterCleanup(item.value)}
                    className={`min-h-8 rounded-lg border px-3 text-xs font-bold active:scale-95 ${
                      filterCleanup === item.value
                        ? item.value === 'missing'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {(search || filterType !== 'all' || filterPerson || filterRange !== 'month' || filterCleanup !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterType('all');
                  setFilterPerson('');
                  setFilterRange('month');
                  setFilterCleanup('all');
                  setLastSavedLogId('');
                }}
                className="vik-button w-full min-h-12 text-sm"
              >
                Zrušit filtry
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="vik-card p-3">
              <div className="text-xs vik-muted">Dnes zápisů</div>
              <div className="text-2xl font-bold text-slate-950 mt-1">{todaySummary.count}</div>
            </div>
            <div className="vik-card p-3">
              <div className="text-xs vik-muted">Dnes čas</div>
              <div className="text-2xl font-bold text-slate-950 mt-1">{formatDuration(Math.round(todaySummary.hours * 60))}</div>
            </div>
          </div>

          <div className="vik-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-bold text-slate-950">Zápisy deníku</div>
            {loading ? (
              <div className="py-12 flex justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center vik-muted">Žádný zápis neodpovídá filtru.</div>
            ) : (
              filteredLogs.map((log) => {
                const logWorkers = uniqueNames([
                  log.userName,
                  ...(Array.isArray(log.workerNames) ? log.workerNames : []),
                ]);
                const expanded = selectedLogId === log.id;
                const matchedLogAsset = findAssetForWorkLog(log, assetOptions, assets);
                const canRepairLink = !log.assetId && Boolean(matchedLogAsset);
                return (
                <article
                  key={log.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedLogId(expanded ? '' : log.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedLogId(expanded ? '' : log.id);
                    }
                  }}
                  className={`px-3 py-3 border-b last:border-b-0 cursor-pointer transition hover:bg-amber-50/50 ${
                    log.id === lastSavedLogId
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {log.id === lastSavedLogId && (
                        <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Právě uloženo
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 mb-1">
                        <span className="font-bold text-slate-700">{typeLabel(log.type)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />provedeno {formatDate(log.performedAt || log.createdAt)}</span>
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{logWorkers.join(', ')}</span>
                        {log.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{log.location}</span>}
                        {log.hoursWorked && <span>{formatDuration(Math.round(log.hoursWorked * 60))}</span>}
                      </div>
                      {log.taskId && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/tasks?task=${log.taskId}`);
                          }}
                          className="mb-2 inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 active:scale-95"
                        >
                          <ClipboardList className="w-3 h-3" />
                          {log.taskTitle || 'Zápis z úkolu'}
                        </button>
                      )}
                      {cleaningEvidenceConfirmed(log) && (
                        <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          {cleaningEvidenceLabel(log)}
                        </div>
                      )}
                      {log.assetName && <div className="text-base font-black text-amber-700 mb-1 leading-tight">{log.assetName}</div>}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{log.content}</p>
                      {expanded && (
                        <div
                          className="mt-4 rounded-2xl border border-[#e2d8c9] bg-[#fbf9f4] p-4 space-y-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Detail zápisu</div>
                              <div className="mt-1 text-base font-bold text-slate-950">{log.assetName || log.location || typeLabel(log.type)}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openEditLog(log)}
                              className="vik-button-primary min-h-12 justify-center"
                            >
                              Opravit zápis
                            </button>
                          </div>

                          {canRepairLink && matchedLogAsset && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                              <div className="font-bold">Zápis ještě není pevně napojený na kartotéku.</div>
                              <div className="mt-1 text-blue-700">
                                Systém našel pravděpodobnou kartu: {matchedLogAsset.code ? `${matchedLogAsset.code} - ` : ''}{matchedLogAsset.name}
                              </div>
                              <button
                                type="button"
                                onClick={() => repairWorkLogAssetLink(log)}
                                disabled={relinkSavingLogId === log.id}
                                className="vik-button-primary mt-3 min-h-12 justify-center"
                              >
                                {relinkSavingLogId === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                Napojit na kartu
                              </button>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Typ</div>
                              <div className="font-bold text-slate-950">{typeLabel(log.type)}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Kdy provedeno</div>
                              <div className="font-bold text-slate-950">{formatDate(log.performedAt || log.createdAt)}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Kdo</div>
                              <div className="font-bold text-slate-950">{logWorkers.join(', ') || '-'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Čas práce</div>
                              <div className="font-bold text-slate-950">{formatDuration(Math.round((log.hoursWorked || 0) * 60))}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Kde</div>
                              <div className="font-bold text-slate-950">{log.location || '-'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-xs text-slate-600">Zařízení / věc</div>
                              <div className="font-bold text-slate-950">{log.assetName || '-'}</div>
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-xs text-slate-600">Popis práce</div>
                            <div className="mt-1 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{log.content || '-'}</div>
                          </div>

                          <div className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                            cleaningEvidenceConfirmed(log)
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}>
                            {cleaningEvidenceConfirmed(log)
                              ? cleaningEvidenceLabel(log)
                              : 'Úklid a kontrola pracoviště není potvrzena'}
                          </div>
                          {log.updatedAt && (
                            <div className="text-xs text-slate-600">
                              Naposledy opraveno {formatDate(log.updatedAt)}
                              {log.updatedByName ? `, opravil: ${log.updatedByName}` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
                );
              })
            )}
          </div>
        </section>
      </main>

      <FAB
        icon={<Plus className="w-6 h-6" />}
        label="Nový zápis"
        onClick={() => setShowEntryModal(true)}
      />
    </div>
  );
}


