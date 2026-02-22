import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { Asset } from '../types/asset';

const STATUS_HEX: Record<string, string> = {
  operational: '#22c55e',
  maintenance: '#eab308',
  broken: '#ef4444',
  stopped: '#6b7280',
};

interface AssetTreeNodeProps {
  asset: Asset;
  allAssets: Asset[];
  depth: number;
  onSelect: (asset: Asset) => void;
}

function countDescendantsByStatus(
  assetId: string,
  allAssets: Asset[],
  status: string
): number {
  const children = allAssets.filter((a) => a.parentId === assetId);
  let count = 0;
  for (const child of children) {
    if (child.status === status) count++;
    count += countDescendantsByStatus(child.id, allAssets, status);
  }
  return count;
}

export default function AssetTreeNode({
  asset,
  allAssets,
  depth,
  onSelect,
}: AssetTreeNodeProps) {
  const children = allAssets
    .filter((a) => a.parentId === asset.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(depth < 1);

  const brokenCount = countDescendantsByStatus(asset.id, allAssets, 'broken');
  const maintenanceCount = countDescendantsByStatus(asset.id, allAssets, 'maintenance');

  return (
    <div className="asset-tree-node">
      <div
        className="asset-row"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            className="expand-btn"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Sbalit' : 'Rozbalit'}
          >
            {expanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </button>
        ) : (
          <span className="expand-btn" style={{ visibility: 'hidden' }}>
            <ChevronRight size={16} />
          </span>
        )}

        <span
          className="status-dot"
          style={{ backgroundColor: STATUS_HEX[asset.status] || '#6b7280' }}
        />

        <button
          className="asset-name"
          onClick={() => onSelect(asset)}
        >
          {asset.name}
        </button>

        {asset.entityType && (
          <span className="type-badge">{asset.entityType}</span>
        )}

        {hasChildren && (brokenCount > 0 || maintenanceCount > 0) && (
          <span className="child-count">
            {brokenCount > 0 && (
              <span style={{ color: '#ef4444' }}>{brokenCount}✕</span>
            )}
            {brokenCount > 0 && maintenanceCount > 0 && ' '}
            {maintenanceCount > 0 && (
              <span style={{ color: '#eab308' }}>{maintenanceCount}⚠</span>
            )}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="asset-children">
          {children.map((child) => (
            <AssetTreeNode
              key={child.id}
              asset={child}
              allAssets={allAssets}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
