// src/pages/BuildingInspectionPage.tsx
// NOMINAL CMMS — Kontrola budov (Firestore LIVE + CRUD)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import {
  ArrowLeft,
  Loader2,
  Building2,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Search,
  Plus,
  Pencil,
  Trash2,
  User,
  Clock,
} from 'lucide-react';

import FAB from '../components/ui/FAB';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
interface InspectionPoint {
  id: string;
  roomCode: string;
  roomName: string;
  floor: string;
  buildingId: string;
  description: string;
  category?: string;
  status: 'pending' | 'ok' | 'issue' | 'missing';
  lastInspectedAt?: any;
  lastInspectedBy?: string;
  issueNote?: string;
  order?: number;
}

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const STATUS_STYLES: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  pending: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', badge: 'bg-amber-500/20 text-amber-400', label: 'Chybí' },
  ok: { bg: 'bg-emerald-500/8', border: 'border-emerald-500/20', badge: 'bg-emerald-500/20 text-emerald-400', label: 'OK' },
  issue: { bg: 'bg-red-500/10', border: 'border-red-500/25', badge: 'bg-red-500/20 text-red-400', label: 'Závada' },
  missing: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', badge: 'bg-amber-500/20 text-amber-400', label: 'Chybí' },
};

const INSPECTORS = [
  { value: 'Vilém', label: 'Vilém' },
  { value: 'Zdeněk Mička', label: 'Zdeněk Mička' },
  { value: 'Petr Volf', label: 'Petr Volf' },
  { value: 'Filip Novák', label: 'Filip Novák' },
  { value: 'Martina', label: 'Martina' },
  { value: 'Pavla Drápelová', label: 'Pavla Drápelová' },
];

const BUILDINGS = [
  { value: 'A', label: 'A — Administrativa' },
  { value: 'B', label: 'B — Spojovací krček' },
  { value: 'C', label: 'C — Zázemí & Vedení' },
  { value: 'D', label: 'D — Výrobní hala' },
  { value: 'E', label: 'E — Dílna & Sklad ND' },
  { value: 'L', label: 'L — Loupárna' },
];

const CATEGORIES = [
  { value: 'výroba', label: 'Výroba' },
  { value: 'energie', label: 'Energie' },
  { value: 'budova', label: 'Budova' },
  { value: 'hygiena', label: 'Hygiena' },
  { value: 'sklad', label: 'Sklad' },
  { value: 'zázemí', label: 'Zázemí' },
  { value: 'údržba', label: 'Údržba' },
];

// ═══════════════════════════════════════════════════
// HOOK — Firestore real-time
// ═══════════════════════════════════════════════════
function useInspections() {
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'inspections'),
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as InspectionPoint))
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setPoints(data);
        setLoading(false);
      },
      (err) => {
        console.error('[Inspections] Firestore error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { points, loading };
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function timeAgo(date: any): string {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'právě teď';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ═══════════════════════════════════════════════════
// INSPECTION CARD
// ═══════════════════════════════════════════════════
function InspectionCard({ point, onOk, onIssue, onReset, onEdit, onDelete, isAdmin }: {
  point: InspectionPoint;
  onOk: () => void;
  onIssue: () => void;
  onReset: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const style = STATUS_STYLES[point.status] || STATUS_STYLES.pending;

  return (
    <div className={`p-3.5 rounded-2xl border ${style.bg} ${style.border} relative`}>
      {/* Admin controls */}
      {isAdmin && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button onClick={onEdit} className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-blue-400 transition active:scale-90">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition active:scale-90">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pr-14">
        <span className="text-[11px] font-bold text-slate-400">{point.roomCode}</span>
        <span className="text-[11px] text-slate-600">{point.floor}</span>
        {point.category && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500">{point.category}</span>
        )}
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ml-auto ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {/* Name + description */}
      <h3 className="text-[14px] font-semibold text-white leading-tight mb-1">{point.roomName}</h3>
      <p className="text-[12px] text-slate-500 leading-relaxed mb-3">{point.description}</p>

      {/* Issue note */}
      {point.status === 'issue' && point.issueNote && (
        <div className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
          <p className="text-[11px] text-red-400">⚠ {point.issueNote}</p>
        </div>
      )}

      {/* Inspector info */}
      {point.lastInspectedBy && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-3">
          <User className="w-3 h-3" />
          <span>{point.lastInspectedBy}</span>
          {point.lastInspectedAt && (
            <>
              <Clock className="w-3 h-3 ml-2" />
              <span>{timeAgo(point.lastInspectedAt)}</span>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button onClick={onReset} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-white transition active:scale-90">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onOk}
          className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5
            ${point.status === 'ok' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'}`}
        >
          <CheckCircle className="w-4 h-4" /> OK
        </button>
        <button
          onClick={onIssue}
          className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5
            ${point.status === 'issue' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-red-500/15 border border-red-500/30 text-red-400'}`}
        >
          <AlertTriangle className="w-4 h-4" /> Závada
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SUMMARY BAR
// ═══════════════════════════════════════════════════
function InspectionSummary({ points }: { points: InspectionPoint[] }) {
  const ok = points.filter((p) => p.status === 'ok').length;
  const issues = points.filter((p) => p.status === 'issue').length;
  const pending = points.filter((p) => p.status === 'pending' || p.status === 'missing').length;

  return (
    <div className="grid grid-cols-4 gap-1.5 mb-4">
      {[
        { value: points.length, label: 'Celkem', color: '#94a3b8' },
        { value: ok, label: 'OK', color: '#34d399' },
        { value: issues, label: 'Závady', color: '#f87171' },
        { value: pending, label: 'Čeká', color: '#fbbf24' },
      ].map((s) => (
        <div key={s.label} className="text-center py-2 px-1 rounded-xl" style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}>
          <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-[10px] text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// FILTER CHIP
// ═══════════════════════════════════════════════════
function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all active:scale-95 flex-shrink-0"
      style={{
        background: active ? `${color}25` : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? color + '50' : 'rgba(255,255,255,0.08)'}`,
        color: active ? color : '#64748b',
      }}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════
export default function BuildingInspectionPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { points, loading } = useInspections();

  const isAdmin = user?.role === 'SUPERADMIN' || user?.role === 'VEDENI';

  // Filters
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState<string>(user?.displayName || '');
  const [search, setSearch] = useState('');

  // Modals
  const [showIssueModal, setShowIssueModal] = useState<InspectionPoint | null>(null);
  const [issueNote, setIssueNote] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<InspectionPoint | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<InspectionPoint | null>(null);

  // Form state (add/edit)
  const [formRoomCode, setFormRoomCode] = useState('');
  const [formRoomName, setFormRoomName] = useState('');
  const [formFloor, setFormFloor] = useState('');
  const [formBuilding, setFormBuilding] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter logic
  const filtered = useMemo(() => {
    let result = points;
    if (filterStatus) result = result.filter((p) => p.status === filterStatus || (filterStatus === 'pending' && p.status === 'missing'));
    if (filterBuilding) result = result.filter((p) => p.buildingId === filterBuilding);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.roomCode.toLowerCase().includes(q) ||
        p.roomName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [points, filterStatus, filterBuilding, search]);

  // Progress
  const done = points.filter((p) => p.status === 'ok' || p.status === 'issue').length;
  const progress = points.length > 0 ? Math.round((done / points.length) * 100) : 0;

  // ─── ACTIONS ───
  const markOk = async (point: InspectionPoint) => {
    const inspector = selectedInspector || user?.displayName || 'Unknown';
    await updateDoc(doc(db, 'inspections', point.id), {
      status: 'ok',
      lastInspectedBy: inspector,
      lastInspectedAt: Timestamp.now(),
      issueNote: null,
    });
  };

  const openIssueModal = (point: InspectionPoint) => {
    setShowIssueModal(point);
    setIssueNote(point.issueNote || '');
  };

  const submitIssue = async () => {
    if (!showIssueModal || !issueNote.trim()) return;
    const inspector = selectedInspector || user?.displayName || 'Unknown';
    await updateDoc(doc(db, 'inspections', showIssueModal.id), {
      status: 'issue',
      issueNote: issueNote.trim(),
      lastInspectedBy: inspector,
      lastInspectedAt: Timestamp.now(),
    });
    setShowIssueModal(null);
    setIssueNote('');
  };

  const resetPoint = async (point: InspectionPoint) => {
    await updateDoc(doc(db, 'inspections', point.id), {
      status: 'pending',
      lastInspectedBy: null,
      lastInspectedAt: null,
      issueNote: null,
    });
  };

  // ─── CRUD ───
  const resetForm = () => {
    setFormRoomCode(''); setFormRoomName(''); setFormFloor('');
    setFormBuilding(''); setFormDescription(''); setFormCategory('');
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (point: InspectionPoint) => {
    setFormRoomCode(point.roomCode);
    setFormRoomName(point.roomName);
    setFormFloor(point.floor);
    setFormBuilding(point.buildingId);
    setFormDescription(point.description);
    setFormCategory(point.category || '');
    setShowEditModal(point);
  };

  const handleAdd = async () => {
    if (!formRoomCode.trim() || !formRoomName.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'inspections'), {
        roomCode: formRoomCode.trim(),
        roomName: formRoomName.trim(),
        floor: formFloor.trim() || '1.NP',
        buildingId: formBuilding || 'D',
        description: formDescription.trim(),
        category: formCategory || null,
        status: 'pending',
        lastInspectedAt: null,
        lastInspectedBy: null,
        issueNote: null,
        order: points.length,
        createdAt: Timestamp.now(),
      });
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      console.error('Add inspection failed:', err);
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!showEditModal || !formRoomCode.trim() || !formRoomName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'inspections', showEditModal.id), {
        roomCode: formRoomCode.trim(),
        roomName: formRoomName.trim(),
        floor: formFloor.trim() || '1.NP',
        buildingId: formBuilding || 'D',
        description: formDescription.trim(),
        category: formCategory || null,
      });
      setShowEditModal(null);
      resetForm();
    } catch (err) {
      console.error('Edit inspection failed:', err);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'inspections', showDeleteConfirm.id));
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Delete inspection failed:', err);
    }
  };

  // Reset all
  const resetAll = async () => {
    for (const p of points) {
      await updateDoc(doc(db, 'inspections', p.id), {
        status: 'pending', lastInspectedBy: null, lastInspectedAt: null, issueNote: null,
      });
    }
  };

  // Unique buildings from data
  const activeBuildings = [...new Set(points.map((p) => p.buildingId))].sort();

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto px-3 pt-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/')} className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-400" />
              Kontrola budov
            </h1>
            <p className="text-xs text-slate-500">{done}/{points.length} zkontrolováno · {progress}%</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
          {isAdmin && (
            <button onClick={resetAll} className="px-3 py-1.5 rounded-lg bg-white/5 text-[11px] text-slate-400 font-semibold hover:text-white transition active:scale-95">
              <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> Reset
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-white/5 mb-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : 'linear-gradient(90deg, #14b8a6, #34d399)' }} />
        </div>

        {/* Inspector selector */}
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-slate-500" />
          <select
            value={selectedInspector}
            onChange={(e) => setSelectedInspector(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-teal-500/50 transition appearance-none"
          >
            <option value="">-- Vyberte inspektora --</option>
            {INSPECTORS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>

        {/* Summary */}
        <InspectionSummary points={points} />

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat místnost, kód..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-2 overflow-x-auto">
          <FilterChip label="Vše" active={!filterStatus} onClick={() => setFilterStatus(null)} color="#94a3b8" />
          <FilterChip label="Čeká" active={filterStatus === 'pending'} onClick={() => setFilterStatus(filterStatus === 'pending' ? null : 'pending')} color="#fbbf24" />
          <FilterChip label="OK" active={filterStatus === 'ok'} onClick={() => setFilterStatus(filterStatus === 'ok' ? null : 'ok')} color="#34d399" />
          <FilterChip label="Závady" active={filterStatus === 'issue'} onClick={() => setFilterStatus(filterStatus === 'issue' ? null : 'issue')} color="#f87171" />
        </div>
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          <FilterChip label="Vše" active={!filterBuilding} onClick={() => setFilterBuilding(null)} color="#94a3b8" />
          {activeBuildings.map((bid) => (
            <FilterChip key={bid} label={`Budova ${bid}`} active={filterBuilding === bid} onClick={() => setFilterBuilding(filterBuilding === bid ? null : bid)} color="#f97316" />
          ))}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Načítám...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12" />}
            title="Žádné kontrolní body"
            subtitle={search || filterStatus || filterBuilding ? 'Zkus jiný filtr' : 'Přidej první kontrolní bod'}
            actionLabel="Přidat bod"
            onAction={openAddModal}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filtered.map((point) => (
              <InspectionCard
                key={point.id}
                point={point}
                onOk={() => markOk(point)}
                onIssue={() => openIssueModal(point)}
                onReset={() => resetPoint(point)}
                onEdit={() => openEditModal(point)}
                onDelete={() => setShowDeleteConfirm(point)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — Add (admin only) */}
      {isAdmin && (
        <FAB icon={<Plus className="w-6 h-6" />} label="Přidat bod" onClick={openAddModal} />
      )}

      {/* ═══ ISSUE MODAL ═══ */}
      <BottomSheet title="⚠ Popsat závadu" isOpen={!!showIssueModal} onClose={() => setShowIssueModal(null)}>
        {showIssueModal && (
          <>
            <div className="bg-white/5 rounded-xl p-3 mb-4">
              <div className="text-[11px] text-slate-500">{showIssueModal.roomCode} · {showIssueModal.floor}</div>
              <div className="text-sm font-semibold text-white mt-0.5">{showIssueModal.roomName}</div>
              <div className="text-[12px] text-slate-400 mt-1">{showIssueModal.description}</div>
            </div>
            <FormField label="Popis závady" value={issueNote} onChange={setIssueNote} type="textarea" placeholder="Co je špatně?" required />
            <SubmitButton label="Nahlásit závadu" onClick={submitIssue} color="red" />
          </>
        )}
      </BottomSheet>

      {/* ═══ ADD MODAL ═══ */}
      <BottomSheet title="➕ Nový kontrolní bod" isOpen={showAddModal} onClose={() => setShowAddModal(false)}>
        <FormField label="Kód místnosti" value={formRoomCode} onChange={setFormRoomCode} placeholder="D 1.25" required />
        <FormField label="Název místnosti" value={formRoomName} onChange={setFormRoomName} placeholder="Údržba, mycí centrum" required />
        <FormField label="Budova" value={formBuilding} onChange={setFormBuilding} type="select" required options={BUILDINGS} />
        <FormField label="Patro" value={formFloor} onChange={setFormFloor} placeholder="1.NP" />
        <FormField label="Kategorie" value={formCategory} onChange={setFormCategory} type="select" options={CATEGORIES} />
        <FormField label="Co kontrolovat" value={formDescription} onChange={setFormDescription} type="textarea" placeholder="odpad, podlaha, dveře, světla..." required />
        <SubmitButton label="Přidat kontrolní bod" onClick={handleAdd} loading={saving} />
      </BottomSheet>

      {/* ═══ EDIT MODAL ═══ */}
      <BottomSheet title="✏️ Upravit kontrolní bod" isOpen={!!showEditModal} onClose={() => { setShowEditModal(null); resetForm(); }}>
        <FormField label="Kód místnosti" value={formRoomCode} onChange={setFormRoomCode} placeholder="D 1.25" required />
        <FormField label="Název místnosti" value={formRoomName} onChange={setFormRoomName} placeholder="Údržba, mycí centrum" required />
        <FormField label="Budova" value={formBuilding} onChange={setFormBuilding} type="select" required options={BUILDINGS} />
        <FormField label="Patro" value={formFloor} onChange={setFormFloor} placeholder="1.NP" />
        <FormField label="Kategorie" value={formCategory} onChange={setFormCategory} type="select" options={CATEGORIES} />
        <FormField label="Co kontrolovat" value={formDescription} onChange={setFormDescription} type="textarea" placeholder="odpad, podlaha, dveře, světla..." required />
        <SubmitButton label="Uložit změny" onClick={handleEdit} loading={saving} />
      </BottomSheet>

      {/* ═══ DELETE CONFIRM ═══ */}
      <BottomSheet title="🗑 Smazat kontrolní bod?" isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)}>
        {showDeleteConfirm && (
          <>
            <div className="bg-red-500/10 rounded-xl p-4 mb-4 border border-red-500/20">
              <p className="text-sm text-white font-semibold">{showDeleteConfirm.roomCode} — {showDeleteConfirm.roomName}</p>
              <p className="text-xs text-slate-400 mt-1">{showDeleteConfirm.description}</p>
              <p className="text-xs text-red-400 mt-2">Tato akce je nevratná!</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-semibold active:scale-95 transition">
                Zrušit
              </button>
              <button onClick={handleDelete} className="py-3 rounded-xl bg-red-500 text-white text-sm font-semibold active:scale-95 transition shadow-lg shadow-red-500/30">
                Smazat
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
