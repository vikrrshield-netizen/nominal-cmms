// src/types/monitoring.ts
// VIKRR Asset Shield — Monitoring (komponenty + hlídané veličiny)
// Obecný monitoring JAKÉHOKOLIV stroje: stroj → komponenta → hlídaná veličina.
// Zobecnění převodovkové teploty (viz gearboxService) na libovolnou veličinu.
// Vše je ADITIVNÍ a NEPOVINNÉ — stroj bez komponent funguje úplně stejně jako dřív.

export type MonitoringStatus = 'ok' | 'warn' | 'crit';
export type ParamDirection = 'high' | 'low'; // high = hlídá překročení, low = podkročení
export type ParamSource = 'manual' | 'live';
export type MeasurementInterval = 'Průběžně' | 'Každou směnu' | 'Denně' | 'Týdně';

export interface MonitoredParam {
  id: string;
  label: string; // "Teplota vinutí"
  unit: string; // "°C"
  value?: number | null; // aktuální hodnota (nemusí být změřená)
  warn?: number | null; // práh "sledovat"
  crit?: number | null; // práh "mimo limit"
  dir: ParamDirection; // "high" | "low"
  source: ParamSource; // "manual" | "live"
  interval?: MeasurementInterval | null; // jen pro manual; pro live = null
  history?: number[]; // posledních ~16 hodnot pro sparkline
  lastMeasuredAt?: string | null; // ISO
  note?: string;
}

export interface AssetComponent {
  id: string;
  type?: string; // klíč typu komponenty (motor|gearbox|pump|...) — volné
  name: string; // "Hlavní pohon"
  code?: string; // "MOT-101" (kód / inventární číslo)
  maker?: string;
  serial?: string;
  since?: string;
  note?: string;
  params: MonitoredParam[];
}

export const MONITORING_STATUS_CONFIG: Record<
  MonitoringStatus,
  { label: string; tone: MonitoringStatus }
> = {
  ok: { label: 'V normě', tone: 'ok' },
  warn: { label: 'Sledovat', tone: 'warn' },
  crit: { label: 'Mimo limit', tone: 'crit' },
};

const RANK: Record<MonitoringStatus, number> = { ok: 0, warn: 1, crit: 2 };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Výpočet stavu (čisté funkce, beze stavu a bez Firestore)
// ---------------------------------------------------------------------------

// Stav jedné veličiny z prahů a aktuální hodnoty. Nezměřeno → "ok" (bez poplachu).
export function paramStatus(
  p: Pick<MonitoredParam, 'value' | 'warn' | 'crit' | 'dir'>,
): MonitoringStatus {
  if (!isNum(p.value)) return 'ok';
  if (p.dir === 'low') {
    if (isNum(p.crit) && p.value <= p.crit) return 'crit';
    if (isNum(p.warn) && p.value <= p.warn) return 'warn';
    return 'ok';
  }
  // high
  if (isNum(p.crit) && p.value >= p.crit) return 'crit';
  if (isNum(p.warn) && p.value >= p.warn) return 'warn';
  return 'ok';
}

// Nejhorší stav ze seznamu (worst). Prázdné → "ok".
export function worstStatus(statuses: MonitoringStatus[]): MonitoringStatus {
  return statuses.reduce<MonitoringStatus>(
    (acc, s) => (RANK[s] > RANK[acc] ? s : acc),
    'ok',
  );
}

// Stav komponenty = nejhorší veličina. Bez veličin → "ok".
export function componentStatus(component: Pick<AssetComponent, 'params'>): MonitoringStatus {
  return worstStatus((component.params ?? []).map(paramStatus));
}

// Stav stroje = nejhorší komponenta. Bez komponent/veličin → "ok".
export function machineMonitoringStatus(
  components: AssetComponent[] | undefined,
): MonitoringStatus {
  return worstStatus((components ?? []).map(componentStatus));
}

// Všechny veličiny stroje napříč komponentami.
export function allParams(components: AssetComponent[] | undefined): MonitoredParam[] {
  return (components ?? []).flatMap((c) => c.params ?? []);
}

// Kondice stroje v % = podíl veličin v normě (status "ok"). Bez veličin → 100 %.
export function machineCondition(components: AssetComponent[] | undefined): number {
  const params = allParams(components);
  if (params.length === 0) return 100;
  const okCount = params.filter((p) => paramStatus(p) === 'ok').length;
  return Math.round((okCount / params.length) * 100);
}

// Barevný tón kondice: ≥85 ok, ≥60 warn, jinak crit.
export function conditionTone(condition: number): MonitoringStatus {
  if (condition >= 85) return 'ok';
  if (condition >= 60) return 'warn';
  return 'crit';
}

// Počty veličin podle stavu (pro KPI / souhrnný pruh).
export function statusCounts(
  components: AssetComponent[] | undefined,
): Record<MonitoringStatus, number> {
  const counts: Record<MonitoringStatus, number> = { ok: 0, warn: 0, crit: 0 };
  for (const p of allParams(components)) counts[paramStatus(p)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Číselníky pro UI (našeptávač jednotek, intervaly, typy komponent)
// ---------------------------------------------------------------------------

export const COMMON_UNITS = [
  '°C', 'A', 'W', 'kW', 'bar', '%', 'ot/min', 'mm/s', 'V', 'Hz', 'l/min', 'µm', 'Pa', 'kg',
];

export const MEASUREMENT_INTERVALS: MeasurementInterval[] = [
  'Průběžně', 'Každou směnu', 'Denně', 'Týdně',
];

export const HISTORY_LIMIT = 16;

export interface ComponentParamSeed {
  label: string;
  unit: string;
  warn?: number;
  crit?: number;
  dir: ParamDirection;
}

export interface ComponentTypePreset {
  id: string;
  label: string;
  icon: string; // klíč ikony (mapuje si UI)
  seeds: ComponentParamSeed[];
}

// Vestavěné typy komponent se šablonou veličin. Uživatel je později může rozšířit
// (krok 4 — editovatelný číselník). Prahy u motoru/převodovky kopírují zaběhnutou
// převodovkovou logiku (warn 70 / crit 85 °C).
export const COMPONENT_TYPE_PRESETS: ComponentTypePreset[] = [
  {
    id: 'motor',
    label: 'Motor',
    icon: 'motor',
    seeds: [
      { label: 'Teplota vinutí', unit: '°C', warn: 75, crit: 85, dir: 'high' },
      { label: 'Proud', unit: 'A', dir: 'high' },
    ],
  },
  {
    id: 'gearbox',
    label: 'Převodovka',
    icon: 'gearbox',
    seeds: [
      { label: 'Teplota oleje', unit: '°C', warn: 70, crit: 85, dir: 'high' },
      { label: 'Vibrace', unit: 'mm/s', warn: 4, crit: 7, dir: 'high' },
    ],
  },
  {
    id: 'pump',
    label: 'Čerpadlo',
    icon: 'pump',
    seeds: [{ label: 'Tlak', unit: 'bar', warn: 6, crit: 8, dir: 'high' }],
  },
  {
    id: 'heating',
    label: 'Topení',
    icon: 'heating',
    seeds: [{ label: 'Teplota', unit: '°C', warn: 200, crit: 230, dir: 'high' }],
  },
  {
    id: 'cooling',
    label: 'Chlazení',
    icon: 'cooling',
    seeds: [{ label: 'Teplota', unit: '°C', warn: 35, crit: 45, dir: 'high' }],
  },
  { id: 'sensor', label: 'Čidlo', icon: 'sensor', seeds: [] },
  { id: 'other', label: 'Ostatní', icon: 'other', seeds: [] },
];

// Založí komponentu z presetu i s předvyplněnými veličinami (šablona).
export function componentFromPreset(preset: ComponentTypePreset, name?: string): AssetComponent {
  return {
    id: newMonitoringId('cmp'),
    type: preset.id,
    name: name || preset.label,
    params: preset.seeds.map((s) => ({
      id: newMonitoringId('par'),
      label: s.label,
      unit: s.unit,
      value: null,
      warn: s.warn ?? null,
      crit: s.crit ?? null,
      dir: s.dir,
      source: 'manual' as const,
      interval: 'Každou směnu' as const,
      history: [],
      lastMeasuredAt: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Pomocníci na úpravu (immutable) + bezpečné uložení do Firestore
// ---------------------------------------------------------------------------

export function newMonitoringId(prefix = 'm'): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const rnd = g.crypto?.randomUUID ? g.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${rnd}`;
}

export function upsertComponent(
  components: AssetComponent[],
  component: AssetComponent,
): AssetComponent[] {
  const idx = components.findIndex((c) => c.id === component.id);
  if (idx === -1) return [...components, component];
  const next = components.slice();
  next[idx] = component;
  return next;
}

export function removeComponent(
  components: AssetComponent[],
  componentId: string,
): AssetComponent[] {
  return components.filter((c) => c.id !== componentId);
}

export function upsertParam(component: AssetComponent, param: MonitoredParam): AssetComponent {
  const idx = component.params.findIndex((p) => p.id === param.id);
  const params =
    idx === -1
      ? [...component.params, param]
      : component.params.map((p) => (p.id === param.id ? param : p));
  return { ...component, params };
}

export function removeParam(component: AssetComponent, paramId: string): AssetComponent {
  return { ...component, params: component.params.filter((p) => p.id !== paramId) };
}

// Zapíše novou naměřenou hodnotu do veličiny + posune historii (pro sparkline).
export function recordParamValue(
  param: MonitoredParam,
  value: number,
  measuredAt: Date = new Date(),
): MonitoredParam {
  const history = [...(param.history ?? []), value].slice(-HISTORY_LIMIT);
  return { ...param, value, history, lastMeasuredAt: measuredAt.toISOString() };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// Firestore nepovolí "undefined" ani ve vnořených objektech. Před uložením očisti.
export function sanitizeComponentsForSave(components: AssetComponent[]): AssetComponent[] {
  return components.map((c) => ({
    ...stripUndefined(c as unknown as Record<string, unknown>),
    params: (c.params ?? []).map(
      (p) => stripUndefined(p as unknown as Record<string, unknown>) as unknown as MonitoredParam,
    ),
  })) as unknown as AssetComponent[];
}
