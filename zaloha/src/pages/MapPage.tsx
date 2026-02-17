// src/pages/MapPage.tsx
// NOMINAL CMMS — Mapa areálu (v25 - SVG floor plan for building D)
// Sekce místností → karty strojů v gridu (jako údržba v24)
// Budova D → interaktivní SVG půdorys 2.NP

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ArrowLeft,
  Loader2,
  ChevronRight,
  Wrench,
  AlertTriangle,
  Search,
  Inbox,
  Building2,
  Layers,
  CreditCard,
  X,
} from 'lucide-react';
import BottomSheet from '../components/ui/BottomSheet';
import EmptyState from '../components/ui/EmptyState';
import FloorPlan2NP from '../components/maps/FloorPlan2NP';

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
  idle: { dot: 'bg-slate-400', label: 'Nečinný', color: '#94a3b8' },
  offline: { dot: 'bg-slate-600', label: 'Offline', color: '#475569' },
};

// ═══════════════════════════════════════════════
// TAB SYSTEM
// ═══════════════════════════════════════════════
type ViewTab = 'stroje' | 'budovy';

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
// ROOM SECTION — v24 style header + machine grid
// ═══════════════════════════════════════════════
function RoomSection({
  room,
  color,
  onAssetClick,
}: {
  room: RoomGroup;
  color: string;
  onAssetClick: (asset: Asset) => void;
}) {
  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-xl border-b"
        style={{ background: `${color}08`, borderColor: `${color}20` }}
      >
        <Layers className="w-4 h-4" style={{ color }} />
        <span className="text-[14px] font-bold" style={{ color }}>
          {room.name}
        </span>
        <span className="text-[11px] text-slate-500 ml-auto">{room.assets.length} strojů</span>
        {room.issueCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400">
            {room.issueCount} ⚠
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 p-2 rounded-b-xl bg-white/[0.02] border border-t-0 border-white/[0.06]">
        {room.assets.map((asset) => (
          <MachineCard key={asset.id} asset={asset} onClick={() => onAssetClick(asset)} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// BUILDING TABS — horizontal pills
// ═══════════════════════════════════════════════
function BuildingTabs({
  buildings,
  selected,
  onSelect,
}: {
  buildings: BuildingGroup[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-all active:scale-95 flex-shrink-0 ${
          !selected
            ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
            : 'bg-white/5 border-white/10 text-slate-400'
        }`}
        style={{ border: '1px solid' }}
      >
        Vše
      </button>
      {buildings.map((b) => (
        <button
          key={b.id}
          onClick={() => onSelect(b.id)}
          className="px-3 py-2 rounded-xl text-[12px] font-semibold transition-all active:scale-95 flex-shrink-0 flex items-center gap-1.5"
          style={{
            background: selected === b.id ? `${b.color}20` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${selected === b.id ? b.color + '40' : 'rgba(255,255,255,0.1)'}`,
            color: selected === b.id ? b.color : '#94a3b8',
          }}
        >
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: `${b.color}20` }}
          >
            {b.id}
          </span>
          {b.name}
          {b.issueCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-red-500/30 text-red-400 text-[9px] font-bold flex items-center justify-center">
              {b.issueCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// ASSET DETAIL SHEET
// ═══════════════════════════════════════════════
function AssetDetailSheet({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.idle;

  return (
    <BottomSheet title={asset.name} isOpen={true} onClose={onClose}>
      <div
        className="flex items-center gap-3 p-3 rounded-xl mb-4"
        style={{ background: `${st.color}12`, border: `1px solid ${st.color}30` }}
      >
        <div className={`w-4 h-4 rounded-full ${st.dot}`} />
        <span className="text-sm font-semibold" style={{ color: st.color }}>
          {st.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {asset.code && (
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 mb-0.5">Kód</div>
            <div className="text-sm font-semibold text-white">{asset.code}</div>
          </div>
        )}
        {asset.buildingId && (
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 mb-0.5">Budova</div>
            <div className="text-sm font-semibold text-white">
              {BUILDING_META[asset.buildingId]?.name || asset.buildingId}
            </div>
          </div>
        )}
        {asset.areaName && (
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 mb-0.5">Místnost</div>
            <div className="text-sm font-semibold text-white">{asset.areaName}</div>
          </div>
        )}
        {asset.category && (
          <div className="bg-white/5 rounded-xl p-3">
            <div className="text-[11px] text-slate-500 mb-0.5">Kategorie</div>
            <div className="text-sm font-semibold text-white">{asset.category}</div>
          </div>
        )}
      </div>

      {asset.controlPoints && asset.controlPoints.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
            Kontrolní body
          </div>
          <div className="flex flex-wrap gap-1.5">
            {asset.controlPoints.map((cp, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 text-[12px] text-slate-300">
                {cp}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button className="py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Nahlásit
        </button>
        <button className="py-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-semibold active:scale-95 transition flex items-center justify-center gap-2">
          <Wrench className="w-4 h-4" />
          Úkol
        </button>
      </div>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════
// ROOM BOTTOM SHEET — for SVG floor plan clicks
// ═══════════════════════════════════════════════
function RoomBottomSheet({
  roomId,
  roomName,
  roomAssets,
  onClose,
  onAssetClick,
}: {
  roomId: string;
  roomName: string;
  roomAssets: Asset[];
  onClose: () => void;
  onAssetClick: (asset: Asset) => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-slate-800 border-t border-white/10 rounded-t-2xl max-h-[50vh] overflow-y-auto animate-slide-up">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-white">{roomName}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">{roomId}</p>

          {/* Machine list */}
          {roomAssets.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Žádné stroje v této místnosti
            </p>
          ) : (
            <div className="space-y-1.5">
              {roomAssets.map((asset) => {
                const st = STATUS_CONFIG[asset.status] || STATUS_CONFIG.idle;
                return (
                  <button
                    key={asset.id}
                    onClick={() => onAssetClick(asset)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition text-left"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-white truncate">
                        {asset.name}
                      </div>
                      {asset.code && (
                        <div className="text-[10px] text-slate-500">{asset.code}</div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// FLOOR PLAN VIEW — for building D
// ═══════════════════════════════════════════════
function FloorPlanView({
  assets,
  onBack,
  onAssetClick,
}: {
  assets: Asset[];
  onBack: () => void;
  onAssetClick: (asset: Asset) => void;
}) {
  const [selectedFloor, setSelectedFloor] = useState<'2np' | '1np'>('2np');
  const [roomSheet, setRoomSheet] = useState<{
    roomId: string;
    roomName: string;
    assets: Asset[];
  } | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const buildingDAssets = useMemo(
    () => assets.filter((a) => a.buildingId === 'D'),
    [assets]
  );

  const handleRoomClick = (roomId: string, roomName: string, roomAssets: Asset[]) => {
    setSelectedRoom(roomId);
    setRoomSheet({ roomId, roomName, assets: roomAssets });
  };

  const handleCloseSheet = () => {
    setRoomSheet(null);
    setSelectedRoom(null);
  };

  return (
    <div>
      {/* Back + Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold mb-3 hover:text-white transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Zpět na budovy
      </button>

      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-white">Budova D — Výrobní hala</h2>
          <p className="text-xs text-slate-500">
            {buildingDAssets.length} zařízení · 2 patra
          </p>
        </div>
      </div>

      {/* Floor switcher */}
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setSelectedFloor('1np')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition ${
            selectedFloor === '1np'
              ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
              : 'bg-white/5 border-white/10 text-slate-400'
          }`}
        >
          1. NP
        </button>
        <button
          onClick={() => setSelectedFloor('2np')}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition ${
            selectedFloor === '2np'
              ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
              : 'bg-white/5 border-white/10 text-slate-400'
          }`}
        >
          2. NP
        </button>
      </div>

      {/* Floor plan */}
      {selectedFloor === '2np' ? (
        <FloorPlan2NP
          assets={buildingDAssets}
          onRoomClick={handleRoomClick}
          selectedRoom={selectedRoom}
        />
      ) : (
        <div className="flex items-center justify-center py-16 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="text-center">
            <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">1. NP — připravujeme</p>
          </div>
        </div>
      )}

      <p className="text-center text-[11px] text-slate-600 mt-2">
        Klikni na místnost pro zobrazení strojů
      </p>

      {/* Room bottom sheet */}
      {roomSheet && (
        <RoomBottomSheet
          roomId={roomSheet.roomId}
          roomName={roomSheet.roomName}
          roomAssets={roomSheet.assets}
          onClose={handleCloseSheet}
          onAssetClick={onAssetClick}
        />
      )}
    </div>
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
// TAB BUTTON
// ═══════════════════════════════════════════════
function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
        active ? 'bg-orange-500/15 text-orange-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════
export default function MapPage() {
  const { assets, loading } = useAssets();
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('stroje');
  const [showFloorPlan, setShowFloorPlan] = useState(false);

  const { buildings, selectedRooms } = useGroupedData(assets, selectedBuilding);

  // Filter by search
  const filteredRooms = useMemo(() => {
    if (!search.trim()) return selectedRooms;
    const q = search.toLowerCase();
    return selectedRooms
      .map((room) => ({
        ...room,
        assets: room.assets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.code?.toLowerCase().includes(q) ||
            a.areaName?.toLowerCase().includes(q)
        ),
      }))
      .filter((r) => r.assets.length > 0);
  }, [selectedRooms, search]);

  const currentColor = selectedBuilding
    ? BUILDING_META[selectedBuilding]?.color || '#f97316'
    : '#f97316';

  // Handle building click in Budovy tab
  const handleBuildingClick = (buildingId: string) => {
    if (buildingId === 'D') {
      setShowFloorPlan(true);
    } else {
      setSelectedBuilding(buildingId);
      setActiveTab('stroje');
    }
  };

  // If showing floor plan for building D
  if (showFloorPlan) {
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
          </div>

          <FloorPlanView
            assets={assets}
            onBack={() => setShowFloorPlan(false)}
            onAssetClick={setSelectedAsset}
          />
        </div>

        {/* Asset detail */}
        {selectedAsset && (
          <AssetDetailSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
        )}
      </div>
    );
  }

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

        {/* View tabs */}
        <div className="flex gap-1 mb-3 border-b border-white/10 pb-2">
          <TabButton
            icon={<CreditCard className="w-4 h-4" />}
            label="Stroje"
            active={activeTab === 'stroje'}
            onClick={() => setActiveTab('stroje')}
          />
          <TabButton
            icon={<Building2 className="w-4 h-4" />}
            label="Budovy"
            active={activeTab === 'budovy'}
            onClick={() => setActiveTab('budovy')}
          />
        </div>

        {activeTab === 'stroje' ? (
          <>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat stroj, kód, místnost..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
              />
            </div>

            {/* Summary */}
            <SummaryBar
              assets={
                selectedBuilding ? assets.filter((a) => a.buildingId === selectedBuilding) : assets
              }
            />

            {/* Building tabs */}
            <BuildingTabs
              buildings={buildings}
              selected={selectedBuilding}
              onSelect={setSelectedBuilding}
            />

            {/* Room sections */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Načítám zařízení...
              </div>
            ) : filteredRooms.length === 0 ? (
              <EmptyState
                icon={<Inbox className="w-12 h-12" />}
                title="Žádné stroje"
                subtitle={search ? 'Zkus jiný výraz' : 'Tato budova nemá stroje'}
                actionLabel="Vymazat filtr"
                onAction={() => {
                  setSearch('');
                  setSelectedBuilding(null);
                }}
              />
            ) : (
              <div>
                {filteredRooms.map((room, i) => (
                  <RoomSection
                    key={`${room.name}-${i}`}
                    room={room}
                    color={(room as any).buildingColor || currentColor}
                    onAssetClick={setSelectedAsset}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* BUDOVY TAB — building overview cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {buildings.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBuildingClick(b.id)}
                className="flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.97] text-left"
                style={{
                  background: `linear-gradient(145deg, ${b.color}12, ${b.color}04)`,
                  borderColor: `${b.color}25`,
                }}
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
                  style={{ background: `${b.color}20`, color: b.color }}
                >
                  {b.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-white">{b.name}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">
                    {b.totalAssets} zařízení · {b.rooms.length} místností
                  </div>
                  {b.issueCount > 0 && (
                    <div className="text-[12px] text-red-400 mt-0.5">
                      ⚠ {b.issueCount} problémů
                    </div>
                  )}
                  {/* Floor plan badge for building D */}
                  {b.id === 'D' && (
                    <div className="text-[11px] text-orange-400 mt-0.5 flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      Půdorys k dispozici
                    </div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Asset detail */}
      {selectedAsset && (
        <AssetDetailSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
}
