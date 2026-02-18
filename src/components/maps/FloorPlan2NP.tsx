// src/components/maps/FloorPlan2NP.tsx
// VIKRR — Asset Shield — Interaktivní SVG půdorys 2.NP budovy D
// Napojeno na Firestore assets

import { useMemo } from 'react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════
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

interface RoomConfig {
  id: string;
  name: string;
  areaName?: string;
  // rect-based rooms
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // path-based rooms (L-shapes etc.)
  path?: string;
  // label position override
  labelX?: number;
  labelY?: number;
  // small room flag
  small?: boolean;
}

interface FloorPlan2NPProps {
  assets: Asset[];
  onRoomClick: (roomId: string, roomName: string, roomAssets: Asset[]) => void;
  selectedRoom: string | null;
}

// ═══════════════════════════════════════════
// ROOM DEFINITIONS — based on real floor plan
// ═══════════════════════════════════════════
const ROOMS: RoomConfig[] = [
  // --- Top row ---
  { id: 'D2.08',  name: 'Extrudovna 1',    areaName: 'Extrudovna I',  x: 30,  y: 30,  width: 220, height: 200 },
  { id: 'D2.10',  name: 'Sklad Extrudátu', areaName: undefined,
    path: 'M 260,30 L 800,30 L 800,290 L 560,290 L 560,195 L 260,195 Z',
    labelX: 680, labelY: 115 },
  { id: 'D2.091', name: 'Míchárna I.',     areaName: 'Míchárna I',    x: 300, y: 48,  width: 120, height: 130 },
  { id: 'D2.092', name: 'Míchárna II.',    areaName: 'Míchárna II',   x: 430, y: 48,  width: 120, height: 130 },

  // --- Left column (Ex1 → Ex2): WC → Denní → Úklid → Rozvodna → VÝTAH → Ex2 ---
  { id: 'D2.06',  name: 'WC',              areaName: undefined,       x: 30,  y: 240, width: 100, height: 50,  small: true },
  { id: 'D2.07',  name: 'Denní míst.',     areaName: undefined,       x: 30,  y: 300, width: 100, height: 60,  small: true },
  { id: 'D2.05',  name: 'Úklidovka',       areaName: undefined,       x: 30,  y: 370, width: 100, height: 50,  small: true },
  { id: 'D2.04',  name: 'El. rozvodna',    areaName: undefined,       x: 30,  y: 430, width: 100, height: 50,  small: true },

  // --- Corridor ---
  { id: 'D2.02',  name: 'Chodba Ex.',      areaName: undefined,       x: 140, y: 195, width: 110, height: 350 },

  // --- Right side ---
  { id: 'D2.11',  name: 'Chodba u výtahu', areaName: undefined,       x: 560, y: 300, width: 190, height: 100 },
  { id: 'D2.12',  name: 'Sklad obalů',     areaName: undefined,       x: 560, y: 410, width: 240, height: 210 },

  // --- Bottom ---
  { id: 'D2.01',  name: 'Extrudovna 2',    areaName: 'Extrudovna II', x: 30,  y: 545, width: 220, height: 200 },
];

// ═══════════════════════════════════════════
// STATUS COLORS
// ═══════════════════════════════════════════
function getRoomStatus(roomAssets: Asset[]): { fill: string; stroke: string; fillSelected: string } {
  if (roomAssets.length === 0) {
    return {
      fill: 'rgba(100,116,139,0.08)',
      stroke: 'rgba(100,116,139,0.3)',
      fillSelected: 'rgba(100,116,139,0.15)',
    };
  }
  const hasBreakdown = roomAssets.some(a => a.status === 'breakdown');
  const hasMaintenance = roomAssets.some(a => a.status === 'maintenance');

  if (hasBreakdown) {
    return {
      fill: 'rgba(239,68,68,0.15)',
      stroke: 'rgba(239,68,68,0.5)',
      fillSelected: 'rgba(239,68,68,0.30)',
    };
  }
  if (hasMaintenance) {
    return {
      fill: 'rgba(251,191,36,0.15)',
      stroke: 'rgba(251,191,36,0.5)',
      fillSelected: 'rgba(251,191,36,0.30)',
    };
  }
  return {
    fill: 'rgba(52,211,153,0.12)',
    stroke: 'rgba(52,211,153,0.45)',
    fillSelected: 'rgba(52,211,153,0.25)',
  };
}

function getAssetCountLabel(count: number): string {
  if (count === 0) return '';
  if (count === 1) return '1 stroj';
  if (count < 5) return `${count} stroje`;
  return `${count} strojů`;
}

// ═══════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════
export default function FloorPlan2NP({ assets, onRoomClick, selectedRoom }: FloorPlan2NPProps) {
  const roomData = useMemo(() => {
    return ROOMS.map(room => {
      const roomAssets = room.areaName
        ? assets.filter(a => a.buildingId === 'D' && a.areaName === room.areaName)
        : [];
      const status = getRoomStatus(roomAssets);
      return { ...room, assets: roomAssets, status };
    });
  }, [assets]);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox="0 0 830 800"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-3xl mx-auto"
        style={{ minWidth: '320px' }}
      >
        {/* Background */}
        <rect x="0" y="0" width="830" height="800" rx="12" fill="rgba(15,23,42,0.6)" />

        {/* Title */}
        <text x="415" y="18" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui">
          2. nadzemní podlaží
        </text>

        {/* Main hall (non-clickable) */}
        <rect x="260" y="195" width="290" height="410" rx="4"
          fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="6,3" />
        <text x="405" y="405" textAnchor="middle" fill="rgba(255,255,255,0.06)" fontSize="13" fontFamily="system-ui">
          Hlavní hala
        </text>

        {/* Staircase expedice */}
        <rect x="710" y="650" width="90" height="75" rx="4"
          fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,2" />
        <text x="755" y="685" textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="system-ui">schodiště</text>
        <text x="755" y="699" textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="8" fontFamily="system-ui">expedice</text>

        {/* VÝTAH 1 — between El. rozvodna and Ex2 */}
        <rect x="30" y="490" width="100" height="45" rx="4"
          fill="rgba(139,92,246,0.10)" stroke="rgba(139,92,246,0.35)" strokeWidth="1" strokeDasharray="4,2" />
        <text x="80" y="517" textAnchor="middle" fill="rgba(139,92,246,0.6)" fontSize="9" fontWeight="700" fontFamily="system-ui">
          VÝTAH 1
        </text>

        {/* VÝTAH 2 — next to D2.11 */}
        <rect x="758" y="310" width="42" height="80" rx="4"
          fill="rgba(139,92,246,0.10)" stroke="rgba(139,92,246,0.35)" strokeWidth="1" strokeDasharray="4,2" />
        <text x="779" y="354" textAnchor="middle" fill="rgba(139,92,246,0.5)" fontSize="8" fontWeight="700" fontFamily="system-ui">
          VÝTAH 2
        </text>

        {/* Door indicator: D2.02 ↔ D2.10 */}
        <line x1="255" y1="195" x2="265" y2="195" stroke="rgba(139,92,246,0.5)" strokeWidth="3" />
        <circle cx="260" cy="195" r="3" fill="rgba(139,92,246,0.4)" />

        {/* ════ ROOMS ════ */}
        {roomData.map((room) => {
          const isSelected = selectedRoom === room.id;
          const hasAssets = room.assets.length > 0;
          const isSmall = room.small;
          const fill = isSelected ? room.status.fillSelected : room.status.fill;
          const stroke = isSelected ? '#f97316' : room.status.stroke;
          const strokeW = isSelected ? 2.5 : 1.5;

          // Label positions
          const cx = room.labelX ?? (room.x != null ? room.x + (room.width ?? 0) / 2 : 0);
          const cy = room.labelY ?? (room.y != null ? room.y + (room.height ?? 0) / 2 : 0);

          // Special: corridor rotation
          const isCorridor = room.id === 'D2.02';

          return (
            <g
              key={room.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onRoomClick(room.id, room.name, room.assets)}
            >
              {/* Room shape */}
              {room.path ? (
                <path d={room.path} fill={fill} stroke={stroke} strokeWidth={strokeW}
                  className="transition-all duration-200" />
              ) : (
                <rect x={room.x} y={room.y} width={room.width} height={room.height} rx={isSmall ? 5 : 6}
                  fill={fill} stroke={stroke} strokeWidth={strokeW}
                  className="transition-all duration-200" />
              )}

              {/* Hover overlay */}
              {room.path ? (
                <path d={room.path} fill="transparent" style={{ transition: 'fill 0.15s' }}
                  className="hover:fill-white/[0.05]" />
              ) : (
                <rect x={room.x} y={room.y} width={room.width} height={room.height} rx={isSmall ? 5 : 6}
                  fill="transparent" style={{ transition: 'fill 0.15s' }}
                  className="hover:fill-white/[0.05]" />
              )}

              {/* Room ID badge */}
              <rect
                x={(room.x ?? cx - 20) + 6}
                y={(room.y ?? cy - 40) + 6}
                width={room.id.length > 4 ? 44 : 38}
                height={isSmall ? 14 : 16}
                rx="3"
                fill="rgba(0,0,0,0.4)"
              />
              <text
                x={(room.x ?? cx - 20) + 6 + (room.id.length > 4 ? 22 : 19)}
                y={(room.y ?? cy - 40) + 6 + (isSmall ? 10 : 12)}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={isSmall ? 8 : 9}
                fontWeight="600"
                fontFamily="system-ui"
              >
                {room.id}
              </text>

              {/* Room name */}
              {isCorridor ? (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.35)"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="system-ui"
                  transform={`rotate(-90 ${cx} ${cy})`}
                >
                  {room.name}
                </text>
              ) : (
                <text
                  x={cx}
                  y={cy - (hasAssets && !isSmall ? 6 : 0)}
                  textAnchor="middle"
                  fill={isSmall ? 'rgba(255,255,255,0.6)' : 'white'}
                  fontSize={isSmall ? 9 : room.id === 'D2.10' ? 13 : 13}
                  fontWeight={isSmall ? '600' : '700'}
                  fontFamily="system-ui"
                >
                  {room.name}
                </text>
              )}

              {/* Second line for Sklad Extrudátu */}
              {room.id === 'D2.10' && (
                <text x={680} y={133} textAnchor="middle" fill="white" fontSize="13" fontWeight="600" fontFamily="system-ui">
                  {/* name already shown above via labelX/Y */}
                </text>
              )}

              {/* Asset count */}
              {hasAssets && !isSmall && (
                <text
                  x={cx}
                  y={cy + 14}
                  textAnchor="middle"
                  fill={room.status.stroke}
                  fontSize="11"
                  fontFamily="system-ui"
                >
                  {getAssetCountLabel(room.assets.length)}
                </text>
              )}

              {/* Issue badge */}
              {room.assets.some(a => a.status === 'breakdown') && room.x != null && room.width != null && (
                <g>
                  <circle
                    cx={room.x + room.width - 14}
                    cy={(room.y ?? 0) + 14}
                    r="10"
                    fill="rgba(239,68,68,0.3)"
                    stroke="rgba(239,68,68,0.6)"
                    strokeWidth="1"
                  />
                  <text
                    x={room.x + room.width - 14}
                    y={(room.y ?? 0) + 18}
                    textAnchor="middle"
                    fill="#fca5a5"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="system-ui"
                  >
                    ⚠
                  </text>
                </g>
              )}

              {/* Maintenance badge */}
              {!room.assets.some(a => a.status === 'breakdown') &&
                room.assets.some(a => a.status === 'maintenance') && room.x != null && room.width != null && (
                <g>
                  <circle
                    cx={room.x + room.width - 14}
                    cy={(room.y ?? 0) + 14}
                    r="8"
                    fill="rgba(251,191,36,0.25)"
                    stroke="rgba(251,191,36,0.5)"
                    strokeWidth="1"
                  />
                  <text
                    x={room.x + room.width - 14}
                    y={(room.y ?? 0) + 18}
                    textAnchor="middle"
                    fill="#fcd34d"
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="system-ui"
                  >
                    !
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(30, 760)">
          <circle cx="6" cy="6" r="5" fill="rgba(52,211,153,0.25)" stroke="rgba(52,211,153,0.5)" strokeWidth="1" />
          <text x="16" y="10" fill="#64748b" fontSize="9" fontFamily="system-ui">OK</text>
          <circle cx="50" cy="6" r="5" fill="rgba(251,191,36,0.25)" stroke="rgba(251,191,36,0.5)" strokeWidth="1" />
          <text x="60" y="10" fill="#64748b" fontSize="9" fontFamily="system-ui">Údržba</text>
          <circle cx="112" cy="6" r="5" fill="rgba(239,68,68,0.25)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
          <text x="122" y="10" fill="#64748b" fontSize="9" fontFamily="system-ui">Porucha</text>
          <circle cx="178" cy="6" r="5" fill="rgba(100,116,139,0.2)" stroke="rgba(100,116,139,0.4)" strokeWidth="1" />
          <text x="188" y="10" fill="#64748b" fontSize="9" fontFamily="system-ui">Bez strojů</text>
          <rect x="240" y="1" width="10" height="10" rx="2" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.4)" strokeWidth="1" strokeDasharray="2,1" />
          <text x="255" y="10" fill="#64748b" fontSize="9" fontFamily="system-ui">Výtah</text>
        </g>
      </svg>
    </div>
  );
}
