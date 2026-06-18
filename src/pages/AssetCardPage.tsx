// src/pages/AssetCardPage.tsx
// VIKRR — Asset Shield — Karta stroje / zařízení

import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import {
  useRevisions,
  TYPE_CONFIG as REV_TYPE,
  formatRevisionDate,
  daysUntilRevision,
} from '../hooks/useRevisions';
import { MAINTENANCE_EMPLOYEE_ROLES, useEmployeeDirectory } from '../hooks/useEmployeeDirectory';
import {
  doc, getDoc, collection, query, where, orderBy, limit, onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createTask } from '../services/taskService';
import { assetService } from '../services/assetService';
import type { Asset as AssetV2, AssetEvent, RepairLogEntry, AssetStatus, AssetCriticality } from '../types/asset';
import { getStatusConfig, getCriticalityConfig } from '../types/asset';
import { showToast } from '../components/ui/Toast';
import {
  AlertTriangle, ArrowLeft, CheckCircle2,
  Clock, Loader2, Shield, Wrench, X,
  ChevronRight, Settings, Building2, MapPin,
  Cog, PlusCircle, FileText, Filter, Printer, Edit3, Save, XCircle,
  Calendar, Trash2, ExternalLink, Download, Table, Search,
  Thermometer, Camera, PackageCheck, Link2,
} from 'lucide-react';
import MicButton from '../components/ui/MicButton';
import { exportAssetCardPDF, exportAssetCardXLSX } from '../utils/exportAssetCard';
import {
  addGearboxTemperatureLog,
  assignGearboxToExtruder,
  getGearboxStatus,
  getGearboxStatusLabel,
  isExtruderAsset,
  isGearboxAsset,
  setGearboxStockStatus,
  subscribeGearboxInstallationEvents,
  subscribeGearboxTemperatureLogs,
} from '../services/gearboxService';
import type { GearboxInstallationEvent, GearboxTemperatureLog } from '../types/gearbox';
import { subscribeToRecentWorkLogs } from '../services/workLogService';
import GearboxRepairModal from '../components/gearbox/GearboxRepairModal';
import GearboxProblemModal from '../components/gearbox/GearboxProblemModal';
import type { WorkLog } from '../types/workLog';
import { materialBatch, productBatch } from '../data/productionMasterSeed';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Asset {
  id: string;
  name: string;
  code?: string | null;
  buildingId: string;
  areaName: string;
  entityType?: string;
  location?: string | null;
  floorId?: string;
  category?: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  year?: number | null;
  status?: string;
  mthCounter?: number;
  controlPoints?: string[];
  notes?: string;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  assetName?: string;
  assignedToName?: string;
  completedAt?: Timestamp;
  createdAt: Timestamp;
}

// ═══════════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════════

const STATUS_MAP: Record<string, { label: string; dot: string; color: string }> = {
  operational: { label: 'V provozu', dot: 'bg-emerald-400', color: '#34d399' },
  maintenance: { label: 'Údržba', dot: 'bg-amber-400 animate-pulse', color: '#fbbf24' },
  breakdown:   { label: 'Porucha', dot: 'bg-red-400 animate-pulse', color: '#f87171' },
  broken:      { label: 'Porucha', dot: 'bg-red-400 animate-pulse', color: '#f87171' },
  idle:        { label: 'Nečinný', dot: 'bg-slate-400', color: '#94a3b8' },
  offline:     { label: 'Offline', dot: 'bg-slate-600', color: '#475569' },
  stopped:     { label: 'Zastaveno', dot: 'bg-slate-500', color: '#64748b' },
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  P1: { label: 'P1 Havárie', bg: 'bg-red-500/20', text: 'text-red-700' },
  P2: { label: 'P2 Týden', bg: 'bg-orange-500/20', text: 'text-orange-700' },
  P3: { label: 'P3 Běžná', bg: 'bg-blue-500/20', text: 'text-blue-700' },
  P4: { label: 'P4 Nápad', bg: 'bg-slate-500/20', text: 'text-slate-400' },
};

const BUILDING_NAMES: Record<string, string> = {
  'A': 'Administrativa',
  'B': 'Spojovací krček',
  'C': 'Zázemí & Vedení',
  'D': 'Výrobní hala',
  'E': 'Dílna & Sklad ND',
  'L': 'Loupárna',
};

const CATEGORY_ICONS: Record<string, { icon: typeof Wrench; color: string }> = {
  extruder:   { icon: Cog, color: '#a855f7' },
  mixer:      { icon: Cog, color: '#3b82f6' },
  packer:     { icon: Cog, color: '#22c55e' },
  compressor: { icon: Cog, color: '#06b6d4' },
  boiler:     { icon: Cog, color: '#f97316' },
  forklift:   { icon: Cog, color: '#eab308' },
  conveyor:   { icon: Cog, color: '#6366f1' },
  hvac:       { icon: Cog, color: '#0ea5e9' },
  electrical: { icon: Cog, color: '#f59e0b' },
  gearbox:    { icon: Cog, color: '#8b5cf6' },
};

function getGearboxTemperatureState(asset: Partial<AssetV2> | null | undefined, temperature?: number | null) {
  const value = typeof temperature === 'number' ? temperature : null;
  const warning = asset?.gearboxWarningTemperatureC ?? 70;
  const critical = asset?.gearboxCriticalTemperatureC ?? 85;
  if (value == null) return { label: 'Bez měření', color: '#64748b', background: '#f8fafc', border: '#e2e8f0' };
  if (value >= critical) return { label: 'Kritická teplota', color: '#b91c1c', background: '#fee2e2', border: '#fecaca' };
  if (value >= warning) return { label: 'Varování', color: '#b45309', background: '#fef3c7', border: '#fde68a' };
  return { label: 'V pořádku', color: '#047857', background: '#d1fae5', border: '#a7f3d0' };
}

function clampTemperature(value: number) {
  return Math.max(20, Math.min(120, Math.round(value)));
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatHistoryDate(value: unknown): string {
  const date = toDateOrNull(value);
  return date ? date.toLocaleDateString('cs-CZ') : 'Bez data';
}

function historyTime(value: unknown): number {
  return toDateOrNull(value)?.getTime() ?? 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

function normalizeLookup(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isRoomLikeAsset(asset: { name?: string; entityType?: string; category?: string }): boolean {
  const type = normalizeLookup(`${asset.name || ''} ${asset.entityType || ''} ${asset.category || ''}`);
  return /\b(mistnost|room|area|hala|prostor|sekce|stredisko|oddeleni|pracoviste|stanoviste|balirna|expedice|extrudovna|vyroba|louparna|satny)\b/.test(type);
}

function isBuildingLikeAsset(asset: { name?: string; entityType?: string; category?: string }): boolean {
  const type = normalizeLookup(`${asset.name || ''} ${asset.entityType || ''} ${asset.category || ''}`);
  return type.includes('budova') || type.includes('building');
}

function isContainerAsset(asset: { name?: string; entityType?: string; category?: string }): boolean {
  return isRoomLikeAsset(asset) || isBuildingLikeAsset(asset);
}

function assetLocationAliases(asset: Asset): Set<string> {
  const aliases = new Set<string>();
  const building = normalizeLookup(String(asset.buildingId || '').replace(/^budova\s+/i, ''));
  const roomSource = asset.areaName || (isRoomLikeAsset(asset) ? asset.name : '') || asset.location || '';
  const room = normalizeLookup(roomSource);
  const fullLocation = normalizeLookup(asset.location);

  [room, fullLocation].filter(Boolean).forEach((value) => aliases.add(value));
  if (building && room) {
    aliases.add(`${building} ${room}`);
    aliases.add(`budova ${building} ${room}`);
  }
  if (!room && building) {
    aliases.add(building);
    aliases.add(`budova ${building}`);
  }
  return aliases;
}

function logLocationFitsAsset(log: WorkLog, asset: Asset): boolean {
  const logLocation = normalizeLookup(log.location);
  if (!logLocation) return true;
  return assetLocationAliases(asset).has(logLocation);
}

export default function AssetCardPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, hasPermission } = useAuthContext();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [loadingAssetV2, setLoadingAssetV2] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'passport' | 'relations' | 'needs' | 'history'>('passport');
  const [stanoviste, setStanoviste] = useState('Expedice');
  const [prefilterSaving, setPrefilterSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'all' | 'work' | 'repair' | 'event' | 'task' | 'revision'>('all');
  const [allAssetsV2, setAllAssetsV2] = useState<AssetV2[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [gearboxTemperatures, setGearboxTemperatures] = useState<GearboxTemperatureLog[]>([]);
  const [gearboxEvents, setGearboxEvents] = useState<GearboxInstallationEvent[]>([]);
  const [showGearboxAssign, setShowGearboxAssign] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [showGearboxTemperature, setShowGearboxTemperature] = useState(false);
  const [gearboxActionSaving, setGearboxActionSaving] = useState(false);
  const [linkedToForm, setLinkedToForm] = useState<string[]>([]);
  const [relationSearch, setRelationSearch] = useState('');
  const navigationState = (location.state as { from?: string; backStack?: string[] } | null) || {};
  const returnTo = navigationState.from || '/kartoteka';
  const backStack = navigationState.backStack || [];
  const goBackByHistory = useBackNavigation('/kartoteka');
  const currentPath = `${location.pathname}${location.search}`;
  const goBackOneStep = () => {
    const previous = backStack[backStack.length - 1];
    if (previous) {
      navigate(previous, { state: { from: returnTo, backStack: backStack.slice(0, -1) } });
      return;
    }
    goBackByHistory(returnTo);
  };

  // ─── V2 Rodný list state ───
  const [assetV2, setAssetV2] = useState<AssetV2 | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string; code: string; entityType: string; status: AssetStatus;
    criticality: AssetCriticality; manufacturer: string; model: string;
    serialNumber: string; year: string; location: string;
    gearboxWarningTemperatureC: string; gearboxCriticalTemperatureC: string;
  }>({
    name: '', code: '', entityType: '', status: 'operational',
    criticality: 'medium', manufacturer: '', model: '',
    serialNumber: '', year: '', location: '',
    gearboxWarningTemperatureC: '70', gearboxCriticalTemperatureC: '85',
  });
  const [eventsForm, setEventsForm] = useState<AssetEvent[]>([]);
  const [repairLogForm, setRepairLogForm] = useState<RepairLogEntry[]>([]);
  const [documentsForm, setDocumentsForm] = useState<string[]>([]);
  const tenantId = user?.tenantId ?? 'main_firm';

  const { revisions, loading: loadingRevisions, logRevision } = useRevisions(assetId);

  const canCreateTask = hasPermission('tasks.create');
  const canEditAsset = hasPermission('assets.edit');
  const canAssignGearbox = hasPermission('asset.update');
  const canReportGearboxProblem = hasPermission('wo.create');
  const isGearbox = isGearboxAsset(assetV2) || isGearboxAsset(asset ? {
    name: asset.name,
    code: asset.code,
    category: asset.category,
  } as Partial<AssetV2> : null);
  const extruderOptions = useMemo(
    () => allAssetsV2.filter((item) => item.id !== assetId && isExtruderAsset(item)),
    [allAssetsV2, assetId]
  );

  // Deep-link akce z dashboardu: ?action=temp|assign otevře příslušný modal převodovky
  useEffect(() => {
    const action = searchParams.get('action');
    if (!action || !isGearbox) return;
    if (action === 'temp') setShowGearboxTemperature(true);
    else if (action === 'assign' && canAssignGearbox) setShowGearboxAssign(true);
    if (action === 'temp' || action === 'assign') {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, isGearbox, canAssignGearbox, setSearchParams]);
  const linkedAssetIds = useMemo(() => {
    const ids = new Set(assetV2?.linkedTo || []);
    allAssetsV2.forEach((item) => {
      if (item.linkedTo?.includes(assetId || '')) ids.add(item.id);
    });
    return Array.from(ids).filter((id) => id && id !== assetId);
  }, [allAssetsV2, assetId, assetV2?.linkedTo]);
  const linkedAssets = useMemo(
    () => linkedAssetIds
      .map((id) => allAssetsV2.find((item) => item.id === id))
      .filter(Boolean) as AssetV2[],
    [allAssetsV2, linkedAssetIds]
  );
  const descendantAssetIds = useMemo(() => {
    if (!assetId || !assetV2 || !isContainerAsset(assetV2)) return [];
    const ids = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      allAssetsV2.forEach((item) => {
        if (item.isDeleted || ids.has(item.id)) return;
        if (item.parentId === assetId || (item.parentId && ids.has(item.parentId))) {
          ids.add(item.id);
          changed = true;
        }
      });
    }
    return Array.from(ids);
  }, [allAssetsV2, assetId, assetV2]);
  const relationOptions = useMemo(() => {
    const q = relationSearch.trim().toLowerCase();
    const selected = new Set(linkedToForm);
    return allAssetsV2
      .filter((item) => item.id !== assetId && !selected.has(item.id) && !item.isDeleted)
      .filter((item) => {
        const text = [
          item.name,
          item.code,
          item.entityType,
          item.buildingId ? `Budova ${item.buildingId}` : '',
          item.areaName,
          item.location,
        ].filter(Boolean).join(' ').toLowerCase();
        return !q || text.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
      .slice(0, 8);
  }, [allAssetsV2, assetId, linkedToForm, relationSearch]);

  // ─── PRINT ASSET PASSPORT ───
  const printAssetPassport = () => {
    if (!asset) return;
    const now = new Date().toLocaleDateString('cs-CZ');
    const stInfo = STATUS_MAP[asset.status || 'operational'] || STATUS_MAP.operational;

    const taskRows = tasks.map((t) => {
      const pCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.P3;
      const date = t.createdAt && typeof t.createdAt.toDate === 'function'
        ? t.createdAt.toDate().toLocaleDateString('cs-CZ') : '—';
      const done = t.completedAt && typeof t.completedAt.toDate === 'function'
        ? t.completedAt.toDate().toLocaleDateString('cs-CZ') : '';
      return `<tr>
        <td>${date}</td>
        <td>${pCfg.label}</td>
        <td class="wrap">${t.title}</td>
        <td>${t.assignedToName || '—'}</td>
        <td>${t.status}</td>
        <td>${done}</td>
      </tr>`;
    }).join('');

    const revRows = revisions.map((r) => {
      const days = daysUntilRevision(r.nextRevisionDate);
      const stLabel = r.status === 'expired' ? 'PROŠLÁ' : r.status === 'expiring' ? 'Končí' : 'Platná';
      return `<tr>
        <td>${r.title}</td>
        <td>${formatRevisionDate(r.lastRevisionDate)}</td>
        <td>${formatRevisionDate(r.nextRevisionDate)}</td>
        <td>${stLabel} (${days < 0 ? Math.abs(days) + 'd po' : 'za ' + days + 'd'})</td>
        <td>${r.revisionCompany || '—'}</td>
        <td>${r.certificateNumber || '—'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
      <title>Pasport — ${asset.name}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 20px; }
        .print-header { text-align: center; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #000; }
        .print-header h1 { font-size: 14px; margin: 0; }
        .print-header p { font-size: 10px; color: #475569; margin: 2px 0 0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 16px; }
        .info-box { border: 1px solid #ccc; padding: 6px 8px; border-radius: 4px; }
        .info-box .lbl { font-size: 9px; text-transform: uppercase; color: #666; }
        .info-box .val { font-size: 12px; font-weight: 600; }
        h2 { font-size: 12px; margin: 14px 0 6px; text-transform: uppercase; border-bottom: 1px solid #999; padding-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
        th { background: #f1f5f9; text-align: left; padding: 4px 6px; border: 1px solid #000; font-size: 9px; text-transform: uppercase; }
        td { padding: 3px 6px; border: 1px solid #000; vertical-align: top; }
        td.wrap { max-width: 200px; word-wrap: break-word; white-space: pre-wrap; }
        tr:nth-child(even) { background: #f8fafc; }
        @page { margin: 12mm; size: A4 landscape; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      </style></head><body>
      <div class="print-header">
        <h1>NOMINAL CMMS — Pasport zařízení</h1>
        <p>${asset.name} ${asset.code ? '(' + asset.code + ')' : ''} · Vytištěno: ${now}</p>
      </div>
      <div class="info-grid">
        <div class="info-box"><div class="lbl">Název</div><div class="val">${asset.name}</div></div>
        <div class="info-box"><div class="lbl">Kód</div><div class="val">${asset.code || '—'}</div></div>
        <div class="info-box"><div class="lbl">Stav</div><div class="val">${stInfo.label}</div></div>
        <div class="info-box"><div class="lbl">Budova</div><div class="val">${BUILDING_NAMES[asset.buildingId] || asset.buildingId}</div></div>
        <div class="info-box"><div class="lbl">Místnost</div><div class="val">${asset.areaName || '—'}</div></div>
        <div class="info-box"><div class="lbl">Kategorie</div><div class="val">${asset.category || '—'}</div></div>
        ${asset.manufacturer ? `<div class="info-box"><div class="lbl">Výrobce</div><div class="val">${asset.manufacturer}</div></div>` : ''}
        ${asset.model ? `<div class="info-box"><div class="lbl">Model</div><div class="val">${asset.model}</div></div>` : ''}
        ${asset.serialNumber ? `<div class="info-box"><div class="lbl">Sériové č.</div><div class="val">${asset.serialNumber}</div></div>` : ''}
        ${asset.year ? `<div class="info-box"><div class="lbl">Rok výroby</div><div class="val">${asset.year}</div></div>` : ''}
        ${asset.mthCounter != null ? `<div class="info-box"><div class="lbl">Motohodiny</div><div class="val">${asset.mthCounter.toLocaleString('cs-CZ')} Mth</div></div>` : ''}
      </div>
      ${tasks.length > 0 ? `
        <h2>Historie úkolů (${tasks.length})</h2>
        <table><thead><tr><th>Datum</th><th>Priorita</th><th>Název</th><th>Řešitel</th><th>Stav</th><th>Dokončeno</th></tr></thead>
        <tbody>${taskRows}</tbody></table>
      ` : '<p>Žádné úkoly.</p>'}
      ${revisions.length > 0 ? `
        <h2>Revize (${revisions.length})</h2>
        <table><thead><tr><th>Typ</th><th>Poslední</th><th>Příští</th><th>Stav</th><th>Firma</th><th>Č. zprávy</th></tr></thead>
        <tbody>${revRows}</tbody></table>
      ` : ''}
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  };

  // Handler: Výměna předfiltru (extruder)
  const handlePrefilterChange = async () => {
    if (!asset) return;
    setPrefilterSaving(true);
    try {
      await createTask({
        title: `Výměna předfiltru — ${asset.name}`,
        description: `Preventivní výměna předfiltru na ${asset.name} (${asset.code || ''})`,
        priority: 'P3',
        type: 'preventive',
        source: 'web',
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      setActiveTab('needs');
    } catch (err) {
      console.error('[Prefilter]', err);
    }
    setPrefilterSaving(false);
  };

  // ─── LOAD ASSET ───
  useEffect(() => {
    if (!assetId) return;
    const fetchAsset = async () => {
      try {
        const snap = await getDoc(doc(db, 'assets', assetId));
        if (snap.exists()) {
          setAsset({ id: snap.id, ...snap.data() } as Asset);
        }
      } catch (err) {
        console.error('[AssetCard] asset load', err);
      }
      setLoadingAsset(false);
    };
    fetchAsset();
  }, [assetId]);

  // ─── LOAD ASSET V2 (tenant-aware) ───
  useEffect(() => {
    if (!assetId || !tenantId) return;
    assetService.getById(tenantId, assetId)
      .then((data) => {
        setAssetV2(data);
        // Pokud v1 asset nebyl nalezen, vyplnit z v2 dat (bridge)
        setAsset((prev) => prev ?? {
          id: data.id,
          name: data.name,
          code: data.code,
          buildingId: data.location || '',
          areaName: data.entityType || '',
          category: data.entityType || '',
          manufacturer: data.manufacturer,
          model: data.model,
          serialNumber: data.serialNumber,
          year: data.year,
          status: data.status,
          mthCounter: data.mthCounter,
        } as Asset);
        setEditForm({
          name: data.name || '', code: data.code || '', entityType: data.entityType || '',
          status: data.status || 'operational', criticality: data.criticality || 'medium',
          manufacturer: data.manufacturer || '', model: data.model || '',
          serialNumber: data.serialNumber || '', year: data.year ? String(data.year) : '',
          location: data.location || '',
          gearboxWarningTemperatureC: String(data.gearboxWarningTemperatureC ?? 70),
          gearboxCriticalTemperatureC: String(data.gearboxCriticalTemperatureC ?? 85),
        });
        setEventsForm(data.events || []);
        setRepairLogForm(data.repairLog || []);
        setDocumentsForm(data.documents || []);
        setLinkedToForm(data.linkedTo || []);
        setLoadingAssetV2(false);
      })
      .catch((err) => {
        console.warn('[AssetCard] v2 load fallback:', err);
        setLoadingAssetV2(false);
      });
  }, [assetId, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    assetService.getAll(tenantId)
      .then(setAllAssetsV2)
      .catch((err) => console.warn('[AssetCard] gearbox asset list:', err));
  }, [tenantId]);

  useEffect(() => {
    if (!assetId || !isGearbox) return;
    const unsubTemp = subscribeGearboxTemperatureLogs(assetId, setGearboxTemperatures);
    const unsubEvents = subscribeGearboxInstallationEvents(assetId, setGearboxEvents);
    return () => {
      unsubTemp();
      unsubEvents();
    };
  }, [assetId, isGearbox]);

  const refreshAssetV2 = async () => {
    if (!assetId) return;
    const updated = await assetService.getById(tenantId, assetId);
    setAssetV2(updated);
    setAsset((prev) => prev ? {
      ...prev,
      name: updated.name,
      code: updated.code,
      areaName: updated.areaName || prev.areaName,
      buildingId: updated.buildingId || prev.buildingId,
      category: updated.category || updated.entityType || prev.category,
      status: updated.status,
    } : prev);
  };

  const handleReturnGearboxToStock = async () => {
    if (!assetV2) return;
    setGearboxActionSaving(true);
    try {
      await setGearboxStockStatus({ tenantId, gearbox: assetV2, status: 'in_stock', user });
      await refreshAssetV2();
      showToast('Převodovka vrácena do skladu', 'success');
    } catch (err) {
      console.error('[Gearbox] return to stock:', err);
      showToast('Nepodařilo se vrátit převodovku do skladu', 'error');
    }
    setGearboxActionSaving(false);
  };

  const handleMoveGearboxToService = async () => {
    if (!assetV2) return;
    setGearboxActionSaving(true);
    try {
      await setGearboxStockStatus({ tenantId, gearbox: assetV2, status: 'service', user });
      await refreshAssetV2();
      showToast('Převodovka přesunuta do servisu', 'success');
    } catch (err) {
      console.error('[Gearbox] move to service:', err);
      showToast('Nepodařilo se přesunout převodovku do servisu', 'error');
    }
    setGearboxActionSaving(false);
  };

  // ─── SAVE EDIT ───
  const handleSaveEdit = async () => {
    if (!assetV2 || !assetId) return;
    setEditSaving(true);
    try {
      await assetService.update(tenantId, assetId, {
        name: editForm.name, code: editForm.code || null,
        entityType: editForm.entityType, status: editForm.status,
        criticality: editForm.criticality, manufacturer: editForm.manufacturer || null,
        model: editForm.model || null, serialNumber: editForm.serialNumber || null,
        year: editForm.year ? Number(editForm.year) : null,
        location: editForm.location || null,
        gearboxWarningTemperatureC: editForm.gearboxWarningTemperatureC ? Number(editForm.gearboxWarningTemperatureC) : null,
        gearboxCriticalTemperatureC: editForm.gearboxCriticalTemperatureC ? Number(editForm.gearboxCriticalTemperatureC) : null,
        events: eventsForm.filter(e => e.name.trim()),
        repairLog: repairLogForm.filter(e => e.description.trim()),
        documents: documentsForm.filter(d => d.trim()),
        linkedTo: linkedToForm.filter((id) => id && id !== assetId),
      });
      const updated = await assetService.getById(tenantId, assetId);
      setAssetV2(updated);
      setAsset((prev) => prev ? {
        ...prev,
        name: updated.name,
        code: updated.code,
        areaName: updated.areaName || prev.areaName,
        buildingId: updated.buildingId || prev.buildingId,
        category: updated.category || updated.entityType || prev.category,
        status: updated.status,
      } : prev);
      setIsEditing(false);
      setActiveTab('history');
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      showToast('Uloženo', 'success');
    } catch (err) {
      console.error('[AssetCard] save error:', err);
      showToast('Chyba při ukládání', 'error');
    }
    setEditSaving(false);
  };

  const handleCancelEdit = () => {
    if (!assetV2) return;
    setEditForm({
      name: assetV2.name || '', code: assetV2.code || '', entityType: assetV2.entityType || '',
      status: assetV2.status || 'operational', criticality: assetV2.criticality || 'medium',
      manufacturer: assetV2.manufacturer || '', model: assetV2.model || '',
      serialNumber: assetV2.serialNumber || '', year: assetV2.year ? String(assetV2.year) : '',
      location: assetV2.location || '',
      gearboxWarningTemperatureC: String(assetV2.gearboxWarningTemperatureC ?? 70),
      gearboxCriticalTemperatureC: String(assetV2.gearboxCriticalTemperatureC ?? 85),
    });
    setEventsForm(assetV2.events || []);
      setRepairLogForm(assetV2.repairLog || []);
      setDocumentsForm(assetV2.documents || []);
      setLinkedToForm(assetV2.linkedTo || []);
      setIsEditing(false);
  };

  // ─── EXPORT HANDLERS ───
  const handleExportPDF = async () => {
    if (!assetV2) return;
    setShowExportMenu(false);
    try {
      await exportAssetCardPDF(assetV2);
      showToast('PDF exportováno', 'success');
    } catch (err) {
      console.error('[AssetCard] PDF export error:', err);
      showToast('Chyba při exportu PDF', 'error');
    }
  };

  const handleExportXLSX = async () => {
    if (!assetV2) return;
    setShowExportMenu(false);
    try {
      await exportAssetCardXLSX(assetV2);
      showToast('Excel exportován', 'success');
    } catch (err) {
      console.error('[AssetCard] XLSX export error:', err);
      showToast('Chyba při exportu Excel', 'error');
    }
  };

  // ─── LOAD TASKS ───
  useEffect(() => {
    if (!assetId) return;
    const q = query(
      collection(db, 'tasks'),
      where('assetId', '==', assetId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
      setLoadingTasks(false);
    }, (err) => {
      console.error('[AssetCard] tasks load', err);
      setLoadingTasks(false);
    });
    return () => unsub();
  }, [assetId]);

  // ─── LOAD WORK DIARY HISTORY ───
  useEffect(() => {
    if (!assetId || !asset) return;
    const assetName = normalizeLookup(asset.name);
    const containerCard = isContainerAsset(assetV2 || asset) || descendantAssetIds.length > 0;
    const relatedIds = new Set([...linkedAssetIds, ...descendantAssetIds]);
    const relatedNames = new Set(linkedAssets.map((item) => normalizeLookup(item.name)).filter(Boolean));

    return subscribeToRecentWorkLogs((logs) => {
      setWorkLogs(
        logs.filter((log) => {
          if (log.assetId === assetId) return true;
          if (log.assetId && relatedIds.has(log.assetId)) return true;
          if (log.assetId) return false;

          const logAssetName = normalizeLookup(log.assetName);
          const locationFits = logLocationFitsAsset(log, asset);
          if (containerCard) return false;
          if (assetName && logAssetName === assetName && locationFits) return true;
          if (logAssetName && relatedNames.has(logAssetName) && locationFits) return true;
          return false;
        })
      );
    }, 300);
  }, [asset, assetId, assetV2, descendantAssetIds, linkedAssetIds, linkedAssets]);

  // Revision alerts
  const expiredRevisions = useMemo(
    () => revisions.filter((r) => r.status === 'expired'),
    [revisions]
  );
  const expiringRevisions = useMemo(
    () => revisions.filter((r) => r.status === 'expiring'),
    [revisions]
  );

  // Sorted events (newest first by nextDate or lastDate)
  const sortedEvents = useMemo(() => {
    const events = assetV2?.events || [];
    return [...events].sort((a, b) => {
      const dA = a.nextDate || a.lastDate || '';
      const dB = b.nextDate || b.lastDate || '';
      return dB.localeCompare(dA);
    });
  }, [assetV2?.events]);

  // Sorted repair log (newest first by date)
  const sortedRepairLog = useMemo(() => {
    const log = assetV2?.repairLog || [];
    return [...log].sort((a, b) => b.date.localeCompare(a.date));
  }, [assetV2?.repairLog]);

  const historyItems = useMemo(() => {
    const repairItems = sortedRepairLog.map((entry) => {
      const partsText = entry.parts?.length ? `Dily: ${entry.parts.join(', ')}` : '';
      const costText = entry.cost ? `${entry.cost.toLocaleString('cs-CZ')} Kc` : '';
      return {
        id: `repair-${entry.id}`,
        type: 'repair' as const,
        typeLabel: 'Oprava',
        title: entry.description || 'Oprava bez popisu',
        detail: [entry.technicianName, partsText, costText].filter(Boolean).join(' | '),
        dateValue: entry.date,
        time: historyTime(entry.date),
        color: '#f97316',
      };
    });

    const eventItems = sortedEvents.map((evt) => ({
      id: `event-${evt.id}`,
      type: 'event' as const,
      typeLabel: 'Udalost',
      title: evt.name || 'Udalost bez nazvu',
      detail: [evt.eventType, evt.instructions, evt.lastDate ? `Posledni: ${formatHistoryDate(evt.lastDate)}` : '', evt.nextDate ? `Pristi: ${formatHistoryDate(evt.nextDate)}` : ''].filter(Boolean).join(' | '),
      dateValue: evt.nextDate || evt.lastDate,
      time: historyTime(evt.nextDate || evt.lastDate),
      color: '#3b82f6',
    }));

    const taskItems = tasks.map((task) => ({
      id: `task-${task.id}`,
      type: 'task' as const,
      typeLabel: 'Ukol',
      title: task.title || 'Ukol bez nazvu',
      detail: [task.priority, task.status, task.assignedToName ? `Resi: ${task.assignedToName}` : ''].filter(Boolean).join(' | '),
      dateValue: task.createdAt,
      time: historyTime(task.createdAt),
      color: '#22c55e',
    }));

    const workLogItems = workLogs.map((log) => {
      const minutes = log.hoursWorked ? Math.round(log.hoursWorked * 60) : 0;
      const workers = Array.isArray(log.workerNames) && log.workerNames.length
        ? log.workerNames.join(', ')
        : log.userName;
      return {
        id: `work-${log.id}`,
        type: 'work' as const,
        typeLabel: 'Deník',
        title: log.taskTitle || log.assetName || 'Zápis práce',
        detail: [workers, minutes ? `${minutes} min` : '', log.location, log.content].filter(Boolean).join(' | '),
        dateValue: log.performedAt || log.createdAt,
        time: historyTime(log.performedAt || log.createdAt),
        color: '#14b8a6',
        linkWarning: log.assetId ? '' : 'Napojeno podle textu. Pro audit je lepší otevřít deník práce a napojit zápis na kartu.',
      };
    });

    const revisionItems = revisions.map((rev: any) => ({
      id: `revision-${rev.id}`,
      type: 'revision' as const,
      typeLabel: 'Revize',
      title: rev.title || 'Revize bez nazvu',
      detail: [rev.status, rev.revisionCompany, rev.certificateNumber].filter(Boolean).join(' | '),
      dateValue: rev.nextRevisionDate || rev.lastRevisionDate,
      time: historyTime(rev.nextRevisionDate || rev.lastRevisionDate),
      color: rev.status === 'expired' ? '#ef4444' : rev.status === 'expiring' ? '#f59e0b' : '#14b8a6',
    }));

    const gearboxTemperatureItems = gearboxTemperatures.map((log) => ({
      id: `gearbox-temp-${log.id}`,
      type: 'event' as const,
      typeLabel: 'Teplota',
      title: `${log.temperatureC} °C`,
      detail: [log.extruderName ? `Extruder: ${log.extruderName}` : '', log.rawMaterial ? `Surovina: ${log.rawMaterial}` : '', log.userName, log.note, log.photoUrl ? 'Fotka přiložena' : ''].filter(Boolean).join(' | '),
      dateValue: log.measuredAt,
      time: historyTime(log.measuredAt),
      color: '#0ea5e9',
    }));

    const gearboxEventItems = gearboxEvents.map((evt) => {
      const title =
        evt.action === 'installed' ? `Namontováno na ${evt.extruderName || 'extruder'}`
          : evt.action === 'service' ? 'Označeno: v opravě'
            : evt.action === 'ready_for_stock' ? 'Označeno: připravená ve skladu'
              : 'Vráceno do skladu';
      const color =
        evt.action === 'installed' ? '#8b5cf6'
          : evt.action === 'service' ? '#f59e0b'
            : '#22c55e';
      return {
        id: `gearbox-event-${evt.id}`,
        type: 'event' as const,
        typeLabel: 'Přesun',
        title,
        detail: [evt.previousExtruderName ? `Předtím: ${evt.previousExtruderName}` : '', evt.userName, evt.note].filter(Boolean).join(' | '),
        dateValue: evt.performedAt,
        time: historyTime(evt.performedAt),
        color,
      };
    });

    const q = normalizeText(historySearch.trim());
    return [...workLogItems, ...repairItems, ...eventItems, ...gearboxTemperatureItems, ...gearboxEventItems, ...taskItems, ...revisionItems]
      .filter((item) => historyType === 'all' || item.type === historyType)
      .filter((item) => !q || normalizeText(`${item.typeLabel} ${item.title} ${item.detail} ${formatHistoryDate(item.dateValue)}`).includes(q))
      .sort((a, b) => b.time - a.time);
  }, [gearboxEvents, gearboxTemperatures, historySearch, historyType, revisions, sortedEvents, sortedRepairLog, tasks, workLogs]);

  // ─── LOADING ───
  if (loadingAsset || loadingAssetV2) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4">
        <Settings className="w-16 h-16 text-slate-600" />
        <h2 className="text-xl font-bold text-slate-400">Zařízení nenalezeno</h2>
        <button onClick={goBackOneStep} className="text-blue-700 font-medium">
          ← Zpět
        </button>
      </div>
    );
  }

  const st = STATUS_MAP[asset.status || 'operational'] || STATUS_MAP.operational;
  const catCfg = CATEGORY_ICONS[asset.category || ''] || { icon: Wrench, color: '#f97316' };
  const IconComp = catCfg.icon;
  const buildingName = BUILDING_NAMES[asset.buildingId] || asset.buildingId;

  // ─── RENDER ───
  return (
    <div className="min-h-screen bg-[#f3eee5] pb-24 text-slate-900">
      {/* Revision Alert Banner */}
      {expiredRevisions.length > 0 && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-700 flex-shrink-0" />
            <div>
              <div className="font-bold text-red-700 text-sm">Prošlé revize!</div>
              {expiredRevisions.map((r) => (
                <div key={r.id} className="text-xs text-red-700/80">{r.title}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 pt-4">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-slate-500 flex-wrap gap-1 mb-4">
          <button onClick={() => navigate('/')} className="hover:text-blue-700 transition">
            Dashboard
          </button>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <button onClick={() => navigate('/kartoteka')} className="hover:text-blue-700 transition">
            Kartotéka
          </button>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <button
            onClick={() => navigate('/kartoteka')}
            className="hover:text-blue-700 transition flex items-center gap-1"
          >
            <Building2 className="w-3.5 h-3.5" />
            {buildingName}
          </button>
          {asset.areaName && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-600" />
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {asset.areaName}
              </span>
            </>
          )}
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <span className="text-slate-900 font-medium">{asset.name}</span>
        </div>

        {/* Header */}
        <div className="rounded-2xl border border-[#e2d8c9] bg-white p-3 shadow-sm mb-3 flex items-center gap-3">
          <button
            onClick={goBackOneStep}
            className="w-11 h-11 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center text-slate-600 hover:bg-stone-100 transition flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: catCfg.color + '25' }}
          >
            <IconComp className="w-6 h-6" style={{ color: catCfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-950 truncate">{asset.name}</h1>
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${st.dot}`} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {asset.code && (
                <span className="text-xs text-slate-600 font-mono">{asset.code}</span>
              )}
              <span
                className="text-xs font-black px-2 py-1 rounded-full"
                style={{ backgroundColor: st.color + '20', color: st.color }}
              >
                {st.label}
              </span>
              {expiringRevisions.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700">
                  {expiringRevisions.length} revize končí
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-xl bg-[#fbf9f4] border border-[#eadfce] p-3">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Typ</div>
            <div className="mt-1 truncate text-sm font-black text-slate-950">{assetV2?.entityType || asset.entityType || asset.category || 'Karta'}</div>
          </div>
          <div className="rounded-xl bg-[#fbf9f4] border border-[#eadfce] p-3">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Umístění</div>
            <div className="mt-1 truncate text-sm font-black text-slate-950">
              {[buildingName, asset.areaName || asset.location].filter(Boolean).join(' · ') || 'Nezadáno'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="rounded-xl bg-[#fbf9f4] border border-[#eadfce] p-3 text-left transition hover:bg-[#f4ede2]"
          >
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Historie</div>
            <div className="mt-1 text-sm font-black text-slate-950">{historyItems.length} záznamů</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('needs')}
            className="rounded-xl bg-[#fbf9f4] border border-[#eadfce] p-3 text-left transition hover:bg-[#f4ede2]"
          >
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Úkoly</div>
            <div className="mt-1 text-sm font-black text-slate-950">{tasks.length} celkem</div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('needs')}
            className={`rounded-xl border p-3 text-left transition ${
              expiredRevisions.length > 0
                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                : 'bg-[#fbf9f4] border-[#eadfce] hover:bg-[#f4ede2]'
            }`}
          >
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Revize</div>
            <div className={`mt-1 text-sm font-black ${expiredRevisions.length > 0 ? 'text-red-700' : 'text-slate-950'}`}>
              {expiredRevisions.length > 0 ? `${expiredRevisions.length} prošlé` : `${revisions.length} záznamů`}
            </div>
          </button>
        </div>

        {/* Akce — jedna čistá lišta (jeden červený akcent „Nahlásit", ostatní neutrální + barevná ikona) */}
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-2xl border border-[#e2d8c9] bg-white p-2 shadow-sm">
          {canCreateTask && (
            <button
              onClick={() => setShowFaultModal(true)}
              className="min-w-[140px] flex-1 bg-red-600 border border-red-600 text-white rounded-xl px-3 text-sm font-black flex items-center justify-center gap-2 hover:bg-red-700 transition active:scale-[0.97] min-h-11"
            >
              <AlertTriangle className="w-5 h-5" />
              Nahlásit poruchu
            </button>
          )}
          {canCreateTask && (
            <button
              onClick={() => setShowTaskModal(true)}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11"
            >
              <PlusCircle className="w-5 h-5 text-emerald-700" />
              Nový úkol
            </button>
          )}
          <button
            onClick={() => setRepairOpen(true)}
            className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11"
          >
            <FileText className="w-5 h-5 text-slate-500" />
            Zapsat
          </button>
          {canEditAsset && (
            <button
              onClick={() => { setIsEditing(!isEditing); setActiveTab('passport'); }}
              className={`min-w-[120px] flex-1 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.97] min-h-11 border ${
                isEditing
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-stone-200 text-slate-700 hover:bg-stone-50'
              }`}
            >
              <Edit3 className="w-5 h-5 text-slate-500" />
              {isEditing ? 'Edituji…' : 'Upravit'}
            </button>
          )}
          {canEditAsset && revisions.length > 0 && (
            <button
              onClick={() => setShowRevisionModal(true)}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11"
            >
              <Shield className="w-5 h-5 text-emerald-700" />
              Zapsat revizi
            </button>
          )}
          {isGearbox && canEditAsset && (
            <button
              onClick={() => setShowGearboxTemperature(true)}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11"
            >
              <Thermometer className="w-5 h-5 text-cyan-600" />
              Teplota
            </button>
          )}
          {isGearbox && canAssignGearbox && (
            <button
              onClick={() => setShowGearboxAssign(true)}
              disabled={gearboxActionSaving}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11 disabled:opacity-50"
            >
              <Cog className="w-5 h-5 text-violet-600" />
              Přiřadit
            </button>
          )}
          {isGearbox && canAssignGearbox && getGearboxStatus(assetV2) !== 'in_stock' && (
            <button
              onClick={handleReturnGearboxToStock}
              disabled={gearboxActionSaving}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11 disabled:opacity-50"
            >
              <PackageCheck className="w-5 h-5 text-emerald-600" />
              Sklad
            </button>
          )}
          {isGearbox && canAssignGearbox && (
            <button
              onClick={handleMoveGearboxToService}
              disabled={gearboxActionSaving || getGearboxStatus(assetV2) === 'service'}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11 disabled:opacity-50"
            >
              <Wrench className="w-5 h-5 text-amber-600" />
              Servis
            </button>
          )}
          {asset.category === 'extruder' && canCreateTask && (
            <button
              onClick={handlePrefilterChange}
              disabled={prefilterSaving}
              className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11 disabled:opacity-50"
            >
              {prefilterSaving ? <Loader2 className="w-5 h-5 animate-spin text-purple-600" /> : <Filter className="w-5 h-5 text-purple-600" />}
              Předfiltr
            </button>
          )}
          <button
            onClick={printAssetPassport}
            className="min-w-[120px] flex-1 bg-white border border-stone-200 text-slate-700 rounded-xl px-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-stone-50 transition active:scale-[0.97] min-h-11"
          >
            <Printer className="w-5 h-5 text-slate-500" />
            Tisk historie
          </button>
          {/* Export */}
          <div className="relative" style={{ flex: '0 0 auto' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="min-h-11 px-4 bg-emerald-700 border border-emerald-700 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-emerald-600 transition active:scale-[0.97]"
              title="Export PDF / Excel"
            >
              <Download className="w-5 h-5" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-lg overflow-hidden"
                  style={{ background: '#fff', border: '1px solid #e2e8f0', minWidth: '180px' }}
                >
                  <button
                    onClick={handleExportPDF}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition"
                    style={{ color: '#0f172a', fontSize: '0.9rem' }}
                  >
                    <FileText className="w-4 h-4" style={{ color: '#ef4444' }} />
                    PDF export
                  </button>
                  <div style={{ height: '1px', background: '#e2e8f0' }} />
                  <button
                    onClick={handleExportXLSX}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition"
                    style={{ color: '#0f172a', fontSize: '0.9rem' }}
                  >
                    <Table className="w-4 h-4" style={{ color: '#22c55e' }} />
                    Excel export
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-4 rounded-2xl border border-[#e2d8c9] bg-white p-2 shadow-sm sm:grid-cols-4">
          {([
            { key: 'passport' as const, label: 'Rodný list' },
            { key: 'relations' as const, label: 'Návaznosti' },
            { key: 'needs' as const, label: `Potřeby (${tasks.length + revisions.length})`, alert: expiredRevisions.length > 0 },
            { key: 'history' as const, label: `Historie (${historyItems.length})` },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-black transition-all ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {tab.alert && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ═══ TABY: Rodný list / Návaznosti / Potřeby (sekce se zobrazují podle aktivního tabu) ═══ */}
        {activeTab !== 'history' && (
          <div className="space-y-4">
            <div className="hidden rounded-2xl border border-[#e2d8c9] bg-white p-3 shadow-sm">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Rychla orientace</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { id: 'asset-section-basic', label: 'Zaklad' },
                  { id: 'asset-section-links', label: 'Vazby' },
                  ...(isGearbox ? [{ id: 'asset-section-gearbox', label: 'Převodovka' }] : []),
                  { id: 'asset-section-technical', label: 'Technika' },
                  { id: 'asset-section-service', label: 'Servis' },
                  { id: 'asset-section-documents', label: 'Dokumenty' },
                ].map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="min-h-10 rounded-xl border border-[#e2d8c9] bg-[#fbf9f4] px-3 text-sm font-black text-[#10263f] transition hover:border-[#1a6b4f] hover:bg-[#edf7f2]"
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>
            {/* ═══ SEKCE 1: IDENTITY CARD (Apple-style) ═══ */}
            <div id="asset-section-basic" className={activeTab === 'passport' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>Identifikace</h3>
                {canEditAsset && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                  >
                    <Edit3 size={14} /> Upravit
                  </button>
                )}
              </div>

              {!isEditing ? (
                /* View mode */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    {assetV2?.image ? (
                      <img src={assetV2.image} alt="" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover', background: '#f1f5f9' }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Cog size={24} style={{ color: '#94a3b8' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{assetV2?.name || asset.name}</div>
                      {(assetV2?.code || asset.code) && (
                        <div style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>{assetV2?.code || asset.code}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                      background: (getStatusConfig(assetV2?.status || asset.status as any).color === 'bg-green-500' ? '#dcfce7' : getStatusConfig(assetV2?.status || asset.status as any).color === 'bg-amber-500' ? '#fef3c7' : getStatusConfig(assetV2?.status || asset.status as any).color === 'bg-red-500' ? '#fee2e2' : '#f1f5f9'),
                      color: (assetV2?.status || asset.status) === 'operational' ? '#16a34a' : (assetV2?.status || asset.status) === 'maintenance' ? '#d97706' : (assetV2?.status || asset.status) === 'broken' ? '#dc2626' : '#64748b',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: (assetV2?.status || asset.status) === 'operational' ? '#22c55e' : (assetV2?.status || asset.status) === 'maintenance' ? '#eab308' : (assetV2?.status || asset.status) === 'broken' ? '#ef4444' : '#6b7280' }} />
                      {getStatusConfig(assetV2?.status || asset.status as any).label}
                    </span>
                    {assetV2?.criticality && (
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                        background: assetV2.criticality === 'critical' ? '#fee2e2' : assetV2.criticality === 'high' ? '#ffedd5' : assetV2.criticality === 'medium' ? '#dbeafe' : '#f1f5f9',
                        color: assetV2.criticality === 'critical' ? '#dc2626' : assetV2.criticality === 'high' ? '#ea580c' : assetV2.criticality === 'medium' ? '#2563eb' : '#64748b',
                      }}>
                        {getCriticalityConfig(assetV2.criticality).label}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Edit mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <RLField label="Název" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
                  <RLField label="Kód" value={editForm.code} onChange={(v) => setEditForm({ ...editForm, code: v })} placeholder="např. AST-001" />
                  <RLField label="Druh položky" value={editForm.entityType} onChange={(v) => setEditForm({ ...editForm, entityType: v })} placeholder="např. Stroj, Budova, Místnost" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <RLSelect
                      label="Stav"
                      value={editForm.status}
                      options={[
                        { value: 'operational', label: '✅ V provozu' },
                        { value: 'maintenance', label: '🔧 Údržba' },
                        { value: 'broken', label: '❌ Porucha' },
                        { value: 'stopped', label: '⏸️ Zastaveno' },
                      ]}
                      onChange={(v) => setEditForm({ ...editForm, status: v as any })}
                    />
                    <RLSelect
                      label="Kritičnost"
                      value={editForm.criticality}
                      options={[
                        { value: 'low', label: '🟢 Nízká' },
                        { value: 'medium', label: '🔵 Střední' },
                        { value: 'high', label: '🟠 Vysoká' },
                        { value: 'critical', label: '🔴 Kritická' },
                      ]}
                      onChange={(v) => setEditForm({ ...editForm, criticality: v as any })}
                    />
                  </div>
                  {isGearbox && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <RLField
                        label="Varování od °C"
                        type="number"
                        value={editForm.gearboxWarningTemperatureC}
                        onChange={(v) => setEditForm({ ...editForm, gearboxWarningTemperatureC: v })}
                        placeholder="70"
                      />
                      <RLField
                        label="Kritická od °C"
                        type="number"
                        value={editForm.gearboxCriticalTemperatureC}
                        onChange={(v) => setEditForm({ ...editForm, gearboxCriticalTemperatureC: v })}
                        placeholder="85"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div id="asset-section-links" className={activeTab === 'relations' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>Přiřazeno k</h3>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Vazby na související místnosti, stroje nebo zařízení</div>
                </div>
                <Link2 size={20} style={{ color: '#64748b' }} />
              </div>

              {!isEditing ? (
                linkedAssets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                    Zatím není přiřazeno k jiné kartě
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {linkedAssets.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(`/asset/${item.id}`, {
                          state: {
                            from: returnTo,
                            backStack: [...backStack, currentPath],
                          },
                        })}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 12, background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Link2 size={17} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[item.code, item.entityType, item.buildingId ? `Budova ${item.buildingId}` : '', item.areaName || item.location].filter(Boolean).join(' - ')}
                          </div>
                        </div>
                        <ChevronRight size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Najít kartu a přiřadit</span>
                    <input
                      value={relationSearch}
                      onChange={(e) => setRelationSearch(e.target.value)}
                      placeholder="např. extruder, kotelna, převodovka..."
                      style={{ width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </label>
                  {relationOptions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                      {relationOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setLinkedToForm((current) => Array.from(new Set([...current, item.id])));
                            setRelationSearch('');
                          }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <PlusCircle size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {[item.code, item.entityType, item.buildingId ? `Budova ${item.buildingId}` : '', item.areaName || item.location].filter(Boolean).join(' - ')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {linkedToForm.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6 }}>
                      {linkedToForm.map((linkedId) => {
                        const item = allAssetsV2.find((candidate) => candidate.id === linkedId);
                        return (
                          <div key={linkedId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <Link2 size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name || linkedId}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{item ? [item.code, item.entityType].filter(Boolean).join(' - ') : 'Uložená vazba'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setLinkedToForm((current) => current.filter((id) => id !== linkedId))}
                              style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isGearbox && assetV2 && (
              <div id="asset-section-gearbox" className={activeTab === 'relations' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #bae6fd', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {(() => {
                  const tempState = getGearboxTemperatureState(assetV2, assetV2.lastTemperatureC);
                  return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0369a1', margin: 0 }}>Převodovka</h3>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{getGearboxStatusLabel(assetV2)}</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                      {assetV2.currentExtruderName ? `Aktuálně v extruderu: ${assetV2.currentExtruderName}` : 'Aktuálně ve skladu ND'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                      Limity: varování od {assetV2.gearboxWarningTemperatureC ?? 70} °C, kritická od {assetV2.gearboxCriticalTemperatureC ?? 85} °C
                    </div>
                  </div>
                  {(assetV2.lastTemperatureC != null || canReportGearboxProblem) && (
                    <div style={{ textAlign: 'right', minWidth: 150 }}>
                      {assetV2.lastTemperatureC != null && (
                        <>
                      <div style={{ fontSize: 28, fontWeight: 800, color: tempState.color }}>{assetV2.lastTemperatureC} °C</div>
                      <div style={{ display: 'inline-flex', marginTop: 4, padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: tempState.color, background: tempState.background, border: `1px solid ${tempState.border}` }}>
                        {tempState.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{assetV2.lastTemperatureAt ? formatHistoryDate(assetV2.lastTemperatureAt) : 'poslední teplota'}</div>
                        </>
                      )}
                      {canReportGearboxProblem && (
                        <button
                          type="button"
                          onClick={() => setProblemOpen(true)}
                          style={{ marginTop: assetV2.lastTemperatureC != null ? 10 : 0, minHeight: 44, width: '100%', borderRadius: 14, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontWeight: 800 }}
                        >
                          Nahlásit problém
                        </button>
                      )}
                    </div>
                  )}
                </div>
                  );
                })()}
                <div style={{ display: 'grid', gridTemplateColumns: canAssignGearbox ? 'repeat(3, minmax(0, 1fr))' : '1fr', gap: 8 }}>
                  {canAssignGearbox && (
                  <button type="button" onClick={() => setShowGearboxAssign(true)} style={{ minHeight: 44, borderRadius: 14, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#6d28d9', fontWeight: 700 }}>
                    Přiřadit k extruderu
                  </button>
                  )}
                  <button type="button" onClick={() => setShowGearboxTemperature(true)} style={{ minHeight: 44, borderRadius: 14, border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0369a1', fontWeight: 700 }}>
                    Zapsat teplotu
                  </button>
                  {canAssignGearbox && (
                  <button type="button" onClick={handleReturnGearboxToStock} disabled={!assetV2.currentExtruderId || gearboxActionSaving} style={{ minHeight: 44, borderRadius: 14, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontWeight: 700, opacity: !assetV2.currentExtruderId ? 0.55 : 1 }}>
                    Vrátit do skladu
                  </button>
                  )}
                </div>
                {problemOpen && canReportGearboxProblem && (
                  <button
                    type="button"
                    onClick={() => setProblemOpen(true)}
                    style={{ marginTop: 8, minHeight: 44, width: '100%', borderRadius: 14, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontWeight: 700 }}
                  >
                    Nahlásit problém
                  </button>
                )}
                {canAssignGearbox && (
                  <button
                    type="button"
                    onClick={() => setRepairOpen(true)}
                    style={{ marginTop: 8, minHeight: 44, width: '100%', borderRadius: 14, border: '1px solid #fcd34d', background: '#fffbeb', color: '#b45309', fontWeight: 700 }}
                  >
                    Zapsat opravu
                  </button>
                )}
                {gearboxTemperatures.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gearboxTemperatures.slice(0, 3).map((log) => (
                      <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{log.temperatureC} °C</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{formatHistoryDate(log.measuredAt)} · {log.userName}</div>
                          {typeof log.motorLoadAmps === 'number' && <div style={{ fontSize: 12, color: '#0369a1', marginTop: 3 }}>Zátěž motoru: {log.motorLoadAmps} A</div>}
                          {typeof (log as unknown as { motorLoadPercent?: number }).motorLoadPercent === 'number' && typeof log.motorLoadAmps !== 'number' && <div style={{ fontSize: 12, color: '#0369a1', marginTop: 3 }}>Zátěž motoru: {(log as unknown as { motorLoadPercent: number }).motorLoadPercent} %</div>}
                          {log.rawMaterial && <div style={{ fontSize: 12, color: '#0f766e', marginTop: 3 }}>Surovina: {log.rawMaterial}</div>}
                          {log.note && <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>{log.note}</div>}
                        </div>
                        {log.photoUrl && <a href={log.photoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontWeight: 700, fontSize: 12 }}>Foto</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {repairOpen && assetV2 && (
              <GearboxRepairModal
                asset={assetV2}
                user={user}
                onClose={() => setRepairOpen(false)}
                onSaved={() => { setRepairOpen(false); setActiveTab('history'); }}
              />
            )}

            {problemOpen && assetV2 && (
              <GearboxProblemModal
                asset={assetV2}
                user={user}
                onClose={() => setProblemOpen(false)}
                onSaved={() => { setProblemOpen(false); setActiveTab('needs'); }}
              />
            )}

            {/* ═══ SEKCE 2: TECHNICAL SHEET (Apple-style) ═══ */}
            <div id="asset-section-technical" className={activeTab === 'passport' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: '0 0 16px 0' }}>Technický list</h3>
              {!isEditing ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <RLReadField label="Výrobce" value={assetV2?.manufacturer || asset.manufacturer} />
                  <RLReadField label="Model" value={assetV2?.model || asset.model} />
                  <RLReadField label="Sériové číslo" value={assetV2?.serialNumber || asset.serialNumber} />
                  <RLReadField label="Rok výroby" value={assetV2?.year ? String(assetV2.year) : asset.year ? String(asset.year) : undefined} />
                  <RLReadField label="Lokace" value={assetV2?.location} />
                  {(assetV2?.mthCounter != null || asset.mthCounter != null) && (
                    <RLReadField label="Motohodiny" value={`${(assetV2?.mthCounter ?? asset.mthCounter ?? 0).toLocaleString('cs-CZ')} Mth`} />
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <RLField label="Výrobce" value={editForm.manufacturer} onChange={(v) => setEditForm({ ...editForm, manufacturer: v })} />
                  <RLField label="Model" value={editForm.model} onChange={(v) => setEditForm({ ...editForm, model: v })} />
                  <RLField label="Sériové číslo" value={editForm.serialNumber} onChange={(v) => setEditForm({ ...editForm, serialNumber: v })} />
                  <RLField label="Rok výroby" value={editForm.year} onChange={(v) => setEditForm({ ...editForm, year: v })} type="number" placeholder="2024" />
                  <RLField label="Lokace" value={editForm.location} onChange={(v) => setEditForm({ ...editForm, location: v })} placeholder="Budova D / Hala 1" />
                </div>
              )}
            </div>

            {/* ═══ SEKCE 3: UDÁLOSTI (Apple-style) ═══ */}
            <div id="asset-section-events" className={activeTab === 'needs' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>
                  Události
                </h3>
                {isEditing && (
                  <button
                    onClick={() => {
                      const newEvt: AssetEvent = { id: crypto.randomUUID(), name: '', eventType: 'kontrola' };
                      setEventsForm([newEvt, ...eventsForm]);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                  >
                    <PlusCircle size={14} /> Přidat
                  </button>
                )}
              </div>

              {!isEditing ? (
                /* View mode */
                sortedEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                    <Calendar size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <div style={{ fontSize: 14 }}>Žádné události</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedEvents.map((evt) => {
                      const evtSt = getEventStatus(evt);
                      return (
                        <div key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: evtSt.dotColor, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{evt.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#e2e8f0', color: '#64748b' }}>{evt.eventType}</span>
                              {evt.nextDate && (
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                  Příští: {new Date(evt.nextDate).toLocaleDateString('cs-CZ')}
                                </span>
                              )}
                              {evt.lastDate && (
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                  Poslední: {new Date(evt.lastDate).toLocaleDateString('cs-CZ')}
                                </span>
                              )}
                            </div>
                            {evt.frequencyDays && (
                              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                Frekvence: každých {evt.frequencyDays} dní
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: evtSt.bg, color: evtSt.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {evtSt.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Edit mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {eventsForm.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                      Žádné události — klikněte „Přidat"
                    </div>
                  )}
                  {eventsForm.map((evt, idx) => (
                    <div key={evt.id} style={{ padding: 16, background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0', position: 'relative' }}>
                      <button
                        onClick={() => setEventsForm(eventsForm.filter((_, i) => i !== idx))}
                        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                      >
                        <Trash2 size={16} />
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 32 }}>
                        <RLField
                          label="Název události"
                          value={evt.name}
                          onChange={(v) => {
                            const updated = [...eventsForm];
                            updated[idx] = { ...updated[idx], name: v };
                            setEventsForm(updated);
                          }}
                          placeholder="např. Kontrola elektriky"
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <RLSelect
                            label="Typ"
                            value={evt.eventType}
                            options={[
                              { value: 'kontrola', label: 'Kontrola' },
                              { value: 'revize', label: 'Revize' },
                              { value: 'udrzba', label: 'Údržba' },
                              { value: 'kalibrace', label: 'Kalibrace' },
                              { value: 'jine', label: 'Jiné' },
                            ]}
                            onChange={(v) => {
                              const updated = [...eventsForm];
                              updated[idx] = { ...updated[idx], eventType: v };
                              setEventsForm(updated);
                            }}
                          />
                          <RLField
                            label="Frekvence (dny)"
                            value={evt.frequencyDays ? String(evt.frequencyDays) : ''}
                            onChange={(v) => {
                              const updated = [...eventsForm];
                              updated[idx] = { ...updated[idx], frequencyDays: v ? Number(v) : undefined };
                              setEventsForm(updated);
                            }}
                            type="number"
                            placeholder="365"
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <RLField
                            label="Poslední datum"
                            value={evt.lastDate || ''}
                            onChange={(v) => {
                              const updated = [...eventsForm];
                              updated[idx] = { ...updated[idx], lastDate: v || '' };
                              setEventsForm(updated);
                            }}
                            type="date"
                          />
                          <RLField
                            label="Příští datum"
                            value={evt.nextDate || ''}
                            onChange={(v) => {
                              const updated = [...eventsForm];
                              updated[idx] = { ...updated[idx], nextDate: v || '' };
                              setEventsForm(updated);
                            }}
                            type="date"
                          />
                        </div>
                        <RLField
                          label="Pokyny"
                          value={evt.instructions || ''}
                          onChange={(v) => {
                            const updated = [...eventsForm];
                            updated[idx] = { ...updated[idx], instructions: v || '' };
                            setEventsForm(updated);
                          }}
                          placeholder="Volitelné poznámky k události"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ═══ SEKCE 4: HISTORIE OPRAV (Apple-style) ═══ */}
            <div id="asset-section-service" className={activeTab === 'needs' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>
                  Historie oprav
                </h3>
                {isEditing && (
                  <button
                    onClick={() => {
                      const newEntry: RepairLogEntry = {
                        id: crypto.randomUUID(),
                        date: new Date().toISOString().split('T')[0],
                        description: '',
                      };
                      setRepairLogForm([newEntry, ...repairLogForm]);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                  >
                    <PlusCircle size={14} /> Přidat
                  </button>
                )}
              </div>

              {!isEditing ? (
                /* View mode */
                sortedRepairLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                    <Wrench size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <div style={{ fontSize: 14 }}>Žádné opravy</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedRepairLog.map((entry) => (
                      <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                        {/* Date column */}
                        <div style={{ flexShrink: 0, minWidth: 56, textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {new Date(entry.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {new Date(entry.date).getFullYear()}
                          </div>
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{entry.description}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {entry.technicianName && (
                              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                👤 {entry.technicianName}
                              </span>
                            )}
                            {entry.parts && entry.parts.length > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#e2e8f0', color: '#64748b' }}>
                                {entry.parts.length} {entry.parts.length === 1 ? 'díl' : entry.parts.length < 5 ? 'díly' : 'dílů'}
                              </span>
                            )}
                          </div>
                          {entry.parts && entry.parts.length > 0 && (
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                              Díly: {entry.parts.join(', ')}
                            </div>
                          )}
                        </div>
                        {/* Cost */}
                        {entry.cost != null && entry.cost > 0 && (
                          <div style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {entry.cost.toLocaleString('cs-CZ')} Kč
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Total cost summary */}
                    {sortedRepairLog.some(e => e.cost != null && e.cost > 0) && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                          Celkem: {sortedRepairLog.reduce((sum, e) => sum + (e.cost || 0), 0).toLocaleString('cs-CZ')} Kč
                        </span>
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Edit mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {repairLogForm.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                      Žádné opravy — klikněte „Přidat"
                    </div>
                  )}
                  {repairLogForm.map((entry, idx) => (
                    <div key={entry.id} style={{ padding: 16, background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0', position: 'relative' }}>
                      <button
                        onClick={() => setRepairLogForm(repairLogForm.filter((_, i) => i !== idx))}
                        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                      >
                        <Trash2 size={16} />
                      </button>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 32 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <RLField
                            label="Datum"
                            value={entry.date}
                            onChange={(v) => {
                              const updated = [...repairLogForm];
                              updated[idx] = { ...updated[idx], date: v };
                              setRepairLogForm(updated);
                            }}
                            type="date"
                          />
                          <RLField
                            label="Technik"
                            value={entry.technicianName || ''}
                            onChange={(v) => {
                              const updated = [...repairLogForm];
                              updated[idx] = { ...updated[idx], technicianName: v || '' };
                              setRepairLogForm(updated);
                            }}
                            placeholder="Jméno technika"
                          />
                        </div>
                        <RLField
                          label="Popis opravy"
                          value={entry.description}
                          onChange={(v) => {
                            const updated = [...repairLogForm];
                            updated[idx] = { ...updated[idx], description: v };
                            setRepairLogForm(updated);
                          }}
                          placeholder="Co bylo opraveno"
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <RLField
                            label="Náklady (Kč)"
                            value={entry.cost != null ? String(entry.cost) : ''}
                            onChange={(v) => {
                              const updated = [...repairLogForm];
                              updated[idx] = { ...updated[idx], cost: v ? Number(v) : undefined };
                              setRepairLogForm(updated);
                            }}
                            type="number"
                            placeholder="0"
                          />
                          <RLField
                            label="Použité díly"
                            value={entry.parts ? entry.parts.join(', ') : ''}
                            onChange={(v) => {
                              const updated = [...repairLogForm];
                              updated[idx] = { ...updated[idx], parts: v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined };
                              setRepairLogForm(updated);
                            }}
                            placeholder="díl1, díl2, ..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ═══ SEKCE 5: DOKUMENTY (Apple-style) ═══ */}
            <div id="asset-section-documents" className={activeTab === 'passport' ? undefined : 'hidden'} style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>
                  Dokumenty
                </h3>
                {isEditing && (
                  <button
                    onClick={() => setDocumentsForm(['', ...documentsForm])}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
                  >
                    <PlusCircle size={14} /> Přidat
                  </button>
                )}
              </div>

              {!isEditing ? (
                /* View mode */
                (assetV2?.documents || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                    <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <div style={{ fontSize: 14 }}>Žádné dokumenty</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(assetV2?.documents || []).map((docUrl, idx) => {
                      const info = getDocumentInfo(docUrl);
                      return (
                        <a
                          key={idx}
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9', textDecoration: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                        >
                          {/* File type icon */}
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: info.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FileText size={20} style={{ color: info.color }} />
                          </div>
                          {/* Filename + type badge */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {info.name}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 6, background: info.color + '15', color: info.color }}>
                              {info.ext.toUpperCase() || 'ODKAZ'}
                            </span>
                          </div>
                          {/* Open icon */}
                          <ExternalLink size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                        </a>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Edit mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {documentsForm.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>
                      Žádné dokumenty — klikněte „Přidat"
                    </div>
                  )}
                  {documentsForm.map((docUrl, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="url"
                          value={docUrl}
                          onChange={(e) => {
                            const updated = [...documentsForm];
                            updated[idx] = e.target.value;
                            setDocumentsForm(updated);
                          }}
                          placeholder="https://... nebo cesta k souboru"
                          style={{ width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <button
                        onClick={() => setDocumentsForm(documentsForm.filter((_, i) => i !== idx))}
                        style={{ width: 44, height: 44, borderRadius: 12, background: 'none', border: '1px solid #fee2e2', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ═══ EDIT FOOTER ═══ */}
            {isEditing && (
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleCancelEdit}
                  style={{ flex: 1, minHeight: 48, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <XCircle size={18} /> Zrušit
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || !editForm.name.trim()}
                  style={{ flex: 1, minHeight: 48, borderRadius: 16, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: editSaving || !editForm.name.trim() ? 0.5 : 1 }}
                >
                  {editSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Uložit
                </button>
              </div>
            )}

            {activeTab === 'passport' && (<>
            {/* Legacy info (Budova, Místnost — from old model) */}
            <div className="card-b p-4">
              <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Umístění (legacy)</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Budova" value={buildingName} icon={<Building2 className="w-3.5 h-3.5 text-slate-500" />} />
                <InfoBox label="Místnost" value={asset.areaName || '—'} icon={<MapPin className="w-3.5 h-3.5 text-slate-500" />} />
                {asset.mthCounter != null && (
                  <InfoBox
                    label="Motohodiny"
                    value={`${asset.mthCounter.toLocaleString('cs-CZ')} Mth`}
                    highlight={asset.mthCounter > 3000 ? 'amber' : undefined}
                  />
                )}
              </div>
            </div>

            {/* VZV Stanoviště */}
            {asset.category === 'forklift' && (
              <div className="card-b p-4">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Stanoviště VZV</h3>
                <div className="flex gap-2">
                  {['Expedice', 'Sklad A', 'Sklad B'].map((loc) => (
                    <button
                      key={loc}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition border min-h-[44px] ${
                        stanoviste === loc
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-600'
                      }`}
                      onClick={() => setStanoviste(loc)}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Aktuální poloha: <span className="text-yellow-400 font-medium">{stanoviste}</span>
                </div>
              </div>
            )}

            {/* Dokumentace VZV */}
            {asset.category === 'forklift' && (
              <div className="card-b p-4">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Dokumentace
                </h3>
                <div className="space-y-2">
                  {[
                    { name: 'Revizní zpráva VZV 2025', date: '12.08.2025' },
                    { name: 'Školení operátora VZV', date: '05.01.2026' },
                    { name: 'Technický list', date: '01.03.2024' },
                  ].map((d, i) => (
                    <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 hover:bg-slate-100/40 transition cursor-pointer">
                      <FileText className="w-5 h-5 text-blue-700 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{d.name}</div>
                        <div className="text-xs text-slate-500">{d.date}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Control Points */}
            {asset.controlPoints && asset.controlPoints.length > 0 && (
              <div className="card-b p-4">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Kontrolní body</h3>
                <div className="space-y-2">
                  {asset.controlPoints.map((cp, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <span className="text-slate-600">{cp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {asset.notes && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                <div className="text-xs text-amber-700 font-bold mb-1">Poznámky</div>
                <div className="text-sm text-amber-700/80">{asset.notes}</div>
              </div>
            )}

            {/* Revision Status */}
            {revisions.length > 0 && (
              <div className="card-b p-4">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Stav revizí
                </h3>
                <div className="space-y-2">
                  {revisions.map((rev) => {
                    const days = daysUntilRevision(rev.nextRevisionDate);
                    const isExpired = rev.status === 'expired';
                    const isExpiring = rev.status === 'expiring';
                    const dotColor = isExpired ? 'bg-red-400' : isExpiring ? 'bg-amber-400' : 'bg-emerald-400';
                    const textColor = isExpired ? 'text-red-700' : isExpiring ? 'text-amber-700' : 'text-emerald-700';

                    return (
                      <div
                        key={rev.id}
                        className="bg-slate-50 rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{rev.title}</div>
                          <div className="text-xs text-slate-500">
                            {formatRevisionDate(rev.nextRevisionDate)}
                          </div>
                        </div>
                        <span className={`text-xs font-bold ${textColor}`}>
                          {days < 0 ? `${Math.abs(days)}d po!` : `za ${days}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </>)}
          </div>
        )}

        {/* ═══ TAB: Historie ═══ */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="card-b p-4">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 mb-3">
                <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Hledat v historii: filtr, lozisko, jmeno technika..."
                  className="w-full bg-transparent py-3 text-sm text-slate-900 placeholder-slate-400 outline-none"
                />
                {historySearch && (
                  <button onClick={() => setHistorySearch('')} className="text-slate-500 hover:text-slate-900">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {([
                  { key: 'all', label: 'Vse' },
                  { key: 'work', label: 'Denik' },
                  { key: 'repair', label: 'Opravy' },
                  { key: 'event', label: 'Udalosti' },
                  { key: 'task', label: 'Ukoly' },
                  { key: 'revision', label: 'Revize' },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setHistoryType(item.key)}
                    className={`min-h-[40px] rounded-lg text-[11px] font-bold border transition ${
                      historyType === item.key
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {historyItems.length === 0 ? (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
                <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">Nic jsem v historii nenasel</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: item.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${item.color}22`, color: item.color }}>
                            {item.typeLabel}
                          </span>
                          <span className="text-[11px] text-slate-500">{formatHistoryDate(item.dateValue)}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-950 leading-snug">{item.title}</div>
                        {item.detail && (
                          <div className="text-xs text-slate-600 mt-1 leading-relaxed">{item.detail}</div>
                        )}
                        {'linkWarning' in item && item.linkWarning && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                            {item.linkWarning}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'needs' && (
          <>
            {loadingTasks ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-16">
                <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">Žádné úkoly pro toto zařízení</p>
                {canCreateTask && (
                  <button
                    onClick={() => setShowTaskModal(true)}
                    className="mt-4 px-4 py-2 bg-blue-500/15 border border-blue-500/30 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-500/25 transition"
                  >
                    + Vytvořit úkol
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => {
                  const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
                  const isDone = task.status === 'completed' || task.status === 'done';
                  return (
                    <div
                      key={task.id}
                      className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm ${isDone ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pCfg.bg} ${pCfg.text}`}>
                          {pCfg.label}
                        </span>
                        {isDone && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        )}
                        <span className="text-[10px] text-slate-600 ml-auto flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.createdAt && typeof task.createdAt.toDate === 'function'
                            ? task.createdAt.toDate().toLocaleDateString('cs-CZ')
                            : '—'
                          }
                        </span>
                      </div>
                      <h4 className="font-medium text-sm text-slate-950">{task.title}</h4>
                      {task.assignedToName && (
                        <div className="text-xs text-blue-700 mt-1">→ {task.assignedToName}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══ TAB: REVISIONS ═══ */}
        {activeTab === 'needs' && (
          <>
            {loadingRevisions ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : revisions.length === 0 ? (
              <div className="text-center py-16">
                <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500">Žádné revize pro toto zařízení</p>
              </div>
            ) : (
              <div className="space-y-3">
                {revisions.map((rev) => {
                  const typeCfg = REV_TYPE[rev.type] || REV_TYPE.other;
                  const days = daysUntilRevision(rev.nextRevisionDate);
                  const isExpired = rev.status === 'expired';
                  const isExpiring = rev.status === 'expiring';
                  const borderColor = isExpired ? 'border-red-500/40' : isExpiring ? 'border-amber-500/30' : 'border-slate-700/30';
                  const dotColor = isExpired ? 'bg-red-400' : isExpiring ? 'bg-amber-400' : 'bg-emerald-400';
                  const textColor = isExpired ? 'text-red-700' : isExpiring ? 'text-amber-700' : 'text-emerald-700';
                  const statusLabel = isExpired ? 'Prošlá' : isExpiring ? 'Končí brzy' : 'Platná';

                  return (
                    <div key={rev.id} className={`bg-white rounded-2xl border ${borderColor} p-4 shadow-sm`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{typeCfg.icon}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isExpired ? 'bg-red-500/20 text-red-700' :
                          isExpiring ? 'bg-amber-500/20 text-amber-700' :
                          'bg-emerald-500/20 text-emerald-700'
                        }`}>
                          {statusLabel}
                        </span>
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ml-auto ${dotColor}`} />
                      </div>
                      <h4 className="font-medium text-slate-950 mb-3">{rev.title}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Poslední</div>
                          <div className="text-xs font-medium text-slate-900">{formatRevisionDate(rev.lastRevisionDate)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Příští</div>
                          <div className={`text-xs font-bold ${textColor}`}>
                            {formatRevisionDate(rev.nextRevisionDate)}
                            <span className="ml-1 opacity-75">
                              ({days < 0 ? `${Math.abs(days)}d po!` : `za ${days}d`})
                            </span>
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Firma</div>
                          <div className="text-xs font-medium text-slate-900">{rev.revisionCompany}</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Č. zprávy</div>
                          <div className="text-xs font-mono text-slate-900">{rev.certificateNumber}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {showFaultModal && (
        <FaultModal
          asset={asset}
          user={user}
          onClose={() => setShowFaultModal(false)}
          onCreated={() => { setShowFaultModal(false); setActiveTab('needs'); }}
        />
      )}

      {showTaskModal && (
        <TaskModal
          asset={asset}
          user={user}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => { setShowTaskModal(false); setActiveTab('needs'); }}
        />
      )}

      {showRevisionModal && revisions.length > 0 && (
        <RevisionLogModal
          revisions={revisions}
          onClose={() => setShowRevisionModal(false)}
          onLog={logRevision}
        />
      )}

      {showGearboxAssign && assetV2 && (
        <GearboxAssignModal
          gearbox={assetV2}
          extruders={extruderOptions}
          saving={gearboxActionSaving}
          onClose={() => setShowGearboxAssign(false)}
          onAssign={async (extruder, note) => {
            setGearboxActionSaving(true);
            try {
              await assignGearboxToExtruder({ tenantId, gearbox: assetV2, extruder, user, note });
              await refreshAssetV2();
              setShowGearboxAssign(false);
              showToast('Převodovka přiřazena k extruderu', 'success');
            } catch (err) {
              console.error('[Gearbox] assign:', err);
              showToast('Nepodařilo se přiřadit převodovku', 'error');
            }
            setGearboxActionSaving(false);
          }}
        />
      )}

      {showGearboxTemperature && assetV2 && (
        <GearboxTemperatureModal
          gearbox={assetV2}
          user={user}
          saving={gearboxActionSaving}
          onClose={() => setShowGearboxTemperature(false)}
          onSave={async ({ temperatureC, motorLoadAmps, measuredAt, rawMaterial, materialId, materialName, materialBatch, productId, productName, productBatch, note, photoFile }) => {
            setGearboxActionSaving(true);
            try {
              await addGearboxTemperatureLog({ tenantId, gearbox: assetV2, user, temperatureC, motorLoadAmps, measuredAt, rawMaterial, materialId, materialName, materialBatch, productId, productName, productBatch, note, photoFile });
              await refreshAssetV2();
              setShowGearboxTemperature(false);
              setActiveTab('history');
              showToast('Teplota převodovky zapsána', 'success');
            } catch (err) {
              console.error('[Gearbox] temperature:', err);
              showToast('Nepodařilo se zapsat teplotu', 'error');
            }
            setGearboxActionSaving(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function InfoBox({ label, value, icon, highlight }: {
  label: string; value: string; icon?: React.ReactNode; highlight?: 'amber' | 'red';
}) {
  const textClass = highlight === 'red' ? 'text-red-700' : highlight === 'amber' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={`text-sm font-medium ${textClass}`}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════
// FAULT MODAL (Nahlásit poruchu — dark theme)
// ═══════════════════════════════════════════

function FaultModal({ asset, user, onClose, onCreated }: {
  asset: Asset; user: any; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const assignees = useEmployeeDirectory({
    tenantId: user?.tenantId || 'main_firm',
    roles: MAINTENANCE_EMPLOYEE_ROLES,
  });
  const selectedAssignee = assignees.find((item) => item.id === assignee);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || '',
        priority: priority as 'P1' | 'P2' | 'P3' | 'P4',
        type: 'corrective',
        source: 'web',
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        assigneeId: assignee || '',
        assigneeName: selectedAssignee?.displayName || '',
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      onCreated();
    } catch (err: any) {
      console.error('[FaultModal]', err);
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Nahlásit poruchu" icon={<AlertTriangle className="w-5 h-5 text-red-700" />} onClose={onClose}>
      <div className="bg-slate-50 p-3 rounded-xl text-sm mb-4">
        <span className="text-slate-500">Zařízení:</span>{' '}
        <span className="font-medium text-slate-900">{asset.name}</span>
        {asset.code && <span className="text-slate-500 ml-2 font-mono text-xs">{asset.code}</span>}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Popis poruchy..."
        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500/50 transition mb-3"
        autoFocus
      />

      <div className="flex gap-2 items-start mb-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailní popis závady — co se stalo, kde přesně, okolnosti..."
          rows={4}
          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-500/50 transition resize-none"
        />
        <div className="pt-2">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Priorita</div>
        <div className="flex gap-2">
          {([
            { key: 'P3', label: 'Nízká', bg: 'bg-blue-500/20', text: 'text-blue-700' },
            { key: 'P2', label: 'Střední', bg: 'bg-orange-500/20', text: 'text-orange-700' },
            { key: 'P1', label: 'Havárie', bg: 'bg-red-500/20', text: 'text-red-700' },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPriority(opt.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                priority === opt.key
                  ? `${opt.bg} ${opt.text} border border-current`
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-400 mb-2">Přiřadit řešitele</div>
        {assignees.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
            V administraci zatím není aktivní pracovník údržby.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assignees.map((a) => (
            <button
              key={a.id}
              onClick={() => setAssignee(assignee === a.id ? '' : a.id)}
              className={`py-2 px-3 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                assignee === a.id
                  ? 'bg-blue-500/20 text-blue-700 border border-blue-500/30'
                  : 'bg-slate-50 text-slate-500 border border-slate-200 hover:text-slate-600'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                assignee === a.id ? 'bg-blue-500/30 text-blue-700' : 'bg-slate-600 text-slate-400'
              }`}>
                {a.displayName.split(' ').map(w => w[0]).join('')}
              </div>
              {a.displayName}
            </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!title.trim() || saving}
        className="w-full py-3.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:from-red-400 hover:to-red-500 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
        Odeslat poruchu
      </button>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════
// TASK MODAL (Nový úkol — dark theme)
// ═══════════════════════════════════════════

function TaskModal({ asset, user, onClose, onCreated }: {
  asset: Asset; user: any; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [taskType, setTaskType] = useState<'preventive' | 'corrective' | 'improvement'>('preventive');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || '',
        priority: priority as 'P1' | 'P2' | 'P3' | 'P4',
        type: taskType,
        source: 'web',
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      onCreated();
    } catch (err: any) {
      console.error('[TaskModal]', err);
      setSaving(false);
    }
  };

  const typeOptions = [
    { key: 'preventive' as const, label: 'Preventivní', color: 'text-emerald-700', bg: 'bg-emerald-500/20' },
    { key: 'corrective' as const, label: 'Nápravný', color: 'text-red-700', bg: 'bg-red-500/20' },
    { key: 'improvement' as const, label: 'Zlepšení', color: 'text-blue-700', bg: 'bg-blue-500/20' },
  ];

  return (
    <ModalShell title="Nový úkol" icon={<PlusCircle className="w-5 h-5 text-blue-700" />} onClose={onClose}>
      <div className="bg-slate-50 p-3 rounded-xl text-sm mb-4">
        <span className="text-slate-500">Zařízení:</span>{' '}
        <span className="font-medium text-slate-900">{asset.name}</span>
        {asset.code && <span className="text-slate-500 ml-2 font-mono text-xs">{asset.code}</span>}
      </div>

      {/* Task type */}
      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Typ úkolu</div>
        <div className="flex gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTaskType(opt.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                taskType === opt.key
                  ? `${opt.bg} ${opt.color} border border-current`
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Název úkolu..."
        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500/50 transition mb-3"
        autoFocus
      />

      <div className="flex gap-2 items-start mb-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Podrobnosti (volitelné)..."
          rows={3}
          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500/50 transition resize-none"
        />
        <div className="pt-2">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-400 mb-2">Priorita</div>
        <div className="flex gap-2">
          {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setPriority(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                priority === key
                  ? `${cfg.bg} ${cfg.text} border border-current`
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!title.trim() || saving}
        className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold hover:from-blue-400 hover:to-blue-500 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
        Vytvořit úkol
      </button>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════
// REVISION LOG MODAL (dark theme)
// ═══════════════════════════════════════════

function RevisionLogModal({ revisions, onClose, onLog }: {
  revisions: any[];
  onClose: () => void;
  onLog: (id: string, data: any) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(revisions[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [certNumber, setCertNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!certNumber.trim()) return;
    setSaving(true);
    try {
      await onLog(selectedId, {
        date: new Date(date),
        certificateNumber: certNumber.trim(),
      });
      onClose();
    } catch (err: any) {
      console.error('[RevisionModal]', err);
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Zapsat revizi" icon={<Shield className="w-5 h-5 text-emerald-700" />} onClose={onClose}>
      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Revize</div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500/50 transition"
          style={{ appearance: 'auto' }}
        >
          {revisions.map((r: any) => (
            <option key={r.id} value={r.id} className="bg-white">{r.title}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Datum revize</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-500/50 transition"
        />
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-400 mb-2">Číslo revizní zprávy</div>
        <input
          type="text"
          value={certNumber}
          onChange={(e) => setCertNumber(e.target.value)}
          placeholder="EL-2026-XXXX"
          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500/50 transition"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!certNumber.trim() || saving}
        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
        Zapsat revizi
      </button>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════
// MODAL SHELL (sdílený wrapper — dark glassmorphism)
// ═══════════════════════════════════════════

function GearboxAssignModal({ gearbox, extruders, saving, onClose, onAssign }: {
  gearbox: AssetV2;
  extruders: AssetV2[];
  saving: boolean;
  onClose: () => void;
  onAssign: (extruder: AssetV2, note: string) => Promise<void>;
}) {
  const [extruderId, setExtruderId] = useState(gearbox.currentExtruderId || extruders[0]?.id || '');
  const [note, setNote] = useState('');
  const selected = extruders.find((item) => item.id === extruderId);

  return (
    <ModalShell title="Přiřadit převodovku" icon={<Cog className="w-5 h-5 text-violet-700" />} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Převodovka</div>
          <div className="font-bold text-slate-900">{gearbox.name}</div>
          <div className="text-xs text-slate-400 mt-1">Nyní: {gearbox.currentExtruderName || 'Sklad ND'}</div>
        </div>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Extruder</div>
          <select
            value={extruderId}
            onChange={(e) => setExtruderId(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-400"
            style={{ appearance: 'auto' }}
          >
            {extruders.length === 0 && <option value="" className="bg-white">Žádný extruder v kartotéce</option>}
            {extruders.map((item) => (
              <option key={item.id} value={item.id} className="bg-white">
                {item.name}{item.code ? ` (${item.code})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Poznámka</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="např. výměna po servisu, preventivní přesun..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400"
          />
        </label>
        <button
          onClick={() => selected && onAssign(selected, note.trim())}
          disabled={!selected || saving}
          className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cog className="w-5 h-5" />}
          Přiřadit k extruderu
        </button>
      </div>
    </ModalShell>
  );
}

interface GearboxMasterItem {
  id: string;
  number: string;
  nkCode: string;
  name: string;
  usageCount?: number;
  active?: boolean;
  recipe?: Array<{ materialId?: string; materialName?: string; ratio?: number }>;
}

function matchesGearboxMasterItem(item: GearboxMasterItem, query: string) {
  const needle = normalizeLookup(query);
  if (!needle) return true;
  return normalizeLookup(`${item.name} ${item.number} ${item.nkCode}`).includes(needle);
}

function sortGearboxMasterItems(items: GearboxMasterItem[], usage: Map<string, number>) {
  return [...items]
    .filter((item) => item.active !== false)
    .sort((a, b) => {
      const recent = (usage.get(b.id) || 0) - (usage.get(a.id) || 0);
      if (recent !== 0) return recent;
      return (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'cs');
    });
}

function GearboxTemperatureModal({ gearbox, user, saving, onClose, onSave }: {
  gearbox: AssetV2;
  user: { displayName?: string } | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    temperatureC: number;
    motorLoadAmps: number | null;
    measuredAt: Date;
    rawMaterial: string;
    materialId?: string;
    materialName?: string;
    materialBatch?: string;
    productId?: string;
    productName?: string;
    productBatch?: string;
    note: string;
    photoFile?: File | null;
  }) => Promise<void>;
}) {
  const [temperature, setTemperature] = useState(String(clampTemperature(gearbox.lastTemperatureC ?? 60)));
  const [motorLoad, setMotorLoad] = useState('');
  const [measuredAt, setMeasuredAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [rawMaterial, setRawMaterial] = useState('');
  const [materials, setMaterials] = useState<GearboxMasterItem[]>([]);
  const [products, setProducts] = useState<GearboxMasterItem[]>([]);
  const [temperatureLogs, setTemperatureLogs] = useState<GearboxTemperatureLog[]>([]);
  const [materialId, setMaterialId] = useState('');
  const [materialBatchValue, setMaterialBatchValue] = useState('');
  const [materialBatchDate, setMaterialBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [materialBatchSuffix, setMaterialBatchSuffix] = useState('A');
  const [productId, setProductId] = useState('');
  const [productBatchValue, setProductBatchValue] = useState('');
  const [productBatchDate, setProductBatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [materialSearch, setMaterialSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  useEffect(() => {
    const unsubMaterials = onSnapshot(
      collection(db, 'materials'),
      (snap) => setMaterials(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxMasterItem))),
      () => setMaterials([]),
    );
    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snap) => setProducts(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxMasterItem))),
      () => setProducts([]),
    );
    const unsubLogs = onSnapshot(
      query(collection(db, 'gearbox_temperature_logs'), orderBy('measuredAt', 'desc'), limit(500)),
      (snap) => setTemperatureLogs(snap.docs.map((item) => ({ id: item.id, ...item.data() } as GearboxTemperatureLog))),
      () => setTemperatureLogs([]),
    );
    return () => {
      unsubMaterials();
      unsubProducts();
      unsubLogs();
    };
  }, []);
  const materialUsage = useMemo(() => {
    const map = new Map<string, number>();
    temperatureLogs.forEach((log) => {
      if (!log.materialId) return;
      map.set(log.materialId, (map.get(log.materialId) || 0) + 1);
    });
    return map;
  }, [temperatureLogs]);
  const productUsage = useMemo(() => {
    const map = new Map<string, number>();
    temperatureLogs.forEach((log) => {
      if (!log.productId) return;
      map.set(log.productId, (map.get(log.productId) || 0) + 1);
    });
    return map;
  }, [temperatureLogs]);
  const sortedMaterials = useMemo(() => sortGearboxMasterItems(materials, materialUsage), [materials, materialUsage]);
  const sortedProducts = useMemo(() => sortGearboxMasterItems(products, productUsage), [products, productUsage]);
  const selectedMaterial = useMemo(() => sortedMaterials.find((item) => item.id === materialId), [materialId, sortedMaterials]);
  const relatedProducts = useMemo(
    () => selectedMaterial
      ? sortedProducts.filter((product) => (product.recipe || []).some((row) => row.materialId === selectedMaterial.id))
      : sortedProducts,
    [selectedMaterial, sortedProducts],
  );
  const productRelationActive = Boolean(selectedMaterial && !showAllProducts);
  const productSource = productRelationActive ? relatedProducts : sortedProducts;
  const filteredMaterials = useMemo(
    () => sortedMaterials.filter((item) => matchesGearboxMasterItem(item, materialSearch)),
    [materialSearch, sortedMaterials],
  );
  const filteredProducts = useMemo(
    () => productSource.filter((item) => matchesGearboxMasterItem(item, productSearch)),
    [productSearch, productSource],
  );
  const selectedProduct = useMemo(() => sortedProducts.find((item) => item.id === productId), [productId, sortedProducts]);

  useEffect(() => {
    setShowAllProducts(false);
  }, [materialId]);

  useEffect(() => {
    if (!productId) return;
    if (productSource.some((product) => product.id === productId)) return;
    setProductId('');
  }, [productId, productSource]);
  useEffect(() => {
    if (!selectedProduct || !productBatchDate) {
      setProductBatchValue('');
      return;
    }
    setProductBatchValue(productBatch(selectedProduct.number, new Date(`${productBatchDate}T00:00:00`)));
  }, [productBatchDate, selectedProduct]);
  useEffect(() => {
    if (!selectedMaterial || !materialBatchDate) {
      setMaterialBatchValue('');
      return;
    }
    setMaterialBatchValue(materialBatch(selectedMaterial.number, new Date(`${materialBatchDate}T00:00:00`), materialBatchSuffix));
  }, [materialBatchDate, materialBatchSuffix, selectedMaterial]);
  const rawTemperatureNumber = Number(String(temperature).replace(',', '.'));
  const temperatureNumber = clampTemperature(Number.isFinite(rawTemperatureNumber) ? rawTemperatureNumber : 60);
  const tempState = getGearboxTemperatureState(gearbox, temperatureNumber);
  const setTemperatureValue = (value: number) => setTemperature(String(clampTemperature(value)));
  const motorLoadNumber = (() => {
    const parsed = Number(String(motorLoad).replace(',', '.'));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 10) / 10) : 0;
  })();
  const motorLoadSliderMax = Math.max(80, Math.ceil(motorLoadNumber + 10));
  const setMotorLoadValue = (value: number) => setMotorLoad(String(Math.max(0, Math.round(value * 10) / 10)));

  return (
    <ModalShell title="Záznam teploty" icon={<Thermometer className="w-5 h-5 text-cyan-700" />} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Převodovka</div>
          <div className="font-bold text-slate-900">{gearbox.name}</div>
          <div className="text-xs text-slate-400 mt-1">{gearbox.currentExtruderName || 'Sklad ND'} · {user?.displayName || 'Neznámý'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-400">Teplota převodovky</div>
              <div className="mt-1 text-4xl font-black text-slate-900">{temperatureNumber} °C</div>
              <div className="mt-1 text-xs text-slate-400">
                Limity: varování {gearbox.gearboxWarningTemperatureC ?? 70} °C, kritická {gearbox.gearboxCriticalTemperatureC ?? 85} °C
              </div>
            </div>
            <span
              className="rounded-full border px-3 py-1 text-xs font-black"
              style={{ color: tempState.color, background: tempState.background, borderColor: tempState.border }}
            >
              {tempState.label}
            </span>
          </div>
          <input
            type="range"
            min="20"
            max="120"
            step="1"
            value={temperatureNumber}
            onChange={(e) => setTemperatureValue(Number(e.target.value))}
            className="mt-4 w-full accent-cyan-400"
          />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[-5, -1, 1, 5].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => setTemperatureValue(temperatureNumber + delta)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-900"
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[50, 60, 70, 80].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTemperatureValue(value)}
                className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-sm font-black text-cyan-700"
              >
                {value} °C
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-400">Zátěž motoru</div>
              <div className="mt-1 text-3xl font-black text-slate-900">{motorLoad.trim() ? motorLoadNumber : '—'} A</div>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={motorLoad}
              onChange={(e) => setMotorLoad(e.target.value)}
              placeholder="např. 12,5"
              className="w-28 rounded-xl border border-slate-200 bg-white p-3 text-right font-black text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <input
            type="range"
            min="0"
            max={motorLoadSliderMax}
            step="0.1"
            value={motorLoadNumber}
            onChange={(e) => setMotorLoadValue(Number(e.target.value))}
            className="mt-4 w-full accent-cyan-400"
          />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[-5, -0.1, 0.1, 5].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => setMotorLoadValue(motorLoadNumber + delta)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-900"
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Datum a čas měření</div>
          <input
            type="datetime-local"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-cyan-400"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-slate-400 mb-2">Surovina z číselníku</div>
            <input
              type="search"
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              placeholder="hledat název, č.sur nebo NK kód"
              className="mb-2 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
            />
            <select
              value={materialId}
              onChange={(e) => {
                setMaterialId(e.target.value);
                setRawMaterial('');
              }}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-cyan-400"
            >
              <option value="">Nezadáno</option>
              {filteredMaterials.map((material) => (
                <option key={material.id} value={material.id}>{material.nkCode} - {material.number} - {material.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-400 mb-2">Výrobek</div>
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="hledat název, č.výr nebo NK kód"
              className="mb-2 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
            />
            {selectedMaterial && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-700">
                <span>{showAllProducts ? 'Zobrazeny všechny výrobky' : `Dle receptury: ${relatedProducts.length} výrobků`}</span>
                <button type="button" onClick={() => setShowAllProducts((current) => !current)} className="rounded-lg bg-slate-100 px-2 py-1 font-black text-slate-900">
                  {showAllProducts ? 'Dle receptury' : 'Zobrazit vše'}
                </button>
              </div>
            )}
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-cyan-400"
            >
              <option value="">Nezadáno</option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.nkCode} - {product.number} - {product.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-400 mb-2">Šarže suroviny</div>
            <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2">
              <input
                type="date"
                value={materialBatchDate}
                onChange={(e) => setMaterialBatchDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-cyan-400"
              />
              <input
                value={materialBatchSuffix}
                onChange={(e) => setMaterialBatchSuffix(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="A"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-black text-slate-900 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <input
              type="text"
              value={materialBatchValue}
              onChange={(e) => setMaterialBatchValue(e.target.value)}
              placeholder="sarze se predvyplni po vyberu suroviny"
              className="mt-2 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-400 mb-2">Datum zahajeni vyroby</div>
            <input
              type="date"
              value={productBatchDate}
              onChange={(e) => setProductBatchDate(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-cyan-400"
            />
            <div className="mt-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm font-black text-cyan-700">
              Šarže výrobku: {productBatchValue || 'vyber výrobek'}
            </div>
          </label>
        </div>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Surovina mimo seznam</div>
          <input
            type="text"
            value={rawMaterial}
            onChange={(e) => setRawMaterial(e.target.value)}
            placeholder="napr. kukurice, ryze, smes..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
          />
        </label>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Poznámka</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="např. opsáno z papíru u extruderu, kontrola bez závad..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-400"
          />
        </label>
        <label className="block">
          <div className="text-sm font-medium text-slate-400 mb-2">Fotka kontroly</div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setPhotoFile(file);
              setPhotoPreview(file ? URL.createObjectURL(file) : '');
            }}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-3 file:py-2 file:text-white"
          />
          {photoPreview && <img src={photoPreview} alt="Náhled" className="mt-3 h-28 rounded-xl object-cover border border-slate-200" />}
        </label>
        <button
          onClick={() => onSave({
            temperatureC: temperatureNumber,
            motorLoadAmps: motorLoad.trim() ? motorLoadNumber : null,
            measuredAt: new Date(measuredAt),
            rawMaterial: selectedMaterial?.name || rawMaterial.trim(),
            materialId: selectedMaterial?.id,
            materialName: selectedMaterial?.name,
            materialBatch: materialBatchValue.trim(),
            productId: selectedProduct?.id,
            productName: selectedProduct?.name,
            productBatch: productBatchValue.trim(),
            note: note.trim(),
            photoFile,
          })}
          disabled={!measuredAt || saving}
          className="w-full py-3.5 bg-cyan-600 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : photoFile ? <Camera className="w-5 h-5" /> : <Thermometer className="w-5 h-5" />}
          Uložit záznam
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'nominalSlideUp 0.25s ease-out' }}
      >
        <style>{`
          @keyframes nominalSlideUp {
            from { transform: translateY(100%); opacity: 0.5; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-2">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// RODNÝ LIST — Apple-style field helpers
// ═══════════════════════════════════════════

function RLReadField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: value ? '#0f172a' : '#cbd5e1' }}>{value || '—'}</div>
    </div>
  );
}

function RLField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );
}

function RLSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: 15, outline: 'none', appearance: 'auto' as any, boxSizing: 'border-box' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════
// EVENT STATUS HELPER
// ═══════════════════════════════════════════

function getEventStatus(evt: { nextDate?: string; lastDate?: string }): {
  label: string; color: string; dotColor: string; bg: string;
} {
  const today = new Date().toISOString().split('T')[0];
  if (evt.nextDate) {
    if (evt.nextDate <= today) {
      return { label: 'Nesplněno', color: '#dc2626', dotColor: '#ef4444', bg: '#fee2e2' };
    }
    return { label: 'Naplánováno', color: '#2563eb', dotColor: '#3b82f6', bg: '#dbeafe' };
  }
  if (evt.lastDate) {
    return { label: 'Splněno', color: '#16a34a', dotColor: '#22c55e', bg: '#dcfce7' };
  }
  return { label: '—', color: '#94a3b8', dotColor: '#cbd5e1', bg: '#f1f5f9' };
}

// ═══════════════════════════════════════════
// DOCUMENT INFO HELPER
// ═══════════════════════════════════════════

function getDocumentInfo(url: string): { name: string; ext: string; color: string } {
  // Extract filename from URL or path
  const segments = url.split(/[/\\]/).pop()?.split('?')[0] || url;
  const name = decodeURIComponent(segments);
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() || '') : '';

  // Color by file type
  if (ext === 'pdf') return { name, ext, color: '#ef4444' };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return { name, ext, color: '#8b5cf6' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return { name, ext, color: '#2563eb' };
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { name, ext, color: '#16a34a' };
  return { name, ext, color: '#64748b' };
}
