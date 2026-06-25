// src/pages/BuildingInspectionPage.tsx
// VIKRR — Asset Shield — Kontroly (Firestore LIVE + CRUD)

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useEmployeeNames } from '../hooks/useEmployeeDirectory';
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
  ClipboardCheck,
  ClipboardList,
  Printer,
} from 'lucide-react';

import FAB from '../components/ui/FAB';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet, { FormField, SubmitButton } from '../components/ui/BottomSheet';
import { Skeleton } from '../components/ui';

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
  taskId?: string;
  order?: number;
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeInspectionStatus(value: unknown): InspectionPoint['status'] {
  return value === 'ok' || value === 'issue' || value === 'missing' || value === 'pending'
    ? value
    : 'pending';
}

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const STATUS_STYLES: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  pending: { bg: 'bg-white', border: 'border-[#e7dfd2]', badge: 'bg-amber-50 text-amber-800 border border-amber-200', label: 'Čeká' },
  ok: { bg: 'bg-emerald-50/70', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200', label: 'OK' },
  issue: { bg: 'bg-red-50/80', border: 'border-red-200', badge: 'bg-red-100 text-red-800 border border-red-200', label: 'Závada' },
  missing: { bg: 'bg-amber-50/80', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800 border border-amber-200', label: 'Chybí' },
};

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
          .map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              roomCode: safeText(raw.roomCode),
              roomName: safeText(raw.roomName, 'Bez nazvu'),
              floor: safeText(raw.floor, 'Bez patra'),
              buildingId: safeText(raw.buildingId),
              description: safeText(raw.description),
              category: safeText(raw.category) || undefined,
              status: safeInspectionStatus(raw.status),
              lastInspectedAt: raw.lastInspectedAt,
              lastInspectedBy: safeText(raw.lastInspectedBy),
              issueNote: safeText(raw.issueNote),
              taskId: safeText(raw.taskId) || undefined,
              order: typeof raw.order === 'number' ? raw.order : 99,
            } satisfies InspectionPoint;
          })
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

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildingLabel(buildingId: string): string {
  return BUILDINGS.find((b) => b.value === buildingId)?.label || `Budova ${buildingId}`;
}

function parseBuildingSearch(search: string): { buildingId: string | null; roomQuery: string } {
  const raw = search.trim();
  if (!raw) return { buildingId: null, roomQuery: '' };

  const firstToken = raw.split(/\s+/)[0].toUpperCase();
  const exactBuilding = BUILDINGS.find((building) => building.value === firstToken);
  if (!exactBuilding) return { buildingId: null, roomQuery: raw };

  return {
    buildingId: exactBuilding.value,
    roomQuery: raw.slice(firstToken.length).trim(),
  };
}

type TaskFilter = 'all' | 'with_task' | 'without_task';

// ═══════════════════════════════════════════════════
// INSPECTION CARD
// ═══════════════════════════════════════════════════
function InspectionCard({ point, onOk, onIssue, onReset, onEdit, onDelete, onOpenTask, isAdmin }: {
  point: InspectionPoint;
  onOk: () => void;
  onIssue: () => void;
  onReset: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: () => void;
  isAdmin: boolean;
}) {
  const style = STATUS_STYLES[point.status] || STATUS_STYLES.pending;

  return (
    <article className={`relative rounded-[22px] border ${style.bg} ${style.border} p-4 shadow-sm`}>
      {/* Admin controls */}
      {isAdmin && (
        <div className="absolute top-3 right-3 flex gap-1.5">
          <button onClick={onEdit} className="w-8 h-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:text-blue-700 transition active:scale-90">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="w-8 h-8 rounded-xl border border-red-200 bg-red-50 flex items-center justify-center text-red-600 hover:text-red-800 transition active:scale-90">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pr-20">
        <span className="text-xs font-black text-slate-950">{point.roomCode}</span>
        <span className="text-xs font-bold text-slate-500">{point.floor}</span>
        {point.category && (
          <span className="text-xs px-2 py-1 rounded-lg bg-[#efe7dc] text-slate-700">{point.category}</span>
        )}
        <span className={`px-2.5 py-1 rounded-full text-xs font-black ml-auto ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {/* Name + description */}
      <h3 className="text-lg font-black text-slate-950 leading-tight mb-1">{point.roomName}</h3>
      <p className="text-sm text-slate-700 leading-relaxed mb-3 break-words whitespace-pre-wrap">{point.description}</p>

      {/* Issue note */}
      {point.status === 'issue' && point.issueNote && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 mb-3">
          <p className="text-sm font-semibold text-slate-950 break-words whitespace-pre-wrap">⚠ {point.issueNote}</p>
        </div>
      )}

      {point.taskId && (
        <button
          type="button"
          onClick={onOpenTask}
          className="w-full mb-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <ClipboardList className="w-4 h-4" />
          Otevřít úkol k závadě
        </button>
      )}

      {/* Inspector info */}
      {point.lastInspectedBy && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-3">
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
      <div className="grid grid-cols-[44px_1fr_1fr] gap-2">
        <button onClick={onReset} className="w-11 h-11 rounded-xl bg-white border border-[#e7dfd2] flex items-center justify-center text-slate-500 hover:text-slate-900 transition active:scale-90">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={onOk}
          className={`min-h-11 rounded-xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-1.5
            ${point.status === 'ok' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}
        >
          <CheckCircle className="w-4 h-4" /> OK
        </button>
        <button
          onClick={onIssue}
          className={`min-h-11 rounded-xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-1.5
            ${point.status === 'issue' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 border border-red-200 text-red-800'}`}
        >
          <AlertTriangle className="w-4 h-4" /> Závada
        </button>
      </div>
    </article>
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
  const goBack = useBackNavigation('/');
  const { user } = useAuthContext();
  const { points, loading } = useInspections();
  const employeeNames = useEmployeeNames({ tenantId: user?.tenantId || 'main_firm' });

  const isAdmin = user?.role === 'SUPERADMIN' || user?.role === 'VEDENI';

  // Filters
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string | null>(null);
  const [filterFloor, setFilterFloor] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTask, setFilterTask] = useState<TaskFilter>('all');
  const [selectedInspector, setSelectedInspector] = useState<string>(user?.displayName || '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!selectedInspector && user?.displayName) {
      setSelectedInspector(user.displayName);
    }
  }, [selectedInspector, user?.displayName]);

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
  const searchScope = useMemo(() => parseBuildingSearch(search), [search]);
  const effectiveBuildingFilter = filterBuilding || searchScope.buildingId;

  // Filter logic
  const filtered = useMemo(() => {
    let result = points;
    if (filterStatus) result = result.filter((p) => p.status === filterStatus || (filterStatus === 'pending' && p.status === 'missing'));
    if (effectiveBuildingFilter) result = result.filter((p) => p.buildingId === effectiveBuildingFilter);
    if (filterFloor) result = result.filter((p) => safeText(p.floor) === filterFloor);
    if (filterCategory) result = result.filter((p) => safeText(p.category) === filterCategory);
    if (filterTask === 'with_task') result = result.filter((p) => !!p.taskId);
    if (filterTask === 'without_task') result = result.filter((p) => p.status === 'issue' && !p.taskId);
    if (searchScope.roomQuery.trim()) {
      const q = normalizeText(searchScope.roomQuery);
      result = result.filter((p) =>
        normalizeText(p.roomCode).includes(q) ||
        normalizeText(p.roomName).includes(q) ||
        normalizeText(p.description).includes(q) ||
        normalizeText(p.floor).includes(q) ||
        normalizeText(p.category).includes(q)
      );
    }
    return result;
  }, [points, filterStatus, effectiveBuildingFilter, filterFloor, filterCategory, filterTask, searchScope.roomQuery]);

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
    const now = Timestamp.now();
    const taskId = showIssueModal.taskId || '';
    setSaving(true);
    try {
      await updateDoc(doc(db, 'inspections', showIssueModal.id), {
        status: 'issue',
        issueNote: issueNote.trim(),
        taskId: taskId || null,
        lastInspectedBy: inspector,
        lastInspectedAt: now,
      });
      setShowIssueModal(null);
      setIssueNote('');
    } catch (err) {
      console.error('[Inspection] Submit issue failed:', err);
    }
    setSaving(false);
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
    setFormRoomCode(safeText(point.roomCode));
    setFormRoomName(safeText(point.roomName));
    setFormFloor(safeText(point.floor));
    setFormBuilding(safeText(point.buildingId));
    setFormDescription(safeText(point.description));
    setFormCategory(safeText(point.category));
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

  // ─── COMPLETE AREA ───
  const [completing, setCompleting] = useState(false);

  const completeArea = async () => {
    if (!effectiveBuildingFilter || completing) return;
    const inspector = selectedInspector || user?.displayName || 'Unknown';
    const areaPoints = points.filter((p) => p.buildingId === effectiveBuildingFilter);
    if (areaPoints.length === 0) return;

    setCompleting(true);
    try {
      // Batch update — mark all pending checkpoints in this building as 'ok'
      const batch = writeBatch(db);
      const now = Timestamp.now();
      for (const p of areaPoints) {
        if (p.status === 'pending' || p.status === 'missing') {
          batch.update(doc(db, 'inspections', p.id), {
            status: 'ok',
            lastInspectedBy: inspector,
            lastInspectedAt: now,
          });
        }
      }
      await batch.commit();

      // Write master log to inspection_logs
      const issueCount = areaPoints.filter((p) => p.status === 'issue').length;
      await addDoc(collection(db, 'inspection_logs'), {
        areaId: effectiveBuildingFilter,
        areaLabel: buildingLabel(effectiveBuildingFilter),
        timestamp: now,
        inspectorUid: user?.uid || user?.id || '',
        inspectorName: inspector,
        status: issueCount > 0 ? 'issue' : 'ok',
        auditReady: true,
        totalPoints: areaPoints.length,
        okCount: areaPoints.filter((p) => p.status === 'ok').length + areaPoints.filter((p) => p.status === 'pending' || p.status === 'missing').length,
        issueCount,
        issues: areaPoints
          .filter((p) => p.status === 'issue')
          .map((p) => ({ roomCode: p.roomCode, roomName: p.roomName, note: p.issueNote || '' })),
      });
    } catch (err) {
      console.error('[Inspection] Complete area failed:', err);
    }
    setCompleting(false);
  };

  // Can complete: building filter active, has pending points or all reviewed
  const canComplete = effectiveBuildingFilter && !completing && points.some((p) => p.buildingId === effectiveBuildingFilter);

  // ─── PRINT INSPECTION REPORT ───
  const printInspectionReport = () => {
    const now = new Date().toLocaleDateString('cs-CZ');
    const inspector = selectedInspector || user?.displayName || '—';
    const scope = effectiveBuildingFilter
      ? buildingLabel(effectiveBuildingFilter)
      : 'Všechny budovy';
    const data = effectiveBuildingFilter ? points.filter((p) => p.buildingId === effectiveBuildingFilter) : points;
    const okCount = data.filter((p) => p.status === 'ok').length;
    const issueCount = data.filter((p) => p.status === 'issue').length;
    const pendingCount = data.filter((p) => p.status === 'pending' || p.status === 'missing').length;

    const rows = data.map((p) => {
      const st = STATUS_STYLES[p.status] || STATUS_STYLES.pending;
      const inspDate = p.lastInspectedAt
        ? (p.lastInspectedAt.toDate ? p.lastInspectedAt.toDate().toLocaleDateString('cs-CZ') : '')
        : '';
      return `<tr>
        <td>${safeText(p.roomCode)}</td>
        <td>${safeText(p.roomName, 'Bez nazvu')}</td>
        <td>${safeText(p.floor, 'Bez patra')}</td>
        <td>${p.category || '—'}</td>
        <td class="wrap">${safeText(p.description)}</td>
        <td style="font-weight:bold;color:${p.status === 'ok' ? '#16a34a' : p.status === 'issue' ? '#dc2626' : '#d97706'}">${st.label}</td>
        <td class="wrap">${safeText(p.issueNote)}</td>
        <td>${p.lastInspectedBy || '—'}</td>
        <td>${inspDate}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
      <title>Protokol kontroly — ${scope}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 20px; }
        .print-header { text-align: center; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 2px solid #000; }
        .print-header h1 { font-size: 14px; margin: 0; }
        .print-header p { font-size: 10px; color: #475569; margin: 2px 0 0; }
        .summary { display: flex; gap: 16px; margin-bottom: 12px; font-size: 12px; }
        .summary span { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th { background: #f1f5f9; text-align: left; padding: 4px 6px; border: 1px solid #000; font-size: 9px; text-transform: uppercase; }
        td { padding: 3px 6px; border: 1px solid #000; vertical-align: top; }
        td.wrap { max-width: 180px; word-wrap: break-word; white-space: pre-wrap; }
        tr:nth-child(even) { background: #f8fafc; }
        .sign { margin-top: 30px; display: flex; justify-content: space-between; }
        .sign div { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 4px; font-size: 10px; }
        @page { margin: 12mm; size: A4 landscape; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      </style></head><body>
      <div class="print-header">
        <h1>NOMINAL CMMS — Protokol kontroly budov</h1>
        <p>${scope} · Inspektor: ${inspector} · Datum: ${now}</p>
      </div>
      <div class="summary">
        Celkem: <span>${data.length}</span> &nbsp;|&nbsp;
        OK: <span style="color:#16a34a">${okCount}</span> &nbsp;|&nbsp;
        Závady: <span style="color:#dc2626">${issueCount}</span> &nbsp;|&nbsp;
        Čeká: <span style="color:#d97706">${pendingCount}</span>
      </div>
      <table>
        <thead><tr><th>Kód</th><th>Místnost</th><th>Patro</th><th>Kategorie</th><th>Popis</th><th>Stav</th><th>Poznámka</th><th>Inspektor</th><th>Datum</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sign">
        <div>Inspektor: ${inspector}</div>
        <div>Podpis vedoucího</div>
      </div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  };

  // Unique buildings from data
  const activeBuildings = [...new Set(points.map((p) => safeText(p.buildingId)).filter(Boolean))].sort();
  const buildingCounts = activeBuildings.reduce<Record<string, number>>((acc, buildingId) => {
    acc[buildingId] = points.filter((point) => point.buildingId === buildingId).length;
    return acc;
  }, {});
  const scopePoints = effectiveBuildingFilter ? points.filter((point) => point.buildingId === effectiveBuildingFilter) : points;
  const floorOptions = [...new Set(scopePoints.map((p) => safeText(p.floor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const categoryOptions = [...new Set(scopePoints.map((p) => safeText(p.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const activeFilterCount = [
    filterStatus,
    effectiveBuildingFilter,
    filterFloor,
    filterCategory,
    filterTask !== 'all' ? filterTask : null,
    search.trim() ? search.trim() : null,
  ].filter(Boolean).length;
  const clearAllFilters = () => {
    setFilterStatus(null);
    setFilterBuilding(null);
    setFilterFloor(null);
    setFilterCategory(null);
    setFilterTask('all');
    setSearch('');
  };

  return (
    <div className="min-h-screen bg-[#f1ece3]">
      <div className="max-w-4xl mx-auto px-3 pt-4 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => goBack()} className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-900 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-700" />
              Kontroly
            </h1>
            <p className="text-xs text-slate-500">{done}/{points.length} zkontrolováno · {progress}%</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
          <button onClick={printInspectionReport} className="px-3 py-1.5 rounded-lg bg-slate-50 text-[11px] text-slate-400 font-semibold hover:text-slate-900 transition active:scale-95">
            <Printer className="w-3.5 h-3.5 inline mr-1" /> Tisk
          </button>
          {isAdmin && (
            <button onClick={resetAll} className="px-3 py-1.5 rounded-lg bg-slate-50 text-[11px] text-slate-400 font-semibold hover:text-slate-900 transition active:scale-95">
              <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> Reset
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-slate-50 mb-3 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : 'linear-gradient(90deg, #14b8a6, #34d399)' }} />
        </div>

        {/* Inspector selector */}
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-slate-500" />
          <select
            value={selectedInspector}
            onChange={(e) => setSelectedInspector(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:border-teal-500/50 transition appearance-none"
          >
            <option value="">-- Vyberte inspektora --</option>
            {[...new Set([user?.displayName || '', ...employeeNames].filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, 'cs-CZ'))
              .map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <InspectionSummary points={points} />

        {/* Building filter */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Budovy</div>
            {effectiveBuildingFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] text-slate-400 px-2 py-1 rounded-lg bg-slate-50 active:scale-95"
              >
                Zobrazit vše
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {activeBuildings.map((bid) => {
              const active = effectiveBuildingFilter === bid;
              return (
                <button
                  key={bid}
                  type="button"
                  onClick={() => {
                    setFilterBuilding(active ? null : bid);
                    setSearch('');
                  }}
                  className={`min-h-[54px] rounded-xl border px-2 py-2 text-left transition active:scale-[0.98] ${
                    active
                      ? 'bg-orange-500/20 border-orange-400/60 text-orange-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="text-base font-bold leading-none">{bid}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{buildingCounts[bid] || 0} místností</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Napiš D pro budovu D, nebo D 1.25 pro místnost..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-teal-500/50 transition"
          />
        </div>
        {searchScope.buildingId && !filterBuilding && (
          <div className="mb-3 rounded-xl bg-orange-500/10 border border-orange-500/25 px-3 py-2 text-xs text-orange-700">
            Zobrazuji {buildingLabel(searchScope.buildingId)}
            {searchScope.roomQuery ? `, hledám "${searchScope.roomQuery}"` : ''}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-1.5 mb-2 overflow-x-auto">
          <FilterChip label="Vše" active={!filterStatus} onClick={() => setFilterStatus(null)} color="#94a3b8" />
          <FilterChip label="Čeká" active={filterStatus === 'pending'} onClick={() => setFilterStatus(filterStatus === 'pending' ? null : 'pending')} color="#fbbf24" />
          <FilterChip label="OK" active={filterStatus === 'ok'} onClick={() => setFilterStatus(filterStatus === 'ok' ? null : 'ok')} color="#34d399" />
          <FilterChip label="Závady" active={filterStatus === 'issue'} onClick={() => setFilterStatus(filterStatus === 'issue' ? null : 'issue')} color="#f87171" />
        </div>
        <div className="flex gap-1.5 mb-2 overflow-x-auto">
          <FilterChip label="Budovy: vše" active={!effectiveBuildingFilter} onClick={() => { setFilterBuilding(null); setSearch(''); }} color="#94a3b8" />
          {activeBuildings.map((bid) => (
            <FilterChip key={bid} label={`Budova ${bid}`} active={effectiveBuildingFilter === bid} onClick={() => { setFilterBuilding(effectiveBuildingFilter === bid ? null : bid); setSearch(''); }} color="#f97316" />
          ))}
        </div>
        {floorOptions.length > 0 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto">
            <FilterChip label="Patro: vše" active={!filterFloor} onClick={() => setFilterFloor(null)} color="#94a3b8" />
            {floorOptions.map((floor) => (
              <FilterChip key={floor} label={floor} active={filterFloor === floor} onClick={() => setFilterFloor(filterFloor === floor ? null : floor)} color="#38bdf8" />
            ))}
          </div>
        )}
        {categoryOptions.length > 0 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto">
            <FilterChip label="Kategorie: vše" active={!filterCategory} onClick={() => setFilterCategory(null)} color="#94a3b8" />
            {categoryOptions.map((category) => (
              <FilterChip key={category} label={category} active={filterCategory === category} onClick={() => setFilterCategory(filterCategory === category ? null : category)} color="#a78bfa" />
            ))}
          </div>
        )}
        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          <FilterChip label="Úkol: vše" active={filterTask === 'all'} onClick={() => setFilterTask('all')} color="#94a3b8" />
          <FilterChip label="S úkolem" active={filterTask === 'with_task'} onClick={() => setFilterTask(filterTask === 'with_task' ? 'all' : 'with_task')} color="#f59e0b" />
          <FilterChip label="Závada bez úkolu" active={filterTask === 'without_task'} onClick={() => setFilterTask(filterTask === 'without_task' ? 'all' : 'without_task')} color="#ef4444" />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold flex-shrink-0 bg-slate-50 border border-slate-200 text-slate-600 active:scale-95"
            >
              Vyčistit ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Complete Area — shown when building filter is active */}
        {canComplete && (
          <button
            onClick={completeArea}
            disabled={completing}
            className="w-full py-4 mb-4 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-base font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-teal-500/25 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {completing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ClipboardCheck className="w-5 h-5" />
            )}
            {completing ? 'Ukládám...' : `Hotovo — Uzavřít budovu ${effectiveBuildingFilter}`}
          </button>
        )}

        {/* Cards grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="vik-card p-4 space-y-3">
                <Skeleton height="h-5" width="w-2/3" />
                <Skeleton height="h-4" />
                <Skeleton height="h-4" width="w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12" />}
            title="Žádné kontrolní body"
            subtitle={activeFilterCount > 0 ? 'Zkus vyčistit nebo změnit filtr' : 'Přidej první kontrolní bod'}
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
                onOpenTask={() => navigate(`/tasks?task=${point.taskId}`)}
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
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <div className="text-[11px] text-slate-500">{showIssueModal.roomCode} · {showIssueModal.floor}</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">{showIssueModal.roomName}</div>
              <div className="text-[12px] text-slate-400 mt-1">{showIssueModal.description}</div>
            </div>
            <FormField label="Popis závady" value={issueNote} onChange={setIssueNote} type="textarea" placeholder="Co je špatně?" required />
            {showIssueModal.taskId ? (
              <button
                type="button"
                onClick={() => navigate(`/tasks?task=${showIssueModal.taskId}`)}
                className="w-full mb-3 py-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 text-sm font-bold flex items-center justify-center gap-2 active:scale-95"
              >
                <ClipboardList className="w-4 h-4" />
                Úkol už je založený - otevřít
              </button>
            ) : (
              <div className="w-full mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-900">
                Závada se uloží do kontroly. Úkol vznikne až při uzavření kontroly.
              </div>
            )}
            <SubmitButton label="Nahlásit závadu" onClick={submitIssue} loading={saving} color="red" />
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
              <p className="text-sm text-slate-900 font-semibold">{showDeleteConfirm.roomCode} — {showDeleteConfirm.roomName}</p>
              <p className="text-xs text-slate-400 mt-1">{showDeleteConfirm.description}</p>
              <p className="text-xs text-red-700 mt-2">Tato akce je nevratná!</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowDeleteConfirm(null)} className="py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-sm font-semibold active:scale-95 transition">
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
