// src/components/ui/MiniChart.tsx
// Sdílený lehký graf (ruční SVG, bez knihovny) — čára nebo sloupce.
// Světlý vzhled „Denní provoz". Pouze prezentace dat.

export interface MiniChartSeries {
  values: number[];
  color: string;
  label?: string;
}

export interface MiniChartThreshold {
  value: number;
  color: string;
  label?: string;
}

interface MiniChartProps {
  type: 'line' | 'bars';
  /** Jedna řada (čára nebo jednoduché sloupce). */
  data?: number[];
  /** Více řad (seskupené sloupce). Má přednost před `data`. */
  series?: MiniChartSeries[];
  labels?: string[];
  color?: string;
  height?: number;
  /** Pevné maximum osy Y (jinak se dopočítá). */
  max?: number;
  /** Vodorovné prahové čáry (jen u typu line). */
  thresholds?: MiniChartThreshold[];
  /** Jednotka pro popisek min/max (např. „°C"). */
  unit?: string;
  ariaLabel?: string;
}

const W = 300; // logická šířka viewBoxu
const PAD = 6;

export default function MiniChart({
  type,
  data,
  series,
  labels,
  color = '#1a6b4f',
  height = 120,
  max,
  thresholds = [],
  unit = '',
  ariaLabel,
}: MiniChartProps) {
  const allSeries: MiniChartSeries[] = series && series.length > 0
    ? series
    : [{ values: data ?? [], color }];

  const flat = allSeries.flatMap((s) => s.values);
  const dataMax = Math.max(1, max ?? Math.max(0, ...flat, ...thresholds.map((t) => t.value)));
  const n = Math.max(1, Math.max(...allSeries.map((s) => s.values.length)));
  const innerH = height - PAD * 2;
  const y = (v: number) => PAD + innerH - (v / dataMax) * innerH;

  if (flat.length === 0) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>Zatím žádná data</div>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={ariaLabel || 'graf'}>
      {/* prahové čáry */}
      {type === 'line' && thresholds.map((t, i) => (
        <line key={`th-${i}`} x1={0} x2={W} y1={y(t.value)} y2={y(t.value)} stroke={t.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
      ))}

      {type === 'line' ? (
        allSeries.map((s, si) => {
          const step = s.values.length > 1 ? W / (s.values.length - 1) : W;
          const pts = s.values.map((v, i) => `${i * step},${y(v)}`).join(' ');
          return (
            <g key={`s-${si}`}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={i * step} cy={y(v)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })
      ) : (
        // sloupce (jedna nebo více řad ve skupinách)
        (() => {
          const groups = n;
          const groupW = W / groups;
          const seriesCount = allSeries.length;
          const barGap = 2;
          const barW = Math.max(2, (groupW - barGap * (seriesCount + 1)) / seriesCount);
          return allSeries.map((s, si) =>
            s.values.map((v, i) => {
              const x = i * groupW + barGap + si * (barW + barGap);
              const h = (v / dataMax) * innerH;
              return <rect key={`b-${si}-${i}`} x={x} y={PAD + innerH - h} width={barW} height={Math.max(0, h)} rx={2} fill={s.color} />;
            })
          );
        })()
      )}

      {/* popisky pod osou */}
      {labels && labels.length > 0 && labels.map((lb, i) => {
        const step = labels.length > 1 ? W / (labels.length - 1) : W / 2;
        const x = type === 'bars' ? i * (W / labels.length) + (W / labels.length) / 2 : i * step;
        return (
          <text key={`l-${i}`} x={x} y={height - 0.5} fontSize={9} fill="#97a096" textAnchor="middle">{lb}</text>
        );
      })}
      {unit && (
        <text x={2} y={PAD + 8} fontSize={9} fill="#97a096">{Math.round(dataMax)}{unit}</text>
      )}
    </svg>
  );
}
