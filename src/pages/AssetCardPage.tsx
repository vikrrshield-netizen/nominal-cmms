// src/pages/AssetCardPage.tsx
// VIKRR — Asset Shield — Karta stroje / zařízení

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import {
  useRevisions,
  TYPE_CONFIG as REV_TYPE,
  formatRevisionDate,
  daysUntilRevision,
} from '../hooks/useRevisions';
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
  Calendar, Trash2, ExternalLink, Download, Table,
} from 'lucide-react';
import MicButton from '../components/ui/MicButton';
import { exportAssetCardPDF, exportAssetCardXLSX } from '../utils/exportAssetCard';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Asset {
  id: string;
  name: string;
  code?: string;
  buildingId: string;
  areaName: string;
  floorId?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  year?: number;
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
  P1: { label: 'P1 Havárie', bg: 'bg-red-500/20', text: 'text-red-400' },
  P2: { label: 'P2 Týden', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  P3: { label: 'P3 Běžná', bg: 'bg-blue-500/20', text: 'text-blue-400' },
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
};

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function AssetCardPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'revisions'>('info');
  const [stanoviste, setStanoviste] = useState('Expedice');
  const [prefilterSaving, setPrefilterSaving] = useState(false);

  // ─── V2 Rodný list state ───
  const [assetV2, setAssetV2] = useState<AssetV2 | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string; code: string; entityType: string; status: AssetStatus;
    criticality: AssetCriticality; manufacturer: string; model: string;
    serialNumber: string; year: string; location: string;
  }>({
    name: '', code: '', entityType: '', status: 'operational',
    criticality: 'medium', manufacturer: '', model: '',
    serialNumber: '', year: '', location: '',
  });
  const [eventsForm, setEventsForm] = useState<AssetEvent[]>([]);
  const [repairLogForm, setRepairLogForm] = useState<RepairLogEntry[]>([]);
  const [documentsForm, setDocumentsForm] = useState<string[]>([]);
  const tenantId = user?.tenantId ?? 'main_firm';

  const { revisions, loading: loadingRevisions, logRevision } = useRevisions(assetId);

  const canCreateTask = hasPermission('tasks.create');
  const canEditAsset = hasPermission('assets.edit');

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
      setActiveTab('tasks');
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
        });
        setEventsForm(data.events || []);
        setRepairLogForm(data.repairLog || []);
        setDocumentsForm(data.documents || []);
        setLoadingAssetV2(false);
      })
      .catch((err) => {
        console.warn('[AssetCard] v2 load fallback:', err);
        setLoadingAssetV2(false);
      });
  }, [assetId, tenantId]);

  // ─── SAVE EDIT ───
  const handleSaveEdit = async () => {
    if (!assetV2 || !assetId) return;
    setEditSaving(true);
    try {
      await assetService.update(tenantId, assetId, {
        name: editForm.name, code: editForm.code || undefined,
        entityType: editForm.entityType, status: editForm.status,
        criticality: editForm.criticality, manufacturer: editForm.manufacturer || undefined,
        model: editForm.model || undefined, serialNumber: editForm.serialNumber || undefined,
        year: editForm.year ? Number(editForm.year) : undefined,
        location: editForm.location || undefined,
        events: eventsForm.filter(e => e.name.trim()),
        repairLog: repairLogForm.filter(e => e.description.trim()),
        documents: documentsForm.filter(d => d.trim()),
      });
      const updated = await assetService.getById(tenantId, assetId);
      setAssetV2(updated);
      setIsEditing(false);
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
    });
    setEventsForm(assetV2.events || []);
    setRepairLogForm(assetV2.repairLog || []);
    setDocumentsForm(assetV2.documents || []);
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

  // ─── LOADING ───
  if (loadingAsset || loadingAssetV2) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <Settings className="w-16 h-16 text-slate-600" />
        <h2 className="text-xl font-bold text-slate-400">Zařízení nenalezeno</h2>
        <button onClick={() => navigate(-1)} className="text-blue-400 font-medium">
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
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Revision Alert Banner */}
      {expiredRevisions.length > 0 && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-red-400 text-sm">Prošlé revize!</div>
              {expiredRevisions.map((r) => (
                <div key={r.id} className="text-xs text-red-300/80">{r.title}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-3 pt-4">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-slate-500 flex-wrap gap-1 mb-4">
          <button onClick={() => navigate('/')} className="hover:text-blue-400 transition">
            Dashboard
          </button>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <button onClick={() => navigate('/map')} className="hover:text-blue-400 transition">
            Mapa
          </button>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <button
            onClick={() => navigate('/map')}
            className="hover:text-blue-400 transition flex items-center gap-1"
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
          <span className="text-white font-medium">{asset.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: catCfg.color + '25' }}
          >
            <IconComp className="w-8 h-8" style={{ color: catCfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white truncate">{asset.name}</h1>
              <div className={`w-4 h-4 rounded-full flex-shrink-0 ${st.dot}`} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {asset.code && (
                <span className="text-xs text-slate-500 font-mono">{asset.code}</span>
              )}
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: st.color + '20', color: st.color }}
              >
                {st.label}
              </span>
              {expiringRevisions.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                  {expiringRevisions.length} revize končí
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex gap-2 mb-2">
          {canEditAsset && (
            <button
              onClick={() => { setIsEditing(!isEditing); setActiveTab('info'); }}
              className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-[0.97] min-h-[48px] ${
                isEditing
                  ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                  : 'bg-slate-500/15 border border-slate-500/30 text-slate-300 hover:bg-slate-500/25'
              }`}
            >
              <Edit3 className="w-5 h-5" />
              {isEditing ? 'Edituji…' : 'Upravit'}
            </button>
          )}
          {canCreateTask && (
            <button
              onClick={() => setShowFaultModal(true)}
              className="flex-1 py-3 bg-red-500/15 border border-red-500/30 text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-500/25 transition active:scale-[0.97] min-h-[48px]"
            >
              <AlertTriangle className="w-5 h-5" />
              Nahlásit
            </button>
          )}
          <button
            onClick={() => setActiveTab('info')}
            className="flex-1 py-3 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-500/25 transition active:scale-[0.97] min-h-[48px]"
          >
            <FileText className="w-5 h-5" />
            Pasport
          </button>
          {/* Export dropdown */}
          <div className="relative" style={{ flex: '0 0 auto' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="py-3 px-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/25 transition active:scale-[0.97] min-h-[48px]"
            >
              <Download className="w-5 h-5" />
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-lg overflow-hidden"
                  style={{ background: '#1e293b', border: '1px solid #334155', minWidth: '180px' }}
                >
                  <button
                    onClick={handleExportPDF}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition"
                    style={{ color: '#e2e8f0', fontSize: '0.9rem' }}
                  >
                    <FileText className="w-4 h-4" style={{ color: '#ef4444' }} />
                    PDF export
                  </button>
                  <div style={{ height: '1px', background: '#334155' }} />
                  <button
                    onClick={handleExportXLSX}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition"
                    style={{ color: '#e2e8f0', fontSize: '0.9rem' }}
                  >
                    <Table className="w-4 h-4" style={{ color: '#22c55e' }} />
                    Excel export
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {/* Secondary Action Buttons */}
        <div className="flex gap-2 mb-4">
          {canCreateTask && (
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex-1 py-3 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-500/25 transition active:scale-[0.97] min-h-[48px]"
            >
              <PlusCircle className="w-5 h-5" />
              Nový úkol
            </button>
          )}
          {canEditAsset && revisions.length > 0 && (
            <button
              onClick={() => setShowRevisionModal(true)}
              className="flex-1 py-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-500/25 transition active:scale-[0.97] min-h-[48px]"
            >
              <Shield className="w-5 h-5" />
              Zapsat revizi
            </button>
          )}
          {asset.category === 'extruder' && canCreateTask && (
            <button
              onClick={handlePrefilterChange}
              disabled={prefilterSaving}
              className="flex-1 py-3 bg-purple-500/15 border border-purple-500/30 text-purple-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-500/25 transition active:scale-[0.97] min-h-[48px] disabled:opacity-50"
            >
              {prefilterSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Filter className="w-5 h-5" />}
              Předfiltr
            </button>
          )}
          <button
            onClick={printAssetPassport}
            className="flex-1 py-3 bg-slate-500/15 border border-slate-500/30 text-slate-300 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-500/25 transition active:scale-[0.97] min-h-[48px]"
          >
            <Printer className="w-5 h-5" />
            Tisk historie
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/10 pb-2">
          {([
            { key: 'info' as const, label: 'Pasport' },
            { key: 'tasks' as const, label: `Úkoly (${tasks.length})` },
            { key: 'revisions' as const, label: `Revize (${revisions.length})`, alert: expiredRevisions.length > 0 },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.alert && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB: INFO ═══ */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            {/* ═══ SEKCE 1: IDENTITY CARD (Apple-style) ═══ */}
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
                    {assetV2?.entityType && (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>
                        {assetV2.entityType}
                      </span>
                    )}
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
                  <RLField label="Typ entity" value={editForm.entityType} onChange={(v) => setEditForm({ ...editForm, entityType: v })} placeholder="např. Stroj, Budova, Místnost" />
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
                </div>
              )}
            </div>

            {/* ═══ SEKCE 2: TECHNICAL SHEET (Apple-style) ═══ */}
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
                              updated[idx] = { ...updated[idx], lastDate: v || undefined };
                              setEventsForm(updated);
                            }}
                            type="date"
                          />
                          <RLField
                            label="Příští datum"
                            value={evt.nextDate || ''}
                            onChange={(v) => {
                              const updated = [...eventsForm];
                              updated[idx] = { ...updated[idx], nextDate: v || undefined };
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
                            updated[idx] = { ...updated[idx], instructions: v || undefined };
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
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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
                              updated[idx] = { ...updated[idx], technicianName: v || undefined };
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
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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

            {/* Legacy info (Budova, Místnost — from old model) */}
            <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
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
              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Stanoviště VZV</h3>
                <div className="flex gap-2">
                  {['Expedice', 'Sklad A', 'Sklad B'].map((loc) => (
                    <button
                      key={loc}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition border min-h-[44px] ${
                        stanoviste === loc
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                          : 'bg-white/5 text-slate-500 border-white/10 hover:text-slate-300'
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
              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
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
                    <div key={i} className="flex items-center gap-3 bg-slate-700/30 rounded-xl p-3 hover:bg-slate-700/40 transition cursor-pointer">
                      <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">{d.name}</div>
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
              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
                <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Kontrolní body</h3>
                <div className="space-y-2">
                  {asset.controlPoints.map((cp, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-slate-300">{cp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {asset.notes && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                <div className="text-xs text-amber-400 font-bold mb-1">Poznámky</div>
                <div className="text-sm text-amber-300/80">{asset.notes}</div>
              </div>
            )}

            {/* Revision Status */}
            {revisions.length > 0 && (
              <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
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
                    const textColor = isExpired ? 'text-red-400' : isExpiring ? 'text-amber-400' : 'text-emerald-400';

                    return (
                      <div
                        key={rev.id}
                        className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{rev.title}</div>
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
          </div>
        )}

        {/* ═══ TAB: TASKS ═══ */}
        {activeTab === 'tasks' && (
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
                    className="mt-4 px-4 py-2 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-xl text-sm font-semibold hover:bg-blue-500/25 transition"
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
                      className={`bg-slate-800/40 rounded-xl border border-slate-700/30 p-4 ${isDone ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pCfg.bg} ${pCfg.text}`}>
                          {pCfg.label}
                        </span>
                        {isDone && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                        <span className="text-[10px] text-slate-600 ml-auto flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.createdAt && typeof task.createdAt.toDate === 'function'
                            ? task.createdAt.toDate().toLocaleDateString('cs-CZ')
                            : '—'
                          }
                        </span>
                      </div>
                      <h4 className="font-medium text-sm text-white">{task.title}</h4>
                      {task.assignedToName && (
                        <div className="text-xs text-blue-400 mt-1">→ {task.assignedToName}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══ TAB: REVISIONS ═══ */}
        {activeTab === 'revisions' && (
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
                  const textColor = isExpired ? 'text-red-400' : isExpiring ? 'text-amber-400' : 'text-emerald-400';
                  const statusLabel = isExpired ? 'Prošlá' : isExpiring ? 'Končí brzy' : 'Platná';

                  return (
                    <div key={rev.id} className={`bg-slate-800/40 rounded-2xl border ${borderColor} p-4`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{typeCfg.icon}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isExpired ? 'bg-red-500/20 text-red-400' :
                          isExpiring ? 'bg-amber-500/20 text-amber-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {statusLabel}
                        </span>
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ml-auto ${dotColor}`} />
                      </div>
                      <h4 className="font-medium text-white mb-3">{rev.title}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-700/30 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Poslední</div>
                          <div className="text-xs font-medium text-white">{formatRevisionDate(rev.lastRevisionDate)}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Příští</div>
                          <div className={`text-xs font-bold ${textColor}`}>
                            {formatRevisionDate(rev.nextRevisionDate)}
                            <span className="ml-1 opacity-75">
                              ({days < 0 ? `${Math.abs(days)}d po!` : `za ${days}d`})
                            </span>
                          </div>
                        </div>
                        <div className="bg-slate-700/30 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Firma</div>
                          <div className="text-xs font-medium text-white">{rev.revisionCompany}</div>
                        </div>
                        <div className="bg-slate-700/30 rounded-xl p-2.5">
                          <div className="text-[10px] text-slate-500 mb-0.5">Č. zprávy</div>
                          <div className="text-xs font-mono text-white">{rev.certificateNumber}</div>
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
          onCreated={() => { setShowFaultModal(false); setActiveTab('tasks'); }}
        />
      )}

      {showTaskModal && (
        <TaskModal
          asset={asset}
          user={user}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => { setShowTaskModal(false); setActiveTab('tasks'); }}
        />
      )}

      {showRevisionModal && revisions.length > 0 && (
        <RevisionLogModal
          revisions={revisions}
          onClose={() => setShowRevisionModal(false)}
          onLog={logRevision}
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
  const textClass = highlight === 'red' ? 'text-red-400' : highlight === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="bg-slate-700/30 rounded-xl p-3">
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

const ASSIGNEE_OPTIONS = [
  { id: 'filip', name: 'Filip Novák' },
  { id: 'zdenek', name: 'Zdeněk Mička' },
  { id: 'petr', name: 'Petr Volf' },
  { id: 'udrzba', name: 'Údržba (tým)' },
];

function FaultModal({ asset, user, onClose, onCreated }: {
  asset: Asset; user: any; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: priority as 'P1' | 'P2' | 'P3' | 'P4',
        type: 'corrective',
        source: 'web',
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        assigneeId: assignee || undefined,
        assigneeName: ASSIGNEE_OPTIONS.find(a => a.id === assignee)?.name || undefined,
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
    <ModalShell title="Nahlásit poruchu" icon={<AlertTriangle className="w-5 h-5 text-red-400" />} onClose={onClose}>
      <div className="bg-slate-700/30 p-3 rounded-xl text-sm mb-4">
        <span className="text-slate-500">Zařízení:</span>{' '}
        <span className="font-medium text-white">{asset.name}</span>
        {asset.code && <span className="text-slate-500 ml-2 font-mono text-xs">{asset.code}</span>}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Popis poruchy..."
        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 transition mb-3"
        autoFocus
      />

      <div className="flex gap-2 items-start mb-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailní popis závady — co se stalo, kde přesně, okolnosti..."
          rows={4}
          className="flex-1 p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 transition resize-none"
        />
        <div className="pt-2">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Priorita</div>
        <div className="flex gap-2">
          {([
            { key: 'P3', label: 'Nízká', bg: 'bg-blue-500/20', text: 'text-blue-400' },
            { key: 'P2', label: 'Střední', bg: 'bg-orange-500/20', text: 'text-orange-400' },
            { key: 'P1', label: 'Havárie', bg: 'bg-red-500/20', text: 'text-red-400' },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPriority(opt.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                priority === opt.key
                  ? `${opt.bg} ${opt.text} border border-current`
                  : 'bg-white/5 text-slate-500 border border-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-400 mb-2">Přiřadit řešitele</div>
        <div className="grid grid-cols-2 gap-2">
          {ASSIGNEE_OPTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAssignee(assignee === a.id ? '' : a.id)}
              className={`py-2 px-3 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                assignee === a.id
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/5 text-slate-500 border border-white/10 hover:text-slate-300'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                assignee === a.id ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-600 text-slate-400'
              }`}>
                {a.name.split(' ').map(w => w[0]).join('')}
              </div>
              {a.name}
            </button>
          ))}
        </div>
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
        description: description.trim() || undefined,
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
    { key: 'preventive' as const, label: 'Preventivní', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    { key: 'corrective' as const, label: 'Nápravný', color: 'text-red-400', bg: 'bg-red-500/20' },
    { key: 'improvement' as const, label: 'Zlepšení', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  ];

  return (
    <ModalShell title="Nový úkol" icon={<PlusCircle className="w-5 h-5 text-blue-400" />} onClose={onClose}>
      <div className="bg-slate-700/30 p-3 rounded-xl text-sm mb-4">
        <span className="text-slate-500">Zařízení:</span>{' '}
        <span className="font-medium text-white">{asset.name}</span>
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
                  : 'bg-white/5 text-slate-500 border border-white/10'
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
        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition mb-3"
        autoFocus
      />

      <div className="flex gap-2 items-start mb-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Podrobnosti (volitelné)..."
          rows={3}
          className="flex-1 p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition resize-none"
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
                  : 'bg-white/5 text-slate-500 border border-white/10'
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
    <ModalShell title="Zapsat revizi" icon={<Shield className="w-5 h-5 text-emerald-400" />} onClose={onClose}>
      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Revize</div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/50 transition"
          style={{ appearance: 'auto' }}
        >
          {revisions.map((r: any) => (
            <option key={r.id} value={r.id} className="bg-slate-800">{r.title}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <div className="text-sm font-medium text-slate-400 mb-2">Datum revize</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/50 transition"
        />
      </div>

      <div className="mb-4">
        <div className="text-sm font-medium text-slate-400 mb-2">Číslo revizní zprávy</div>
        <input
          type="text"
          value={certNumber}
          onChange={(e) => setCertNumber(e.target.value)}
          placeholder="EL-2026-XXXX"
          className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition"
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

function ModalShell({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-slate-700/50"
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
            <h2 className="text-lg font-bold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
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
