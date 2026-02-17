// src/pages/AssetCardPage.tsx
// NOMINAL CMMS — Karta stroje / zařízení (Firestore LIVE)

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useRevisions, STATUS_CONFIG as REV_STATUS, TYPE_CONFIG as REV_TYPE, formatRevisionDate, daysUntilRevision } from '../hooks/useRevisions';
import { Breadcrumb } from '../components/ui';
import {
  doc, getDoc, collection, query, where, orderBy, limit, onSnapshot,
  addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AlertTriangle, ArrowLeft, CheckCircle2,
  Clock, Loader2, Settings, Shield,
  Wrench, X,
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

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  P1: { label: 'P1 Havárie', color: 'bg-red-500' },
  P2: { label: 'P2 Týden', color: 'bg-orange-500' },
  P3: { label: 'P3 Běžná', color: 'bg-blue-500' },
  P4: { label: 'P4 Nápad', color: 'bg-gray-400' },
};

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════

export default function AssetCardPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthContext();

  // Data
  const [asset, setAsset] = useState<Asset | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'tasks' | 'revisions'>('info');

  // Revize pro tento stroj
  const { revisions, loading: loadingRevisions, logRevision } = useRevisions(assetId);

  const canCreateTask = hasPermission('tasks.create');
  const canEditAsset = hasPermission('assets.edit');

  // ─────────────────────────────────────────
  // LOAD ASSET
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // LOAD TASKS for this asset
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // LOADING / NOT FOUND
  // ─────────────────────────────────────────
  if (loadingAsset) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <Settings className="w-16 h-16 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-600">Zařízení nenalezeno</h2>
        <button onClick={() => navigate(-1)} className="text-blue-600 font-medium">
          ← Zpět
        </button>
      </div>
    );
  }

  // Revision alerts
  const expiredRevisions = revisions.filter((r) => r.status === 'expired');
  // expiringRevisions available via revisions.filter if needed

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Revision Alert Banner */}
      {expiredRevisions.length > 0 && (
        <div className="bg-red-500 text-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <div>
              <div className="font-bold">Prošlé revize!</div>
              {expiredRevisions.map((r) => (
                <div key={r.id} className="text-sm opacity-90">{r.title}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <Breadcrumb items={[
          { label: 'Dashboard', onClick: () => navigate('/') },
          { label: 'Mapa', onClick: () => navigate('/map') },
          { label: asset.name },
        ]} />

        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-800">{asset.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <span className="px-1.5 py-0.5 bg-slate-100 rounded font-bold text-xs">{asset.buildingId}</span>
              <span>{asset.areaName}</span>
              {asset.code && <span className="font-mono text-xs">• {asset.code}</span>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {canCreateTask && (
            <button
              onClick={() => setShowFaultModal(true)}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-red-700"
            >
              <AlertTriangle className="w-4 h-4" />
              Nahlásit poruchu
            </button>
          )}
          {canEditAsset && (
            <button
              onClick={() => setShowRevisionModal(true)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-blue-700"
            >
              <Shield className="w-4 h-4" />
              Zapsat revizi
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b flex">
        {(['info', 'tasks', 'revisions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'info' && 'Informace'}
            {tab === 'tasks' && `Úkoly (${tasks.length})`}
            {tab === 'revisions' && (
              <span className="flex items-center justify-center gap-1">
                Revize ({revisions.length})
                {expiredRevisions.length > 0 && (
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {/* ═══ TAB: INFO ═══ */}
        {activeTab === 'info' && (
          <>
            {/* Basic Info */}
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-500 uppercase">Základní údaje</h3>
              <div className="grid grid-cols-2 gap-3">
                <InfoBox label="Budova" value={asset.buildingId} />
                <InfoBox label="Místnost" value={asset.areaName} />
                {asset.manufacturer && <InfoBox label="Výrobce" value={asset.manufacturer} />}
                {asset.model && <InfoBox label="Model" value={asset.model} />}
                {asset.serialNumber && <InfoBox label="Sériové č." value={asset.serialNumber} />}
                {asset.year && <InfoBox label="Rok výroby" value={String(asset.year)} />}
                {asset.mthCounter != null && (
                  <InfoBox label="Motohodiny" value={`${asset.mthCounter} Mth`} />
                )}
                {asset.status && <InfoBox label="Stav" value={asset.status} />}
              </div>
            </div>

            {/* Control Points */}
            {asset.controlPoints && asset.controlPoints.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Kontrolní body</h3>
                <div className="space-y-2">
                  {asset.controlPoints.map((cp, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>{cp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {asset.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs text-amber-700 font-bold mb-1">Poznámky</div>
                <div className="text-sm text-amber-800">{asset.notes}</div>
              </div>
            )}

            {/* Quick Revision Status */}
            {revisions.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Stav revizí
                </h3>
                <div className="space-y-2">
                  {revisions.map((rev) => {
                    const statusCfg = REV_STATUS[rev.status];
                    const days = daysUntilRevision(rev.nextRevisionDate);
                    return (
                      <div key={rev.id} className={`p-3 rounded-xl ${statusCfg.bgColor}`}>
                        <div className="flex justify-between items-center">
                          <span className={`font-medium text-sm ${statusCfg.color}`}>{rev.title}</span>
                          <span className={`text-xs font-bold ${statusCfg.color}`}>
                            {days < 0 ? `${Math.abs(days)}d po termínu` : `za ${days}d`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ TAB: TASKS ═══ */}
        {activeTab === 'tasks' && (
          <>
            {loadingTasks ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Žádné úkoly pro toto zařízení</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden divide-y">
                {tasks.map((task) => {
                  const pCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.P3;
                  const isDone = task.status === 'done';
                  return (
                    <div key={task.id} className={`p-4 ${isDone ? 'opacity-60' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${pCfg.color}`}>
                          {pCfg.label}
                        </span>
                        {isDone && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                      <h4 className="font-medium text-slate-800">{task.title}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.createdAt && typeof task.createdAt.toDate === 'function'
                            ? task.createdAt.toDate().toLocaleDateString('cs-CZ')
                            : '—'
                          }
                        </span>
                        {task.assignedToName && (
                          <span>→ {task.assignedToName}</span>
                        )}
                      </div>
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
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : revisions.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Žádné revize pro toto zařízení</p>
              </div>
            ) : (
              <div className="space-y-3">
                {revisions.map((rev) => {
                  const statusCfg = REV_STATUS[rev.status];
                  const typeCfg = REV_TYPE[rev.type] || REV_TYPE.other;
                  const days = daysUntilRevision(rev.nextRevisionDate);
                  return (
                    <div key={rev.id} className={`bg-white rounded-xl border p-4 ${
                      rev.status === 'expired' ? 'border-red-300' : ''
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{typeCfg.icon}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusCfg.bgColor} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <h4 className="font-medium text-slate-800 mb-2">{rev.title}</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Poslední: </span>
                          <span className="font-medium">{formatRevisionDate(rev.lastRevisionDate)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Příští: </span>
                          <span className={`font-bold ${statusCfg.color}`}>
                            {formatRevisionDate(rev.nextRevisionDate)}
                            {days < 0
                              ? ` (${Math.abs(days)}d po!)`
                              : ` (za ${days}d)`
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Firma: </span>
                          <span className="font-medium">{rev.revisionCompany}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Č. zprávy: </span>
                          <span className="font-mono">{rev.certificateNumber}</span>
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

      {/* Fault Modal */}
      {showFaultModal && (
        <FaultModal
          asset={asset}
          user={user}
          onClose={() => setShowFaultModal(false)}
          onCreated={() => { setShowFaultModal(false); setActiveTab('tasks'); }}
        />
      )}

      {/* Revision Modal */}
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

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
      await addDoc(collection(db, 'tasks'), {
        title: title.trim(),
        description: description.trim(),
        priority,
        status: 'open',
        assetId: asset.id,
        assetName: asset.name,
        buildingId: asset.buildingId,
        areaName: asset.areaName,
        createdBy: user?.uid || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
        assignedTo: null,
        assignedToName: null,
        scheduledDate: null,
        completedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });
      onCreated();
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold">Nahlásit poruchu</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl text-sm">
            <span className="text-slate-500">Zařízení:</span>{' '}
            <span className="font-medium">{asset.name}</span>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Popis poruchy..."
            className="w-full p-3 border rounded-xl focus:border-blue-500 outline-none"
            autoFocus
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Podrobnosti (volitelné)..."
            rows={3}
            className="w-full p-3 border rounded-xl focus:border-blue-500 outline-none resize-none"
          />

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Priorita</div>
            <div className="flex gap-2">
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                    priority === key
                      ? `${cfg.color} text-white`
                      : 'bg-slate-100 text-slate-600'
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
            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
            Odeslat poruchu
          </button>
        </div>
      </div>
    </div>
  );
}

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
      alert(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold">Zapsat revizi</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Revize</div>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full p-3 border rounded-xl outline-none"
            >
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Datum revize</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 border rounded-xl outline-none"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Číslo revizní zprávy</div>
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="EL-2026-XXXX"
              className="w-full p-3 border rounded-xl focus:border-blue-500 outline-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!certNumber.trim() || saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
            Zapsat revizi
          </button>
        </div>
      </div>
    </div>
  );
}
