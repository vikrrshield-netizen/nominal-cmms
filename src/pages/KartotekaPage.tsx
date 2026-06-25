// src/pages/KartotekaPage.tsx
// VIKRR Asset Shield — Kartotéka (asset tree with grid cards)
// Root items = large cards in grid (MapPage style)
// Children = indented collapsible list under each card

import { useEffect, useState, useMemo, useCallback, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import {
  ArrowLeft, Building2, Search, Upload, Plus, X,
  ChevronRight, ChevronDown, FileText, Loader2, Trash2,
  ClipboardCheck, Cog, LayoutGrid, ListTree, ArrowUp, ArrowDown,
  ChevronsUp, ChevronsDown, GripVertical,
  Archive, Layers, CheckCircle2, Wrench, Pause, AlertTriangle, List, SlidersHorizontal, HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { assetService } from '../services/assetService';
import { isGearboxAsset } from '../services/gearboxService';
import { importAssets } from '../utils/importers/importAssets';
import type { Asset, AssetStatus, AssetCriticality } from '../types/asset';
import { ASSET_STATUS_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import { showToast } from '../components/ui/Toast';
import ImportModal from '../components/ui/ImportModal';
import BottomSheet, { FormFooter } from '../components/ui/BottomSheet';
import HowToSheet from '../components/help/HowToSheet';
import { guideById } from '../data/guides';
import './KartotekaPage.css';

// ── Status colors ────────────────────────────────────────────────
const STATUS_HEX: Record<string, string> = {
  operational: '#2e9e74',
  maintenance: '#e8932b',
  broken:      '#d7503a',
  stopped:     '#97a096',
};

const STATUS_DOT: Record<string, string> = {
  operational: 'bg-emerald-500',
  maintenance: 'bg-amber-500',
  broken:      'bg-red-500',
  stopped:     'bg-slate-400',
};

// ── Entity type → color mapping (for root cards) — klidná paleta ─────────────────
const ENTITY_COLORS: Record<string, string> = {
  'Budova':    '#1a6b4f',
  'Areál':     '#3d4a43',
  'Hala':      '#2f77b5',
  'Linka':     '#1f7355',
  'Dílna':     '#5c6b61',
  'Sklad':     '#d07e1e',
  'Kancelář':  '#7047a4',
};

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getEntityColor(entityType: string | undefined): string {
  return ENTITY_COLORS[entityType || ''] || '#2f77b5';
}

// ── Helpers ──────────────────────────────────────────────────────
type FilterKey = 'all' | 'broken' | 'maintenance' | 'stopped' | 'operational' | 'gearbox';
type CreateKind = 'building' | 'room' | 'asset' | 'gearbox' | 'inspection';
type ViewMode = 'tree' | 'tiles' | 'route';
type InspectionFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
const NO_FLOOR = '__no_floor';

const INSPECTION_FREQUENCY_OPTIONS: Array<{ value: InspectionFrequency; label: string }> = [
  { value: 'daily', label: 'Denně' },
  { value: 'weekly', label: 'Týdně' },
  { value: 'monthly', label: 'Měsíčně' },
  { value: 'quarterly', label: 'Čtvrtletně' },
  { value: 'yearly', label: 'Ročně' },
];

const ASSET_TYPE_OPTIONS = [
  'Zařízení',
  'Extruder',
  'Převodovka',
  'Kogenerační jednotka',
  'Kotel',
  'Čerpadlo',
  'Dopravník',
  'Ventilátor',
  'Kompresor',
  'Rozvaděč',
  'Měřidlo',
  'Ostatní',
];

type DisplayAsset = Asset & {
  isVirtual?: boolean;
  virtualKind?: 'building' | 'room';
  sourceBuildingId?: string;
  sourceAreaName?: string;
};

type DropPlacement = 'before' | 'after';

function slug(value: string) {
  return safeText(value).toLowerCase().trim().replace(/[^a-z0-9]+/gi, '_') || 'unknown';
}

function normalizeText(value: unknown): string {
  return safeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getFloorValue(asset: Pick<Asset, 'floor'>) {
  return safeText(asset.floor).trim() || NO_FLOOR;
}

function getFloorLabel(value: string) {
  return value === NO_FLOOR ? 'Bez patra' : value;
}

function isBuildingAsset(asset: Asset) {
  const type = normalizeText(asset.entityType);
  return type === 'budova' || type === 'hala' || type === 'areal';
}

function isRoomAsset(asset: Asset) {
  const type = normalizeText(asset.entityType);
  return type === 'mistnost' || type === 'mistnosti' || type === 'prostor';
}

function inferBuildingIdFromText(...values: string[]) {
  const joined = values.join(' ').toUpperCase();
  const explicit = joined.match(/\bBUDOVA\s*([A-Z0-9]{1,3})\b/);
  if (explicit) return explicit[1];
  const compact = joined.match(/\b([A-Z])\b/);
  return compact?.[1] || '';
}

function getBuildingLabel(asset: Asset) {
  return asset.buildingId ? `Budova ${asset.buildingId}` : 'Bez budovy';
}

function getRoomLabel(asset: Asset) {
  return safeText(asset.areaName) || safeText(asset.location) || '';
}

function resolveRouteMeta(asset: DisplayAsset, allAssets: DisplayAsset[]) {
  const ancestors = collectAncestorIds(asset.id, allAssets)
    .map((id) => allAssets.find((item) => item.id === id))
    .filter(Boolean) as DisplayAsset[];
  const ancestorRoom = ancestors.find((item) => isRoomAsset(item));
  const roomName = isRoomAsset(asset)
    ? safeText(asset.name) || safeText(asset.areaName)
    : getRoomLabel(asset);
  const matchedRoom = roomName
    ? allAssets.find((item) => item.id !== asset.id && isRoomAsset(item) && slug(safeText(item.name) || safeText(item.areaName)) === slug(roomName))
    : undefined;
  const room = ancestorRoom || matchedRoom;
  const ancestorBuilding = ancestors.find((item) => isBuildingAsset(item));
  const building = safeText(asset.buildingId || room?.buildingId || ancestorBuilding?.buildingId).trim();
  const floor = safeText(asset.floor || room?.floor).trim();
  return {
    building,
    floor: floor || NO_FLOOR,
    roomName: roomName || safeText(room?.name) || safeText(room?.areaName) || 'Bez místnosti',
    roomId: room?.id,
    roomIsVirtual: room?.isVirtual,
    order: room?.inspectionOrder ?? asset.inspectionOrder,
  };
}

function rootIconLabel(asset: DisplayAsset): string {
  if (asset.virtualKind === 'building' || isBuildingAsset(asset)) {
    return safeText(asset.sourceBuildingId || asset.buildingId || inferBuildingIdFromText(safeText(asset.name), safeText(asset.code))).slice(0, 2).toUpperCase() || 'B';
  }
  return (safeText(asset.name) || '?').charAt(0).toUpperCase();
}

function getCreateKindName(kind: CreateKind) {
  if (kind === 'building') return 'Budova';
  if (kind === 'room') return 'Místnost';
  if (kind === 'gearbox') return 'Převodovka';
  if (kind === 'inspection') return 'Kontrola';
  return 'Zařízení';
}

function getCreateKindHelp(kind: CreateKind) {
  if (kind === 'building') return 'Hlavní budova nebo hala v areálu.';
  if (kind === 'room') return 'Místnost nebo prostor uvnitř budovy.';
  if (kind === 'gearbox') return 'Samostatná karta převodovky s historií a umístěním.';
  if (kind === 'inspection') return 'Pravidelná kontrola, která se propíše do modulu Kontroly.';
  return 'Stroj, zařízení nebo věc, na kterou se bude zapisovat práce.';
}

function getParentOptionLabel(asset: DisplayAsset, allAssets: DisplayAsset[]) {
  const names = [...collectAncestorIds(asset.id, allAssets).reverse(), asset.id]
    .map((id) => allAssets.find((item) => item.id === id)?.name)
    .filter(Boolean);
  return names.join(' / ') || asset.name;
}

function makeVirtualNode(input: {
  id: string;
  parentId: string | null;
  tenantId: string;
  name: string;
  entityType: string;
  kind: 'building' | 'room';
  buildingId?: string;
  areaName?: string;
  floor?: string;
}): DisplayAsset {
  return {
    id: input.id,
    tenantId: input.tenantId,
    parentId: input.parentId,
    name: input.name,
    entityType: input.entityType,
    code: '',
    status: 'operational',
    criticality: 'low',
    buildingId: input.buildingId,
    areaName: input.areaName,
    floor: input.floor,
    isVirtual: true,
    virtualKind: input.kind,
    sourceBuildingId: input.buildingId,
    sourceAreaName: input.areaName,
  };
}

function buildRoomTree(realAssets: Asset[], tenantId: string): DisplayAsset[] {
  const result: DisplayAsset[] = [];
  const virtual = new Map<string, DisplayAsset>();
  const realIds = new Set(realAssets.map((asset) => asset.id));
  const realBuildingById = new Map(
    realAssets
      .filter((asset) => isBuildingAsset(asset) && asset.buildingId)
      .map((asset) => [asset.buildingId as string, asset])
  );
  const realRoomByKey = new Map(
    realAssets
      .filter((asset) => isRoomAsset(asset))
      .map((asset) => [`${asset.buildingId || ''}:${slug(asset.areaName || asset.name)}`, asset])
  );

  const ensureVirtual = (node: DisplayAsset) => {
    if (!virtual.has(node.id)) {
      virtual.set(node.id, node);
      result.push(node);
    }
  };

  for (const asset of realAssets) {
    if (isBuildingAsset(asset) || isRoomAsset(asset)) {
      result.push(asset);
      continue;
    }

    if (asset.parentId && realIds.has(asset.parentId)) {
      result.push(asset);
      continue;
    }

    const roomName = getRoomLabel(asset).trim();
    const buildingLabel = getBuildingLabel(asset);
    const buildingId = asset.buildingId || '';
    const realBuilding = buildingId ? realBuildingById.get(buildingId) : undefined;

    if (!roomName && !buildingId) {
      result.push(asset);
      continue;
    }

    const buildingNodeId = realBuilding?.id || `virtual-building:${slug(buildingLabel)}`;
    if (!realBuilding) {
      ensureVirtual(makeVirtualNode({
        id: buildingNodeId,
        parentId: null,
        tenantId,
        name: buildingLabel,
        entityType: 'Budova',
        kind: 'building',
        buildingId,
      }));
    }

    if (roomName) {
      const realRoom = realRoomByKey.get(`${buildingId}:${slug(roomName)}`);
      const roomNodeId = realRoom?.id || `virtual-room:${slug(buildingLabel)}:${slug(roomName)}`;
      if (!realRoom) ensureVirtual(makeVirtualNode({
        id: roomNodeId,
        parentId: buildingNodeId,
        tenantId,
        name: roomName,
        entityType: 'Místnost',
        kind: 'room',
        buildingId,
        areaName: roomName,
        floor: asset.floor,
      }));
      result.push({ ...asset, parentId: roomNodeId });
    } else {
      result.push({ ...asset, parentId: buildingNodeId });
    }
  }

  return result;
}

function collectAncestorIds(assetId: string, allAssets: DisplayAsset[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>([assetId]);
  let current = allAssets.find((a) => a.id === assetId);
  while (current?.parentId && !seen.has(current.parentId)) {
    ids.push(current.parentId);
    seen.add(current.parentId);
    current = allAssets.find((a) => a.id === current!.parentId);
  }
  return ids;
}

/** Count descendants recursively, grouped by status */
function countDescendants(parentId: string, allAssets: DisplayAsset[], visited = new Set<string>()) {
  let total = 0, broken = 0, maintenance = 0, operational = 0, stopped = 0;
  if (visited.has(parentId)) return { total, broken, maintenance, operational, stopped };

  const nextVisited = new Set(visited);
  nextVisited.add(parentId);
  const children = allAssets.filter((a) => a.parentId === parentId && !nextVisited.has(a.id));
  for (const c of children) {
    if (!c.isVirtual) {
      total++;
      if (c.status === 'broken') broken++;
      else if (c.status === 'maintenance') maintenance++;
      else if (c.status === 'stopped') stopped++;
      else operational++;
    }
    const sub = countDescendants(c.id, allAssets, nextVisited);
    total += sub.total;
    broken += sub.broken;
    maintenance += sub.maintenance;
    operational += sub.operational;
    stopped += sub.stopped;
  }
  return { total, broken, maintenance, operational, stopped };
}

// ═══════════════════════════════════════════════════════════════════
// CHILD TREE NODE — recursive list item for non-root assets
// ═══════════════════════════════════════════════════════════════════
interface TreeNodeProps {
  asset: DisplayAsset;
  allAssets: DisplayAsset[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDetail: (asset: DisplayAsset) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (asset: DisplayAsset) => void;
  canCreateAsset: boolean;
  visited?: Set<string>;
}

function TreeNode({ asset, allAssets, depth, expanded, onToggle, onDetail, onAddChild, onDelete, canCreateAsset, visited }: TreeNodeProps) {
  const currentPath = new Set(visited);
  currentPath.add(asset.id);
  const children = allAssets
    .filter((a) => a.parentId === asset.id && !currentPath.has(a.id))
    .sort((a, b) => safeText(a.name).localeCompare(safeText(b.name), 'cs'));
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(asset.id);
  const statusColor = STATUS_HEX[asset.status] || '#6b7280';
  const desc = countDescendants(asset.id, allAssets);

  return (
    <div className={`k-tree-node ${asset.virtualKind ? `is-${asset.virtualKind}` : 'is-asset'}`}>
      <div
        className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 cursor-pointer transition hover:border-emerald-200 hover:bg-[#fbf9f4]"
        style={{ marginLeft: `${depth * 18}px` }}
        onClick={() => hasChildren ? onToggle(asset.id) : onDetail(asset)}
      >
        {hasChildren ? (
          <button
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={(e) => { e.stopPropagation(); onToggle(asset.id); }}
            aria-label={isExpanded ? 'Sbalit' : 'Rozbalit'}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />

        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-800">
          {safeText(asset.name) || 'Bez názvu'}
        </span>

        <span className="hidden shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-500 sm:flex">
          <span className="font-mono">{desc.total}</span>
          {desc.operational > 0 && (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="font-mono">{desc.operational}</span></span>
          )}
          {desc.maintenance > 0 && (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /><span className="font-mono">{desc.maintenance}</span></span>
          )}
          {desc.broken > 0 && (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="font-mono">{desc.broken}</span></span>
          )}
          {desc.stopped > 0 && (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span className="font-mono">{desc.stopped}</span></span>
          )}
        </span>

        {hasChildren && (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">{children.length}</span>
        )}

        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-slate-50"
          onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
          title="Otevřít rodný list"
          aria-label="Rodný list"
        >
          <FileText size={15} />
        </button>

        {canCreateAsset && (
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-600 hover:bg-slate-50"
            onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
            title="Přidat potomka"
            aria-label="Přidat"
          >
            <Plus size={15} />
          </button>
        )}

        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50"
          onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
          title="Smazat"
          aria-label="Smazat"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              asset={child}
              allAssets={allAssets}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onDetail={onDetail}
              onAddChild={onAddChild}
              onDelete={onDelete}
              canCreateAsset={canCreateAsset}
              visited={currentPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROOT CARD — large card for top-level items (MapPage style)
// ═══════════════════════════════════════════════════════════════════
interface RootCardProps {
  asset: DisplayAsset;
  allAssets: DisplayAsset[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDetail: (asset: DisplayAsset) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (asset: DisplayAsset) => void;
  canCreateAsset: boolean;
}

function RootCard({ asset, allAssets, expanded, onToggle, onDetail, onAddChild, onDelete, canCreateAsset }: RootCardProps) {
  const color = getEntityColor(asset.entityType);
  const children = allAssets
    .filter((a) => a.parentId === asset.id)
    .sort((a, b) => safeText(a.name).localeCompare(safeText(b.name), 'cs'));
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(asset.id);
  const desc = countDescendants(asset.id, allAssets);
  const dotClass = STATUS_DOT[asset.status] || 'bg-slate-400';

  return (
    <div className={`k-root-wrapper ${isExpanded ? 'is-expanded' : ''}`}>
      <div className="vik-card overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="flex items-center gap-3 p-3.5">
          {/* Icon + status dot */}
          <div className="relative shrink-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: `${color}1f`, color }}
            >
              {rootIconLabel(asset)}
            </div>
            <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white ${dotClass}`} />
          </div>

          {/* Název = rozbalit/sbalit větev (jinak otevře rodný list) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggle(asset.id);
              else onDetail(asset);
            }}
            title={hasChildren ? (isExpanded ? 'Sbalit' : 'Rozbalit') : 'Otevřít rodný list'}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {hasChildren && (
              <span className="shrink-0 text-slate-400">
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-black text-slate-950">
                {safeText(asset.name) || 'Bez názvu'}
                {hasChildren && (
                  <span className="font-mono font-bold text-slate-400"> ({children.length})</span>
                )}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold text-slate-500">
                <span className="font-bold uppercase tracking-wide text-slate-400">{safeText(asset.entityType) || 'Položka'}</span>
                {asset.code && <span className="font-mono text-slate-400">{asset.code}</span>}
                <span className="font-mono">{desc.total} pol.</span>
                {desc.operational > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="font-mono">{desc.operational}</span></span>
                )}
                {desc.maintenance > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /><span className="font-mono">{desc.maintenance}</span></span>
                )}
                {desc.broken > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="font-mono">{desc.broken}</span></span>
                )}
                {desc.stopped > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span className="font-mono">{desc.stopped}</span></span>
                )}
              </span>
            </span>
          </button>

          {/* Akce — vpravo (ikon-only) */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-[#f8f4ec] text-emerald-700 hover:bg-slate-50"
              onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
              title="Otevřít rodný list"
              aria-label="Rodný list"
            >
              <FileText size={16} />
            </button>
            {canCreateAsset && (
              <button
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-[#f8f4ec] text-sky-600 hover:bg-slate-50"
                onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
                title="Přidat potomka"
                aria-label="Přidat"
              >
                <Plus size={16} />
              </button>
            )}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-[#f8f4ec] text-red-600 hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
              title="Smazat"
              aria-label="Smazat"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded children list */}
      {isExpanded && hasChildren && (
        <div className="mt-1.5 space-y-1 pl-3">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              asset={child}
              allAssets={allAssets}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              onDetail={onDetail}
              onAddChild={onAddChild}
              onDelete={onDelete}
              canCreateAsset={canCreateAsset}
              visited={new Set([asset.id])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════
interface TileCardProps {
  asset: DisplayAsset;
  allAssets: DisplayAsset[];
  onDetail: (asset: DisplayAsset) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (asset: DisplayAsset) => void;
  canCreateAsset: boolean;
}

function TileCard({ asset, allAssets, onDetail, onAddChild, onDelete, canCreateAsset }: TileCardProps) {
  const color = getEntityColor(asset.entityType);
  const dotClass = STATUS_DOT[asset.status] || 'bg-slate-400';
  const desc = countDescendants(asset.id, allAssets);
  const parentPath = collectAncestorIds(asset.id, allAssets)
    .reverse()
    .map((id) => allAssets.find((item) => item.id === id)?.name)
    .filter(Boolean)
    .join(' / ');
  const statusLabel = ASSET_STATUS_CONFIG[asset.status as AssetStatus]?.label || asset.status || 'Stav';
  const location = [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.floor || '', safeText(asset.areaName) || safeText(asset.location)]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="vik-card overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
      <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => onDetail(asset)}>
        <span className="relative shrink-0">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: `${color}1f`, color }}
          >
            {rootIconLabel(asset)}
          </span>
          <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white ${dotClass}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-black text-slate-950">{safeText(asset.name) || 'Bez názvu'}</span>
          <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{safeText(asset.entityType) || 'Položka'} · {statusLabel}</span>
        </span>
      </button>

      <div className="space-y-0.5 px-3 pb-1 font-mono text-[11px] text-slate-400">
        {asset.code && <div className="truncate">{asset.code}</div>}
        {location && <div className="truncate">{location}</div>}
        {parentPath && <div className="truncate">{parentPath}</div>}
      </div>

      {desc.total > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[11px] font-semibold text-slate-500">
          <span className="font-mono">{desc.total} pol.</span>
          {desc.operational > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="font-mono">{desc.operational}</span></span>}
          {desc.maintenance > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /><span className="font-mono">{desc.maintenance}</span></span>}
          {desc.broken > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="font-mono">{desc.broken}</span></span>}
          {desc.stopped > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span className="font-mono">{desc.stopped}</span></span>}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
        <button type="button" className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-[13px] font-bold text-emerald-700 hover:bg-slate-50" onClick={() => onDetail(asset)}>
          <FileText size={15} /> Rodný list
        </button>
        {canCreateAsset && (
          <button type="button" className="flex h-8 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-600 hover:bg-slate-50" onClick={() => onAddChild(asset.id)} aria-label="Přidat">
            <Plus size={15} />
          </button>
        )}
        <button type="button" className="flex h-8 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50" onClick={() => onDelete(asset)} aria-label="Smazat">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

export default function KartotekaPage() {
  const navigate = useNavigate();
  const goBack = useBackNavigation('/');
  const { user, isSandbox, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const canCreateAsset = !isSandbox && ['SUPERADMIN', 'MAJITEL', 'VEDENI', 'UDRZBA', 'VYROBA'].includes(user?.role || '');
  const canManageRoute = !isSandbox && hasPermission('asset.update');

  // ── Data state ───
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ───
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [routeSavingKey, setRouteSavingKey] = useState<string | null>(null);
  const [routeDraggingKey, setRouteDraggingKey] = useState<string | null>(null);
  const [routeDropKey, setRouteDropKey] = useState<string | null>(null);
  const [routeAssetDraggingId, setRouteAssetDraggingId] = useState<string | null>(null);
  const [routeAssetDropId, setRouteAssetDropId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'tree';
    const saved = window.localStorage.getItem('kartoteka:viewMode');
    return saved === 'tiles' || saved === 'route' ? saved : 'tree';
  });
  const [floorFilter, setFloorFilter] = useState('all');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const addDeviceGuide = guideById('add-device');

  // ── Delete state ───
  const [deleteTarget, setDeleteTarget] = useState<DisplayAsset | null>(null);

  // ── Create modal state ───
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>('asset');
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createParentChoiceId, setCreateParentChoiceId] = useState('');
  const [createBuildingId, setCreateBuildingId] = useState('');
  const [createAreaName, setCreateAreaName] = useState('');
  const [createFloor, setCreateFloor] = useState('');
  const [createInspection, setCreateInspection] = useState(false);
  const [createInspectionFrequency, setCreateInspectionFrequency] = useState<InspectionFrequency>('monthly');
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    entityType: '',
    code: '',
    description: '',
    category: 'budova',
    status: 'operational' as AssetStatus,
    criticality: 'medium' as AssetCriticality,
  });

  // ── Load assets ───
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    assetService.getAll(tenantId)
      .then((data) => { if (!cancelled) setAssets(data); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  const reloadAssets = useCallback(() => {
    if (!tenantId) return;
    assetService.getAll(tenantId)
      .then(setAssets)
      .catch((err) => setError(String(err)));
  }, [tenantId]);

  // ── Excel import handler ───
  const handleImport = async (rows: Record<string, unknown>[]) => {
    const result = await importAssets(rows, tenantId);
    if (result.imported > 0) reloadAssets();
    return result;
  };

  const createInspectionPoint = async (input: {
    roomCode: string;
    roomName: string;
    buildingId: string;
    floor?: string;
    description: string;
    category?: string;
    assetId?: string;
    frequency?: InspectionFrequency;
  }) => {
    const building = input.buildingId || 'D';
    const floor = input.floor || '1.NP';
    const frequency = input.frequency || 'monthly';
    const checkPoints = input.description || 'Vizuální kontrola';
    const month = new Date().toISOString().slice(0, 7);
    const templateId = input.assetId
      ? `kartoteka_${input.assetId}`
      : `kartoteka_${slug(`${building}_${floor}_${input.roomCode}_${input.roomName}_${checkPoints}`).slice(0, 80)}`;
    const logId = `${templateId}_${month}`;
    const now = serverTimestamp();

    await addDoc(collection(db, 'inspections'), {
      roomCode: input.roomCode,
      roomName: input.roomName,
      floor,
      buildingId: building,
      description: checkPoints,
      category: input.category || 'budova',
      sourceAssetId: input.assetId || null,
      frequency,
      status: 'pending',
      lastInspectedAt: null,
      lastInspectedBy: null,
      issueNote: null,
      createdAt: Timestamp.now(),
    });

    await setDoc(doc(db, 'inspection_templates', templateId), {
      templateId,
      building,
      floor,
      roomName: input.roomName,
      roomCode: input.roomCode,
      checkPoints,
      frequency,
      category: input.category || 'budova',
      sourceAssetId: input.assetId || null,
      source: 'kartoteka',
      isDeleted: false,
      sortOrder: Date.now(),
      createdByName: user?.displayName || 'Kartoteka',
      updatedAt: now,
      createdAt: now,
    }, { merge: true });

    await setDoc(doc(db, 'inspection_logs', logId), {
      templateId,
      month,
      building,
      floor,
      roomName: input.roomName,
      roomCode: input.roomCode,
      checkPoints,
      frequency,
      sortOrder: Date.now(),
      status: 'pending',
      defectNote: '',
      inspectionNote: '',
      completedBy: '',
      completedAt: null,
      isDeleted: false,
      sourceAssetId: input.assetId || null,
      createdByName: user?.displayName || 'Kartoteka',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  };

  // ── Create asset handler ───
  const handleCreate = async () => {
    if (!createForm.name.trim() || !tenantId) return;
    if (!canCreateAsset) {
      showToast(isSandbox
        ? 'Demo režim neukládá do databáze. Přihlas se skutečným PINem údržby nebo vedení.'
        : 'Tvoje role nemá právo vytvářet položky v kartotéce.',
        'error'
      );
      return;
    }
    setCreateSaving(true);
    try {
      const parent = createParentId ? assets.find((asset) => asset.id === createParentId) : null;
      const parentIsRoom = !!parent && isRoomAsset(parent);
      const buildingId = createBuildingId
        || parent?.buildingId
        || (createKind === 'building' ? inferBuildingIdFromText(createForm.code, createForm.name) : '');
      const roomName = createKind === 'room' ? createForm.name.trim() : (createAreaName || parent?.name || createForm.name.trim());
      const roomCode = createForm.code.trim() || (buildingId ? `${buildingId} - ${roomName}` : roomName);

      if (createKind === 'inspection') {
        await createInspectionPoint({
          roomCode,
          roomName,
          buildingId: buildingId || 'D',
          floor: createFloor || parent?.floor,
          description: createForm.description.trim() || createForm.name.trim(),
          category: createForm.category,
          assetId: parent?.id,
          frequency: createInspectionFrequency,
        });
        showToast('Kontrola vytvořena v modulu Kontroly', 'success');
        setShowCreate(false);
        resetCreateForm();
        setCreateSaving(false);
        return;
      }

      const newAssetId = await assetService.add(tenantId, {
        tenantId,
        name: createForm.name.trim(),
        entityType: createForm.entityType.trim()
          || (createKind === 'building' ? 'Budova' : createKind === 'room' ? 'Místnost' : 'Zařízení'),
        code: createForm.code.trim() || null,
        status: createForm.status,
        criticality: createForm.criticality,
        parentId: createKind === 'building' ? null : createParentId,
        buildingId: buildingId || undefined,
        areaName: createKind === 'room' ? createForm.name.trim() : (createAreaName || undefined),
        floor: createFloor || parent?.floor || undefined,
        location: parentIsRoom ? parent?.name : undefined,
        category: createKind === 'gearbox' ? 'gearbox' : undefined,
        gearboxStatus: createKind === 'gearbox' ? 'in_stock' : undefined,
      } as Omit<Asset, 'id'>);

      if (createKind === 'room' && createInspection) {
        await createInspectionPoint({
          roomCode,
          roomName,
          buildingId: buildingId || 'D',
          floor: createFloor,
          description: createForm.description.trim() || 'Vizuální kontrola místnosti',
          category: createForm.category,
          assetId: newAssetId,
          frequency: createInspectionFrequency,
        });
      }
      const parentName = createParentId
        ? assets.find((a) => a.id === createParentId)?.name
        : createAreaName || (createBuildingId ? `Budova ${createBuildingId}` : null);
      showToast(
        parentName
          ? `Vytvořeno pod "${parentName}"`
          : 'Kořenový prvek vytvořen',
        'success'
      );
      setShowCreate(false);
      resetCreateForm();
      reloadAssets();
      // Auto-expand parent so user sees the new child
      if (createParentId || createAreaName || createBuildingId) {
        const branchId = createAreaName
          ? `virtual-room:${slug(createBuildingId ? `Budova ${createBuildingId}` : 'Bez budovy')}:${slug(createAreaName)}`
          : createBuildingId ? `virtual-building:${slug(`Budova ${createBuildingId}`)}` : createParentId;
        if (branchId) setExpanded((prev) => new Set([...prev, branchId]));
      }
    } catch (err) {
      console.error('[Kartoteka] create error:', err);
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      showToast(
        code.includes('permission-denied')
          ? 'Databáze zápis odmítla: nemáš oprávnění pro vytvoření položky v kartotéce.'
          : 'Chyba při vytváření. Zkus obnovit stránku a zadat položku znovu.',
        'error'
      );
    }
    setCreateSaving(false);
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '', entityType: '', code: '', description: '', category: 'budova',
      status: 'operational', criticality: 'medium',
    });
    setCreateKind('asset');
    setCreateParentId(null);
    setCreateParentChoiceId('');
    setCreateBuildingId('');
    setCreateAreaName('');
    setCreateFloor('');
    setCreateInspection(false);
    setCreateInspectionFrequency('monthly');
  };

  const openCreateModal = (parentId: string | null, kind?: CreateKind) => {
    if (!canCreateAsset) {
      showToast(isSandbox
        ? 'Demo režim neukládá do databáze. Přihlas se skutečným PINem údržby nebo vedení.'
        : 'Tvoje role nemá právo vytvářet položky v kartotéce.',
        'error'
      );
      return;
    }
    resetCreateForm();
    const parent = parentId ? treeAssets.find((asset) => asset.id === parentId) : null;
    const nextKind = kind || (!parent ? 'building' : isBuildingAsset(parent) ? 'room' : 'asset');
    setCreateKind(nextKind);
    if (parent?.isVirtual) {
      setCreateParentId(null);
      setCreateParentChoiceId(parent.id);
      setCreateBuildingId(parent.sourceBuildingId || parent.buildingId || '');
      setCreateAreaName(parent.virtualKind === 'room' ? (parent.sourceAreaName || parent.areaName || parent.name) : '');
    } else {
      setCreateParentId(parentId);
      setCreateParentChoiceId(parentId || '');
      setCreateBuildingId(parent?.buildingId || '');
      setCreateAreaName(parent && isRoomAsset(parent) ? parent.name || parent.areaName || '' : parent?.areaName || '');
      setCreateFloor(parent?.floor || '');
    }
    setCreateForm((prev) => ({
      ...prev,
      entityType: nextKind === 'building' ? 'Budova' : nextKind === 'room' ? 'Místnost' : nextKind === 'gearbox' ? 'Převodovka' : nextKind === 'inspection' ? 'Kontrola' : '',
      category: nextKind === 'inspection' ? 'budova' : prev.category,
      description: nextKind === 'inspection' ? 'Vizuální kontrola místnosti' : '',
    }));
    if (nextKind === 'asset') {
      setCreateForm((prev) => ({ ...prev, entityType: 'Zařízení' }));
    }
    setShowCreate(true);
  };

  // ── Delete handler ───
  const handleDelete = useCallback((asset: DisplayAsset) => {
    if (asset.isVirtual) {
      showToast('Toto je jen větev stromu, ne skutečná karta ke smazání.', 'error');
      return;
    }
    const childCount = assets.filter((a) => a.parentId === asset.id).length;
    if (childCount > 0) {
      showToast(`Nelze smazat — má ${childCount} potomků. Nejdřív smaž potomky.`, 'error');
      return;
    }
    setDeleteTarget(asset);
  }, [assets]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !tenantId) return;
    try {
      await assetService.delete(tenantId, deleteTarget.id);
      showToast(`Smazáno: ${deleteTarget.name}`, 'success');
      setDeleteTarget(null);
      reloadAssets();
    } catch (err) {
      console.error('[Kartoteka] delete error:', err);
      showToast('Chyba při mazání', 'error');
    }
  }, [deleteTarget, tenantId, reloadAssets]);

  // ── Toggle expand/collapse ───
  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Navigate to detail ───
  const resolveVirtualAsset = useCallback((asset: DisplayAsset): Asset | null => {
    if (!asset.isVirtual) return asset;

    const sourceBuildingId = safeText(asset.sourceBuildingId || asset.buildingId || inferBuildingIdFromText(safeText(asset.name), safeText(asset.code))).toUpperCase();
    const normalizedName = normalizeText(asset.name);
    const normalizedArea = normalizeText(asset.sourceAreaName || asset.areaName || asset.name);

    if (asset.virtualKind === 'building') {
      return assets.find((candidate) => {
        if (!isBuildingAsset(candidate)) return false;
        const candidateBuildingId = safeText(candidate.buildingId || inferBuildingIdFromText(safeText(candidate.name), safeText(candidate.code))).toUpperCase();
        const candidateCode = safeText(candidate.code).toUpperCase();
        return Boolean(
          (sourceBuildingId && (candidateBuildingId === sourceBuildingId || candidateCode === sourceBuildingId))
          || normalizeText(candidate.name) === normalizedName
        );
      }) || null;
    }

    if (asset.virtualKind === 'room') {
      return assets.find((candidate) => {
        if (!isRoomAsset(candidate)) return false;
        const candidateBuildingId = safeText(candidate.buildingId || inferBuildingIdFromText(safeText(candidate.name), safeText(candidate.code))).toUpperCase();
        const sameBuilding = !sourceBuildingId || candidateBuildingId === sourceBuildingId;
        const candidateArea = normalizeText(candidate.areaName || candidate.name || candidate.location);
        return sameBuilding && candidateArea === normalizedArea;
      }) || null;
    }

    return null;
  }, [assets]);

  const createRealBuildingFromVirtual = useCallback(async (asset: DisplayAsset): Promise<string | null> => {
    if (!tenantId || asset.virtualKind !== 'building') return null;
    if (!canCreateAsset) {
      showToast(isSandbox
        ? 'Demo režim neukládá do databáze. Přihlas se skutečným PINem údržby nebo vedení.'
        : 'Tvoje role nemá právo vytvářet budovy v kartotéce.',
        'error'
      );
      return null;
    }

    const buildingId = safeText(
      asset.sourceBuildingId
      || asset.buildingId
      || inferBuildingIdFromText(safeText(asset.name), safeText(asset.code))
    ).toUpperCase();
    const name = safeText(asset.name) || (buildingId ? `Budova ${buildingId}` : 'Budova');

    try {
      const newAssetId = await assetService.add(tenantId, {
        tenantId,
        parentId: null,
        name,
        entityType: 'Budova',
        code: buildingId || undefined,
        buildingId: buildingId || undefined,
        status: 'operational',
        criticality: 'medium',
        notes: 'Karta budovy vytvořená z kartotéky.',
      });

      setAssets((prev) => [
        ...prev,
        {
          id: newAssetId,
          tenantId,
          parentId: null,
          name,
          entityType: 'Budova',
          code: buildingId || undefined,
          buildingId: buildingId || undefined,
          status: 'operational',
          criticality: 'medium',
          notes: 'Karta budovy vytvořená z kartotéky.',
        },
      ]);
      showToast(`Budova "${name}" dostala vlastní kartu`, 'success');
      return newAssetId;
    } catch (err) {
      console.error('[Kartoteka] create virtual building card error:', err);
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      showToast(
        code.includes('permission-denied')
          ? 'Databáze zápis odmítla: nemáš oprávnění založit kartu budovy.'
          : 'Nepodařilo se založit kartu budovy. Zkus to prosím znovu.',
        'error'
      );
      return null;
    }
  }, [canCreateAsset, isSandbox, tenantId]);

  const createRealRoomFromVirtual = useCallback(async (asset: DisplayAsset): Promise<string | null> => {
    if (!tenantId || asset.virtualKind !== 'room') return null;
    if (!canCreateAsset) {
      showToast(isSandbox
        ? 'Demo režim neukládá do databáze. Přihlas se skutečným PINem údržby nebo vedení.'
        : 'Tvoje role nemá právo vytvářet místnosti v kartotéce.',
        'error'
      );
      return null;
    }

    const buildingId = safeText(
      asset.sourceBuildingId
      || asset.buildingId
      || inferBuildingIdFromText(safeText(asset.name), safeText(asset.code))
    ).toUpperCase();
    const areaName = safeText(asset.sourceAreaName || asset.areaName || asset.name) || 'Místnost';
    const parentBuilding = assets.find((candidate) => {
      if (!isBuildingAsset(candidate)) return false;
      const candidateBuildingId = safeText(candidate.buildingId || inferBuildingIdFromText(safeText(candidate.name), safeText(candidate.code))).toUpperCase();
      const candidateCode = safeText(candidate.code).toUpperCase();
      return Boolean(buildingId && (candidateBuildingId === buildingId || candidateCode === buildingId));
    });

    try {
      const newAssetId = await assetService.add(tenantId, {
        tenantId,
        parentId: parentBuilding?.id || null,
        name: areaName,
        entityType: 'Místnost',
        code: undefined,
        buildingId: buildingId || undefined,
        areaName,
        status: 'operational',
        criticality: 'medium',
        notes: 'Karta místnosti vytvořená z kartotéky.',
      });

      setAssets((prev) => [
        ...prev,
        {
          id: newAssetId,
          tenantId,
          parentId: parentBuilding?.id || null,
          name: areaName,
          entityType: 'Místnost',
          buildingId: buildingId || undefined,
          areaName,
          status: 'operational',
          criticality: 'medium',
          notes: 'Karta místnosti vytvořená z kartotéky.',
        },
      ]);
      showToast(`Místnost "${areaName}" dostala vlastní kartu`, 'success');
      return newAssetId;
    } catch (err) {
      console.error('[Kartoteka] create virtual room card error:', err);
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      showToast(
        code.includes('permission-denied')
          ? 'Databáze zápis odmítla: nemáš oprávnění založit kartu místnosti.'
          : 'Nepodařilo se založit kartu místnosti. Zkus to prosím znovu.',
        'error'
      );
      return null;
    }
  }, [assets, canCreateAsset, isSandbox, tenantId]);

  const handleDetail = useCallback(async (asset: DisplayAsset) => {
    if (asset.isVirtual) {
      const realAsset = resolveVirtualAsset(asset);
      if (realAsset) {
        navigate(`/asset/${realAsset.id}`, { state: { from: '/kartoteka' } });
        return;
      }
      if (asset.virtualKind === 'building') {
        const newAssetId = await createRealBuildingFromVirtual(asset);
        if (newAssetId) {
          navigate(`/asset/${newAssetId}`, { state: { from: '/kartoteka' } });
        }
        return;
      }
      if (asset.virtualKind === 'room') {
        const newAssetId = await createRealRoomFromVirtual(asset);
        if (newAssetId) {
          navigate(`/asset/${newAssetId}`, { state: { from: '/kartoteka' } });
        }
        return;
      }
      showToast(
        'Tahle položka je zatím jen větev stromu. Založ ji jako skutečnou kartu, aby šla otevřít.',
        'error'
      );
      return;
    }
    navigate(`/asset/${asset.id}`, { state: { from: '/kartoteka' } });
  }, [createRealBuildingFromVirtual, createRealRoomFromVirtual, navigate, resolveVirtualAsset]);

  // ── Counts ───
  const counts = useMemo(() => ({
    total: assets.length,
    operational: assets.filter((a) => a.status === 'operational').length,
    maintenance: assets.filter((a) => a.status === 'maintenance').length,
    broken:      assets.filter((a) => a.status === 'broken').length,
    stopped:     assets.filter((a) => a.status === 'stopped').length,
    gearboxes:   assets.filter((a) => isGearboxAsset(a)).length,
  }), [assets]);

  const treeAssets = useMemo(() => buildRoomTree(assets, tenantId), [assets, tenantId]);

  // ── Filtering (search + status) ───
  const { visibleAssets } = useMemo(() => {
    let matching = treeAssets;

    if (search.trim()) {
      const q = search.toLowerCase();
      matching = matching.filter(
        (a) => safeText(a.name).toLowerCase().includes(q) ||
               safeText(a.entityType).toLowerCase().includes(q) ||
               safeText(a.code).toLowerCase().includes(q) ||
               safeText(a.areaName).toLowerCase().includes(q) ||
               safeText(a.location).toLowerCase().includes(q) ||
               safeText(a.buildingId).toLowerCase().includes(q)
      );
    }

    if (filter !== 'all') {
      matching = filter === 'gearbox'
        ? matching.filter((a) => a.isVirtual || isGearboxAsset(a))
        : matching.filter((a) => a.isVirtual || a.status === filter);
    }

    if (floorFilter !== 'all') {
      matching = matching.filter((a) => a.isVirtual || getFloorValue(a) === floorFilter);
    }

    // Include ancestors so tree stays intact
    if (search.trim() || filter !== 'all' || floorFilter !== 'all') {
      const idSet = new Set<string>();
      for (const a of matching) {
        idSet.add(a.id);
        for (const ancestorId of collectAncestorIds(a.id, treeAssets)) {
          idSet.add(ancestorId);
        }
      }
      return { visibleAssets: treeAssets.filter((a) => idSet.has(a.id)) };
    }

    return { visibleAssets: treeAssets };
  }, [treeAssets, search, filter, floorFilter]);

  const floorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const asset of treeAssets) {
      if (!asset.isVirtual) values.add(getFloorValue(asset));
    }
    return Array.from(values).sort((a, b) => getFloorLabel(a).localeCompare(getFloorLabel(b), 'cs'));
  }, [treeAssets]);

  const rootAssets = useMemo(() => {
    const visibleIds = new Set(visibleAssets.map((a) => a.id));
    return visibleAssets
      .filter((a) => !a.parentId || !visibleIds.has(a.parentId))
      .sort((a, b) => safeText(a.name).localeCompare(safeText(b.name), 'cs'));
  }, [visibleAssets]);

  const tileAssets = useMemo(() => {
    return visibleAssets
      .filter((asset) => !asset.isVirtual)
      .sort((a, b) => {
        const aKey = `${a.buildingId || ''} ${a.floor || ''} ${safeText(a.code)} ${safeText(a.areaName)} ${safeText(a.name)}`;
        const bKey = `${b.buildingId || ''} ${b.floor || ''} ${safeText(b.code)} ${safeText(b.areaName)} ${safeText(b.name)}`;
        return aKey.localeCompare(bKey, 'cs');
      });
  }, [visibleAssets]);

  const routeGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      title: string;
      subtitle: string;
      assets: DisplayAsset[];
      order: number;
      fallbackKey: string;
      targetIds: Set<string>;
    }>();
    for (const asset of tileAssets.filter((item) => !isBuildingAsset(item))) {
      const meta = resolveRouteMeta(asset, visibleAssets);
      const buildingLabel = meta.building ? `Budova ${meta.building}` : 'Bez budovy';
      const floorLabel = getFloorLabel(meta.floor);
      const key = `${meta.building || 'none'}::${meta.floor}::${slug(meta.roomName)}`;
      const fallbackKey = `${meta.building || ''} ${meta.floor} ${safeText(asset.code)} ${meta.roomName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: meta.roomName,
          subtitle: `${buildingLabel} - ${floorLabel}`,
          assets: [],
          order: meta.order ?? Number.MAX_SAFE_INTEGER,
          fallbackKey,
          targetIds: new Set<string>(),
        });
      }
      const group = groups.get(key)!;
      group.assets.push(asset);
      if (meta.roomId && !meta.roomIsVirtual) group.targetIds.add(meta.roomId);
      if (meta.order !== undefined) group.order = Math.min(group.order, meta.order);
      if (fallbackKey.localeCompare(group.fallbackKey, 'cs') < 0) group.fallbackKey = fallbackKey;
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        assets: group.assets.sort((a, b) => {
          const aOrder = Number.isFinite(a.inspectionItemOrder) ? a.inspectionItemOrder! : Number.MAX_SAFE_INTEGER;
          const bOrder = Number.isFinite(b.inspectionItemOrder) ? b.inspectionItemOrder! : Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) return aOrder - bOrder;
          const aKey = `${safeText(a.code)} ${safeText(a.name)}`;
          const bKey = `${safeText(b.code)} ${safeText(b.name)}`;
          return aKey.localeCompare(bKey, 'cs');
        }),
        targetIds: group.targetIds.size > 0 ? Array.from(group.targetIds) : group.assets.map((asset) => asset.id),
      }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.fallbackKey.localeCompare(b.fallbackKey, 'cs');
      });
  }, [tileAssets, visibleAssets]);

  const currentViewCount = viewMode === 'tree'
    ? rootAssets.length
    : viewMode === 'route'
      ? routeGroups.length
      : tileAssets.length;

  const saveRouteGroupOrder = useCallback(async (targetIds: string[], order: number) => {
    const uniqueTargetIds = Array.from(new Set(targetIds)).filter(Boolean);
    if (uniqueTargetIds.length === 0) return;
    await Promise.all(
      uniqueTargetIds.map((assetId) =>
        assetService.update(tenantId, assetId, { inspectionOrder: order })
      )
    );
  }, [tenantId]);

  const saveRouteGroupSequence = useCallback(async (orderedGroups: typeof routeGroups) => {
    await Promise.all(
      orderedGroups.map((group, index) =>
        saveRouteGroupOrder(group.targetIds, (index + 1) * 1000)
      )
    );
  }, [saveRouteGroupOrder]);

  const moveRouteGroupToIndex = useCallback(async (sourceKey: string, requestedTargetIndex: number) => {
    if (!canManageRoute) return;
    const sourceIndex = routeGroups.findIndex((group) => group.key === sourceKey);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(requestedTargetIndex, routeGroups.length - 1));
    if (sourceIndex === targetIndex) return;

    const nextGroups = [...routeGroups];
    const [moved] = nextGroups.splice(sourceIndex, 1);
    nextGroups.splice(targetIndex, 0, moved);

    setRouteSavingKey(sourceKey);
    try {
      await saveRouteGroupSequence(nextGroups);
      showToast('Pořadí kontroly uloženo.', 'success');
      reloadAssets();
    } catch (err) {
      console.error(err);
      showToast('Pořadí se nepodařilo uložit.', 'error');
    } finally {
      setRouteSavingKey(null);
      setRouteDraggingKey(null);
      setRouteDropKey(null);
    }
  }, [canManageRoute, reloadAssets, routeGroups, saveRouteGroupSequence]);

  const reorderRouteGroup = useCallback(async (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    const targetIndex = routeGroups.findIndex((group) => group.key === targetKey);
    if (targetIndex < 0) return;
    await moveRouteGroupToIndex(sourceKey, targetIndex);
  }, [moveRouteGroupToIndex, routeGroups]);

  const handleMoveRouteGroup = useCallback(async (groupKey: string, direction: -1 | 1) => {
    const index = routeGroups.findIndex((group) => group.key === groupKey);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= routeGroups.length) return;
    await moveRouteGroupToIndex(groupKey, swapIndex);
  }, [moveRouteGroupToIndex, routeGroups]);

  const saveRouteAssetSequence = useCallback(async (orderedAssets: DisplayAsset[]) => {
    await Promise.all(
      orderedAssets
        .filter((asset) => !asset.isVirtual)
        .map((asset, index) =>
          assetService.update(tenantId, asset.id, { inspectionItemOrder: (index + 1) * 1000 })
        )
    );
  }, [tenantId]);

  const getRouteAssetDropPlacement = useCallback((event: DragEvent<HTMLElement>): DropPlacement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontalBias = Math.abs(event.clientX - (rect.left + rect.width / 2));
    const verticalBias = Math.abs(event.clientY - (rect.top + rect.height / 2));
    if (horizontalBias > verticalBias) {
      return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    }
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }, []);

  const reorderRouteAsset = useCallback(async (
    groupKey: string,
    sourceAssetId: string,
    targetAssetId: string,
    placement: DropPlacement = 'before'
  ) => {
    if (!canManageRoute || sourceAssetId === targetAssetId) return;
    const group = routeGroups.find((item) => item.key === groupKey);
    if (!group) return;
    const sourceIndex = group.assets.findIndex((asset) => asset.id === sourceAssetId);
    const targetIndex = group.assets.findIndex((asset) => asset.id === targetAssetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const nextAssets = [...group.assets];
    const [moved] = nextAssets.splice(sourceIndex, 1);
    const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = placement === 'after' ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
    nextAssets.splice(Math.max(0, Math.min(insertIndex, nextAssets.length)), 0, moved);

    setRouteSavingKey(groupKey);
    try {
      await saveRouteAssetSequence(nextAssets);
      showToast('Pořadí zařízení uloženo.', 'success');
      reloadAssets();
    } catch (err) {
      console.error(err);
      showToast('Pořadí zařízení se nepodařilo uložit.', 'error');
    } finally {
      setRouteSavingKey(null);
      setRouteAssetDraggingId(null);
      setRouteAssetDropId(null);
    }
  }, [canManageRoute, reloadAssets, routeGroups, saveRouteAssetSequence]);


  const createParentOptions = useMemo(() => {
    return treeAssets
      .filter((asset) => {
        if (createKind === 'building') return false;
        if (createKind === 'room') return isBuildingAsset(asset);
        if (createKind === 'inspection') return isBuildingAsset(asset) || isRoomAsset(asset);
        return true;
      })
      .sort((a, b) => getParentOptionLabel(a, treeAssets).localeCompare(getParentOptionLabel(b, treeAssets), 'cs'));
  }, [createKind, treeAssets]);

  const selectedCreateParent = useMemo(
    () => createParentChoiceId ? treeAssets.find((asset) => asset.id === createParentChoiceId) : null,
    [createParentChoiceId, treeAssets]
  );

  const applyCreateParent = useCallback((parentId: string) => {
    const parent = parentId ? treeAssets.find((asset) => asset.id === parentId) : null;
    setCreateParentChoiceId(parentId);
    if (!parent) {
      setCreateParentId(null);
      setCreateBuildingId('');
      setCreateAreaName('');
      setCreateFloor('');
      return;
    }

    if (parent.isVirtual) {
      setCreateParentId(null);
      setCreateBuildingId(parent.sourceBuildingId || parent.buildingId || '');
      setCreateAreaName(parent.virtualKind === 'room' ? (parent.sourceAreaName || parent.areaName || parent.name) : '');
      setCreateFloor(parent.floor || '');
      return;
    }

    setCreateParentId(parent.id);
    setCreateBuildingId(parent.buildingId || '');
    setCreateAreaName(isRoomAsset(parent) ? parent.name || parent.areaName || '' : parent.areaName || '');
    setCreateFloor(parent.floor || '');
  }, [treeAssets]);

  const expandVisibleTree = useCallback(() => {
    setExpanded(new Set(visibleAssets.map((item) => item.id)));
  }, [visibleAssets]);

  const collapseTree = useCallback(() => {
    setExpanded(new Set());
  }, []);

  useEffect(() => {
    window.localStorage.setItem('kartoteka:viewMode', viewMode);
  }, [viewMode]);

  // ── Auto-expand when filtering ───
  useEffect(() => {
    if (search.trim() || filter !== 'all' || floorFilter !== 'all') {
      const allIds = new Set(visibleAssets.map((a) => a.id));
      setExpanded(allIds);
    }
  }, [search, filter, floorFilter, visibleAssets]);

  // ── Filter config ───
  const filters: { key: FilterKey; label: string; icon: LucideIcon }[] = [
    { key: 'all',         label: 'Vše',       icon: List },
    { key: 'broken',      label: 'Poruchy',   icon: AlertTriangle },
    { key: 'maintenance', label: 'Údržba',    icon: Wrench },
    { key: 'stopped',     label: 'Zastaveno', icon: Pause },
    { key: 'operational', label: 'OK',        icon: CheckCircle2 },
  ];

  // ── Determine parent name for modal title ───
  const createParentName = createParentId
    ? treeAssets.find((a) => a.id === createParentId)?.name ?? ''
    : createAreaName || (createBuildingId ? `Budova ${createBuildingId}` : '');

  const createModalTitle = createParentName
    ? `Nová položka pod "${createParentName}"`
    : `Nová položka: ${getCreateKindName(createKind)}`;

  const createDefaultType = createAreaName ? 'Zařízení' : '';

  useEffect(() => {
    if (showCreate && createDefaultType && !createForm.entityType.trim()) {
      setCreateForm((prev) => ({ ...prev, entityType: createDefaultType }));
    }
  }, [createDefaultType, createForm.entityType, showCreate]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="kartoteka-page">
      {/* ── Header ── */}
      <div className="vik-page-header sticky top-0 z-30 px-4 py-3">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3">
          <button onClick={() => goBack()} aria-label="Zpět" className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black flex items-center gap-2">
              <Archive className="w-6 h-6 text-emerald-700" />
              Kartotéka
            </h1>
            <p className="truncate text-sm font-semibold text-slate-600">Strom budov, místností a strojů</p>
          </div>
          <button onClick={() => setShowImport(true)} className="vik-button">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          {canCreateAsset && (
            <button onClick={() => openCreateModal(null)} aria-label="Přidat kořenový prvek" className="vik-button vik-button-primary">
              <Plus size={18} />
              <span className="hidden sm:inline">Přidat</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Semafor stavů (zároveň filtr) ── */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-3">
        <div className="grid grid-cols-5 gap-2">
          {([
            { key: 'all' as FilterKey, icon: Layers, label: 'Celkem', value: counts.total, color: 'text-slate-700', tile: 'border-slate-200' },
            { key: 'operational' as FilterKey, icon: CheckCircle2, label: 'OK', value: counts.operational, color: 'text-emerald-700', tile: 'border-emerald-200' },
            { key: 'maintenance' as FilterKey, icon: Wrench, label: 'Údržba', value: counts.maintenance, color: 'text-amber-700', tile: 'border-amber-200' },
            { key: 'stopped' as FilterKey, icon: Pause, label: 'Stop', value: counts.stopped, color: 'text-slate-600', tile: 'border-slate-200' },
            { key: 'broken' as FilterKey, icon: AlertTriangle, label: 'Porucha', value: counts.broken, color: 'text-red-700', tile: 'border-red-200' },
          ]).map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilter(s.key === filter ? 'all' : s.key)}
                className={`rounded-xl border ${s.tile} bg-white px-1 py-2 text-center transition active:scale-95 ${filter === s.key ? 'ring-2 ring-emerald-600/30' : ''}`}
              >
                <Icon className={`mx-auto h-4 w-4 ${s.color}`} />
                <div className={`mt-0.5 font-mono text-[17px] font-black leading-none ${s.color}`}>{s.value}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{s.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search ── */}
      {canCreateAsset && (
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-2 px-4 pt-3" aria-label="Pridat polozku">
          <button className="vik-button" onClick={() => setAddSheetOpen(true)}>
            <Plus size={16} /> Přidat
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1180px] px-4 pt-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="vik-input pl-10 pr-10"
            placeholder="Hledat podle názvu, typu nebo kódu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600" aria-label="Smazat" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filtry (stav) a Patro jsou v panelu „Filtry" — viz tlačítko v liště zobrazení níže. */}

      <div className="mx-auto flex w-full max-w-[1180px] items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 rounded-xl border border-slate-200 bg-white p-1" aria-label="Zobrazeni kartoteky">
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-black transition ${viewMode === 'tree' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}
          >
            <ListTree size={16} />
            Strom
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tiles')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-black transition ${viewMode === 'tiles' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}
          >
            <LayoutGrid size={16} />
            Dlaždice
          </button>
          <button
            type="button"
            onClick={() => setViewMode('route')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-black transition ${viewMode === 'route' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}
          >
            <ClipboardCheck size={16} />
            Trasa
          </button>
        </div>
        <button type="button" onClick={() => setFiltersSheetOpen(true)} aria-label="Filtry" title="Filtry" className="vik-button relative px-3">
          <SlidersHorizontal size={18} />
          {(filter !== 'all' || floorFilter !== 'all') && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{(filter !== 'all' ? 1 : 0) + (floorFilter !== 'all' ? 1 : 0)}</span>
          )}
        </button>
        {viewMode === 'tree' && (
          <>
            <button type="button" onClick={expandVisibleTree} aria-label="Rozbalit vše" title="Rozbalit vše" className="vik-button px-3">
              <ChevronsDown size={18} />
            </button>
            <button type="button" onClick={collapseTree} aria-label="Sbalit vše" title="Sbalit vše" className="vik-button px-3">
              <ChevronsUp size={18} />
            </button>
          </>
        )}
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="k-loading">
          <Loader2 size={32} className="k-spin" />
          <span>Načítám kartotéku…</span>
        </div>
      )}

      {/* ── Error state ── */}
      {error && <div className="k-error">{error}</div>}

      {/* ── Empty state ── */}
      {!loading && !error && assets.length === 0 && (
        <div className="k-empty">
          <Building2 size={48} />
          <span>Žádné záznamy v kartotéce</span>
          {canCreateAsset && (
            <button className="k-empty-action" onClick={() => openCreateModal(null)}>
              <Plus size={16} /> Přidat první položku
            </button>
          )}
        </div>
      )}

      {/* ── Main content: root card grid + tree ── */}
      {!loading && !error && assets.length > 0 && (
        <div className="k-content">
          {currentViewCount === 0 && (search || filter !== 'all' || floorFilter !== 'all') ? (
            <div className="k-empty">
              <Search size={32} />
              <span>Žádné výsledky</span>
            </div>
          ) : viewMode === 'route' ? (
            <div className="space-y-3">
              {routeGroups.map((group, index) => (
                <section
                  key={group.key}
                  className={`vik-card p-3 transition ${routeDraggingKey === group.key ? 'opacity-50' : ''} ${routeDropKey === group.key && routeDraggingKey !== group.key ? 'border-emerald-300 ring-2 ring-emerald-500/40' : ''}`}
                  onDragOver={(event) => {
                    if (!canManageRoute || routeAssetDraggingId || !routeDraggingKey || routeDraggingKey === group.key) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setRouteDropKey(group.key);
                  }}
                  onDragLeave={() => {
                    if (routeDropKey === group.key) setRouteDropKey(null);
                  }}
                  onDrop={(event) => {
                    if (!canManageRoute || routeAssetDraggingId) return;
                    event.preventDefault();
                    const rawKey = event.dataTransfer.getData('text/plain');
                    const sourceKey = routeDraggingKey || rawKey.replace(/^route-group:/, '');
                    if (sourceKey) void reorderRouteGroup(sourceKey, group.key);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-black text-slate-950">{group.title}</span>
                      <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{group.subtitle}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-slate-500">{group.assets.length} pol.</span>
                      {canManageRoute && (
                        <>
                          <span
                            className="ml-1 inline-flex cursor-grab items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 active:cursor-grabbing"
                            draggable
                            onDragStart={(event) => {
                              event.stopPropagation();
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', `route-group:${group.key}`);
                              setRouteDraggingKey(group.key);
                            }}
                            onDragEnd={() => {
                              setRouteDraggingKey(null);
                              setRouteDropKey(null);
                            }}
                            title="Přetáhnout místnost v trase"
                          >
                            <GripVertical size={14} />
                            Přetáhnout
                          </span>
                          <button
                            type="button"
                            onClick={() => moveRouteGroupToIndex(group.key, 0)}
                            disabled={index === 0 || routeSavingKey === group.key}
                            aria-label="Posunout místnost na začátek"
                            title="Na začátek"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ChevronsUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRouteGroup(group.key, -1)}
                            disabled={index === 0 || routeSavingKey === group.key}
                            aria-label="Posunout místnost nahoru"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRouteGroup(group.key, 1)}
                            disabled={index === routeGroups.length - 1 || routeSavingKey === group.key}
                            aria-label="Posunout místnost dolů"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRouteGroupToIndex(group.key, routeGroups.length - 1)}
                            disabled={index === routeGroups.length - 1 || routeSavingKey === group.key}
                            aria-label="Posunout místnost na konec"
                            title="Na konec"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          >
                            <ChevronsDown size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`relative rounded-2xl transition ${routeAssetDraggingId === asset.id ? 'opacity-50' : ''} ${routeAssetDropId === asset.id && routeAssetDraggingId !== asset.id ? 'ring-2 ring-emerald-400' : ''}`}
                        draggable={canManageRoute}
                        onDragStart={(event) => {
                          if (!canManageRoute) return;
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', `route-asset:${asset.id}`);
                          setRouteAssetDraggingId(asset.id);
                        }}
                        onDragOver={(event) => {
                          if (!canManageRoute || !routeAssetDraggingId || routeAssetDraggingId === asset.id) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = 'move';
                          setRouteAssetDropId(asset.id);
                        }}
                        onDragLeave={() => {
                          if (routeAssetDropId === asset.id) setRouteAssetDropId(null);
                        }}
                        onDrop={(event) => {
                          if (!canManageRoute) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const rawId = event.dataTransfer.getData('text/plain');
                          const sourceAssetId = routeAssetDraggingId || rawId.replace(/^route-asset:/, '');
                          if (sourceAssetId) {
                            void reorderRouteAsset(
                              group.key,
                              sourceAssetId,
                              asset.id,
                              getRouteAssetDropPlacement(event)
                            );
                          }
                        }}
                        onDragEnd={() => {
                          setRouteAssetDraggingId(null);
                          setRouteAssetDropId(null);
                        }}
                      >
                        {canManageRoute && (
                          <span className="absolute right-2 top-2 z-10 text-slate-300" title="Přetáhnout zařízení">
                            <GripVertical size={14} />
                          </span>
                        )}
                        <TileCard
                          asset={asset}
                          allAssets={visibleAssets}
                          onDetail={handleDetail}
                          onAddChild={openCreateModal}
                          onDelete={handleDelete}
                          canCreateAsset={canCreateAsset}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : viewMode === 'tiles' ? (
            <div className="k-tile-grid">
              {tileAssets.map((asset) => (
                <TileCard
                  key={asset.id}
                  asset={asset}
                  allAssets={visibleAssets}
                  onDetail={handleDetail}
                  onAddChild={openCreateModal}
                  onDelete={handleDelete}
                  canCreateAsset={canCreateAsset}
                />
              ))}
            </div>
          ) : (
            <div className="k-grid">
              {rootAssets.map((asset) => (
                <RootCard
                  key={asset.id}
                  asset={asset}
                  allAssets={visibleAssets}
                  expanded={expanded}
                  onToggle={handleToggle}
                  onDetail={handleDetail}
                  onAddChild={openCreateModal}
                  onDelete={handleDelete}
                  canCreateAsset={canCreateAsset}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Excel Import Modal ── */}
      {showImport && (
        <ImportModal
          title="Import zařízení z Excelu"
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <BottomSheet title="Smazat položku?" isOpen onClose={() => setDeleteTarget(null)}>
          <p className="text-[15px] leading-relaxed text-slate-600">
            Opravdu chcete smazat <strong className="font-bold text-slate-950">{deleteTarget.name}</strong>? Tato akce je nevratná.
          </p>
          <FormFooter
            onCancel={() => setDeleteTarget(null)}
            onSubmit={confirmDelete}
            submitLabel="Smazat"
            color="red"
          />
        </BottomSheet>
      )}

      {/* ── Create Asset Modal ── */}
      {showCreate && (
        <BottomSheet title={createModalTitle} isOpen onClose={() => setShowCreate(false)}>
          {/* Druh */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {([
              ['building', 'Budova'],
              ['room', 'Místnost'],
              ['asset', 'Zařízení'],
              ['gearbox', 'Převodovka'],
              ['inspection', 'Kontrola'],
            ] as [CreateKind, string][]).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setCreateKind(kind);
                  setCreateForm((prev) => ({
                    ...prev,
                    entityType: kind === 'building' ? 'Budova' : kind === 'room' ? 'Místnost' : kind === 'gearbox' ? 'Převodovka' : kind === 'inspection' ? 'Kontrola' : 'Zařízení',
                  }));
                }}
                className={`min-h-[44px] rounded-xl border py-2 text-sm font-semibold transition ${createKind === kind ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <strong className="font-bold text-slate-900">{getCreateKindName(createKind)}</strong>: {getCreateKindHelp(createKind)}
          </div>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Název *</span>
            <input
              className="vik-input"
              type="text"
              placeholder="např. Výrobní hala D"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              autoFocus
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Kam to patří</span>
            <select
              className="vik-input"
              value={createParentChoiceId}
              onChange={(e) => applyCreateParent(e.target.value)}
            >
              <option value="">Samostatně / bez nadřazené položky</option>
              {createParentOptions.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {getParentOptionLabel(asset, treeAssets)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              {selectedCreateParent
                ? `Uloží se pod: ${getParentOptionLabel(selectedCreateParent, treeAssets)}`
                : createKind === 'building'
                  ? 'Budova je hlavní karta, proto se nezařazuje pod jinou položku.'
                  : 'Když vybereš místnost nebo zařízení, nová položka se uloží přímo pod ni.'}
            </span>
          </label>

          {createKind === 'asset' && (
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Druh zařízení</span>
              <input
                className="vik-input"
                type="text"
                list="asset-type-options"
                placeholder="vyber nebo napiš např. Kogenerační jednotka"
                value={createForm.entityType}
                onChange={(e) => setCreateForm({ ...createForm, entityType: e.target.value })}
              />
              <datalist id="asset-type-options">
                {ASSET_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
          )}

          {createKind === 'inspection' && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Tohle není zařízení. Je to plán kontroly, který se zobrazí v modulu Kontroly.
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Kód</span>
            <input
              className="vik-input"
              type="text"
              placeholder="např. HAL-D"
              value={createForm.code}
              onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
            />
          </label>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Budova</span>
              <input
                className="vik-input"
                type="text"
                placeholder="např. D"
                value={createBuildingId}
                onChange={(e) => setCreateBuildingId(e.target.value.toUpperCase())}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Patro</span>
              <input
                className="vik-input"
                type="text"
                placeholder="např. 1.NP"
                value={createFloor}
                onChange={(e) => setCreateFloor(e.target.value)}
              />
            </label>
          </div>

          {(createKind === 'asset' || createKind === 'inspection') && (
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Místnost / umístění</span>
              <input
                className="vik-input"
                type="text"
                placeholder="např. Údržba, mycí centrum"
                value={createAreaName}
                onChange={(e) => setCreateAreaName(e.target.value)}
              />
            </label>
          )}

          {(createKind === 'inspection' || (createKind === 'room' && createInspection)) && (
            <>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Kategorie kontroly</span>
                <select
                  className="vik-input"
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                >
                  <option value="budova">Budova</option>
                  <option value="hygiena">Hygiena</option>
                  <option value="výroba">Výroba</option>
                  <option value="energie">Energie</option>
                  <option value="sklad">Sklad</option>
                  <option value="údržba">Údržba</option>
                </select>
              </label>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Opakování kontroly</span>
                <select
                  className="vik-input"
                  value={createInspectionFrequency}
                  onChange={(e) => setCreateInspectionFrequency(e.target.value as InspectionFrequency)}
                >
                  {INSPECTION_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Co kontrolovat</span>
                <textarea
                  className="vik-input"
                  rows={3}
                  placeholder="např. podlaha, dveře, světla, čistota..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </label>
            </>
          )}

          {createKind === 'room' && (
            <button
              type="button"
              onClick={() => setCreateInspection((value) => !value)}
              className={`mb-4 flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${createInspection ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <span className="font-bold">{createInspection ? '✓' : '○'}</span>
              Rovnou založit pravidelnou kontrolu této místnosti
            </button>
          )}

          {createKind !== 'inspection' && (
            <div className="mb-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Stav</span>
                <select
                  className="vik-input"
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as AssetStatus })}
                >
                  {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatus[]).map((s) => (
                    <option key={s} value={s}>{ASSET_STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">Kritičnost</span>
                <select
                  className="vik-input"
                  value={createForm.criticality}
                  onChange={(e) => setCreateForm({ ...createForm, criticality: e.target.value as AssetCriticality })}
                >
                  {(Object.keys(CRITICALITY_CONFIG) as AssetCriticality[]).map((c) => (
                    <option key={c} value={c}>{CRITICALITY_CONFIG[c].label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <FormFooter
            onCancel={() => setShowCreate(false)}
            onSubmit={handleCreate}
            submitLabel="Vytvořit"
            loading={createSaving}
            disabled={!createForm.name.trim() || createSaving}
          />
        </BottomSheet>
      )}

      {/* ── Přidat (výběr typu) ── */}
      {addSheetOpen && (
        <BottomSheet title="Co chceš přidat?" isOpen onClose={() => setAddSheetOpen(false)}>
          <div className="grid grid-cols-2 gap-2 p-1">
            <button type="button" className="col-span-2 flex items-center gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-left hover:border-emerald-400" onClick={() => { setAddSheetOpen(false); openCreateModal(null, 'asset'); }}>
              <Wrench size={24} className="shrink-0 text-emerald-700" />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">Zařízení</span>
                <span className="block text-[12px] text-slate-500">stroj, klimatizace, čerpadlo, motor…</span>
              </span>
            </button>
            <button type="button" className="flex flex-col items-start gap-0.5 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-400 hover:bg-emerald-50" onClick={() => { setAddSheetOpen(false); openCreateModal(null, 'building'); }}>
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><Building2 size={18} className="text-emerald-700" /> Budova</span>
              <span className="text-[11px] text-slate-500">hala, objekt</span>
            </button>
            <button type="button" className="flex flex-col items-start gap-0.5 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-400 hover:bg-emerald-50" onClick={() => { setAddSheetOpen(false); openCreateModal(null, 'room'); }}>
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><Plus size={18} className="text-emerald-700" /> Místnost</span>
              <span className="text-[11px] text-slate-500">místo uvnitř budovy</span>
            </button>
            <button type="button" className="flex flex-col items-start gap-0.5 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-400 hover:bg-emerald-50" onClick={() => { setAddSheetOpen(false); openCreateModal(null, 'inspection'); }}>
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><ClipboardCheck size={18} className="text-emerald-700" /> Kontrola</span>
              <span className="text-[11px] text-slate-500">pravidelná obchůzka</span>
            </button>
            <button type="button" className="flex flex-col items-start gap-0.5 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-400 hover:bg-emerald-50" onClick={() => { setAddSheetOpen(false); openCreateModal(null, 'gearbox'); }}>
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><Cog size={18} className="text-emerald-700" /> Převodovka</span>
              <span className="text-[11px] text-slate-500">speciální karta (teplota)</span>
            </button>
          </div>
          <button type="button" onClick={() => { setAddSheetOpen(false); setGuideOpen(true); }} className="mt-3 flex w-full items-center justify-center gap-2 text-[13px] font-bold text-emerald-700">
            <HelpCircle size={16} /> Jak na to?
          </button>
        </BottomSheet>
      )}

      {/* ── Filtry ── */}
      {filtersSheetOpen && (
        <BottomSheet title="Filtry" isOpen onClose={() => setFiltersSheetOpen(false)}>
          <div className="space-y-4 p-1">
            <div>
              <span className="eyebrow mb-2 block">Stav</span>
              <div className="flex flex-wrap gap-2">
                <button className={filter === 'all' ? 'vik-chip vik-chip-active' : 'vik-chip'} onClick={() => setFilter('all')}>Vše</button>
                {filters.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button key={f.key} className={filter === f.key ? 'vik-chip vik-chip-active' : 'vik-chip'} onClick={() => setFilter(f.key === filter ? 'all' : f.key)}>
                      <Icon className="h-3.5 w-3.5" /> {f.label}
                    </button>
                  );
                })}
                <button className={filter === 'gearbox' ? 'vik-chip vik-chip-active' : 'vik-chip'} onClick={() => setFilter(filter === 'gearbox' ? 'all' : 'gearbox')}>
                  <Cog className="h-3.5 w-3.5" /> Převodovky <span className="opacity-70">{counts.gearboxes}</span>
                </button>
              </div>
            </div>
            {floorOptions.length > 1 && (
              <div>
                <span className="eyebrow mb-2 block">Patro</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={floorFilter === 'all' ? 'vik-chip vik-chip-active' : 'vik-chip'} onClick={() => setFloorFilter('all')}>Vše</button>
                  {floorOptions.map((floor) => (
                    <button key={floor} type="button" className={floorFilter === floor ? 'vik-chip vik-chip-active' : 'vik-chip'} onClick={() => setFloorFilter(floorFilter === floor ? 'all' : floor)}>
                      {getFloorLabel(floor)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" className="vik-button flex-1" onClick={() => { setFilter('all'); setFloorFilter('all'); }}>Zrušit filtry</button>
              <button type="button" className="flex-1 rounded-xl bg-emerald-600 py-2.5 font-bold text-white" onClick={() => setFiltersSheetOpen(false)}>Hotovo</button>
            </div>
          </div>
        </BottomSheet>
      )}

      {guideOpen && addDeviceGuide && (
        <HowToSheet guide={addDeviceGuide} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
