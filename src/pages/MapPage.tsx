// src/pages/MapPage.tsx
// NOMINAL CMMS — Mapa areálu (v25 - SVG floor plan for building D)
// Sekce místností → karty strojů v gridu (jako údržba v24)
// Budova D → interaktivní SVG půdorys 2.NP

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
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
} from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { createTask } from '../services/taskService';
import BottomSheet from '../components/ui/BottomSheet';
import EmptyState from '../components/ui/EmptyState';
import {
  EntityCardFull,
  type Entity,
  type Blueprint,
  type EntityLogEntry,
} from '../components/EntityCard';

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
      collection(db, 'assets'),
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

    const roomMap = new Map<string, Map<string, Asset[]>>();
    assets.forEach((asset) => {
      const bid = asset.buildingId || '?';
      if (!roomMap.has(bid)) roomMap.set(bid, new Map());
      const rooms = roomMap.get(bid)!;
      const roomKey = asset.areaName || 'Ostatní';
      if (!rooms.has(roomKey)) rooms.set(roomKey, []);
      rooms.get(roomKey)!.push(asset);
    });

    roomMap.forEach((rooms, bid) => {
      const building = buildingMap.get(bid);
      if (!building) return;

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
function RoomTile({ room, color, onClick, code }: { room: RoomGroup; color: string; onClick: () => void; code: string }) {
  const roomWorst = getWorstStatus(room.assets);
  const roomSt = STATUS_CONFIG[roomWorst] || STATUS_CONFIG.idle;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-3 rounded-2xl border transition-all active:scale-[0.96] cursor-pointer text-center min-h-[110px] relative bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/40"
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
    setWasteStatus(prev => ({ ...prev, [id]: !prev[id] }));
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
    } catch (err) {
      console.error('[WastePanel]', err);
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
function AssetDetailSheet({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const entity = useMemo(() => assetToEntity(asset), [asset]);
  const logs = useMemo(() => DEMO_MACHINE_LOGS.map((l) => ({ ...l, entityId: asset.id })), [asset.id]);

  return (
    <BottomSheet title={asset.name} isOpen={true} onClose={onClose}>
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

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button className="py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2 min-h-[48px]">
          <AlertTriangle className="w-4 h-4" />
          Nahlásit
        </button>
        <button className="py-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2 min-h-[48px]">
          <Wrench className="w-4 h-4" />
          Úkol
        </button>
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
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

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

        {/* Search — rooms & machines levels */}
        {activeLevel !== 'buildings' && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeLevel === 'rooms' ? 'Hledat místnost...' : activeLevel === 'folder' ? 'Hledat ve složce...' : 'Hledat stroj...'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
            />
          </div>
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

                  {/* [+] Add building tile */}
                  <button
                    onClick={() => setShowAddModal('building')}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[120px]"
                  >
                    <Plus className="w-8 h-8 mb-1" />
                    <span className="text-[12px] font-medium">Přidat</span>
                  </button>
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
                  />
                ))}

                {/* [+] Add room tile */}
                <button
                  onClick={() => setShowAddModal('room')}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[110px]"
                >
                  <Plus className="w-7 h-7 mb-1" />
                  <span className="text-[12px] font-medium">Přidat</span>
                </button>
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

                  {/* [+] Add asset tile */}
                  <button
                    onClick={() => setShowAddModal('asset')}
                    className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 transition cursor-pointer text-center min-h-[100px]"
                  >
                    <Plus className="w-7 h-7 mb-1" />
                    <span className="text-[12px] font-medium">Přidat</span>
                  </button>
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

      {/* Asset detail */}
      {selectedAsset && (
        <AssetDetailSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}

      {/* [+] Add Modal */}
      <BottomSheet
        title={
          showAddModal === 'building' ? '🏢 Přidat budovu' :
          showAddModal === 'room' ? '🚪 Přidat místnost' :
          showAddModal === 'asset' ? '⚙️ Přidat zařízení' : ''
        }
        isOpen={showAddModal !== null}
        onClose={() => { setShowAddModal(null); setAddName(''); setAddCode(''); setAddError(''); }}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 font-medium mb-1.5">
              Název <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={
                showAddModal === 'building' ? 'Např. F — Expedice' :
                showAddModal === 'room' ? 'Např. Míchárna' : 'Např. Extruder XL-400'
              }
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 font-medium mb-1.5">Kód</label>
            <input
              type="text"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              placeholder="Např. EXT-005"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-[15px] placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
            />
          </div>
          {addError && (
            <div className="p-2.5 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
              {addError}
            </div>
          )}
          <button
            onClick={async () => {
              const name = addName.trim();
              if (!name) return;

              // Validate building code for building modal
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
                if (showAddModal === 'asset' && selectedBuildingId) {
                  await addDoc(collection(db, 'assets'), {
                    name,
                    code: addCode.trim() || undefined,
                    buildingId: selectedBuildingId,
                    areaName: selectedRoomName || 'Ostatní',
                    status: 'operational',
                    category: '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                } else if (showAddModal === 'room' && selectedBuildingId) {
                  await addDoc(collection(db, 'assets'), {
                    name: `${name} — placeholder`,
                    code: addCode.trim() || undefined,
                    buildingId: selectedBuildingId,
                    areaName: name,
                    status: 'idle',
                    category: '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                } else if (showAddModal === 'building') {
                  const buildingCode = addCode.trim() || name.charAt(0).toUpperCase();
                  await addDoc(collection(db, 'assets'), {
                    name: `${name} — placeholder`,
                    code: '',
                    buildingId: buildingCode,
                    areaName: 'Hlavní',
                    status: 'idle',
                    category: '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                }
                setShowAddModal(null);
                setAddName('');
                setAddCode('');
                setAddError('');
              } catch (err) {
                console.error('[MapPage] Add failed:', err);
                setAddError('Nepodařilo se uložit. Zkuste to znovu.');
              }
              setAddSaving(false);
            }}
            disabled={!addName.trim() || addSaving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {addSaving ? 'Ukládám...' : 'Přidat'}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
