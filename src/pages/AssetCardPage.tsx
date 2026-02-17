// src/pages/AssetCardPage.tsx
// NOMINAL CMMS — Karta stroje / zařízení (Dark Glassmorphism — sjednoceno s FleetPage)

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
import {
  AlertTriangle, ArrowLeft, CheckCircle2,
  Clock, Loader2, Shield, Wrench, X,
  ChevronRight, Settings, Building2, MapPin,
  Cog, PlusCircle,
} from 'lucide-react';

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
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'revisions'>('info');

  const { revisions, loading: loadingRevisions, logRevision } = useRevisions(assetId);

  const canCreateTask = hasPermission('tasks.create');
  const canEditAsset = hasPermission('assets.edit');

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

  // ─── LOADING ───
  if (loadingAsset) {
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

        {/* Action Buttons */}
        <div className="flex gap-2 mb-4">
          {canCreateTask && (
            <button
              onClick={() => setShowFaultModal(true)}
              className="flex-1 py-3 bg-red-500/15 border border-red-500/30 text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-500/25 transition active:scale-[0.97] min-h-[48px]"
            >
              <AlertTriangle className="w-5 h-5" />
              Nahlásit poruchu
            </button>
          )}
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/10 pb-2">
          {([
            { key: 'info' as const, label: 'Informace' },
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
            {/* Basic Info — glassmorphism cards */}
            <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
              <h3 className="text-xs text-slate-500 uppercase font-bold mb-3">Rodný list</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Budova" value={buildingName} icon={<Building2 className="w-3.5 h-3.5 text-slate-500" />} />
                <InfoBox label="Místnost" value={asset.areaName || '—'} icon={<MapPin className="w-3.5 h-3.5 text-slate-500" />} />
                {asset.manufacturer && <InfoBox label="Výrobce" value={asset.manufacturer} />}
                {asset.model && <InfoBox label="Model" value={asset.model} />}
                {asset.serialNumber && <InfoBox label="Sériové č." value={asset.serialNumber} />}
                {asset.year && <InfoBox label="Rok výroby" value={String(asset.year)} />}
                {asset.mthCounter != null && (
                  <InfoBox
                    label="Motohodiny"
                    value={`${asset.mthCounter.toLocaleString('cs-CZ')} Mth`}
                    highlight={asset.mthCounter > 3000 ? 'amber' : undefined}
                  />
                )}
                {asset.category && (
                  <InfoBox label="Kategorie" value={asset.category} />
                )}
              </div>
            </div>

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

function FaultModal({ asset, user, onClose, onCreated }: {
  asset: Asset; user: any; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
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

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Podrobnosti (volitelné)..."
        rows={3}
        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 transition resize-none mb-3"
      />

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

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Podrobnosti (volitelné)..."
        rows={3}
        className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition resize-none mb-3"
      />

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center" onClick={onClose}>
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
