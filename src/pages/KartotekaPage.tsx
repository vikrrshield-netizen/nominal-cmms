// src/pages/KartotekaPage.tsx
// VIKRR Asset Shield — Kartotéka (asset tree with grid cards)
// Root items = large cards in grid (MapPage style)
// Children = indented collapsible list under each card

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import {
  ArrowLeft, Building2, Search, Upload, Plus, X,
  ChevronRight, ChevronDown, FileText, Loader2, Trash2,
  ClipboardCheck, Cog, LayoutGrid, ListTree, ArrowUp, ArrowDown,
  ChevronsUp, ChevronsDown, GripVertical,
} from 'lucide-react';
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
import './KartotekaPage.css';

// ── Status colors ────────────────────────────────────────────────
const STATUS_HEX: Record<string, string> = {
  operational: '#22c55e',
  maintenance: '#eab308',
  broken:      '#ef4444',
  stopped:     '#6b7280',
};

const STATUS_DOT: Record<string, string> = {
  operational: 'bg-emerald-400',
  maintenance: 'bg-amber-400 animate-pulse',
  broken:      'bg-red-400 animate-pulse',
  stopped:     'bg-slate-400',
};

// ── Entity type → color mapping (for root cards) ─────────────────
const ENTITY_COLORS: Record<string, string> = {
  'Budova':    '#6366f1',
  'Areál':     '#8b5cf6',
  'Hala':      '#f97316',
  'Linka':     '#10b981',
  'Dílna':     '#0ea5e9',
  'Sklad':     '#eab308',
  'Kancelář':  '#a855f7',
};

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getEntityColor(entityType: string | undefined): string {
  return ENTITY_COLORS[entityType || ''] || '#3b82f6';
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
      {/* Row */}
      <div
        className="k-tree-row"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => hasChildren ? onToggle(asset.id) : onDetail(asset)}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button className="k-tree-expand" onClick={(e) => { e.stopPropagation(); onToggle(asset.id); }}>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="k-tree-expand-placeholder" />
        )}

        {/* Status dot */}
        <span className="k-tree-dot" style={{ backgroundColor: statusColor }} />

        {/* Asset name */}
        <span className="k-tree-name">{safeText(asset.name) || 'Bez názvu'}</span>

        {/* Descendant issue counts */}
        {hasChildren && (desc.broken > 0 || desc.maintenance > 0) && (
          <span className="k-tree-issues">
            {desc.broken > 0 && <span style={{ color: '#ef4444' }}>{desc.broken}✕</span>}
            {desc.maintenance > 0 && <span style={{ color: '#eab308' }}>{desc.maintenance}⚠</span>}
          </span>
        )}

        {/* Child count */}
        {hasChildren && (
          <span className="k-tree-childcount">{children.length}</span>
        )}

        <span className="k-tree-stats-inline">
          <span className="k-tree-stat">{desc.total} položek</span>
          {desc.operational > 0 && (
            <span className="k-tree-stat"><span style={{ color: '#22c55e' }}>●</span> {desc.operational}</span>
          )}
          {desc.maintenance > 0 && (
            <span className="k-tree-stat"><span style={{ color: '#eab308' }}>●</span> {desc.maintenance}</span>
          )}
          {desc.broken > 0 && (
            <span className="k-tree-stat is-alert"><span style={{ color: '#ef4444' }}>●</span> {desc.broken}</span>
          )}
          {desc.stopped > 0 && (
            <span className="k-tree-stat"><span style={{ color: '#6b7280' }}>●</span> {desc.stopped}</span>
          )}
        </span>

        {/* Akce — stejné menu jako u budovy (Rodný list / Přidat / Smazat) */}
        <button
          className="k-tree-action k-tree-action-detail"
          onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
          title="Otevřít rodný list"
        >
          <FileText size={14} /> Rodný list
        </button>

        {canCreateAsset && (
          <button
            className="k-tree-action k-tree-action-add"
            onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
            title="Přidat potomka"
          >
            <Plus size={14} /> Přidat
          </button>
        )}

        <button
          className="k-tree-action k-tree-action-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
          title="Smazat"
        >
          <Trash2 size={14} /> Smazat
        </button>
      </div>

      {/* Children (recursive) */}
      {isExpanded && hasChildren && (
        <div className="k-tree-children">
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
      {/* Card */}
      <div
        className="k-root-card"
        style={{
          background: '#ffffff',
          borderColor: '#e7dfd2',
          boxShadow: `inset 4px 0 0 ${color}cc`,
        }}
      >
        {/* Status dot (top-right) */}
        <div className={`k-root-status-dot ${dotClass}`} />

        {/* Top row: icon + název(rozbalit) + Rodný list + akce */}
        <div className="k-root-top">
          {/* Icon box */}
          <div
            className="k-root-icon"
            style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
          >
            {rootIconLabel(asset)}
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
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', color: 'inherit', textAlign: 'left', minWidth: 0,
            }}
          >
            {hasChildren && (
              <span style={{ color: '#64748b', display: 'flex' }}>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </span>
            )}
            <span className="k-root-info">
              <span className="k-root-name">
                {safeText(asset.name) || 'Bez názvu'}
                {hasChildren && (
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}> ({children.length})</span>
                )}
              </span>
              <span className="k-root-type">{safeText(asset.entityType) || 'Položka'}</span>
              {asset.code && (
                <span className="k-root-code">{asset.code}</span>
              )}
            </span>
          </button>

          {/* Rodný list — hned vedle názvu */}
          <div className="k-root-stats k-root-stats-inline">
            <span className="k-root-stat">
              {desc.total} položek
            </span>
            {desc.operational > 0 && (
              <span className="k-root-stat">
                <span style={{ color: '#22c55e' }}>●</span> {desc.operational}
              </span>
            )}
            {desc.maintenance > 0 && (
              <span className="k-root-stat">
                <span style={{ color: '#eab308' }}>●</span> {desc.maintenance}
              </span>
            )}
            {desc.broken > 0 && (
              <span className="k-root-stat k-root-stat-alert">
                <span style={{ color: '#ef4444' }}>●</span> {desc.broken}
              </span>
            )}
            {desc.stopped > 0 && (
              <span className="k-root-stat">
                <span style={{ color: '#6b7280' }}>●</span> {desc.stopped}
              </span>
            )}
          </div>

          <button
            className="k-root-action-btn"
            onClick={(e) => { e.stopPropagation(); onDetail(asset); }}
            title="Otevřít rodný list"
            style={{ color: '#3b82f6', borderColor: '#3b82f630' }}
          >
            <FileText size={16} />
            <span className="k-action-label">Rodný list</span>
          </button>

          {/* Akce — vpravo */}
          <div className="k-root-actions" style={{ marginLeft: 'auto' }}>
            {canCreateAsset && (
              <button
                className="k-root-action-btn"
                onClick={(e) => { e.stopPropagation(); onAddChild(asset.id); }}
                title="Přidat potomka"
                style={{ color: '#38bdf8', borderColor: '#38bdf830' }}
              >
                <Plus size={16} />
                <span className="k-action-label">Přidat</span>
              </button>
            )}
            <button
              className="k-root-action-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
              title="Smazat"
              style={{ color: '#ef4444', borderColor: '#ef444430' }}
            >
              <Trash2 size={16} />
              <span className="k-action-label">Smazat</span>
            </button>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="k-root-stats">
          <span className="k-root-stat">
            {desc.total} položek
          </span>
          {desc.operational > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#22c55e' }}>●</span> {desc.operational}
            </span>
          )}
          {desc.maintenance > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#eab308' }}>●</span> {desc.maintenance}
            </span>
          )}
          {desc.broken > 0 && (
            <span className="k-root-stat k-root-stat-alert">
              <span style={{ color: '#ef4444' }}>●</span> {desc.broken}
            </span>
          )}
          {desc.stopped > 0 && (
            <span className="k-root-stat">
              <span style={{ color: '#6b7280' }}>●</span> {desc.stopped}
            </span>
          )}
        </div>

      </div>

      {/* Expanded children list */}
      {isExpanded && hasChildren && (
        <div className="k-root-children">
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
    <article className="k-tile-card" style={{ boxShadow: `inset 4px 0 0 ${color}cc` }}>
      <div className={`k-root-status-dot ${dotClass}`} />
      <button type="button" className="k-tile-main" onClick={() => onDetail(asset)}>
        <span
          className="k-tile-icon"
          style={{ background: `${color}18`, color, borderColor: `${color}35` }}
        >
          {rootIconLabel(asset)}
        </span>
        <span className="k-tile-copy">
          <span className="k-tile-name">{safeText(asset.name) || 'Bez názvu'}</span>
          <span className="k-tile-type">{safeText(asset.entityType) || 'Položka'} · {statusLabel}</span>
        </span>
      </button>

      <div className="k-tile-meta">
        {asset.code && <span>{asset.code}</span>}
        {location && <span>{location}</span>}
        {parentPath && <span>{parentPath}</span>}
      </div>

      {desc.total > 0 && (
        <div className="k-tile-stats">
          <span>{desc.total} položek</span>
          {desc.operational > 0 && <span><span style={{ color: '#22c55e' }}>●</span> {desc.operational}</span>}
          {desc.maintenance > 0 && <span><span style={{ color: '#eab308' }}>●</span> {desc.maintenance}</span>}
          {desc.broken > 0 && <span className="is-alert"><span style={{ color: '#ef4444' }}>●</span> {desc.broken}</span>}
          {desc.stopped > 0 && <span><span style={{ color: '#6b7280' }}>●</span> {desc.stopped}</span>}
        </div>
      )}

      <div className="k-tile-actions">
        <button type="button" className="k-root-action-btn" onClick={() => onDetail(asset)}>
          <FileText size={16} />
          <span className="k-action-label">Rodný list</span>
        </button>
        {canCreateAsset && (
          <button type="button" className="k-root-action-btn" onClick={() => onAddChild(asset.id)}>
            <Plus size={16} />
            <span className="k-action-label">Přidat</span>
          </button>
        )}
        <button type="button" className="k-root-action-btn" onClick={() => onDelete(asset)}>
          <Trash2 size={16} />
          <span className="k-action-label">Smazat</span>
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
          const aKey = `${a.inspectionItemOrder ?? Number.MAX_SAFE_INTEGER} ${safeText(a.code)} ${safeText(a.name)}`;
          const bKey = `${b.inspectionItemOrder ?? Number.MAX_SAFE_INTEGER} ${safeText(b.code)} ${safeText(b.name)}`;
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

  const reorderRouteAsset = useCallback(async (groupKey: string, sourceAssetId: string, targetAssetId: string) => {
    if (!canManageRoute || sourceAssetId === targetAssetId) return;
    const group = routeGroups.find((item) => item.key === groupKey);
    if (!group) return;
    const sourceIndex = group.assets.findIndex((asset) => asset.id === sourceAssetId);
    const targetIndex = group.assets.findIndex((asset) => asset.id === targetAssetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

    const nextAssets = [...group.assets];
    const [moved] = nextAssets.splice(sourceIndex, 1);
    nextAssets.splice(targetIndex, 0, moved);

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
  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all',         label: 'Vše' },
    { key: 'broken',      label: '❌ Poruchy' },
    { key: 'maintenance', label: '🔧 Údržba' },
    { key: 'stopped',     label: '⏸️ Zastaveno' },
    { key: 'operational', label: '✅ OK' },
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
      <div className="k-header">
        <button className="k-back-btn" onClick={() => goBack()}>
          <ArrowLeft size={20} />
        </button>
        <Building2 size={22} style={{ color: '#3b82f6' }} />
        <span className="k-title">Kartotéka</span>

        {/* Add root asset */}
        {canCreateAsset && (
          <button
            className="k-add-btn"
            onClick={() => openCreateModal(null)}
            title="Přidat kořenový prvek"
          >
            <Plus size={18} />
          </button>
        )}

        {/* Import */}
        <button className="k-import-btn" onClick={() => setShowImport(true)}>
          <Upload size={16} />
          <span>Import</span>
        </button>
      </div>

      {/* ── Status summary bar ── */}
      <div className="k-summary">
        <span className="k-stat">
          Celkem <span className="k-stat-count">{counts.total}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#22c55e' }}>●</span>
          <span className="k-stat-count">{counts.operational}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#eab308' }}>●</span>
          <span className="k-stat-count">{counts.maintenance}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#ef4444' }}>●</span>
          <span className="k-stat-count">{counts.broken}</span>
        </span>
        <span className="k-stat">
          <span style={{ color: '#6b7280' }}>●</span>
          <span className="k-stat-count">{counts.stopped}</span>
        </span>
      </div>

      {/* ── Search ── */}
      {canCreateAsset && (
        <div className="k-create-toolbar" aria-label="Rychle pridat polozku">
          <span className="k-create-label">Přidat</span>
          <button className="k-create-btn" onClick={() => openCreateModal(null, 'building')}>
            <Building2 size={16} /> Budova
          </button>
          <button className="k-create-btn" onClick={() => openCreateModal(null, 'room')}>
            <Plus size={16} /> Místnost
          </button>
          <button className="k-create-btn" onClick={() => openCreateModal(null, 'inspection')}>
            <ClipboardCheck size={16} /> Kontrola
          </button>
          <button className="k-create-btn" onClick={() => openCreateModal(null, 'gearbox')}>
            <Cog size={16} /> Převodovka
          </button>
        </div>
      )}

      <div className="k-search">
        <div className="k-search-wrap">
          <Search size={18} className="k-search-icon" />
          <input
            type="text"
            placeholder="Hledat podle názvu, typu nebo kódu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="k-search-clear" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="k-filters">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`filter-chip${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key === filter ? 'all' : f.key)}
          >
            {f.label}
          </button>
        ))}
        <button
          className={`filter-chip${filter === 'gearbox' ? ' active' : ''}`}
          onClick={() => setFilter(filter === 'gearbox' ? 'all' : 'gearbox')}
        >
          Převodovky ({counts.gearboxes})
        </button>
      </div>

      {floorOptions.length > 1 && (
        <div className="k-floor-filters" aria-label="Filtr podle patra">
          <span>Patro</span>
          <button
            type="button"
            className={`filter-chip${floorFilter === 'all' ? ' active' : ''}`}
            onClick={() => setFloorFilter('all')}
          >
            Vše
          </button>
          {floorOptions.map((floor) => (
            <button
              key={floor}
              type="button"
              className={`filter-chip${floorFilter === floor ? ' active' : ''}`}
              onClick={() => setFloorFilter(floorFilter === floor ? 'all' : floor)}
            >
              {getFloorLabel(floor)}
            </button>
          ))}
        </div>
      )}

      <div className={`k-tree-tools is-${viewMode}`}>
        <div className="k-view-toggle" aria-label="Zobrazeni kartoteky">
          <button
            type="button"
            className={viewMode === 'tree' ? 'active' : ''}
            onClick={() => setViewMode('tree')}
          >
            <ListTree size={16} />
            Strom
          </button>
          <button
            type="button"
            className={viewMode === 'tiles' ? 'active' : ''}
            onClick={() => setViewMode('tiles')}
          >
            <LayoutGrid size={16} />
            Dlaždice
          </button>
          <button
            type="button"
            className={viewMode === 'route' ? 'active' : ''}
            onClick={() => setViewMode('route')}
          >
            <ClipboardCheck size={16} />
            Trasa kontrol
          </button>
        </div>
        <button type="button" onClick={expandVisibleTree}>
          Rozbalit vše
        </button>
        <button type="button" onClick={collapseTree}>
          Sbalit vše
        </button>
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
            <div className="k-route-groups">
              {routeGroups.map((group, index) => (
                <section
                  key={group.key}
                  className={`k-route-group ${routeDraggingKey === group.key ? 'is-dragging' : ''} ${routeDropKey === group.key && routeDraggingKey !== group.key ? 'is-drop-target' : ''}`}
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
                  <div className="k-route-header">
                    <span className="k-route-title">
                      {group.title}
                      <small>{group.subtitle}</small>
                    </span>
                    <div className="k-route-actions">
                      <small>{group.assets.length} položek</small>
                      {canManageRoute && (
                        <>
                          <span
                            className="k-route-drag-hint"
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
                          >
                            <ChevronsUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRouteGroup(group.key, -1)}
                            disabled={index === 0 || routeSavingKey === group.key}
                            aria-label="Posunout místnost nahoru"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRouteGroup(group.key, 1)}
                            disabled={index === routeGroups.length - 1 || routeSavingKey === group.key}
                            aria-label="Posunout místnost dolů"
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRouteGroupToIndex(group.key, routeGroups.length - 1)}
                            disabled={index === routeGroups.length - 1 || routeSavingKey === group.key}
                            aria-label="Posunout místnost na konec"
                            title="Na konec"
                          >
                            <ChevronsDown size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="k-tile-grid k-route-grid">
                    {group.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`k-route-tile-wrap ${routeAssetDraggingId === asset.id ? 'is-dragging' : ''} ${routeAssetDropId === asset.id && routeAssetDraggingId !== asset.id ? 'is-drop-target' : ''}`}
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
                          if (sourceAssetId) void reorderRouteAsset(group.key, sourceAssetId, asset.id);
                        }}
                        onDragEnd={() => {
                          setRouteAssetDraggingId(null);
                          setRouteAssetDropId(null);
                        }}
                      >
                        {canManageRoute && (
                          <span className="k-route-tile-grip" title="Přetáhnout zařízení">
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
        <div className="k-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="k-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="k-modal-header">
              <h2 className="k-modal-title">🗑️ Smazat položku?</h2>
              <button className="k-modal-close" onClick={() => setDeleteTarget(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="k-modal-body">
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                Opravdu chcete smazat <strong style={{ color: '#f1f5f9' }}>{deleteTarget.name}</strong>?
                Tato akce je nevratná.
              </p>
            </div>
            <div className="k-modal-footer">
              <button className="k-btn-cancel" onClick={() => setDeleteTarget(null)}>
                Zrušit
              </button>
              <button
                className="k-btn-save"
                style={{ background: '#ef4444' }}
                onClick={confirmDelete}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Asset Modal ── */}
      {showCreate && (
        <div className="k-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="k-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="k-modal-header">
              <h2 className="k-modal-title">
                {createModalTitle}
              </h2>
              <button className="k-modal-close" onClick={() => setShowCreate(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Form body */}
            <div className="k-modal-body">
              <div className="k-row">
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
                    className="filter-chip"
                    style={{
                      background: createKind === kind ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255,255,255,0.05)',
                      borderColor: createKind === kind ? 'rgba(59, 130, 246, 0.55)' : 'rgba(255,255,255,0.08)',
                      color: createKind === kind ? '#bfdbfe' : '#94a3b8',
                      flex: 1,
                    }}
                    onClick={() => {
                      setCreateKind(kind);
                      setCreateForm((prev) => ({
                        ...prev,
                        entityType: kind === 'building' ? 'Budova' : kind === 'room' ? 'Místnost' : kind === 'gearbox' ? 'Převodovka' : kind === 'inspection' ? 'Kontrola' : 'Zařízení',
                      }));
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="k-form-note">
                <strong>{getCreateKindName(createKind)}</strong>: {getCreateKindHelp(createKind)}
              </div>

              <label className="k-field">
                <span className="k-label">Název *</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. Výrobní hala D"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  autoFocus
                />
              </label>

              <label className="k-field">
                <span className="k-label">Kam to patří</span>
                <select
                  className="k-input"
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
                <span className="k-help-text">
                  {selectedCreateParent
                    ? `Uloží se pod: ${getParentOptionLabel(selectedCreateParent, treeAssets)}`
                    : createKind === 'building'
                      ? 'Budova je hlavní karta, proto se nezařazuje pod jinou položku.'
                      : 'Když vybereš místnost nebo zařízení, nová položka se uloží přímo pod ni.'}
                </span>
              </label>

              {createKind === 'asset' && (
                <label className="k-field">
                  <span className="k-label">Druh zařízení</span>
                  <input
                    className="k-input"
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
                <div className="k-form-note">
                  Tohle není zařízení. Je to plán kontroly, který se zobrazí v modulu Kontroly.
                </div>
              )}

              <label className="k-field">
                <span className="k-label">Kód</span>
                <input
                  className="k-input"
                  type="text"
                  placeholder="např. HAL-D"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                />
              </label>

              <div className="k-row">
                <label className="k-field">
                  <span className="k-label">Budova</span>
                  <input
                    className="k-input"
                    type="text"
                    placeholder="např. D"
                    value={createBuildingId}
                    onChange={(e) => setCreateBuildingId(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="k-field">
                  <span className="k-label">Patro</span>
                  <input
                    className="k-input"
                    type="text"
                    placeholder="např. 1.NP"
                    value={createFloor}
                    onChange={(e) => setCreateFloor(e.target.value)}
                  />
                </label>
              </div>

              {(createKind === 'asset' || createKind === 'inspection') && (
                <label className="k-field">
                  <span className="k-label">Místnost / umístění</span>
                  <input
                    className="k-input"
                    type="text"
                    placeholder="např. Údržba, mycí centrum"
                    value={createAreaName}
                    onChange={(e) => setCreateAreaName(e.target.value)}
                  />
                </label>
              )}

              {(createKind === 'inspection' || (createKind === 'room' && createInspection)) && (
                <>
                  <label className="k-field">
                    <span className="k-label">Kategorie kontroly</span>
                    <select
                      className="k-input"
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

                  <label className="k-field">
                    <span className="k-label">Opakování kontroly</span>
                    <select
                      className="k-input"
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

                  <label className="k-field">
                    <span className="k-label">Co kontrolovat</span>
                    <textarea
                      className="k-input"
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
                  className="filter-chip"
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    background: createInspection ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255,255,255,0.05)',
                    borderColor: createInspection ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255,255,255,0.08)',
                    color: createInspection ? '#fde68a' : '#94a3b8',
                  }}
                  onClick={() => setCreateInspection((value) => !value)}
                >
                  {createInspection ? '✓' : '○'} Rovnou založit pravidelnou kontrolu této místnosti
                </button>
              )}

              {createKind !== 'inspection' && (
              <div className="k-row">
                <label className="k-field">
                  <span className="k-label">Stav</span>
                  <select
                    className="k-input"
                    value={createForm.status}
                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as AssetStatus })}
                  >
                    {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatus[]).map((s) => (
                      <option key={s} value={s}>{ASSET_STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                </label>
                <label className="k-field">
                  <span className="k-label">Kritičnost</span>
                  <select
                    className="k-input"
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
            </div>

            {/* Footer */}
            <div className="k-modal-footer">
              <button className="k-btn-cancel" onClick={() => setShowCreate(false)}>
                Zrušit
              </button>
              <button
                className="k-btn-save"
                onClick={handleCreate}
                disabled={!createForm.name.trim() || createSaving}
              >
                {createSaving ? 'Ukládám…' : 'Vytvořit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
