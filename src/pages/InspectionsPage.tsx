// src/pages/InspectionsPage.tsx
// VIKRR — Asset Shield — Kontrolní body budovy (měsíční checklist)
// Digitalizace formuláře "Kontrola budovy C,D"

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle,
  ChevronDown, ChevronRight, ChevronLeft, X, Loader2, ClipboardCheck, CheckCircle2, RotateCcw,
  FileSpreadsheet, FileText, Search, Archive, Unlock, Lock, Clock, Check, MoreVertical, Camera
} from 'lucide-react';
import { useInspections } from '../hooks/useInspections';
import type { InspectionFrequency, InspectionLog, InspectionStats } from '../hooks/useInspections';
import type { InspectionRun } from '../types/inspectionRun';
import type { TaskPriority } from '../types/firestore';
import { showToast } from '../components/ui/Toast';
import { exportInspectionPDF, exportInspectionXLSX } from '../utils/exportInspectionReport';
import { exportInspectionRunPDF, exportInspectionRunXLSX } from '../utils/exportInspectionRunReport';
import { useAuthContext } from '../context/AuthContext';
import { useConfirm } from '../hooks/useConfirm';
import { assetService } from '../services/assetService';
import type { Asset } from '../types/asset';

// ═══════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════

const STATUS = {
  ok: { label: 'OK', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  defect: { label: 'Závada', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  pending: { label: 'Čeká', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};

const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; hint: string; className: string }> = [
  { value: 'P1', label: 'P1', hint: 'hned / havárie', className: 'border-red-500/40 bg-red-500/10 text-red-700' },
  { value: 'P2', label: 'P2', hint: 'důležité', className: 'border-amber-500/40 bg-amber-500/10 text-amber-700' },
  { value: 'P3', label: 'P3', hint: 'běžný úkol', className: 'border-blue-200 bg-blue-50 text-blue-900' },
  { value: 'P4', label: 'P4', hint: 'až bude čas', className: 'border-slate-500/40 bg-slate-700/50 text-slate-200' },
];

const FOOD_SAFETY_HAZARDS = [
  { value: 'foreign_body', label: 'Cizí předmět' },
  { value: 'hygiene', label: 'Hygiena' },
  { value: 'pests', label: 'Škůdci' },
  { value: 'chemical', label: 'Chemie' },
  { value: 'water', label: 'Voda / kondenzace' },
  { value: 'temperature', label: 'Teplota' },
  { value: 'allergen', label: 'Alergen' },
  { value: 'building', label: 'Konstrukce budovy' },
];

const FOOD_SAFETY_IMPACTS = [
  { value: 'low', label: 'Nízký' },
  { value: 'medium', label: 'Střední' },
  { value: 'high', label: 'Vysoký' },
];

const FREQUENCY_OPTIONS: Array<{ value: InspectionFrequency; label: string; hint: string }> = [
  { value: 'daily', label: 'Denně', hint: 'každý den' },
  { value: 'weekly', label: 'Týdně', hint: 'každý týden' },
  { value: 'monthly', label: 'Měsíčně', hint: 'každý měsíc' },
  { value: 'quarterly', label: 'Čtvrtletně', hint: 'jednou za čtvrtletí' },
  { value: 'yearly', label: 'Ročně', hint: 'jednou za rok' },
];

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalize(value: unknown): string {
  return safeText(value).trim().toLowerCase();
}

function uniqueSorted(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => safeText(value).trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'cs'));
}

function assetRoom(asset: Asset): string {
  return asset.areaName || asset.location || asset.roomId || '';
}

function logMatchesRoom(log: InspectionLog, room: string): boolean {
  const q = normalize(room);
  if (!q) return true;
  return normalize(log.roomName) === q || normalize(log.roomCode) === q;
}

function assetMatchesLog(asset: Asset, log: InspectionLog): boolean {
  const building = normalize(asset.buildingId);
  const room = normalize(assetRoom(asset));
  const logBuilding = normalize(log.building);
  const logRoom = normalize(log.roomName);
  const logCode = normalize(log.roomCode);

  if (building && logBuilding && building !== logBuilding) return false;
  if (room && logRoom !== room && logCode !== room) return false;
  return Boolean(building || room);
}

type InspectionEffectiveStatus = InspectionLog['status'];

function buildStats(
  items: InspectionLog[],
  getStatus: (item: InspectionLog) => InspectionEffectiveStatus = (item) => item.status,
): InspectionStats {
  const total = items.length;
  const ok = items.filter((item) => getStatus(item) === 'ok').length;
  const defect = items.filter((item) => getStatus(item) === 'defect').length;
  const pending = items.filter((item) => getStatus(item) === 'pending').length;
  const percentDone = total > 0 ? Math.round(((ok + defect) / total) * 100) : 0;
  return { total, ok, defect, pending, percentDone };
}

function frequencyLabel(value?: InspectionFrequency): string {
  return FREQUENCY_OPTIONS.find((item) => item.value === (value || 'monthly'))?.label || 'Měsíčně';
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function inspectionCompletedDate(log: InspectionLog): Date | null {
  return log.completedAt?.toDate?.() || null;
}

function inspectionDueDate(log: InspectionLog): Date | null {
  const completed = inspectionCompletedDate(log);
  if (!completed) return null;
  const due = startOfDay(completed);
  const frequency = log.frequency || 'monthly';
  if (frequency === 'daily') due.setDate(due.getDate() + 1);
  if (frequency === 'weekly') due.setDate(due.getDate() + 7);
  if (frequency === 'monthly') due.setMonth(due.getMonth() + 1);
  if (frequency === 'quarterly') due.setMonth(due.getMonth() + 3);
  if (frequency === 'yearly') due.setFullYear(due.getFullYear() + 1);
  return due;
}

function isInspectionDue(log: InspectionLog, monthKey: string): boolean {
  if (monthKey !== currentMonthKey()) return log.status === 'pending';
  if (log.status === 'defect') return false;
  if (log.status === 'pending') return true;
  const due = inspectionDueDate(log);
  return Boolean(due && due <= startOfDay(new Date()));
}

function inspectionEffectiveStatus(log: InspectionLog, monthKey: string): InspectionEffectiveStatus {
  return isInspectionDue(log, monthKey) ? 'pending' : log.status;
}

function shiftMonthKey(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, (monthIndex || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function runDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function runDateLabel(value: unknown): string {
  const date = runDate(value);
  return date ? date.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : '—';
}

function runDayLabel(value: unknown): string {
  const date = runDate(value);
  return date ? date.toLocaleDateString('cs-CZ', { dateStyle: 'medium' }) : 'bez data';
}

function runTimestamp(value: unknown): number {
  return runDate(value)?.getTime() || 0;
}

function initialsOf(name?: string): string {
  const parts = safeText(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeLabel(log: InspectionLog): string {
  const date = log.completedAt?.toDate?.();
  return date ? date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '';
}

// Donut (stav kontroly) — ruční SVG, bez knihovny
const DONUT_R = 30;
const DONUT_C = 2 * Math.PI * DONUT_R;

// ═══════════════════════════════════════
// PAGE
// ═══════════════════════════════════════

export default function InspectionsPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { ask } = useConfirm();
  const tenantId = user?.tenantId ?? 'main_firm';
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const {
    loading,
    logs,
    markOk,
    markDefect,
    markPending,
    updateInspectionNote,
    updateInspectionFrequency,
    currentMonth,
    previousDefects,
    confirmPreviousDefect,
    prevMonth,
    currentRun,
    draftRun,
    closedRuns,
    startInspectionRun,
    closeInspectionRun,
    reopenInspectionRun,
  } = useInspections(selectedMonth);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [confirmingDefect, setConfirmingDefect] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeLog, setActiveLog] = useState<InspectionLog | null>(null);
  const [activeNoteLog, setActiveNoteLog] = useState<InspectionLog | null>(null);
  const [activeFrequencyLog, setActiveFrequencyLog] = useState<InspectionLog | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [defectNote, setDefectNote] = useState('');
  const [inspectionNote, setInspectionNote] = useState('');
  const [inspectionFrequency, setInspectionFrequency] = useState<InspectionFrequency>('monthly');
  const [planFrequency, setPlanFrequency] = useState<InspectionFrequency>('monthly');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P2');
  const [foodSafetyRisk, setFoodSafetyRisk] = useState(false);
  const [foodSafetyHazardType, setFoodSafetyHazardType] = useState('foreign_body');
  const [foodSafetyImpact, setFoodSafetyImpact] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ok' | 'defect'>('pending');
  const [showPlanningTools, setShowPlanningTools] = useState(false);
  const [modalStatus, setModalStatus] = useState<'none' | 'ok' | 'defect'>('defect');
  const [defectPhotos, setDefectPhotos] = useState<{ id: string; url: string }[]>([]);
  const photoSeq = useRef(0);
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([]);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [selectedFrequencies, setSelectedFrequencies] = useState<InspectionFrequency[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [selectedAssetType, setSelectedAssetType] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [viewMode, setViewMode] = useState<'current' | 'archive'>('current');
  const [archiveBuilding, setArchiveBuilding] = useState('');
  const [archiveFrom, setArchiveFrom] = useState('');
  const [archiveTo, setArchiveTo] = useState('');
  const [selectedRun, setSelectedRun] = useState<InspectionRun | null>(null);
  const [closingRun, setClosingRun] = useState(false);
  const [runExporting, setRunExporting] = useState<'xlsx' | 'pdf' | null>(null);

  useEffect(() => {
    let cancelled = false;
    assetService.getAll(tenantId)
      .then((items) => {
        if (!cancelled) setAssets(items);
      })
      .catch((err) => {
        console.error('[InspectionsPage] Kartoteka load failed:', err);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Toggle group
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Format month
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  const activeAssets = useMemo(() => assets.filter((asset) => !asset.isDeleted), [assets]);

  const buildingOptions = useMemo(() => uniqueSorted([
    ...logs.map((log) => log.building),
    ...activeAssets.map((asset) => asset.buildingId),
  ]), [activeAssets, logs]);

  const filteredClosedRuns = useMemo(() => (
    closedRuns.filter((run) => {
      if (archiveBuilding && !(run.buildingScope || []).includes(archiveBuilding)) return false;
      const closedOrStarted = runTimestamp(run.closedAt) || runTimestamp(run.startedAt);
      if (archiveFrom) {
        const from = new Date(`${archiveFrom}T00:00:00`).getTime();
        if (closedOrStarted < from) return false;
      }
      if (archiveTo) {
        const to = new Date(`${archiveTo}T23:59:59`).getTime();
        if (closedOrStarted > to) return false;
      }
      return true;
    })
  ), [archiveBuilding, archiveFrom, archiveTo, closedRuns]);

  const latestClosedRun = closedRuns[0] || null;

  const floorOptions = useMemo(() => {
    const inSelectedBuildings = (building?: string) =>
      selectedBuildings.length === 0 || selectedBuildings.includes(safeText(building));

    return uniqueSorted([
      ...logs
        .filter((log) => inSelectedBuildings(log.building))
        .map((log) => log.floor),
      ...activeAssets
        .filter((asset) => inSelectedBuildings(asset.buildingId))
        .map((asset) => asset.floor),
    ]);
  }, [activeAssets, logs, selectedBuildings]);

  const roomOptions = useMemo(() => {
    const inSelectedBuildings = (building?: string) =>
      selectedBuildings.length === 0 || selectedBuildings.includes(safeText(building));

    return uniqueSorted([
      ...logs
        .filter((log) => inSelectedBuildings(log.building))
        .filter((log) => selectedFloors.length === 0 || selectedFloors.includes(safeText(log.floor)))
        .map((log) => log.roomName),
      ...activeAssets
        .filter((asset) => inSelectedBuildings(asset.buildingId))
        .filter((asset) => selectedFloors.length === 0 || selectedFloors.includes(safeText(asset.floor)))
        .map(assetRoom),
    ]);
  }, [activeAssets, logs, selectedBuildings, selectedFloors]);

  const assetTypeOptions = useMemo(() => {
    const inSelectedBuildings = (asset: Asset) =>
      selectedBuildings.length === 0 || selectedBuildings.includes(safeText(asset.buildingId));
    return uniqueSorted(
      activeAssets
        .filter(inSelectedBuildings)
        .map((asset) => asset.entityType || asset.category)
    );
  }, [activeAssets, selectedBuildings]);

  const assetPickOptions = useMemo(() => {
    const search = normalize(assetSearch);
    return activeAssets.filter((asset) => {
      if (selectedBuildings.length > 0 && !selectedBuildings.includes(safeText(asset.buildingId))) return false;
      if (selectedFloors.length > 0 && !selectedFloors.includes(safeText(asset.floor))) return false;
      if (selectedRooms.length > 0 && !selectedRooms.some((room) => normalize(assetRoom(asset)) === normalize(room))) return false;
      if (selectedAssetType && normalize(asset.entityType || asset.category) !== normalize(selectedAssetType)) return false;
      if (search) {
        const text = [
          asset.name,
          asset.code,
          asset.entityType,
          asset.category,
          assetRoom(asset),
          asset.buildingId,
        ].filter(Boolean).join(' ');
        if (!normalize(text).includes(search)) return false;
      }
      return true;
    });
  }, [activeAssets, assetSearch, selectedAssetType, selectedBuildings, selectedFloors, selectedRooms]);

  const scopedAssets = useMemo(() => {
    if (selectedAssetIds.length === 0) return assetPickOptions;
    return assetPickOptions.filter((asset) => selectedAssetIds.includes(asset.id));
  }, [assetPickOptions, selectedAssetIds]);

  const hasAssetScope = selectedAssetType || selectedAssetIds.length > 0 || assetSearch.trim();

  const scopedBaseLogs = useMemo(() => (
    logs.filter((log) => {
      if (selectedBuildings.length > 0 && !selectedBuildings.includes(safeText(log.building))) return false;
      if (selectedFloors.length > 0 && !selectedFloors.includes(safeText(log.floor))) return false;
      if (selectedFrequencies.length > 0 && !selectedFrequencies.includes(log.frequency || 'monthly')) return false;
      if (selectedRooms.length > 0 && !selectedRooms.some((room) => logMatchesRoom(log, room))) return false;
      if (hasAssetScope && !scopedAssets.some((asset) => assetMatchesLog(asset, log))) return false;
      return true;
    })
  ), [hasAssetScope, logs, scopedAssets, selectedBuildings, selectedFloors, selectedFrequencies, selectedRooms]);

  const scopedLogs = useMemo(() => (
    scopedBaseLogs.filter((log) => {
      const status = inspectionEffectiveStatus(log, selectedMonth);
      return filter === 'all' || status === filter;
    })
  ), [filter, scopedBaseLogs, selectedMonth]);

  const scopedStats = useMemo(
    () => buildStats(scopedBaseLogs, (log) => inspectionEffectiveStatus(log, selectedMonth)),
    [scopedBaseLogs, selectedMonth],
  );

  const donutDash = (scopedStats.percentDone / 100) * DONUT_C;

  const resultLogs = useMemo(() => (
    scopedBaseLogs
      .slice()
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
  ), [scopedBaseLogs]);

  const todayResultLogs = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return resultLogs.filter((log) => {
      const completed = inspectionCompletedDate(log);
      return completed ? startOfDay(completed).getTime() === today : false;
    });
  }, [resultLogs]);

  const resultDefectLogs = useMemo(() => (
    resultLogs.filter((log) => log.status === 'defect')
  ), [resultLogs]);

  const nextInspectionItems = useMemo(() => (
    scopedBaseLogs
      .filter((log) => inspectionEffectiveStatus(log, selectedMonth) === 'pending')
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .slice(0, 3)
  ), [scopedBaseLogs, selectedMonth]);

  const toggleBuilding = (building: string) => {
    setSelectedBuildings((current) =>
      current.includes(building)
        ? current.filter((item) => item !== building)
        : [...current, building]
    );
    setSelectedFloors([]);
    setSelectedRooms([]);
    setSelectedAssetIds([]);
  };

  const toggleFloor = (floor: string) => {
    setSelectedFloors((current) =>
      current.includes(floor)
        ? current.filter((item) => item !== floor)
        : [...current, floor]
    );
    setSelectedRooms([]);
    setSelectedAssetIds([]);
  };

  const toggleFrequency = (frequency: InspectionFrequency) => {
    setSelectedFrequencies((current) =>
      current.includes(frequency)
        ? current.filter((item) => item !== frequency)
        : [...current, frequency]
    );
  };

  const toggleRoom = (room: string) => {
    setSelectedRooms((current) =>
      current.includes(room)
        ? current.filter((item) => item !== room)
        : [...current, room]
    );
    setSelectedAssetIds([]);
  };

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((item) => item !== assetId)
        : [...current, assetId]
    );
  };

  const clearKartotekaScope = () => {
    setSelectedBuildings([]);
    setSelectedFloors([]);
    setSelectedFrequencies([]);
    setSelectedRooms([]);
    setSelectedAssetType('');
    setSelectedAssetIds([]);
    setAssetSearch('');
  };

  const excelGrouped = scopedLogs
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .reduce((acc, log) => {
      const key = selectedBuildings.length === 1
        ? log.floor || 'Bez patra'
        : `${log.building || 'Bez budovy'} / ${log.floor || 'Bez patra'}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(log);
      return acc;
    }, {} as Record<string, InspectionLog[]>);

  // Handle OK
  const handleOk = async (log: InspectionLog) => {
    setSaving(true);
    try {
      await markOk(log.id);
      showToast(`${log.roomName} — OK`, 'success');
    } catch (err) {
      showToast('Chyba při ukládání', 'error');
    }
    setSaving(false);
  };

  // Fotodokumentace v okně (zatím jen náhled, neukládá se)
  const resetDefectPhotos = () => {
    setDefectPhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.url));
      return [];
    });
  };

  const handleAddPhoto = (file?: File) => {
    if (!file) return;
    setDefectPhotos((prev) => (
      prev.length >= 3
        ? prev
        : [...prev, { id: `photo-${photoSeq.current++}`, url: URL.createObjectURL(file) }]
    ));
  };

  const handleRemovePhoto = (id: string) => {
    setDefectPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((photo) => photo.id !== id);
    });
  };

  const closeDefectModal = () => {
    resetDefectPhotos();
    setActiveLog(null);
  };

  // Handle Defect
  const handleDefect = async () => {
    if (!activeLog || defectNote.trim().length < 3) return;
    setSaving(true);
    try {
      await markDefect(activeLog.id, defectNote.trim(), taskPriority, {
        foodSafetyRisk,
        foodSafetyHazardType,
        foodSafetyImpact,
      });
      showToast('Závada zapsána do rozpracované kontroly. Úkol vznikne při uzavření.', 'success');
      setActiveLog(null);
      resetDefectPhotos();
      setDefectNote('');
      setTaskPriority('P2');
      setFoodSafetyRisk(false);
      setFoodSafetyHazardType('foreign_body');
      setFoodSafetyImpact('medium');
    } catch (err) {
      showToast('Chyba při ukládání', 'error');
    }
    setSaving(false);
  };

  const openInspectionModal = (log: InspectionLog, mode: 'none' | 'ok' | 'defect') => {
    if (mode === 'ok') {
      void handleOk(log);
      return;
    }
    setActiveLog(log);
    resetDefectPhotos();
    setDefectNote(log.defectNote || '');
    setTaskPriority('P2');
    setFoodSafetyRisk(log.foodSafetyRisk === true);
    setFoodSafetyHazardType(log.foodSafetyHazardType || 'foreign_body');
    setFoodSafetyImpact(log.foodSafetyImpact || 'medium');
    setModalStatus(mode);
  };

  const openInspectionNote = (log: InspectionLog) => {
    setActiveNoteLog(log);
    setInspectionNote(log.inspectionNote || '');
  };

  const handleInspectionNote = async () => {
    if (!activeNoteLog) return;
    setSaving(true);
    try {
      await updateInspectionNote(activeNoteLog.id, inspectionNote.trim());
      showToast(inspectionNote.trim() ? 'Připomínka uložena' : 'Připomínka smazána', 'success');
      setActiveNoteLog(null);
      setInspectionNote('');
    } catch (err) {
      showToast('Chyba při ukládání připomínky', 'error');
    }
    setSaving(false);
  };

  const openInspectionFrequency = (log: InspectionLog) => {
    setActiveFrequencyLog(log);
    setInspectionFrequency(log.frequency || 'monthly');
  };

  const handleInspectionFrequency = async () => {
    if (!activeFrequencyLog) return;
    setSaving(true);
    try {
      await updateInspectionFrequency(activeFrequencyLog.id, inspectionFrequency);
      showToast('Pravidelnost kontroly uložena', 'success');
      setActiveFrequencyLog(null);
    } catch (err) {
      showToast('Chyba při ukládání pravidelnosti', 'error');
    }
    setSaving(false);
  };

  const openPlanModal = () => {
    setPlanFrequency(selectedFrequencies[0] || 'monthly');
    setShowPlanModal(true);
  };

  const handlePlanSave = async () => {
    if (scopedLogs.length === 0) return;
    setSaving(true);
    try {
      for (const log of scopedLogs) {
        await updateInspectionFrequency(log.id, planFrequency);
      }
      showToast(`Plan ulozen pro ${scopedLogs.length} kontrol`, 'success');
      setShowPlanModal(false);
    } catch (err) {
      showToast('Plán se nepodařilo uložit', 'error');
    }
    setSaving(false);
  };

  // Handle Reset
  const handleReset = async (log: InspectionLog) => {
    await markPending(log.id);
    showToast('Vráceno na Čeká', 'success');
  };

  // Handle confirm previous defect
  const handleConfirmDefect = async (logId: string, action: 'fixed' | 'still_defect') => {
    setConfirmingDefect(logId);
    try {
      await confirmPreviousDefect(logId, action);
      showToast(action === 'fixed' ? 'Závada opravena' : 'Nedodělek přenesen do aktuálního měsíce', 'success');
    } catch (err) {
      showToast('Chyba při potvrzení', 'error');
    }
    setConfirmingDefect(null);
  };

  // Previous month label
  const prevMonthLabel = new Date(prevMonth + '-01').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  const handleExportXLSX = async () => {
    if (resultLogs.length === 0) return;
    setExporting('xlsx');
    try {
      await exportInspectionXLSX(resultLogs, scopedStats, selectedMonth);
      showToast('Excel kontroly stažen', 'success');
    } catch (err) {
      console.error('[InspectionsPage] XLSX export failed:', err);
      showToast('Excel se nepodařilo vytvořit', 'error');
    }
    setExporting(null);
  };

  const handleExportPDF = async () => {
    if (resultLogs.length === 0) return;
    setExporting('pdf');
    try {
      await exportInspectionPDF(resultLogs, scopedStats, selectedMonth);
      showToast('PDF report vytvořen', 'success');
    } catch (err) {
      console.error('[InspectionsPage] PDF export failed:', err);
      showToast('PDF se nepodařilo vytvořit', 'error');
    }
    setExporting(null);
  };

  const handleStartRun = async () => {
    setSaving(true);
    try {
      await startInspectionRun();
      showToast('Kontrola zahájena jako rozpracovaný doklad', 'success');
    } catch (err) {
      console.error('[InspectionsPage] Start run failed:', err);
      showToast('Kontrolu se nepodařilo zahájit', 'error');
    }
    setSaving(false);
  };

  const handleCloseRun = async () => {
    if (!draftRun) return;
    if (!(await ask({ message: 'Uzavřít kontrolu? Ze závad se založí úkoly.', danger: false }))) return;
    setClosingRun(true);
    try {
      await closeInspectionRun(draftRun.id);
      showToast('Kontrola uzavřena a závady převedeny do úkolů', 'success');
    } catch (err) {
      console.error('[InspectionsPage] Close run failed:', err);
      showToast('Kontrolu se nepodařilo uzavřít', 'error');
    }
    setClosingRun(false);
  };

  const handleReopenRun = async (run: InspectionRun) => {
    if (run.legacyLogId) {
      showToast('Starší doklad jde otevřít a exportovat, ale nejde znovu otevřít jako draft.', 'success');
      return;
    }
    setRunExporting('pdf');
    try {
      await reopenInspectionRun(run.id);
      setViewMode('current');
      setSelectedRun(null);
      showToast('Kontrola znovu otevřena', 'success');
    } catch (err) {
      console.error('[InspectionsPage] Reopen run failed:', err);
      showToast('Kontrolu se nepodařilo znovu otevřít', 'error');
    }
    setRunExporting(null);
  };

  const handleRunExport = async (run: InspectionRun, type: 'xlsx' | 'pdf') => {
    setRunExporting(type);
    try {
      if (type === 'xlsx') await exportInspectionRunXLSX(run);
      else exportInspectionRunPDF(run);
      showToast(type === 'xlsx' ? 'Excel doklad stažen' : 'PDF doklad otevřen pro tisk', 'success');
    } catch (err) {
      console.error('[InspectionsPage] Run export failed:', err);
      showToast('Export dokladu se nepodařil', 'error');
    }
    setRunExporting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
      </div>
    );
  }

  if (viewMode === 'archive') {
    return (
      <InspectionArchiveView
        buildingOptions={buildingOptions}
        archiveBuilding={archiveBuilding}
        archiveFrom={archiveFrom}
        archiveTo={archiveTo}
        runs={filteredClosedRuns}
        selectedRun={selectedRun}
        busy={Boolean(runExporting)}
        onBack={() => setViewMode('current')}
        onCurrent={() => setViewMode('current')}
        onSelectRun={setSelectedRun}
        onBuilding={setArchiveBuilding}
        onFrom={setArchiveFrom}
        onTo={setArchiveTo}
        onExport={handleRunExport}
        onReopen={handleReopenRun}
      />
    );
  }

  return (
    <div className="vik-page min-h-screen text-slate-950 pb-24">
      {/* Header */}
      <div className="vik-page-header sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto w-full max-w-[1200px] flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-emerald-700" />
              Kontroly
            </h1>
            <p className="truncate text-sm font-semibold text-slate-600">Měsíční kontrolní checklist · doklad podle data uzavření</p>
          </div>
          <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:flex">
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
              aria-label="Předchozí měsíc"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[116px] text-center text-sm font-black capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
              aria-label="Další měsíc"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('archive')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 hover:bg-slate-50"
          >
            <Archive className="h-4 w-4" />
            <span className="hidden sm:inline">Archiv</span>
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-4">
        {/* Měsíční navigace na mobilu */}
        <div className="mb-3 flex items-center justify-between gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
            aria-label="Předchozí měsíc"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="flex-1 text-center text-sm font-black capitalize">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
            aria-label="Další měsíc"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_336px] lg:items-start">
          {/* ─────────── LEVÝ SLOUPEC: pracovní checklist ─────────── */}
          <div className="min-w-0 space-y-4">

            {/* Teď provést */}
            <section className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="eyebrow text-amber-700">Teď provést</div>
                  <h2 className="mt-0.5 text-lg font-black text-slate-950">
                    <span className="text-amber-700">{scopedStats.pending} kontrol</span> čeká na provedení
                  </h2>
                </div>
              </div>
              {nextInspectionItems.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {nextInspectionItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-amber-200"
                    >
                      <button
                        type="button"
                        onClick={() => openInspectionModal(item, 'none')}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[15px] font-black text-slate-950">{item.roomName || 'Bez místnosti'}</span>
                        <span className="block truncate text-[13px] font-semibold text-slate-600">
                          {[item.roomCode, item.checkPoints].filter(Boolean).join(' · ') || frequencyLabel(item.frequency)}
                        </span>
                      </button>
                      <span className="hidden shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-700 sm:inline">
                        {frequencyLabel(item.frequency)}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOk(item)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />OK
                        </button>
                        <button
                          type="button"
                          onClick={() => openInspectionModal(item, 'defect')}
                          disabled={saving}
                          className="rounded-xl border-[1.5px] border-red-200 bg-white px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
                        >
                          Závada
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                  V aktuálním výběru není nic k provedení.
                </div>
              )}
            </section>

            {/* Filtry stavu + přepínač nástrojů */}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setFilter('pending')} className={filter === 'pending' ? 'vik-chip vik-chip-active' : 'vik-chip'}>Čeká <span className="opacity-70">{scopedStats.pending}</span></button>
              <button type="button" onClick={() => setFilter('defect')} className={filter === 'defect' ? 'vik-chip vik-chip-active' : 'vik-chip'}>Závady <span className="opacity-70">{scopedStats.defect}</span></button>
              <button type="button" onClick={() => setFilter('ok')} className={filter === 'ok' ? 'vik-chip vik-chip-active' : 'vik-chip'}>OK <span className="opacity-70">{scopedStats.ok}</span></button>
              <button type="button" onClick={() => setFilter('all')} className={filter === 'all' ? 'vik-chip vik-chip-active' : 'vik-chip'}>Vše</button>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setShowPlanningTools((v) => !v)} className="vik-chip">{showPlanningTools ? 'Skrýt filtry a plán' : 'Filtry a plán'}</button>
                <button type="button" onClick={openPlanModal} className="vik-chip vik-chip-active">Nastavit plán</button>
              </div>
            </div>

      {showPlanningTools && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-slate-950">Výběr z kartotéky</div>
              <div className="text-xs text-slate-600">
                {scopedLogs.length}/{logs.length} bodů v aktuálním výběru
                {scopedAssets.length > 0 ? ` · ${scopedAssets.length} položek z kartotéky` : ''}
              </div>
            </div>
            {(selectedBuildings.length > 0 || selectedFloors.length > 0 || selectedFrequencies.length > 0 || selectedRooms.length > 0 || selectedAssetType || selectedAssetIds.length > 0 || assetSearch.trim()) && (
              <button
                type="button"
                onClick={clearKartotekaScope}
                className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 active:scale-95"
              >
                Zrušit filtr
              </button>
            )}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {buildingOptions.map((building) => (
              <button
                key={building}
                type="button"
                onClick={() => toggleBuilding(building)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                  selectedBuildings.includes(building)
                    ? 'bg-blue-600 border-blue-400 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                Budova {building}
              </button>
            ))}
          </div>

          {floorOptions.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Patro</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {floorOptions.map((floor) => (
                  <button
                    key={floor}
                    type="button"
                    onClick={() => toggleFloor(floor)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                      selectedFloors.includes(floor)
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-cyan-300'
                    }`}
                  >
                    {floor}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Plán pravidelných kontrol</div>
              <button type="button" onClick={openPlanModal} className="px-2 py-1 rounded-lg bg-emerald-700 text-xs font-bold text-white">
                Nastavit plán
              </button>
              {selectedFrequencies.length > 0 && (
                <button type="button" onClick={() => setSelectedFrequencies([])} className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                  Všechny
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <button type="button" onClick={() => setSelectedFrequencies(['daily'])} className="min-h-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">Denní plán</button>
              <button type="button" onClick={() => setSelectedFrequencies(['weekly'])} className="min-h-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">Týdenní plán</button>
              <button type="button" onClick={() => setSelectedFrequencies(['monthly'])} className="min-h-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700">Měsíční plán</button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleFrequency(option.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                    selectedFrequencies.includes(option.value)
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {roomOptions.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Místnosti</div>
                {selectedRooms.length > 0 && (
                  <button type="button" onClick={() => { setSelectedRooms([]); setSelectedAssetIds([]); }} className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                    Všechny
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {roomOptions.map((room) => (
                  <button
                    key={room}
                    type="button"
                    onClick={() => toggleRoom(room)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                      selectedRooms.includes(room)
                        ? 'bg-emerald-600 border-emerald-400 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    {room}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Typ / druh položky</span>
              <select
                value={selectedAssetType}
                onChange={(event) => setSelectedAssetType(event.target.value)}
                className="w-full min-h-11 rounded-xl bg-[#fbf9f4] border border-slate-200 px-3 text-sm font-semibold text-slate-950"
              >
                <option value="">Všechny typy</option>
                {assetTypeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Hledat stroj, zařízení, kód nebo místo z kartotéky"
              className="w-full min-h-11 rounded-xl bg-[#fbf9f4] border border-slate-200 pl-10 pr-3 text-sm font-semibold text-slate-950 placeholder:text-slate-500"
            />
          </div>

          {assetPickOptions.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Zařízení z kartotéky</div>
                {selectedAssetIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedAssetIds([])} className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                    Všechna
                  </button>
                )}
              </div>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 space-y-1.5">
                {assetPickOptions.slice(0, 40).map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className={`w-full px-3 py-2 rounded-lg text-left border transition ${
                      selectedAssetIds.includes(asset.id)
                        ? 'bg-violet-600/70 border-violet-400 text-white'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-violet-300'
                    }`}
                  >
                    <div className="text-sm font-bold">{asset.name}</div>
                    <div className={`text-xs ${selectedAssetIds.includes(asset.id) ? 'text-violet-700' : 'text-slate-500'}`}>
                      {asset.buildingId || '-'} {asset.floor ? `· ${asset.floor}` : ''} {assetRoom(asset) ? `· ${assetRoom(asset)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
              {assetPickOptions.length > 40 && (
                <div className="text-xs text-slate-500 mt-1">Zobrazuji prvních 40 položek. Upřesni hledání pro kratší seznam.</div>
              )}
            </div>
          )}
        </div>
        )}

      {/* ═══ NEDODĚLKY Z MINULA ═══ */}
      {previousDefects.length > 0 && (
        <div>
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-red-100 bg-red-50">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-5 h-5 text-red-700" />
                <div>
                  <span className="font-bold text-lg text-red-900">Nedodělky z minula</span>
                  <span className="text-sm text-red-700 ml-2 capitalize">{prevMonthLabel}</span>
                </div>
              </div>
              <span className="text-sm text-red-700 font-bold">{previousDefects.length}</span>
            </div>

            {previousDefects.map((defect) => (
              <div key={defect.id} className="border-b border-red-100 last:border-b-0 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-12 rounded-full bg-red-500 flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-950">{defect.roomName}</span>
                      {defect.roomCode && (
                        <span className="text-xs text-slate-500 font-mono">{defect.roomCode}</span>
                      )}
                    </div>
                    <div className="text-sm text-[#1A1A1A] mt-1 bg-red-50 border border-red-100 rounded-lg p-2 whitespace-pre-wrap break-words">
                      {defect.defectNote}
                    </div>
                    {defect.completedBy && (
                      <p className="text-xs text-slate-500 mt-1">
                        {defect.completedBy} • {defect.completedAt?.toDate?.()?.toLocaleDateString('cs-CZ') || ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 ml-5">
                  <button
                    onClick={() => handleConfirmDefect(defect.id, 'fixed')}
                    disabled={confirmingDefect === defect.id}
                    className="flex-1 min-h-12 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {confirmingDefect === defect.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Opraveno
                  </button>
                  <button
                    onClick={() => handleConfirmDefect(defect.id, 'still_defect')}
                    disabled={confirmingDefect === defect.id}
                    className="flex-1 min-h-12 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {confirmingDefect === defect.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    Stále závada
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist po zónách */}
      <div className="space-y-5">
        {Object.entries(excelGrouped).map(([groupKey, items]) => {
          const collapsed = expandedGroups[groupKey] === false; // default rozbaleno
          const total = items.length;
          const done = items.filter((l) => inspectionEffectiveStatus(l, selectedMonth) !== 'pending').length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          return (
            <div key={groupKey}>
              <div className="mb-2 flex items-center gap-3 px-1">
                <button type="button" onClick={() => toggleGroup(groupKey)} className="flex items-center gap-2 text-left">
                  {collapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  <h3 className="text-[14.5px] font-black text-slate-950">{groupKey}</h3>
                </button>
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">{done}/{total} hotovo</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              {!collapsed && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {items.map((log) => (
                    <InspectionRow
                      key={log.id}
                      log={log}
                      status={inspectionEffectiveStatus(log, selectedMonth)}
                      due={isInspectionDue(log, selectedMonth)}
                      onOk={() => handleOk(log)}
                      onDefect={() => openInspectionModal(log, 'defect')}
                      onNote={() => openInspectionNote(log)}
                      onFrequency={() => openInspectionFrequency(log)}
                      onReset={() => handleReset(log)}
                      onOpenTask={log.taskId ? () => navigate(`/tasks?task=${log.taskId}`) : undefined}
                      onOpenModal={() => openInspectionModal(log, 'none')}
                      saving={saving}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(excelGrouped).length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-500">
            <ClipboardCheck className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p className="font-bold">Žádné záznamy pro tento filtr</p>
          </div>
        )}
      </div>

      {/* Provozní audit po budovách */}
      <AuditPanel />
          </div>

          {/* ─────────── PRAVÝ PANEL: doklad / stav / závady ─────────── */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-[84px]">
            {/* Aktuální doklad */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4 shadow-sm">
              <div className="eyebrow flex items-center gap-1.5 text-emerald-800">
                {draftRun ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                Aktuální doklad
              </div>
              <div className="mt-1.5 text-xl font-black text-slate-950">
                {draftRun ? 'Rozpracováno' : currentRun?.status === 'closed' ? 'Uzavřeno' : 'Nezahájeno'}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-slate-600">
                {draftRun
                  ? `Zahájeno ${runDayLabel(draftRun.startedAt)} · ${draftRun.summary?.defect || 0} závad zapsáno`
                  : currentRun?.status === 'closed'
                    ? `Uzavřeno ${runDayLabel(currentRun.closedAt)} · založ nový měsíc nebo otevři archiv`
                    : 'Založ doklad a průběžně dopisuj OK / závady.'}
              </div>
              {draftRun ? (
                <button
                  type="button"
                  onClick={handleCloseRun}
                  disabled={closingRun || saving}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {closingRun ? 'Uzavírám…' : 'Uzavřít kontrolu'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartRun}
                  disabled={saving || currentRun?.status === 'closed'}
                  className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  Zahájit kontrolu
                </button>
              )}
            </div>

            {/* Stav kontroly */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-[15px] font-black text-slate-950">Stav kontroly</h3>
              <div className="mt-3 flex items-center gap-4">
                <svg width="78" height="78" viewBox="0 0 78 78" className="shrink-0">
                  <circle cx="39" cy="39" r={DONUT_R} fill="none" stroke="#e7e0d4" strokeWidth="9" />
                  <circle cx="39" cy="39" r={DONUT_R} fill="none" stroke="#2e9e74" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${donutDash} ${DONUT_C}`} transform="rotate(-90 39 39)" />
                  <text x="39" y="38" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1b2620">{scopedStats.percentDone}%</text>
                  <text x="39" y="50" textAnchor="middle" fontSize="7" fontWeight="800" fill="#97a096" letterSpacing="1">HOTOVO</text>
                </svg>
                <div className="flex-1 text-[13px] font-semibold text-slate-600">
                  {scopedStats.ok + scopedStats.defect} z {scopedStats.total} bodů hotovo
                  <br />
                  <span className="text-slate-800">{scopedStats.pending} bodů zbývá · {todayResultLogs.length} dnes</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-2xl font-black text-emerald-800">{scopedStats.ok}</div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-emerald-800">OK</div>
                </div>
                <button type="button" onClick={() => setFilter('defect')} className="rounded-xl border border-red-200 bg-red-50 p-3 text-left active:scale-95">
                  <div className="text-2xl font-black text-red-700">{scopedStats.defect}</div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-red-700">Závady</div>
                </button>
                <button type="button" onClick={() => setFilter('pending')} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left active:scale-95">
                  <div className="text-2xl font-black text-amber-700">{scopedStats.pending}</div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-amber-700">Čeká</div>
                </button>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-2xl font-black text-slate-900">{scopedStats.total}</div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-600">Celkem</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportXLSX}
                  disabled={exporting != null || resultLogs.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={exporting != null || resultLogs.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-black text-white transition hover:bg-blue-600 disabled:opacity-50"
                >
                  {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </button>
              </div>
            </div>

            {/* Závady k reportu */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-black text-slate-950">Závady k reportu</h3>
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-black text-red-700">{resultDefectLogs.length}</span>
              </div>
              {resultDefectLogs.length > 0 ? (
                <div className="mt-2 divide-y divide-stone-100">
                  {resultDefectLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5 py-2.5">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-black text-slate-950">{log.roomName || 'Bez místnosti'}</div>
                        <div className="truncate text-xs font-semibold text-slate-500">{[log.roomCode, log.defectNote].filter(Boolean).join(' · ') || 'Bez popisu'}</div>
                      </div>
                      {log.taskId && (
                        <button type="button" onClick={() => navigate(`/tasks?task=${log.taskId}`)} className="shrink-0 whitespace-nowrap text-xs font-black text-blue-700 hover:underline">
                          otevřít →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                  Bez závad v aktuálním výběru.
                </div>
              )}
            </div>

            {/* Hotové kontroly */}
            <button
              type="button"
              onClick={() => setViewMode('archive')}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
            >
              <span>
                <span className="block text-[15px] font-black text-slate-950">Hotové kontroly</span>
                <span className="block text-xs font-semibold text-slate-500">
                  {latestClosedRun ? `Poslední: ${runDayLabel(latestClosedRun.closedAt || latestClosedRun.startedAt)}` : 'Zatím bez uzavřeného dokladu'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-2xl font-black text-slate-900">{closedRuns.length}</span>
                <Archive className="h-5 w-5 text-slate-400" />
              </span>
            </button>
          </aside>
        </div>
      </div>

      {/* Modal: Provést kontrolu */}
      {activeLog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={closeDefectModal}>
          <div
            className="flex max-h-[92vh] w-full max-w-[560px] flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hlavička */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-5">
              <div className="min-w-0">
                <div className="eyebrow flex items-center gap-1.5 text-emerald-800">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Kontrolní bod
                </div>
                <h2 className="mt-1.5 text-xl font-black leading-tight text-slate-950">{activeLog.roomName || 'Kontrolní bod'}</h2>
                <div className="mt-1 font-mono text-xs font-semibold text-slate-500">
                  {[activeLog.roomCode, frequencyLabel(activeLog.frequency)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={closeDefectModal} aria-label="Zavřít" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tělo */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {activeLog.checkPoints && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">Co kontrolovat</span>
                  <div className="inspection-text-block mt-1 text-sm font-semibold text-slate-700">{activeLog.checkPoints}</div>
                </div>
              )}

              {/* Segment stav */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => { if (activeLog) { void handleOk(activeLog); closeDefectModal(); } }}
                  disabled={saving}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-slate-200 bg-white p-4 font-black text-slate-600 transition hover:border-emerald-300 active:scale-[0.98] disabled:opacity-50"
                >
                  <Check className="h-6 w-6 text-emerald-600" />
                  Bez závady
                  <span className="font-mono text-[10px] font-bold uppercase text-slate-400">Stav OK</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalStatus('defect')}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] p-4 font-black transition active:scale-[0.98] ${
                    modalStatus === 'defect' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:border-red-300'
                  }`}
                >
                  <AlertTriangle className="h-6 w-6" />
                  Závada
                  <span className="font-mono text-[10px] font-bold uppercase opacity-70">Zapsat nález</span>
                </button>
              </div>

              {/* Blok závady */}
              {modalStatus === 'defect' && (
                <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-red-800">Důležitost úkolu</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TASK_PRIORITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTaskPriority(option.value)}
                          className={`rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-black transition ${
                            taskPriority === option.value ? option.className : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          {option.label} <span className="font-semibold opacity-70">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFoodSafetyRisk((value) => !value)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left font-bold transition ${
                      foodSafetyRisk ? 'border-red-300 bg-white text-red-800' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span>Riziko pro bezpečnost potravin?</span>
                    <span className="font-black">{foodSafetyRisk ? 'ANO' : 'NE'}</span>
                  </button>

                  {foodSafetyRisk && (
                    <>
                      <div>
                        <label className="text-xs font-black uppercase tracking-wide text-red-800">Kategorie</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {FOOD_SAFETY_HAZARDS.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setFoodSafetyHazardType(item.value)}
                              className={`rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-bold transition ${
                                foodSafetyHazardType === item.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-black uppercase tracking-wide text-red-800">Dopad</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {FOOD_SAFETY_IMPACTS.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setFoodSafetyImpact(item.value)}
                              className={`rounded-xl border-[1.5px] px-3 py-1.5 text-sm font-bold transition ${
                                foodSafetyImpact === item.value ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-red-800">Popis závady *</label>
                    <textarea
                      value={defectNote}
                      onChange={(e) => setDefectNote(e.target.value)}
                      placeholder="Popis zjištění, umístění, doporučení…"
                      rows={3}
                      autoFocus
                      className="inspection-text-block mt-2 w-full resize-y rounded-xl border-[1.5px] border-slate-200 bg-white p-3 text-sm outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-wide text-red-800">Fotodokumentace</label>
                    <div className="mt-2 flex flex-wrap gap-2.5">
                      {defectPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative h-[84px] w-[84px] overflow-hidden rounded-xl border-[1.5px] border-emerald-500 bg-cover bg-center"
                          style={{ backgroundImage: `url(${photo.url})` }}
                        >
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(photo.id)}
                            aria-label="Odebrat fotku"
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-lg bg-black/55 text-white transition hover:bg-black/70"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {defectPhotos.length < 3 && (
                        <label className="flex h-[84px] w-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-emerald-400 hover:text-emerald-700">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => { handleAddPhoto(e.target.files?.[0]); e.target.value = ''; }}
                          />
                          <Camera className="h-5 w-5" />
                          <span className="font-mono text-[9.5px] font-bold">Přidat</span>
                        </label>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-slate-500">Fotky se zatím jen zobrazí — ukládání doplníme později.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Patička */}
            <div className="flex items-center justify-between gap-2 border-t border-stone-100 bg-slate-50 p-4">
              <button onClick={closeDefectModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-100">
                Zrušit
              </button>
              {modalStatus === 'defect' ? (
                <button
                  onClick={handleDefect}
                  disabled={saving || defectNote.trim().length < 3}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  {saving ? 'Ukládám…' : 'Zapsat závadu'}
                </button>
              ) : (
                <button
                  onClick={() => { if (activeLog) { void handleOk(activeLog); closeDefectModal(); } }}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Uložit jako OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspection note modal */}
      {activeNoteLog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setActiveNoteLog(null)}>
          <div
            className="bg-white text-slate-950 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Připomínka ke kontrole</h2>
                <p className="text-xs text-slate-600">{activeNoteLog.roomCode || '-'} - {activeNoteLog.roomName}</p>
              </div>
              <button onClick={() => setActiveNoteLog(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs text-slate-500">Co se kontroluje</div>
                <div className="text-sm text-slate-800 mt-1">{activeNoteLog.checkPoints}</div>
              </div>
              <div>
                <label className="text-sm text-slate-700 mb-1.5 block">Poznámka / připomínka</label>
                <textarea
                  value={inspectionNote}
                  onChange={(event) => setInspectionNote(event.target.value)}
                  placeholder="Například: sledovat stav, příště ověřit, drobná poznámka bez úkolu..."
                  rows={4}
                  autoFocus
                  className="inspection-text-block w-full bg-[#fbf9f4] p-3 rounded-xl border border-slate-300 placeholder:text-slate-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectionNote('')}
                  className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold transition"
                >
                  Vymazat text
                </button>
                <button
                  type="button"
                  onClick={handleInspectionNote}
                  disabled={saving}
                  className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Ulozit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk plan modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setShowPlanModal(false)}>
          <div
            className="bg-white text-slate-950 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Nastavit plán kontrol</h2>
                <p className="text-xs text-slate-600">
                  Použije se na {scopedLogs.length} právě zobrazených kontrol.
                </p>
              </div>
              <button onClick={() => setShowPlanModal(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
                Nejdřív si vyfiltruj budovu, patro nebo místnost. Pak tady nastav, jak často se mají tyto zobrazené kontroly dělat.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPlanFrequency(option.value)}
                    className={`min-h-16 rounded-xl border px-3 text-left transition active:scale-[0.98] ${
                      planFrequency === option.value
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-black">{option.label}</div>
                    <div className="text-xs opacity-80">{option.hint}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handlePlanSave}
                disabled={saving || scopedLogs.length === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Uložit plán pro {scopedLogs.length} kontrol
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection frequency modal */}
      {activeFrequencyLog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setActiveFrequencyLog(null)}>
          <div
            className="bg-white text-slate-950 rounded-t-3xl md:rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Pravidelnost kontroly</h2>
                <p className="text-xs text-slate-600">{activeFrequencyLog.roomCode || '-'} - {activeFrequencyLog.roomName}</p>
              </div>
              <button onClick={() => setActiveFrequencyLog(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setInspectionFrequency(option.value)}
                    className={`min-h-16 rounded-xl border px-3 text-left transition active:scale-[0.98] ${
                      inspectionFrequency === option.value
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-black">{option.label}</div>
                    <div className="text-xs opacity-80">{option.hint}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleInspectionFrequency}
                disabled={saving}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Uložit pravidelnost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// INSPECTION ITEM COMPONENT
// ═══════════════════════════════════════

interface InspectionArchiveViewProps {
  buildingOptions: string[];
  archiveBuilding: string;
  archiveFrom: string;
  archiveTo: string;
  runs: InspectionRun[];
  selectedRun: InspectionRun | null;
  busy: boolean;
  onBack: () => void;
  onCurrent: () => void;
  onSelectRun: (run: InspectionRun) => void;
  onBuilding: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onExport: (run: InspectionRun, type: 'xlsx' | 'pdf') => void;
  onReopen: (run: InspectionRun) => void;
}

function InspectionArchiveView({
  buildingOptions,
  archiveBuilding,
  archiveFrom,
  archiveTo,
  runs,
  selectedRun,
  busy,
  onBack,
  onCurrent,
  onSelectRun,
  onBuilding,
  onFrom,
  onTo,
  onExport,
  onReopen,
}: InspectionArchiveViewProps) {
  const activeRun = selectedRun || runs[0] || null;
  const defects = activeRun?.items?.filter((item) => item.status === 'defect') || [];

  return (
    <div className="vik-page min-h-screen text-slate-950 pb-24">
      <div className="vik-page-header sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto w-full max-w-[1200px] flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Archive className="w-6 h-6 text-emerald-700" />
              Hotové kontroly
            </h1>
            <p className="text-sm text-slate-600">Uložené doklady podle data uzavření</p>
          </div>
          <button type="button" onClick={onCurrent} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">
            Aktuální
          </button>
        </div>
      </div>

      <div className="grid gap-4 px-4 pt-4 lg:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-black text-slate-950">Filtr složek</div>
          <div className="mt-3 grid gap-2">
            <select value={archiveBuilding} onChange={(event) => onBuilding(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-[#fbf9f4] px-3 text-sm font-bold text-slate-900">
              <option value="">Všechny budovy</option>
              {buildingOptions.map((building) => <option key={building} value={building}>{building}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={archiveFrom} onChange={(event) => onFrom(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-[#fbf9f4] px-3 text-sm font-bold text-slate-900" />
              <input type="date" value={archiveTo} onChange={(event) => onTo(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-[#fbf9f4] px-3 text-sm font-bold text-slate-900" />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
              Složky podle data · {runs.length}
            </div>
            <div className="space-y-2">
            {runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">Žádná hotová kontrola neodpovídá filtru.</div>
            ) : runs.map((run) => (
              <button key={run.id} type="button" onClick={() => onSelectRun(run)} className={`w-full rounded-xl border p-3 text-left transition ${activeRun?.id === run.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-slate-950">{runDayLabel(run.closedAt || run.startedAt)}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">{run.summary?.percentDone || 0} %</span>
                </div>
                <div className="mt-1 text-sm font-bold text-slate-600">{run.month} · {runDateLabel(run.closedAt || run.startedAt)}</div>
                <div className="mt-2 flex gap-2 text-xs font-black">
                  <span className="text-emerald-700">{run.summary?.ok || 0} OK</span>
                  <span className="text-red-700">{run.summary?.defect || 0} závad</span>
                  <span className="text-slate-500">{run.taskIds?.length || 0} úkolů</span>
                </div>
              </button>
            ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!activeRun ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-600">Vyber hotovou kontrolu.</div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-emerald-800">Doklad kontroly</div>
                  <h2 className="text-2xl font-black text-slate-950">{activeRun.month}</h2>
                  <p className="text-sm font-bold text-slate-600">Zahájil {activeRun.startedByName} · uzavřel {activeRun.closedByName || '—'} · {runDateLabel(activeRun.closedAt || activeRun.startedAt)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" disabled={busy} onClick={() => onExport(activeRun, 'xlsx')} className="min-h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-800 disabled:opacity-50">XLSX</button>
                  <button type="button" disabled={busy} onClick={() => onExport(activeRun, 'pdf')} className="min-h-11 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-black text-sky-800 disabled:opacity-50">PDF</button>
                  <button type="button" disabled={busy} onClick={() => onReopen(activeRun)} className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-black text-amber-800 disabled:opacity-50">Otevřít</button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-black uppercase text-slate-500">Celkem</div><div className="text-2xl font-black">{activeRun.summary?.total || 0}</div></div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-black uppercase text-emerald-700">OK</div><div className="text-2xl font-black text-emerald-800">{activeRun.summary?.ok || 0}</div></div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3"><div className="text-xs font-black uppercase text-red-700">Závady</div><div className="text-2xl font-black text-red-800">{activeRun.summary?.defect || 0}</div></div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-xs font-black uppercase text-amber-700">Úkoly</div><div className="text-2xl font-black text-amber-800">{activeRun.taskIds?.length || 0}</div></div>
              </div>

              <div className="mt-5">
                <div className="mb-2 font-black text-slate-950">Závady</div>
                {defects.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Kontrola bez závad.</div>
                ) : (
                  <div className="space-y-2">
                    {defects.map((item) => (
                      <div key={item.id} className="rounded-xl border border-red-200 bg-red-50 p-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="font-black text-slate-950">{item.roomName || item.roomCode || 'Bez místnosti'}</div>
                          <div className="text-xs font-black text-red-800">{item.taskId ? `Úkol ${item.taskId.slice(0, 8)}` : 'Bez úkolu'}</div>
                        </div>
                        <div className="mt-1 text-sm font-bold text-slate-700">{item.checkPoints}</div>
                        <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-sm font-semibold text-slate-950">{item.defectNote || 'Bez popisu'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 font-black text-slate-950">Všechny body</div>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {(activeRun.items || []).map((item) => (
                    <div key={item.id} className="grid gap-1 border-b border-slate-200 p-3 last:border-b-0 sm:grid-cols-[180px_1fr_90px]">
                      <div className="font-black text-slate-950">{item.roomName || item.roomCode || 'Bez místnosti'}</div>
                      <div className="text-sm font-semibold text-slate-700">{item.checkPoints}</div>
                      <div className={`text-sm font-black ${item.status === 'defect' ? 'text-red-700' : item.status === 'ok' ? 'text-emerald-700' : 'text-slate-600'}`}>{item.status === 'defect' ? 'Závada' : item.status === 'ok' ? 'OK' : 'Čeká'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function InspectionRow({
  log,
  status,
  due,
  onOk,
  onDefect,
  onNote,
  onFrequency,
  onReset,
  onOpenTask,
  onOpenModal,
  saving,
}: {
  log: InspectionLog;
  status: InspectionEffectiveStatus;
  due: boolean;
  onOk: () => void;
  onDefect: () => void;
  onNote: () => void;
  onFrequency: () => void;
  onReset: () => void;
  onOpenTask?: () => void;
  onOpenModal: () => void;
  saving: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const isPending = status === 'pending';

  return (
    <div className="border-t border-stone-100 first:border-t-0">
      <div className="flex items-center gap-3 px-3 py-3 transition hover:bg-[#faf8f3] sm:px-4">
        {/* Stav ikona */}
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            status === 'ok'
              ? 'bg-emerald-50 text-emerald-700'
              : status === 'defect'
                ? 'bg-red-50 text-red-700'
                : 'border border-dashed border-slate-300 bg-slate-50 text-slate-400'
          }`}
        >
          {status === 'ok' ? (
            <Check className="h-4 w-4" strokeWidth={2.6} />
          ) : status === 'defect' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
        </span>

        {/* Info — klik otevře okno */}
        <button type="button" onClick={onOpenModal} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[14px] font-black text-slate-950">{log.roomName || 'Bez místnosti'}</div>
          <div className="truncate text-[12.5px] font-semibold text-slate-500">
            {log.roomCode && <span className="font-mono">{log.roomCode}</span>}
            {log.roomCode ? ' · ' : ''}{frequencyLabel(log.frequency)}
            {log.completedBy && (
              <span className="ml-1.5 font-mono text-slate-400">{[timeLabel(log), initialsOf(log.completedBy)].filter(Boolean).join(' · ')}</span>
            )}
          </div>
          {log.status === 'defect' && log.defectNote && (
            <div className="mt-1 flex items-start gap-1.5 text-[12.5px] font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="inspection-text-block">{log.defectNote}</span>
            </div>
          )}
          {due && log.status === 'ok' && (
            <div className="mt-0.5 text-[11px] font-bold text-amber-700">Je čas zopakovat kontrolu</div>
          )}
        </button>

        {/* Pravá strana */}
        {isPending ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOk}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">OK</span>
            </button>
            <button
              type="button"
              onClick={onDefect}
              disabled={saving}
              className="rounded-xl border-[1.5px] border-red-200 bg-white px-3 py-2 text-sm font-black text-red-700 transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
            >
              Závada
            </button>
            <button
              type="button"
              onClick={() => setShowActions((v) => !v)}
              aria-label="Další akce"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {log.taskId && onOpenTask && (
              <button type="button" onClick={onOpenTask} className="whitespace-nowrap text-xs font-black text-blue-700 hover:underline">
                úkol →
              </button>
            )}
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status === 'defect' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
              {status === 'defect' ? 'Závada' : 'OK'}
            </span>
            <button
              type="button"
              onClick={() => setShowActions((v) => !v)}
              aria-label="Další akce"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {showActions && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 sm:px-4">
          {!isPending && (
            <button type="button" onClick={onReset} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              ↩ Zpět na Čeká
            </button>
          )}
          <button type="button" onClick={onNote} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Poznámka
          </button>
          <button type="button" onClick={onFrequency} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Pravidelnost: {frequencyLabel(log.frequency)}
          </button>
        </div>
      )}

      {log.inspectionNote && (
        <div className="px-3 pb-2.5 sm:px-4">
          <div className="inspection-text-block rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900">{log.inspectionNote}</div>
        </div>
      )}
    </div>
  );
}

export function InspectionItem({
  log,
  onOk,
  onDefect,
  onReset,
  saving,
}: {
  log: InspectionLog;
  onOk: () => void;
  onDefect: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const st = STATUS[log.status as keyof typeof STATUS] || STATUS.pending;

  return (
    <div className={`flex items-stretch border-b border-slate-200 last:border-b-0 ${
      log.status === 'pending' ? '' : 'opacity-80'
    }`}>
      {/* Status stripe */}
      <div className={`w-1.5 ${
        log.status === 'ok' ? 'bg-emerald-500' : log.status === 'defect' ? 'bg-amber-500' : 'bg-slate-600'
      }`} />

      {/* Content */}
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-start gap-2">
          <st.icon className={`h-5 w-5 ${st.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base">{log.roomName}</span>
              {log.roomCode && (
                <span className="text-xs text-slate-500 font-mono">{log.roomCode}</span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{log.checkPoints}</p>
            {log.status === 'defect' && log.defectNote && (
              <div className="inspection-text-block mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm font-semibold">
                ⚠️ {log.defectNote}
              </div>
            )}
            {log.completedBy && (
              <p className="text-xs text-slate-500 mt-1">
                {log.completedBy} • {log.completedAt?.toDate?.()?.toLocaleDateString('cs-CZ') || ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col justify-center gap-1 p-2">
        {log.status === 'pending' ? (
          <>
            <button
              onClick={onOk}
              disabled={saving}
              className="min-h-12 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-bold transition disabled:opacity-50"
            >
              ✓ OK
            </button>
            <button
              onClick={onDefect}
              disabled={saving}
              className="min-h-12 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-bold transition disabled:opacity-50"
            >
              ✗ Závada
            </button>
          </>
        ) : (
          <button
            onClick={onReset}
            className="min-h-12 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition"
          >
            ↩ Zpět
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// AUDIT PANEL — Revize a kontrola budovy
// ═══════════════════════════════════════

const AUDIT_ITEMS: { id: string; label: string; icon: string; description: string; building: string }[] = [
  // ── Budova C — Zázemí & Vedení ──
  { id: 'c_kotelna', label: 'Kotelna', icon: '🔥', description: 'Plynové kotle, regulace, komín, odvod spalin', building: 'C' },
  { id: 'c_rozvadec', label: 'Rozvaděč NN', icon: '⚡', description: 'Hlavní rozvaděč, jištění, uzemnění, revizní štítky', building: 'C' },
  { id: 'c_hydranty', label: 'Požární hydranty', icon: '🧯', description: 'Hydranty, hasicí přístroje, platnost revizí', building: 'C' },
  { id: 'c_unikove', label: 'Únikové cesty', icon: '🚪', description: 'Průchodnost, značení, nouzové osvětlení', building: 'C' },
  // ── Budova D — Výrobní hala ──
  { id: 'd_vzt', label: 'Vzduchotechnika', icon: '💨', description: 'VZT jednotky, filtrace, regulace, čistota', building: 'D' },
  { id: 'd_kompresor', label: 'Kompresor', icon: '🔧', description: 'Tlakový vzduch, odvod kondenzátu, filtry', building: 'D' },
  { id: 'd_chlazeni', label: 'Chladicí okruh', icon: '❄️', description: 'Chladivo, netěsnosti, výkon, teploty', building: 'D' },
  { id: 'd_plyn', label: 'Plynová regulace', icon: '🔥', description: 'Regulační stanice, ventily, detektor úniku', building: 'D' },
  { id: 'd_klapky', label: 'Požární klapky', icon: '🛡️', description: 'Funkčnost, těsnost, servisní protokol', building: 'D' },
  { id: 'd_vrata', label: 'Sekční vrata', icon: '🚪', description: 'Sekční vrata, nájezdy, mechanismus, bezpečnostní prvky', building: 'D' },
];

type AuditStatus = 'pending' | 'ok' | 'defect';

function AuditPanel() {
  const [auditState, setAuditState] = useState<Record<string, { status: AuditStatus; note: string }>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);

  const getState = (id: string) => auditState[id] || { status: 'pending' as AuditStatus, note: '' };

  const setStatus = (id: string, status: AuditStatus) => {
    setAuditState((prev) => ({
      ...prev,
      [id]: { ...getState(id), status },
    }));
  };

  const setNote = (id: string, note: string) => {
    setAuditState((prev) => ({
      ...prev,
      [id]: { ...getState(id), note },
    }));
  };

  const doneCount = AUDIT_ITEMS.filter((item) => getState(item.id).status !== 'pending').length;

  return (
    <div className="px-3 sm:px-4 mt-5">
      <div className="bg-white rounded-2xl border border-[#ded6c8] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4 border-b border-[#ded6c8] bg-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ClipboardCheck className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-base sm:text-lg font-black text-slate-950">Revize a kontrola budovy</span>
              <span className="block text-xs font-bold text-slate-600">Rychlý provozní audit po budovách</span>
            </span>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-800">
            {doneCount}/{AUDIT_ITEMS.length}
          </span>
        </div>

        {/* Items grouped by building */}
        {(['C', 'D'] as const).map((bld) => (
          <div key={bld}>
            <div className="px-3 sm:px-4 py-2 bg-[#f1ece3] border-b border-[#ded6c8]">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Budova {bld} — {bld === 'C' ? 'Zázemí & Vedení' : 'Výrobní hala'}
              </span>
            </div>
            {AUDIT_ITEMS.filter((it) => it.building === bld).map((item) => {
              const state = getState(item.id);
              const isEditing = editingNote === item.id;
              return (
                <div key={item.id} className="border-b border-[#eee6da] bg-white last:border-b-0">
                  <div className="grid grid-cols-[6px_1fr] sm:grid-cols-[6px_1fr_auto] gap-3 p-3 sm:p-4">
                    <div className={`h-full min-h-14 rounded-full ${
                      state.status === 'ok' ? 'bg-emerald-600' : state.status === 'defect' ? 'bg-amber-500' : 'bg-slate-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{item.icon}</span>
                        <span className="min-w-0 truncate text-base sm:text-lg font-black text-slate-950">{item.label}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{item.description}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex gap-2 sm:justify-end">
                      <button
                        onClick={() => setStatus(item.id, state.status === 'ok' ? 'pending' : 'ok')}
                        className={`min-h-11 flex-1 sm:flex-none rounded-xl px-4 text-sm font-black transition active:scale-[0.98] ${
                          state.status === 'ok'
                            ? 'bg-emerald-700 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setStatus(item.id, state.status === 'defect' ? 'pending' : 'defect')}
                        className={`min-h-11 flex-1 sm:flex-none rounded-xl px-4 text-sm font-black transition active:scale-[0.98] ${
                          state.status === 'defect'
                            ? 'bg-amber-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                        }`}
                      >
                        Závada
                      </button>
                      <button
                        onClick={() => setEditingNote(isEditing ? null : item.id)}
                        aria-label="Poznámka"
                        className={`min-h-11 w-12 rounded-xl text-sm font-black transition active:scale-[0.98] ${
                          isEditing || state.note
                            ? 'border border-blue-200 bg-blue-50 text-blue-800'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        📝
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="px-3 sm:px-4 pb-3">
                      <textarea
                        value={state.note}
                        onChange={(e) => setNote(item.id, e.target.value)}
                        placeholder="Poznámky ke kontrole..."
                        rows={2}
                        autoFocus
                        className="inspection-text-block w-full bg-[#fbf9f4] p-3 rounded-xl border border-slate-300 placeholder:text-slate-500 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 outline-none resize-none text-sm font-semibold"
                      />
                    </div>
                  )}
                  {!isEditing && state.note && (
                    <div className="px-3 sm:px-4 pb-3">
                      <div className="inspection-text-block rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold">
                        📝 {state.note}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
