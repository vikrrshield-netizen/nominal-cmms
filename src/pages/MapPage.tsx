// src/pages/MapPage.tsx
// VIKRR — Asset Shield — Mapa areálu (v25 - SVG floor plan for building D)
// Sekce místností → karty strojů v gridu (jako údržba v24)
// Budova D → interaktivní SVG půdorys 2.NP

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ArrowLeft,
  Loader2,
  ChevronRight,
  Wrench,
  AlertTriangle,
  Search,
  Inbox,
  Layers,
  Plus,
  Truck,
  Edit2,
  Save,
  FileText,
  Building2,
  Camera,
  Bug,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { createTask } from '../services/taskService';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';
import { showToast } from '../components/ui/Toast';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import { usePestControl } from '../hooks/usePestControl';
import {
  EntityCardFull,
  type Entity,
  type Blueprint,
  type EntityLogEntry,
} from '../components/EntityCard';
import EntityModal, { type EntityModalData, type BreadcrumbItem } from '../components/EntityModal';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════
interface Asset {
  id: string;
  name: string;
  code?: string;
  status: string;
  buildingId: string;
  floor?: string;
  areaName?: string;
  category?: string;
  controlPoints?: string[];
  parentId?: string;
  isDeleted?: boolean;
}

// ═══════════════════════════════════════════════
// BUILDING CONFIG
// ═══════════════════════════════════════════════
const BUILDING_META: Record<string, { name: string; color: string; order: number }> = {
  'A': { name: 'Administrativa', color: '#6366f1', order: 1 },
  'B': { name: 'Spojovací krček', color: '#8b5cf6', order: 2 },
  'C': { name: 'Zázemí & Vedení', color: '#a855f7', order: 3 },
  'D': { name: 'Výrobní hala', color: '#f97316', order: 4 },
  'E': { name: 'Dílna & Sklad ND', color: '#10b981', order: 5 },
  'L': { name: 'Loupárna', color: '#eab308', order: 6 },
};

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string }> = {
  operational: { dot: 'bg-emerald-400', label: 'V provozu', color: '#34d399' },
  maintenance: { dot: 'bg-amber-400 animate-pulse', label: 'Údržba', color: '#fbbf24' },
  breakdown: { dot: 'bg-red-400 animate-pulse', label: 'Porucha', color: '#f87171' },
  sanitation: { dot: 'bg-blue-400', label: 'Sanitace', color: '#60a5fa' },
  planned_downtime: { dot: 'bg-orange-400', label: 'Plán. odstávka', color: '#fb923c' },
  idle: { dot: 'bg-slate-400', label: 'Nečinný', color: '#94a3b8' },
  offline: { dot: 'bg-slate-600', label: 'Offline', color: '#475569' },
};

// ═══════════════════════════════════════════════
// DRILL-DOWN LEVEL (Building > Room > Folder > Asset)
// ═══════════════════════════════════════════════
type DrillLevel = 'buildings' | 'rooms' | 'machines' | 'folder';

// ═══════════════════════════════════════════════
// ASSET FOLDERS (iPhone-style grouping)
// ═══════════════════════════════════════════════
interface FolderGroup {
  id: string;
  name: string;
  icon: string;
  assets: Asset[];
  worstStatus: string;
}

const FOLDER_CONFIG: Record<string, { label: string; icon: string }> = {
  'extruder':    { label: 'Extrudery',       icon: '🏭' },
  'mixer':       { label: 'Míchačky',        icon: '🔄' },
  'packaging':   { label: 'Balicí linky',    icon: '📦' },
  'oven':        { label: 'Pece & Sušárny',  icon: '🔥' },
  'conveyor':    { label: 'Dopravníky',      icon: '➡️' },
  'forklift':    { label: 'VZV',             icon: '🚜' },
  'compressor':  { label: 'Kompresory',      icon: '💨' },
  'hvac':        { label: 'Vzduchotechnika', icon: '🌬️' },
  'pump':        { label: 'Čerpadla',        icon: '💧' },
  'electrical':  { label: 'Elektro',         icon: '⚡' },
  'peeling':     { label: 'Loupací linka',   icon: '🌾' },
  'silo':        { label: 'Sila',            icon: '🗼' },
  'cleaning':    { label: 'Čistění',         icon: '🧹' },
  'cooling':     { label: 'Chlazení',        icon: '❄️' },
  'pest_trap':   { label: 'Hmyzolapače',     icon: '🪲' },
  'waste_bin':   { label: 'Popelnice',       icon: '🗑️' },
};

function getWorstStatus(assets: Asset[]): string {
  if (assets.some((a) => a.status === 'breakdown')) return 'breakdown';
  if (assets.some((a) => a.status === 'maintenance')) return 'maintenance';
  if (assets.some((a) => a.status === 'planned_downtime')) return 'planned_downtime';
  if (assets.some((a) => a.status === 'sanitation')) return 'sanitation';
  if (assets.some((a) => a.status === 'operational')) return 'operational';
  return 'idle';
}

function buildFolders(roomAssets: Asset[]): { folders: FolderGroup[]; ungrouped: Asset[] } {
  const catMap = new Map<string, Asset[]>();
  const ungrouped: Asset[] = [];

  roomAssets.forEach((asset) => {
    const cat = asset.category;
    if (!cat) { ungrouped.push(asset); return; }
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(asset);
  });

  const folders: FolderGroup[] = [];
  catMap.forEach((assets, catId) => {
    if (assets.length >= 2) {
      const cfg = FOLDER_CONFIG[catId] || { label: catId, icon: '📁' };
      folders.push({
        id: catId,
        name: cfg.label,
        icon: cfg.icon,
        assets: assets.sort((a, b) => a.name.localeCompare(b.name, 'cs')),
        worstStatus: getWorstStatus(assets),
      });
    } else {
      ungrouped.push(...assets);
    }
  });

  folders.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  return { folders, ungrouped };
}

// ═══════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════
function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'assets'), where('isDeleted', '==', false)),
      (snap) => {
        setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Asset)));
        setLoading(false);
      },
      (err) => {
        console.error('[MapPage] Firestore error:', err);
        setAssets([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { assets, loading };
}

// ═══════════════════════════════════════════════
// GROUP: by building → room
// ═══════════════════════════════════════════════
interface RoomGroup {
  name: string;
  floor: string;
  assets: Asset[];
  issueCount: number;
}

interface BuildingGroup {
  id: string;
  name: string;
  color: string;
  rooms: RoomGroup[];
  totalAssets: number;
  issueCount: number;
}

function useGroupedData(assets: Asset[], selectedBuilding: string | null) {
  return useMemo(() => {
    const buildingMap = new Map<string, BuildingGroup>();

    // Seed known buildings from BUILDING_META
    Object.entries(BUILDING_META).forEach(([id, meta]) => {
      buildingMap.set(id, {
        id,
        name: meta.name,
        color: meta.color,
        rooms: [],
        totalAssets: 0,
        issueCount: 0,
      });
    });

    // Dynamic color palette for buildings not in BUILDING_META
    const DYNAMIC_COLORS = ['#ec4899', '#14b8a6', '#f43f5e', '#06b6d4', '#84cc16', '#d946ef'];
    let dynamicIdx = 0;

    const roomMap = new Map<string, Map<string, Asset[]>>();
    assets.forEach((asset) => {
      const bid = asset.buildingId || '?';

      // Ensure dynamic buildings get a BuildingGroup entry
      if (!buildingMap.has(bid)) {
        buildingMap.set(bid, {
          id: bid,
          name: bid,
          color: DYNAMIC_COLORS[dynamicIdx++ % DYNAMIC_COLORS.length],
          rooms: [],
          totalAssets: 0,
          issueCount: 0,
        });
      }

      if (!roomMap.has(bid)) roomMap.set(bid, new Map());
      const rooms = roomMap.get(bid)!;
      const roomKey = asset.areaName || 'Ostatní';
      if (!rooms.has(roomKey)) rooms.set(roomKey, []);
      rooms.get(roomKey)!.push(asset);
    });

    roomMap.forEach((rooms, bid) => {
      const building = buildingMap.get(bid)!;

      rooms.forEach((roomAssets, roomName) => {
        const issues = roomAssets.filter(
          (a) => a.status === 'breakdown' || a.status === 'maintenance'
        ).length;
        building.rooms.push({
          name: roomName,
          floor: roomAssets[0]?.floor || '1.NP',
          assets: roomAssets.sort((a, b) => a.name.localeCompare(b.name, 'cs')),
          issueCount: issues,
        });
        building.totalAssets += roomAssets.length;
        building.issueCount += issues;
      });

      building.rooms.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    });

    const buildings = Array.from(buildingMap.values())
      .filter((b) => b.totalAssets > 0)
      .sort((a, b) => (BUILDING_META[a.id]?.order ?? 99) - (BUILDING_META[b.id]?.order ?? 99));

    const selectedRooms = selectedBuilding
      ? buildingMap.get(selectedBuilding)?.rooms || []
      : buildings.flatMap((b) =>
          b.rooms.map((r) => ({ ...r, buildingId: b.id, buildingColor: b.color }))
        );

    return { buildings, selectedRooms };
  }, [assets, selectedBuilding]);
}

// ═══════════════════════════════════════════════
// MACHINE CARD — v24 style, dark design
// ═══════════════════════════════════════════════
function MachineCard({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.idle;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-3 rounded-xl border bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] transition-all active:scale-[0.96] cursor-pointer text-center min-h-[80px]"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />
        <span className="text-[13px] font-semibold text-white leading-tight">{asset.name}</span>
      </div>
      {asset.code && <span className="text-[10px] text-slate-500 mt-0.5">{asset.code}</span>}
      <span className="text-[11px] mt-1.5 font-medium" style={{ color: st.color }}>
        Karta
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════
// FOLDER TILE — iPhone-style category grouping
// ═══════════════════════════════════════════════
function FolderTile({ folder, onClick }: { folder: FolderGroup; onClick: () => void }) {
  const st = STATUS_CONFIG[folder.worstStatus] || STATUS_CONFIG.idle;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 rounded-2xl border bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] transition-all active:scale-[0.96] cursor-pointer text-center min-h-[100px] relative"
    >
      <div className={`absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full ${st.dot}`} />
      <span className="text-3xl mb-1.5">{folder.icon}</span>
      <span className="text-[13px] font-semibold text-white leading-tight">{folder.name}</span>
      <span className="text-[11px] text-slate-500 mt-1">{folder.assets.length} strojů</span>
    </button>
  );
}

// ═══════════════════════════════════════════════
// ROOM TILE — drill-down level 2 (iPhone tile)
// ═══════════════════════════════════════════════
function RoomTile({ room, color, onClick, code, canManage, onEdit, onDelete }: {
  room: RoomGroup; color: string; onClick: () => void; code: string;
  canManage?: boolean; onEdit?: () => void; onDelete?: () => void;
}) {
  const roomWorst = getWorstStatus(room.assets);
  const roomSt = STATUS_CONFIG[roomWorst] || STATUS_CONFIG.idle;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="w-full flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-[0.96] cursor-pointer text-center min-h-[110px] relative bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40"
      >
        <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${roomSt.dot}`} />
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-1.5"
          style={{ background: `${color}20` }}
        >
          <Layers className="w-6 h-6" style={{ color }} />
        </div>
        <span className="text-[13px] font-semibold text-white leading-tight">{room.name}</span>
        <span className="text-[10px] font-mono text-slate-500 mt-0.5">{code}</span>
        <span className="text-[11px] text-slate-500 mt-0.5">{room.assets.length} strojů</span>
        {room.issueCount > 0 && (
          <span className="text-[11px] text-red-400 mt-0.5">{room.issueCount} problémů</span>
        )}
      </button>
      {/* Edit/Delete overlay — visible on hover for users with asset.delete permission */}
      {canManage && (
        <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="w-7 h-7 rounded-lg bg-amber-500/80 text-white flex items-center justify-center hover:bg-amber-500 transition"
              title="Přejmenovat místnost"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500 transition"
              title="Smazat místnost"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// WASTE PANEL — Loupárna odpadový semafor
// ═══════════════════════════════════════════════
const WASTE_ITEMS = [
  { id: 'paper', label: 'Papír', icon: '📄' },
  { id: 'plastic', label: 'Plast', icon: '🧴' },
  { id: 'nonconforming', label: 'Neshodný produkt', icon: '❌' },
  { id: 'container', label: 'Kontejner', icon: '📦' },
];

function WastePanel({ wasteStatus, setWasteStatus }: { wasteStatus: Record<string, boolean>; setWasteStatus: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const { user } = useAuthContext();
  const [plevyStatus, setPlevyStatus] = useState<'ok' | 'pending'>('ok');
  const [saving, setSaving] = useState(false);

  const toggleFull = (id: string) => {
    const next = !wasteStatus[id];
    setWasteStatus(prev => ({ ...prev, [id]: next }));
    const item = WASTE_ITEMS.find(w => w.id === id);
    showToast(next ? `${item?.label || id} — plný stav` : `${item?.label || id} — prázdný`, next ? 'error' : 'success');
  };

  const handleVyvezPlevy = async () => {
    setSaving(true);
    try {
      await createTask({
        title: 'Vyvézt plevy — Loupárna',
        description: 'Urgentní odvoz plevů z Loupárny. Vůz je plný.',
        priority: 'P2',
        type: 'corrective',
        source: 'web',
        buildingId: 'L',
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      setPlevyStatus('pending');
      showToast('Úkol na odvoz plevů vytvořen', 'success');
    } catch (err) {
      console.error('[WastePanel]', err);
      showToast('Chyba při vytváření úkolu', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30 mb-4">
      <h3 className="text-xs text-slate-500 uppercase font-bold mb-3 flex items-center gap-2">
        <Truck className="w-4 h-4" />
        Správa odpadů — Loupárna
      </h3>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {WASTE_ITEMS.map((w) => {
          const isFull = wasteStatus[w.id] || false;
          return (
            <div
              key={w.id}
              className={`rounded-xl p-3 border transition ${
                isFull
                  ? 'bg-red-500/15 border-red-500/30'
                  : 'bg-emerald-500/10 border-emerald-500/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{w.icon}</span>
                <span className="text-sm font-medium text-white">{w.label}</span>
                <div className={`w-3 h-3 rounded-full ml-auto ${isFull ? 'bg-red-500' : 'bg-emerald-500'}`} />
              </div>
              <button
                onClick={() => toggleFull(w.id)}
                className={`w-full py-1.5 rounded-lg text-xs font-bold transition ${
                  isFull
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
              >
                {isFull ? 'Označit prázdný' : 'Plný stav'}
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleVyvezPlevy}
        disabled={saving || plevyStatus === 'pending'}
        className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-[0.97] ${
          plevyStatus === 'pending'
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            : 'bg-yellow-600 text-white hover:bg-yellow-500'
        }`}
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : plevyStatus === 'pending' ? (
          '⏳ Čeká na odvoz'
        ) : (
          <>🌾 Vyvézt plevy</>
        )}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MACHINE BLUEPRINT (hardcoded for demo — Matryoshka)
// ═══════════════════════════════════════════════
const MACHINE_BLUEPRINT: Blueprint = {
  type: 'machine',
  label: 'Stroj',
  icon: 'Wrench',
  color: '#f97316',
  fields: [
    { key: 'code', label: 'Inventární kód', type: 'text', required: true },
    { key: 'building', label: 'Budova', type: 'text', required: true },
    { key: 'area', label: 'Místnost', type: 'text', required: false },
    { key: 'category', label: 'Kategorie', type: 'text', required: false },
    { key: 'next_revision', label: 'Příští revize', type: 'date', required: false,
      alert: { warningDays: 30, criticalDays: 7 } },
    { key: 'motor_hours', label: 'Motohodiny', type: 'number', required: false,
      unit: 'Mth', alert: { maxValue: 5000 } },
  ],
};

// Demo data for enhanced detail
const DEMO_REVISION_DATES: Record<string, string> = {
  'EXT-001': '2026-03-25',
  'MIX-001': '2026-06-10',
  'BAL-001': '2026-04-18',
  'PEC-001': '2026-02-28',
};
const DEMO_MOTOR_HOURS: Record<string, number> = {
  'EXT-001': 4200,
  'MIX-001': 1850,
  'BAL-001': 3100,
  'PEC-001': 4800,
};

function assetToEntity(asset: Asset): Entity {
  const code = asset.code || '';
  return {
    id: asset.id,
    parentId: null,
    type: 'machine',
    blueprintId: 'blueprint_machine',
    name: asset.name,
    code,
    status: asset.status === 'operational' ? 'operational'
      : asset.status === 'maintenance' ? 'warning'
      : asset.status === 'breakdown' ? 'critical' : 'inactive',
    data: {
      code,
      building: BUILDING_META[asset.buildingId]?.name || asset.buildingId,
      area: asset.areaName || '',
      category: asset.category || '',
      next_revision: DEMO_REVISION_DATES[code] || '2026-07-01',
      motor_hours: DEMO_MOTOR_HOURS[code] || 1200,
    },
    tags: [],
    createdAt: null,
    updatedAt: null,
    createdBy: '',
    isDeleted: false,
  };
}

const DEMO_MACHINE_LOGS: EntityLogEntry[] = [
  {
    id: 'mlog1', entityId: '', userId: 'demo', userInitials: 'VD',
    type: 'maintenance', text: 'Výměna ložisek hlavního motoru — vibrace eliminovány',
    createdAt: new Date('2026-02-14T09:30:00'),
  },
  {
    id: 'mlog2', entityId: '', userId: 'demo', userInitials: 'FN',
    type: 'inspection', text: 'Pravidelná kontrola OK — teplota, vibrace, olej v normě',
    createdAt: new Date('2026-02-10T07:00:00'),
  },
  {
    id: 'mlog3', entityId: '', userId: 'demo', userInitials: 'ZM',
    type: 'note', text: 'Objednat náhradní řemen — dodací lhůta 3 týdny',
    createdAt: new Date('2026-02-05T11:15:00'),
  },
];

// ═══════════════════════════════════════════════
// ASSET DETAIL SHEET — Matryoshka EntityCard style
// ═══════════════════════════════════════════════
function AssetDetailSheet({ asset, onClose, onCreateTask, onReport, onDelete, onOpenPassport, canManage, allAssets, onSelectAsset }: {
  asset: Asset;
  onClose: () => void;
  onCreateTask: (asset: Asset) => Promise<void>;
  onReport: (asset: Asset) => Promise<void>;
  onDelete?: (asset: Asset) => void;
  onOpenPassport?: (asset: Asset) => void;
  canManage?: boolean;
  allAssets?: Asset[];
  onSelectAsset?: (asset: Asset) => void;
}) {
  const entity = useMemo(() => assetToEntity(asset), [asset]);
  const logs = useMemo(() => DEMO_MACHINE_LOGS.map((l) => ({ ...l, entityId: asset.id })), [asset.id]);
  const [actionLoading, setActionLoading] = useState<'report' | 'task' | 'pest' | 'empty' | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { user: sheetUser } = useAuthContext();

  // ── Inline editing ──
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(asset.name);
  const [editStatus, setEditStatus] = useState(asset.status);
  const [editRoom, setEditRoom] = useState(asset.areaName || '');
  const [editSaving, setEditSaving] = useState(false);

  // Reset edit state when asset changes (prevents stale data)
  useEffect(() => {
    setEditName(asset.name);
    setEditStatus(asset.status);
    setEditRoom(asset.areaName || '');
    setIsEditing(false);
  }, [asset.id]);

  const roomOptions = useMemo(() => {
    if (!allAssets) return [];
    return Array.from(new Set(
      allAssets.filter(a => a.buildingId === asset.buildingId).map(a => a.areaName || 'Ostatní')
    ));
  }, [allAssets, asset.buildingId]);

  // ── Children (sub-assets) ──
  const children = useMemo(() => {
    if (!allAssets) return [];
    return allAssets.filter(a => a.parentId === asset.id);
  }, [allAssets, asset.id]);

  const parentAsset = useMemo(() => {
    if (!allAssets || !asset.parentId) return null;
    return allAssets.find(a => a.id === asset.parentId) || null;
  }, [allAssets, asset.parentId]);

  // ── Add sub-asset form ──
  const [showSubForm, setShowSubForm] = useState(false);
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  const handleAddSubAsset = async () => {
    if (!subName.trim()) return;
    setSubSaving(true);
    try {
      await addDoc(collection(db, 'assets'), {
        name: subName.trim(),
        code: subCode.trim() || '',
        buildingId: asset.buildingId,
        areaName: asset.areaName || 'Ostatní',
        status: 'operational',
        category: asset.category || '',
        parentId: asset.id,
        isDeleted: false,
        createdById: sheetUser?.uid || 'unknown',
        createdByName: sheetUser?.displayName || 'Neznámý',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Podzařízení "${subName.trim()}" přidáno`, 'success');
      setSubName('');
      setSubCode('');
      setShowSubForm(false);
    } catch {
      showToast('Chyba při vytváření', 'error');
    }
    setSubSaving(false);
  };

  const handleInlineSave = async () => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'assets', asset.id), {
        name: editName.trim(),
        status: editStatus,
        areaName: editRoom.trim() || 'Ostatní',
        updatedAt: serverTimestamp(),
      });
      showToast('Změny uloženy', 'success');
      setIsEditing(false);
    } catch {
      showToast('Chyba při ukládání', 'error');
    }
    setEditSaving(false);
  };

  // Pest control hook — only active for pest_trap assets
  const isPestTrap = asset.category === 'pest_trap';
  const isWasteBin = asset.category === 'waste_bin';
  const pestControl = usePestControl(isPestTrap ? asset.id : null);
  const [pestCount, setPestCount] = useState('');
  const [pestNote, setPestNote] = useState('');
  const [showPestForm, setShowPestForm] = useState(false);

  const handleAction = async (type: 'report' | 'task') => {
    setActionLoading(type);
    setActionResult(null);
    try {
      if (type === 'report') {
        await onReport(asset);
      } else {
        await onCreateTask(asset);
      }
      setActionResult({ type: 'success', text: type === 'report' ? 'Porucha nahlášena (P1)' : 'Úkol vytvořen (P3)' });
      showToast(type === 'report' ? 'Porucha nahlášena' : 'Úkol vytvořen', 'success');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setActionResult({ type: 'error', text: `Chyba: ${(err as Error).message}` });
      showToast('Akce se nezdařila', 'error');
    }
    setActionLoading(null);
  };

  // Pest log submission
  const handlePestSubmit = async () => {
    const count = parseInt(pestCount, 10);
    if (isNaN(count) || count < 0) return;
    setActionLoading('pest');
    try {
      // Check for photo file input
      const fileInput = document.getElementById('pest-photo-input') as HTMLInputElement | null;
      const photoFile = fileInput?.files?.[0] || undefined;
      const result = await pestControl.addPestLog(count, photoFile, pestNote);
      const msg = result?.isCritical
        ? `Kritický stav! ${count} kusů — úkol vytvořen`
        : `Záznam uložen: ${count} kusů`;
      showToast(msg, result?.isCritical ? 'error' : 'success');
      setPestCount('');
      setPestNote('');
      setShowPestForm(false);
      if (fileInput) fileInput.value = '';
    } catch (err) {
      showToast('Chyba při ukládání záznamu', 'error');
    }
    setActionLoading(null);
  };

  // Quick Empty for waste bins — update asset + log to history
  const handleQuickEmpty = async () => {
    setActionLoading('empty');
    try {
      // Update asset status
      await updateDoc(doc(db, 'assets', asset.id), {
        lastEmptiedAt: serverTimestamp(),
        status: 'operational',
        updatedAt: serverTimestamp(),
      });
      // Log to empty_logs sub-collection for history
      await addDoc(collection(db, 'assets', asset.id, 'empty_logs'), {
        emptiedBy: sheetUser?.displayName || 'Neznámý',
        emptiedAt: serverTimestamp(),
        createdById: sheetUser?.uid || '',
        createdByName: sheetUser?.displayName || 'Neznámý',
      });
      showToast(`${asset.name} — označen jako vyvezený`, 'success');
      setTimeout(() => onClose(), 800);
    } catch (err) {
      showToast('Chyba při označování', 'error');
    }
    setActionLoading(null);
  };

  return (
    <BottomSheet
      title={asset.name}
      isOpen={true}
      onClose={onClose}
      titleActions={canManage ? (
        <>
          {isEditing ? (
            <button
              onClick={handleInlineSave}
              disabled={editSaving || !editName.trim()}
              className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 transition disabled:opacity-50"
              title="Uložit"
            >
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 hover:bg-amber-500/30 transition"
              title="Upravit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {!isEditing && onDelete && (
            <button
              onClick={() => onDelete(asset)}
              className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition"
              title="Smazat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </>
      ) : undefined}
    >
      {/* Inline edit form */}
      {isEditing && (
        <div className="mb-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Název</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Stav</label>
            <div className="flex gap-1.5">
              {([
                { value: 'operational', label: 'V provozu', active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' },
                { value: 'maintenance', label: 'Údržba', active: 'bg-amber-500/20 border-amber-500/40 text-amber-400' },
                { value: 'breakdown', label: 'Porucha', active: 'bg-red-500/20 border-red-500/40 text-red-400' },
              ] as const).map((s) => (
                <button
                  key={s.value}
                  onClick={() => setEditStatus(s.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition ${
                    editStatus === s.value ? s.active : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {roomOptions.length > 0 && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Místnost</label>
              <select
                value={editRoom}
                onChange={(e) => setEditRoom(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 transition"
                style={{ appearance: 'auto' }}
              >
                {roomOptions.map((r) => (
                  <option key={r} value={r} className="bg-slate-800">{r}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <EntityCardFull
        entity={entity}
        blueprint={MACHINE_BLUEPRINT}
        logs={logs}
      />

      {/* Control points */}
      {asset.controlPoints && asset.controlPoints.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-bold">
            Kontrolní body
          </div>
          <div className="flex flex-wrap gap-1.5">
            {asset.controlPoints.map((cp, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 text-[12px] text-slate-300 border border-white/10">
                {cp}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ PEST TRAP SECTION ═══ */}
      {isPestTrap && (
        <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bug className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-amber-300">Hmyzolapač</span>
            {pestControl.isCritical && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold animate-pulse">KRITICKÝ</span>
            )}
          </div>

          {/* Latest count */}
          {pestControl.latestLog && (
            <div className="flex items-center gap-3 mb-3 bg-white/5 rounded-xl p-3">
              <div className="text-center">
                <div className={`text-2xl font-bold ${pestControl.isCritical ? 'text-red-400' : 'text-amber-300'}`}>
                  {pestControl.latestLog.count}
                </div>
                <div className="text-[10px] text-slate-500">kusů</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-400">Poslední kontrola</div>
                <div className="text-sm text-white">
                  {pestControl.latestLog.loggedAt?.toDate?.()?.toLocaleDateString('cs-CZ') || '—'}
                </div>
                {pestControl.latestLog.note && (
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{pestControl.latestLog.note}</div>
                )}
              </div>
              {pestControl.latestLog.photoUrl && (
                <img src={pestControl.latestLog.photoUrl} alt="foto" className="w-12 h-12 rounded-lg object-cover" />
              )}
            </div>
          )}

          {/* Pest log form */}
          {showPestForm ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Počet hmyzu</label>
                <input
                  type="number"
                  min="0"
                  value={pestCount}
                  onChange={(e) => setPestCount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Foto (volitelné)</label>
                <input
                  id="pest-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-500/20 file:text-amber-400 hover:file:bg-amber-500/30"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Poznámka</label>
                <input
                  type="text"
                  value={pestNote}
                  onChange={(e) => setPestNote(e.target.value)}
                  placeholder="Stav lapáku, komentář..."
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPestForm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-semibold"
                >
                  Zrušit
                </button>
                <button
                  onClick={handlePestSubmit}
                  disabled={actionLoading === 'pest' || !pestCount}
                  className="flex-[2] py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading === 'pest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  Uložit kontrolu
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPestForm(true)}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Insect Check
            </button>
          )}

          {/* History (last 5) */}
          {pestControl.logs.length > 1 && (
            <div className="mt-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Historie</div>
              <div className="space-y-1">
                {pestControl.logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${log.isCritical ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className="text-slate-400">{log.loggedAt?.toDate?.()?.toLocaleDateString('cs-CZ') || '—'}</span>
                    <span className={`font-bold ${log.isCritical ? 'text-red-400' : 'text-white'}`}>{log.count} ks</span>
                    {log.note && <span className="text-slate-500 truncate">{log.note}</span>}
                    {log.photoUrl && <span className="text-blue-400">📷</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ WASTE BIN SECTION ═══ */}
      {isWasteBin && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-emerald-300">Popelnice / Kontejner</span>
          </div>
          <button
            onClick={handleQuickEmpty}
            disabled={actionLoading === 'empty'}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {actionLoading === 'empty' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Quick Empty — Vyvezeno
          </button>
        </div>
      )}

      {/* ═══ PARENT LINK ═══ */}
      {parentAsset && onSelectAsset && (
        <div className="mt-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1.5 font-bold">Nadřazené zařízení</div>
          <button
            onClick={() => onSelectAsset(parentAsset)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition text-left"
          >
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${(STATUS_CONFIG[parentAsset.status] || STATUS_CONFIG.idle).dot}`} />
            <span className="text-sm text-white font-medium truncate">{parentAsset.name}</span>
            {parentAsset.code && <span className="text-[10px] text-slate-500 font-mono ml-auto">{parentAsset.code}</span>}
          </button>
        </div>
      )}

      {/* ═══ CHILDREN (SUB-ASSETS) ═══ */}
      {(children.length > 0 || canManage) && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">
              Podzařízení {children.length > 0 && <span className="text-slate-600">({children.length})</span>}
            </div>
            {canManage && !showSubForm && (
              <button
                onClick={() => setShowSubForm(true)}
                className="text-[11px] text-orange-400 font-semibold hover:text-orange-300 transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Přidat
              </button>
            )}
          </div>

          {/* Sub-asset inline form */}
          {showSubForm && (
            <div className="mb-2 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 space-y-2">
              <input
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Název podzařízení"
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-500/50 transition"
              />
              <input
                type="text"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="Kód (volitelně)"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-500/50 transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowSubForm(false); setSubName(''); setSubCode(''); }}
                  className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleAddSubAsset}
                  disabled={subSaving || !subName.trim()}
                  className="flex-[2] py-2 rounded-lg bg-orange-600 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {subSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Přidat
                </button>
              </div>
            </div>
          )}

          {/* Children list */}
          {children.length > 0 && (
            <div className="space-y-1">
              {children.map((child) => {
                const cst = STATUS_CONFIG[child.status] || STATUS_CONFIG.idle;
                return (
                  <button
                    key={child.id}
                    onClick={() => onSelectAsset?.(child)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition text-left"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cst.dot}`} />
                    <span className="text-sm text-white font-medium truncate">{child.name}</span>
                    {child.code && <span className="text-[10px] text-slate-500 font-mono ml-auto">{child.code}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Action result feedback */}
      {actionResult && (
        <div className={`mt-3 p-3 rounded-xl text-sm font-semibold text-center ${
          actionResult.type === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/20 border border-red-500/30 text-red-400'
        }`}>
          {actionResult.type === 'success' ? '✅ ' : '❌ '}{actionResult.text}
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          onClick={(e) => { e.stopPropagation(); handleAction('report'); }}
          disabled={actionLoading !== null}
          className="py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
        >
          {actionLoading === 'report' ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          Nahlásit
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleAction('task'); }}
          disabled={actionLoading !== null}
          className="py-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
        >
          {actionLoading === 'task' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          Úkol
        </button>
        {onOpenPassport && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPassport(asset); }}
            className="col-span-2 py-3 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2 min-h-[48px]"
          >
            <FileText className="w-4 h-4" />
            Pasport
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════
// SUMMARY BAR
// ═══════════════════════════════════════════════
function SummaryBar({ assets }: { assets: Asset[] }) {
  const total = assets.length;
  const ok = assets.filter((a) => a.status === 'operational').length;
  const issues = assets.filter((a) => a.status === 'breakdown').length;
  const maint = assets.filter((a) => a.status === 'maintenance').length;

  return (
    <div className="grid grid-cols-4 gap-1.5 mb-4">
      {[
        { value: total, label: 'Celkem', color: '#94a3b8' },
        { value: ok, label: 'OK', color: '#34d399' },
        { value: maint, label: 'Údržba', color: '#fbbf24' },
        { value: issues, label: 'Porucha', color: '#f87171' },
      ].map((s) => (
        <div
          key={s.label}
          className="text-center py-2 px-1 rounded-xl"
          style={{ background: `${s.color}10`, border: `1px solid ${s.color}15` }}
        >
          <div className="text-lg font-bold" style={{ color: s.color }}>
            {s.value}
          </div>
          <div className="text-[10px] text-slate-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// GLOBAL SEARCH RESULTS
// ═══════════════════════════════════════════════
function GlobalSearchResults({ assets, buildings, search, onSelectAsset, onSelectRoom, onSelectBuilding }: {
  assets: Asset[];
  buildings: BuildingGroup[];
  search: string;
  onSelectAsset: (asset: Asset) => void;
  onSelectRoom: (buildingId: string, roomName: string) => void;
  onSelectBuilding: (buildingId: string) => void;
}) {
  const q = search.toLowerCase().trim();

  const matchedBuildings = buildings.filter(b =>
    b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
  );

  const matchedRooms: { buildingId: string; buildingName: string; roomName: string }[] = [];
  const seenRooms = new Set<string>();
  assets.forEach(a => {
    const room = a.areaName || 'Ostatní';
    const key = `${a.buildingId}::${room}`;
    if (seenRooms.has(key)) return;
    if (room.toLowerCase().includes(q)) {
      seenRooms.add(key);
      matchedRooms.push({
        buildingId: a.buildingId,
        buildingName: BUILDING_META[a.buildingId]?.name || a.buildingId,
        roomName: room,
      });
    }
  });

  const matchedAssets = assets.filter(a =>
    a.name.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q)
  ).slice(0, 15);

  const total = matchedBuildings.length + matchedRooms.length + matchedAssets.length;

  if (total === 0) {
    return (
      <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 p-6 text-center mb-4">
        <div className="text-slate-500 text-sm">Nic nenalezeno pro "{search}"</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 p-4 mb-4 space-y-3 max-h-[60vh] overflow-y-auto">
      <div className="text-xs text-slate-500 font-bold uppercase">Výsledky ({total})</div>

      {matchedBuildings.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-600 uppercase font-bold mb-1.5 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Budovy
          </div>
          {matchedBuildings.map(b => (
            <button key={b.id} onClick={() => onSelectBuilding(b.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition text-left mb-1"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: `${b.color}20`, color: b.color }}>{b.id}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{b.name}</div>
                <div className="text-[11px] text-slate-500">{b.totalAssets} zařízení</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          ))}
        </div>
      )}

      {matchedRooms.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-600 uppercase font-bold mb-1.5 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Místnosti
          </div>
          {matchedRooms.slice(0, 10).map(r => (
            <button key={`${r.buildingId}-${r.roomName}`} onClick={() => onSelectRoom(r.buildingId, r.roomName)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition text-left mb-1"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center"><Layers className="w-4 h-4 text-slate-400" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{r.roomName}</div>
                <div className="text-[11px] text-slate-500">{r.buildingName}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          ))}
        </div>
      )}

      {matchedAssets.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-600 uppercase font-bold mb-1.5 flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Zařízení
          </div>
          {matchedAssets.map(a => {
            const ast = STATUS_CONFIG[a.status] || STATUS_CONFIG.idle;
            const catCfg = a.category ? FOLDER_CONFIG[a.category] : null;
            return (
              <button key={a.id} onClick={() => onSelectAsset(a)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition text-left mb-1"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
                  {catCfg ? (
                    <span className="text-base">{catCfg.icon}</span>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full ${ast.dot}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{a.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {BUILDING_META[a.buildingId]?.name || a.buildingId}{a.areaName ? ` · ${a.areaName}` : ''}
                    {catCfg ? ` · ${catCfg.label}` : ''}
                  </div>
                </div>
                {a.code && <span className="text-[10px] text-slate-500 font-mono">{a.code}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN PAGE — Drill-down: Buildings → Rooms → Machines
// ═══════════════════════════════════════════════
export default function MapPage() {
  const { assets, loading } = useAssets();
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('buildings');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedRoomName, setSelectedRoomName] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [search, setSearch] = useState('');
  const [wasteStatus, setWasteStatus] = useState<Record<string, boolean>>({});
  const [showAddModal, setShowAddModal] = useState<'building' | 'room' | 'asset' | null>(null);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addWasteType, setAddWasteType] = useState('');
  const [addPickupFreq, setAddPickupFreq] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  // editingAsset state removed — inline editing in AssetDetailSheet

  // EntityModal navigation stack
  const [entityModalStack, setEntityModalStack] = useState<{ data: EntityModalData; breadcrumbs: BreadcrumbItem[] }[]>([]);
  const currentEntityModal = entityModalStack.length > 0 ? entityModalStack[entityModalStack.length - 1] : null;

  const openEntityModal = (data: EntityModalData, initialBreadcrumbs: BreadcrumbItem[]) => {
    setEntityModalStack([{ data, breadcrumbs: [...initialBreadcrumbs, { label: data.name }] }]);
    setSelectedAsset(null);
  };

  const navigateEntityModal = (data: EntityModalData, parentBreadcrumb: BreadcrumbItem) => {
    setEntityModalStack((prev) => {
      const current = prev[prev.length - 1];
      if (!current) return prev;
      const newBreadcrumbs = [...current.breadcrumbs.slice(0, -1), parentBreadcrumb, { label: data.name }];
      return [...prev, { data, breadcrumbs: newBreadcrumbs }];
    });
  };

  const entityModalBack = () => {
    setEntityModalStack((prev) => prev.length > 1 ? prev.slice(0, -1) : []);
  };

  const closeEntityModal = () => {
    setEntityModalStack([]);
  };

  const { user, hasPermission } = useAuthContext();
  const canManageAssets = hasPermission('asset.delete');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'room' | 'asset'; name: string; buildingId: string; roomName?: string; assetId?: string } | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Room rename state
  const [renamingRoom, setRenamingRoom] = useState<{ buildingId: string; oldName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const { buildings } = useGroupedData(assets, selectedBuildingId);

  const currentBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  const currentRoom = useMemo(
    () => currentBuilding?.rooms.find((r) => r.name === selectedRoomName) || null,
    [currentBuilding, selectedRoomName]
  );

  const currentColor = selectedBuildingId
    ? BUILDING_META[selectedBuildingId]?.color || '#f97316'
    : '#f97316';

  // Filtered rooms (Level 2)
  const filteredRooms = useMemo(() => {
    const rooms = currentBuilding?.rooms || [];
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.assets.some((a) => a.name.toLowerCase().includes(q))
    );
  }, [currentBuilding, search]);

  // Level 3: Folders + ungrouped assets
  const { filteredFolders, filteredUngrouped } = useMemo(() => {
    if (!currentRoom) return { filteredFolders: [] as FolderGroup[], filteredUngrouped: [] as Asset[] };
    const { folders, ungrouped } = buildFolders(currentRoom.assets);
    if (!search.trim()) return { filteredFolders: folders, filteredUngrouped: ungrouped };
    const q = search.toLowerCase();
    return {
      filteredFolders: folders.filter(
        (f) => f.name.toLowerCase().includes(q) || f.assets.some((a) => a.name.toLowerCase().includes(q))
      ),
      filteredUngrouped: ungrouped.filter(
        (a) => a.name.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q)
      ),
    };
  }, [currentRoom, search]);

  // Level 4: Current folder + filtered assets
  const currentFolder = useMemo(() => {
    if (!currentRoom || !selectedFolderId) return null;
    const { folders } = buildFolders(currentRoom.assets);
    return folders.find((f) => f.id === selectedFolderId) || null;
  }, [currentRoom, selectedFolderId]);

  const filteredFolderAssets = useMemo(() => {
    if (!currentFolder) return [];
    if (!search.trim()) return currentFolder.assets;
    const q = search.toLowerCase();
    return currentFolder.assets.filter(
      (a) => a.name.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q)
    );
  }, [currentFolder, search]);

  // Effective drill level — falls back safely if selected data vanishes after reload
  const activeLevel: DrillLevel = useMemo(() => {
    if (loading) return drillLevel;
    if (drillLevel === 'folder' && !currentFolder) return currentRoom ? 'machines' : currentBuilding ? 'rooms' : 'buildings';
    if (drillLevel === 'machines' && !currentRoom) return currentBuilding ? 'rooms' : 'buildings';
    if (drillLevel === 'rooms' && !currentBuilding) return 'buildings';
    return drillLevel;
  }, [drillLevel, loading, currentBuilding, currentRoom, currentFolder]);

  // Generate room code: e.g. D1.01, D2.03
  const getRoomCode = (buildingId: string, room: RoomGroup, index: number) => {
    const floorNum = room.floor?.match(/(\d)/)?.[1] || '1';
    return `${buildingId}${floorNum}.${String(index + 1).padStart(2, '0')}`;
  };

  // ── Machine action handlers ──
  const handleNewTask = async (asset: Asset) => {
    try {
      await createTask({
        title: `Úkol: ${asset.name}`,
        description: `Vytvořeno z mapy areálu. Budova ${asset.buildingId}, ${asset.areaName || ''}`,
        priority: 'P3',
        type: 'corrective',
        source: 'web',
        buildingId: asset.buildingId,
        assetId: asset.id,
        assetName: asset.name,
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      setSelectedAsset(null);
    } catch (err) { console.error('[MapPage] createTask failed:', err); }
  };

  const handleReport = async (asset: Asset) => {
    try {
      await createTask({
        title: `Porucha: ${asset.name}`,
        description: `Nahlášeno z mapy areálu. Budova ${asset.buildingId}, ${asset.areaName || ''}`,
        priority: 'P1',
        type: 'corrective',
        source: 'web',
        buildingId: asset.buildingId,
        assetId: asset.id,
        assetName: asset.name,
        createdById: user?.id || 'unknown',
        createdByName: user?.displayName || 'Neznámý',
      });
      setSelectedAsset(null);
    } catch (err) { console.error('[MapPage] report failed:', err); }
  };

  // Delete asset handler — checks history + children, then soft-deletes
  const [allowArchive, setAllowArchive] = useState(false);

  const handleDeleteAsset = async (asset: Asset) => {
    setSelectedAsset(null);
    setDeleteTarget({ type: 'asset', name: asset.name, buildingId: asset.buildingId, assetId: asset.id });
    setAllowArchive(false);
    setDeleteImpact(null);

    try {
      // Check for linked tasks
      const tasksSnap = await getDocs(
        query(collection(db, 'tasks'), where('assetId', '==', asset.id))
      );
      const taskCount = tasksSnap.size;

      // Check for child assets
      const childrenSnap = await getDocs(
        query(collection(db, 'assets'), where('parentId', '==', asset.id))
      );
      const childCount = childrenSnap.docs.filter(d => !d.data().isDeleted).length;

      if (taskCount > 0 || childCount > 0) {
        const parts: string[] = [];
        if (taskCount > 0) parts.push(`${taskCount} úkolů`);
        if (childCount > 0) parts.push(`${childCount} podřízených zařízení`);
        setDeleteImpact(`Zařízení obsahuje historii: ${parts.join(', ')}. Bude archivováno.`);
        setAllowArchive(true);
      }
    } catch {
      // If queries fail, allow simple delete
    }

    setShowDeleteModal(true);
  };

  const confirmAssetDelete = async () => {
    if (!deleteTarget || deleteTarget.type !== 'asset' || !deleteTarget.assetId) return;
    // Soft delete — mark as archived (lookup by ID, not name)
    await updateDoc(doc(db, 'assets', deleteTarget.assetId), {
      isDeleted: true,
      updatedAt: serverTimestamp(),
    });
    showToast(`Zařízení "${deleteTarget.name}" archivováno`, 'success');
    setShowDeleteModal(false);
    setDeleteTarget(null);
    setSelectedAsset(null);
  };

  // Edit is now inline in AssetDetailSheet — no separate modal needed

  // FAB handler — opens add modal for current drill level
  const handleFabClick = () => {
    setSelectedAsset(null);
    if (activeLevel === 'machines' || activeLevel === 'folder') setShowAddModal('asset');
    else if (activeLevel === 'rooms') setShowAddModal('room');
    else setShowAddModal('building');
  };

  // ── Room management handlers ──
  const handleRoomDelete = async (buildingId: string, roomName: string) => {
    // Check for active tasks linked to assets in this room
    const roomAssets = assets.filter(a => a.buildingId === buildingId && (a.areaName || 'Ostatní') === roomName);
    const assetIds = roomAssets.map(a => a.id);

    if (assetIds.length > 0) {
      // Check tasks collection for active tasks referencing these assets
      try {
        const tasksQuery = query(
          collection(db, 'tasks'),
          where('assetId', 'in', assetIds.slice(0, 10)), // Firestore 'in' max 10
          where('status', 'in', ['backlog', 'planned', 'in_progress', 'paused']),
        );
        const snap = await getDocs(tasksQuery);
        if (!snap.empty) {
          setDeleteImpact(`Nelze smazat — lokalita má ${snap.size} aktivních úkolů.`);
          setDeleteTarget({ type: 'room', name: roomName, buildingId });
          setShowDeleteModal(true);
          return;
        }
      } catch {
        // If composite query fails, proceed without impact check
      }
    }

    setDeleteImpact(null);
    setDeleteTarget({ type: 'room', name: roomName, buildingId });
    setShowDeleteModal(true);
  };

  const confirmRoomDelete = async () => {
    if (!deleteTarget || deleteTarget.type !== 'room') return;
    const roomAssets = assets.filter(
      a => a.buildingId === deleteTarget.buildingId && (a.areaName || 'Ostatní') === deleteTarget.name
    );
    // Soft delete all assets in this room
    await Promise.all(roomAssets.map(a =>
      updateDoc(doc(db, 'assets', a.id), { isDeleted: true, updatedAt: serverTimestamp() })
    ));
    showToast(`Místnost "${deleteTarget.name}" archivována (${roomAssets.length} zařízení)`, 'success');
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleRoomRename = (buildingId: string, oldName: string) => {
    setRenamingRoom({ buildingId, oldName });
    setRenameValue(oldName);
  };

  const saveRoomRename = async () => {
    if (!renamingRoom || !renameValue.trim()) return;
    setRenameSaving(true);
    const roomAssets = assets.filter(
      a => a.buildingId === renamingRoom.buildingId && (a.areaName || 'Ostatní') === renamingRoom.oldName
    );
    try {
      await Promise.all(roomAssets.map(a =>
        updateDoc(doc(db, 'assets', a.id), { areaName: renameValue.trim(), updatedAt: serverTimestamp() })
      ));
      showToast(`Místnost přejmenována na "${renameValue.trim()}"`, 'success');
      setRenamingRoom(null);
    } catch (err) {
      showToast('Chyba při přejmenování', 'error');
    }
    setRenameSaving(false);
  };

  // ── Navigation handlers ──
  const handleBuildingClick = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    setDrillLevel('rooms');
    setSearch('');
  };

  const handleRoomClick = (roomName: string) => {
    setSelectedRoomName(roomName);
    setDrillLevel('machines');
    setSearch('');
  };

  const handleBackToBuildings = () => {
    setDrillLevel('buildings');
    setSelectedBuildingId(null);
    setSelectedRoomName(null);
    setSelectedFolderId(null);
    setSearch('');
  };

  const handleBackToRooms = () => {
    setDrillLevel('rooms');
    setSelectedRoomName(null);
    setSelectedFolderId(null);
    setSearch('');
  };

  const handleFolderClick = (folderId: string) => {
    setSelectedFolderId(folderId);
    setDrillLevel('folder');
    setSearch('');
  };

  const handleBackToFolders = () => {
    setDrillLevel('machines');
    setSelectedFolderId(null);
    setSearch('');
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-3 pt-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => window.location.href = '/'}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Mapa areálu</h1>
            <p className="text-xs text-slate-500">
              {assets.length} zařízení · {buildings.length} budov
            </p>
          </div>
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
        </div>

        {/* Breadcrumb */}
        {activeLevel !== 'buildings' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 flex-wrap">
            <button onClick={handleBackToBuildings} className="hover:text-orange-400 transition font-medium">
              Budovy
            </button>
            {activeLevel === 'rooms' && currentBuilding && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white font-semibold">{currentBuilding.name}</span>
              </>
            )}
            {activeLevel === 'machines' && currentBuilding && (
              <>
                <ChevronRight className="w-3 h-3" />
                <button onClick={handleBackToRooms} className="hover:text-orange-400 transition font-medium">
                  {currentBuilding.name}
                </button>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white font-semibold">{selectedRoomName}</span>
              </>
            )}
            {activeLevel === 'folder' && currentBuilding && currentFolder && (
              <>
                <ChevronRight className="w-3 h-3" />
                <button onClick={handleBackToRooms} className="hover:text-orange-400 transition font-medium">
                  {currentBuilding.name}
                </button>
                <ChevronRight className="w-3 h-3" />
                <button onClick={handleBackToFolders} className="hover:text-orange-400 transition font-medium">
                  {selectedRoomName}
                </button>
                <ChevronRight className="w-3 h-3" />
                <span className="text-white font-semibold">{currentFolder.icon} {currentFolder.name}</span>
              </>
            )}
          </div>
        )}

        {/* Global Search — all levels */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat budovu, místnost nebo stroj..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
          />
        </div>

        {/* Global search results overlay — only at buildings level */}
        {activeLevel === 'buildings' && search.trim() && (
          <GlobalSearchResults
            assets={assets}
            buildings={buildings}
            search={search}
            onSelectAsset={(asset) => { setSearch(''); setSelectedAsset(asset); }}
            onSelectRoom={(buildingId, roomName) => {
              setSearch('');
              setSelectedBuildingId(buildingId);
              setSelectedRoomName(roomName);
              setDrillLevel('machines');
            }}
            onSelectBuilding={(buildingId) => {
              setSearch('');
              handleBuildingClick(buildingId);
            }}
          />
        )}

        {/* ═══ LEVEL 1: Buildings (Tiles) ═══ */}
        {activeLevel === 'buildings' && (
          <>
            <SummaryBar assets={assets} />

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Načítám zařízení...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {buildings.map((b) => {
                    const bAssets = assets.filter(a => a.buildingId === b.id);
                    const bWorst = getWorstStatus(bAssets);
                    const bSt = STATUS_CONFIG[bWorst] || STATUS_CONFIG.idle;
                    return (
                      <button
                        key={b.id}
                        onClick={() => handleBuildingClick(b.id)}
                        className="flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-[0.96] cursor-pointer text-center min-h-[120px] relative"
                        style={{
                          background: `linear-gradient(145deg, ${b.color}12, ${b.color}04)`,
                          borderColor: `${b.color}25`,
                        }}
                      >
                        <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${bSt.dot}`} />
                        <div
                          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold mb-1.5"
                          style={{ background: `${b.color}20`, color: b.color }}
                        >
                          {b.id}
                        </div>
                        <span className="text-[13px] font-semibold text-white leading-tight">{b.name}</span>
                        <span className="text-[11px] text-slate-500 mt-0.5">
                          {b.totalAssets} zařízení · {b.rooms.length} míst.
                        </span>
                        {b.issueCount > 0 && (
                          <span className="text-[11px] text-red-400 mt-0.5">{b.issueCount} problémů</span>
                        )}
                      </button>
                    );
                  })}

                  {/* [+] Add building tile (admin only) */}
                  {canManageAssets && (
                    <button
                      onClick={() => setShowAddModal('building')}
                      className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[120px]"
                    >
                      <Plus className="w-8 h-8 mb-1" />
                      <span className="text-[12px] font-medium">Přidat</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ LEVEL 2: Rooms in building (Tiles) ═══ */}
        {activeLevel === 'rooms' && currentBuilding && (
          <>
            <button
              onClick={handleBackToBuildings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold mb-3 hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Zpět na budovy
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold"
                style={{ background: `${currentColor}20`, color: currentColor }}
              >
                {selectedBuildingId}
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-white">{currentBuilding.name}</div>
                <div className="text-xs text-slate-500">
                  {currentBuilding.totalAssets} zařízení · {currentBuilding.rooms.length} místností
                </div>
              </div>
            </div>

            <SummaryBar assets={assets.filter((a) => a.buildingId === selectedBuildingId)} />

            {selectedBuildingId === 'L' && <WastePanel wasteStatus={wasteStatus} setWasteStatus={setWasteStatus} />}

            {filteredRooms.length === 0 ? (
              <EmptyState
                icon={<Inbox className="w-12 h-12" />}
                title="Žádné místnosti"
                subtitle={search ? 'Zkus jiný výraz' : 'Tato budova nemá místnosti'}
              />
            ) : (
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredRooms.map((room, idx) => (
                  <RoomTile
                    key={room.name}
                    room={room}
                    color={currentColor}
                    code={getRoomCode(selectedBuildingId || '', room, idx)}
                    onClick={() => handleRoomClick(room.name)}
                    canManage={canManageAssets}
                    onEdit={() => handleRoomRename(selectedBuildingId || '', room.name)}
                    onDelete={() => handleRoomDelete(selectedBuildingId || '', room.name)}
                  />
                ))}

                {/* [+] Add room tile (admin only) */}
                {canManageAssets && (
                  <button
                    onClick={() => setShowAddModal('room')}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[110px]"
                  >
                    <Plus className="w-7 h-7 mb-1" />
                    <span className="text-[12px] font-medium">Přidat</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ LEVEL 3: Folders + Machines in room ═══ */}
        {activeLevel === 'machines' && currentRoom && (
          <>
            <button
              onClick={handleBackToRooms}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold mb-3 hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Zpět na místnosti
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `${currentColor}20` }}
              >
                <Layers className="w-6 h-6" style={{ color: currentColor }} />
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-white">{currentRoom.name}</div>
                <div className="text-xs text-slate-500">
                  {currentRoom.assets.length} strojů · {currentRoom.floor}
                </div>
              </div>
            </div>

            {filteredFolders.length === 0 && filteredUngrouped.length === 0 ? (
              <EmptyState
                icon={<Inbox className="w-12 h-12" />}
                title="Žádné stroje"
                subtitle={search ? 'Zkus jiný výraz' : 'Tato místnost nemá stroje'}
              />
            ) : (
              <>
                {/* Folder tiles + ungrouped in single grid */}
                <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {filteredFolders.map((folder) => (
                    <FolderTile key={folder.id} folder={folder} onClick={() => handleFolderClick(folder.id)} />
                  ))}
                  {filteredUngrouped.map((asset) => (
                    <MachineCard key={asset.id} asset={asset} onClick={() => setSelectedAsset(asset)} />
                  ))}

                  {/* [+] Add asset tile (admin only) */}
                  {canManageAssets && (
                    <button
                      onClick={() => setShowAddModal('asset')}
                      className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[100px]"
                    >
                      <Plus className="w-7 h-7 mb-1" />
                      <span className="text-[12px] font-medium">Přidat</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ LEVEL 4: Assets inside folder ═══ */}
        {activeLevel === 'folder' && currentFolder && (
          <>
            <button
              onClick={handleBackToFolders}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold mb-3 hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Zpět na místnost
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center text-2xl">
                {currentFolder.icon}
              </div>
              <div className="flex-1">
                <div className="text-lg font-bold text-white">{currentFolder.name}</div>
                <div className="text-xs text-slate-500">
                  {currentFolder.assets.length} strojů
                </div>
              </div>
            </div>

            {filteredFolderAssets.length === 0 ? (
              <EmptyState
                icon={<Inbox className="w-12 h-12" />}
                title="Žádné stroje"
                subtitle={search ? 'Zkus jiný výraz' : 'Složka je prázdná'}
              />
            ) : (
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredFolderAssets.map((asset) => (
                  <MachineCard key={asset.id} asset={asset} onClick={() => setSelectedAsset(asset)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB — Floating Add Button (admin only) */}
      {canManageAssets && (
        <button
          onClick={handleFabClick}
          className="fixed bottom-24 right-4 z-50 w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/30 flex items-center justify-center text-white active:scale-90 transition-all hover:shadow-xl hover:shadow-orange-500/40"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Asset detail — opens EntityModal for the asset */}
      {selectedAsset && !currentEntityModal && (
        <AssetDetailSheet
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onCreateTask={handleNewTask}
          onReport={handleReport}
          onDelete={handleDeleteAsset}
          canManage={canManageAssets}
          allAssets={assets}
          onSelectAsset={setSelectedAsset}
          onOpenPassport={(asset: Asset) => {
            const buildingName = BUILDING_META[asset.buildingId]?.name || asset.buildingId;
            openEntityModal(
              {
                type: 'asset',
                id: asset.id,
                name: asset.name,
                buildingId: asset.buildingId,
                roomName: asset.areaName,
                status: asset.status,
                code: asset.code,
                category: asset.category,
                asset,
              },
              [
                { label: buildingName, data: { type: 'building', id: asset.buildingId, name: buildingName, buildingId: asset.buildingId } },
                ...(asset.areaName ? [{ label: asset.areaName, data: { type: 'room' as const, id: asset.areaName, name: asset.areaName, buildingId: asset.buildingId, roomName: asset.areaName } }] : []),
              ]
            );
          }}
        />
      )}

      {/* EntityModal — hierarchical drill-down */}
      {currentEntityModal && (
        <EntityModal
          data={currentEntityModal.data}
          breadcrumbs={currentEntityModal.breadcrumbs}
          onClose={closeEntityModal}
          onNavigate={navigateEntityModal}
          onBack={entityModalBack}
        />
      )}

      {/* Edit Asset Modal removed — inline editing in AssetDetailSheet */}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteTarget(null); setAllowArchive(false); }}
        onConfirm={deleteTarget?.type === 'asset' ? confirmAssetDelete : confirmRoomDelete}
        itemName={deleteTarget?.name || ''}
        itemType={deleteTarget?.type === 'asset' ? 'zařízení' : 'místnost'}
        impactWarning={deleteImpact}
        requirePin={!allowArchive}
        allowArchive={allowArchive}
      />

      {/* Room Rename Modal */}
      <BottomSheet
        title={`Přejmenovat: ${renamingRoom?.oldName || ''}`}
        isOpen={renamingRoom !== null}
        onClose={() => setRenamingRoom(null)}
      >
        <FormField label="Nový název" value={renameValue} onChange={setRenameValue} required autoFocus />
        <FormFooter
          onCancel={() => setRenamingRoom(null)}
          onSubmit={saveRoomRename}
          submitLabel="Přejmenovat"
          loading={renameSaving}
          disabled={!renameValue.trim() || renameValue.trim() === renamingRoom?.oldName}
        />
      </BottomSheet>

      {/* [+] Add Modal */}
      <BottomSheet
        title={
          showAddModal === 'building' ? '🏢 Přidat budovu' :
          showAddModal === 'room' ? '🚪 Přidat místnost' :
          showAddModal === 'asset' ? '⚙️ Přidat zařízení' : ''
        }
        isOpen={showAddModal !== null}
        onClose={() => { setShowAddModal(null); setAddName(''); setAddCode(''); setAddCategory(''); setAddWasteType(''); setAddPickupFreq(''); setAddError(''); }}
      >
        <FormField
          label="Název"
          value={addName}
          onChange={setAddName}
          placeholder={
            showAddModal === 'building' ? 'Např. F — Expedice' :
            showAddModal === 'room' ? 'Např. Míchárna' : 'Např. Extruder XL-400'
          }
          required
          autoFocus
        />
        <FormField label="Kód" value={addCode} onChange={setAddCode} placeholder="Např. EXT-005" />
        {showAddModal === 'asset' && (
          <FormField
            label="Kategorie"
            value={addCategory}
            onChange={(v) => { setAddCategory(v); if (v !== 'waste_bin') { setAddWasteType(''); setAddPickupFreq(''); } }}
            type="select"
            options={Object.entries(FOLDER_CONFIG).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }))}
          />
        )}
        {showAddModal === 'asset' && addCategory === 'waste_bin' && (
          <>
            <FormField
              label="Typ odpadu"
              value={addWasteType}
              onChange={setAddWasteType}
              type="select"
              options={[
                { value: 'mixed', label: 'Směsný' },
                { value: 'plastic', label: 'Plast' },
                { value: 'paper', label: 'Papír' },
                { value: 'glass', label: 'Sklo' },
                { value: 'metal', label: 'Kov' },
                { value: 'bio', label: 'Bio' },
                { value: 'hazardous', label: 'Nebezpečný' },
              ]}
            />
            <FormField
              label="Frekvence svozu"
              value={addPickupFreq}
              onChange={setAddPickupFreq}
              type="select"
              options={[
                { value: 'daily', label: 'Denně' },
                { value: 'weekly', label: 'Týdně' },
                { value: 'biweekly', label: '2x měsíčně' },
                { value: 'monthly', label: 'Měsíčně' },
                { value: 'on_demand', label: 'Na objednávku' },
              ]}
            />
          </>
        )}
        {addError && (
          <div className="p-2.5 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
            {addError}
          </div>
        )}
        <FormFooter
          onCancel={() => { setShowAddModal(null); setAddName(''); setAddCode(''); setAddCategory(''); setAddWasteType(''); setAddPickupFreq(''); setAddError(''); }}
          onSubmit={async () => {
            const name = addName.trim();
            if (!name) return;

            if (showAddModal === 'building') {
              const code = addCode.trim() || name.charAt(0).toUpperCase();
              if (code.length > 5) {
                setAddError('Kód budovy max 5 znaků.');
                return;
              }
            }

            setAddSaving(true);
            setAddError('');
            try {
              const createdById = user?.id || 'unknown';
              const createdByName = user?.displayName || 'Neznámý';

              if (showAddModal === 'asset' && selectedBuildingId) {
                const assetData: Record<string, any> = {
                  name,
                  code: addCode.trim() || '',
                  buildingId: selectedBuildingId,
                  areaName: selectedRoomName || 'Ostatní',
                  status: 'operational',
                  category: addCategory || '',
                  isDeleted: false,
                  createdById,
                  createdByName,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                if (addCategory === 'waste_bin') {
                  if (addWasteType) assetData.wasteType = addWasteType;
                  if (addPickupFreq) assetData.pickupFrequency = addPickupFreq;
                }
                await addDoc(collection(db, 'assets'), assetData);
              } else if (showAddModal === 'room' && selectedBuildingId) {
                await addDoc(collection(db, 'assets'), {
                  name: `${name} — placeholder`,
                  code: addCode.trim() || '',
                  buildingId: selectedBuildingId,
                  areaName: name,
                  status: 'idle',
                  category: '',
                  isDeleted: false,
                  createdById,
                  createdByName,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else if (showAddModal === 'building') {
                const buildingCode = addCode.trim() || name.charAt(0).toUpperCase();
                await addDoc(collection(db, 'assets'), {
                  name: `${name} — placeholder`,
                  code: buildingCode,
                  buildingId: buildingCode,
                  areaName: 'Hlavní',
                  status: 'idle',
                  category: '',
                  isDeleted: false,
                  createdById,
                  createdByName,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              }
              showToast(
                showAddModal === 'building' ? `Budova "${name}" vytvořena` :
                showAddModal === 'room' ? `Místnost "${name}" vytvořena` :
                `Zařízení "${name}" přidáno`,
                'success'
              );
              setShowAddModal(null);
              setAddName('');
              setAddCode('');
              setAddCategory('');
              setAddWasteType('');
              setAddPickupFreq('');
              setAddError('');
            } catch (err) {
              console.error('[MapPage] Add failed:', err);
              const errMsg = (err as Error).message || 'Nepodařilo se uložit';
              setAddError(errMsg);
              showToast(`Chyba: ${errMsg}`, 'error');
            }
            setAddSaving(false);
          }}
          submitLabel="Přidat"
          loading={addSaving}
          disabled={!addName.trim()}
        />
      </BottomSheet>
    </div>
  );
}
