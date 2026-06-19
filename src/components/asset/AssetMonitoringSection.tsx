// src/components/asset/AssetMonitoringSection.tsx
// VIKRR — Asset Shield — Monitoring: komponenty + hlídané veličiny na Kartě stroje (pod Rodný list).
// Data jsou uložená přímo na assetu (asset.components). Vzhled „Denní provoz".
// Logika výpočtu stavu je v src/types/monitoring.ts (čisté funkce).

import { useState } from 'react';
import { Activity, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Asset } from '../../types/asset';
import { assetService } from '../../services/assetService';
import BottomSheet, { FormField, FormFooter } from '../ui/BottomSheet';
import { showToast } from '../ui/Toast';
import {
  type AssetComponent,
  type MonitoredParam,
  type MonitoringStatus,
  type ParamDirection,
  type ParamSource,
  type MeasurementInterval,
  COMPONENT_TYPE_PRESETS,
  COMMON_UNITS,
  MEASUREMENT_INTERVALS,
  componentStatus,
  paramStatus,
  machineCondition,
  conditionTone,
  componentFromPreset,
  newMonitoringId,
  upsertComponent,
  removeComponent,
  upsertParam,
  removeParam,
  recordParamValue,
  sanitizeComponentsForSave,
} from '../../types/monitoring';

interface Props {
  asset: Asset;
  tenantId: string;
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}

const TONE: Record<MonitoringStatus, { dot: string; text: string; soft: string }> = {
  ok: { dot: '#22c55e', text: '#16a34a', soft: '#dcfce7' },
  warn: { dot: '#eab308', text: '#d97706', soft: '#fef3c7' },
  crit: { dot: '#ef4444', text: '#dc2626', soft: '#fee2e2' },
};

const parseNum = (s: string): number | null => {
  const n = Number(String(s).replace(',', '.'));
  return String(s).trim() !== '' && Number.isFinite(n) ? n : null;
};

const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) {
    return <span style={{ display: 'inline-block', width: 58, flex: 'none' }} aria-hidden="true" />;
  }
  const w = 58, h = 20, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ flex: 'none' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type CompDraft = { id: string | null; type: string; name: string; code: string };
type ParamDraft = {
  componentId: string;
  id: string | null;
  label: string;
  unit: string;
  warn: string;
  crit: string;
  dir: ParamDirection;
  source: ParamSource;
  interval: string;
  newValue: string;
};

export default function AssetMonitoringSection({ asset, tenantId, canEdit, onChanged }: Props) {
  const components = asset.components ?? [];
  const [saving, setSaving] = useState(false);
  const [compSheet, setCompSheet] = useState<CompDraft | null>(null);
  const [paramSheet, setParamSheet] = useState<ParamDraft | null>(null);

  // Nezakládat prázdnou sekci lidem bez práva editace.
  if (components.length === 0 && !canEdit) return null;

  const cond = machineCondition(components);
  const condTone = conditionTone(cond);

  const persist = async (next: AssetComponent[], successMsg?: string) => {
    setSaving(true);
    try {
      await assetService.update(tenantId, asset.id, { components: sanitizeComponentsForSave(next) });
      await onChanged();
      if (successMsg) showToast(successMsg, 'success');
    } catch (err) {
      console.error('[Monitoring] save error:', err);
      showToast('Chyba při ukládání', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveComponent = async () => {
    if (!compSheet) return;
    const name = compSheet.name.trim();
    if (!name) {
      showToast('Zadej název komponenty', 'error');
      return;
    }
    const code = compSheet.code.trim();
    let next: AssetComponent[];
    if (compSheet.id) {
      const existing = components.find((c) => c.id === compSheet.id);
      if (!existing) return;
      next = upsertComponent(components, { ...existing, type: compSheet.type, name, code: code || undefined });
    } else {
      const preset = COMPONENT_TYPE_PRESETS.find((p) => p.id === compSheet.type);
      const created: AssetComponent = preset
        ? componentFromPreset(preset, name)
        : { id: newMonitoringId('cmp'), type: compSheet.type, name, params: [] };
      created.code = code || undefined;
      next = upsertComponent(components, created);
    }
    setCompSheet(null);
    await persist(next, 'Komponenta uložena');
  };

  const deleteComponent = async (id: string) => {
    if (!window.confirm('Smazat celou komponentu i s jejími veličinami?')) return;
    await persist(removeComponent(components, id), 'Komponenta smazána');
  };

  const saveParam = async () => {
    if (!paramSheet) return;
    const label = paramSheet.label.trim();
    if (!label) {
      showToast('Zadej název veličiny', 'error');
      return;
    }
    const comp = components.find((c) => c.id === paramSheet.componentId);
    if (!comp) return;
    const prev = paramSheet.id ? comp.params.find((p) => p.id === paramSheet.id) : null;
    let param: MonitoredParam = {
      id: prev?.id ?? newMonitoringId('par'),
      label,
      unit: paramSheet.unit.trim(),
      value: prev?.value ?? null,
      warn: parseNum(paramSheet.warn),
      crit: parseNum(paramSheet.crit),
      dir: paramSheet.dir,
      source: paramSheet.source,
      interval: paramSheet.source === 'manual' ? ((paramSheet.interval as MeasurementInterval) || null) : null,
      history: prev?.history ?? [],
      lastMeasuredAt: prev?.lastMeasuredAt ?? null,
    };
    const nv = parseNum(paramSheet.newValue);
    if (nv !== null) param = recordParamValue(param, nv);
    const next = upsertComponent(components, upsertParam(comp, param));
    setParamSheet(null);
    await persist(next, 'Veličina uložena');
  };

  const deleteParam = async () => {
    if (!paramSheet?.id) {
      setParamSheet(null);
      return;
    }
    const comp = components.find((c) => c.id === paramSheet.componentId);
    if (!comp) return;
    if (!window.confirm('Smazat tuto veličinu?')) return;
    const next = upsertComponent(components, removeParam(comp, paramSheet.id));
    setParamSheet(null);
    await persist(next, 'Veličina smazána');
  };

  const openParamEdit = (componentId: string, p: MonitoredParam) =>
    setParamSheet({
      componentId,
      id: p.id,
      label: p.label,
      unit: p.unit,
      warn: p.warn != null ? String(p.warn) : '',
      crit: p.crit != null ? String(p.crit) : '',
      dir: p.dir,
      source: p.source,
      interval: p.interval ?? 'Každou směnu',
      newValue: '',
    });

  const openParamNew = (componentId: string) =>
    setParamSheet({
      componentId,
      id: null,
      label: '',
      unit: '',
      warn: '',
      crit: '',
      dir: 'high',
      source: 'manual',
      interval: 'Každou směnu',
      newValue: '',
    });

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Activity size={18} style={{ color: '#0f172a' }} />
        <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>
          Komponenty a veličiny
        </h3>
        {components.length > 0 && (
          <span
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
              background: TONE[condTone].soft, color: TONE[condTone].text,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[condTone].dot }} />
            kondice {cond} %
          </span>
        )}
      </div>

      {components.length === 0 ? (
        <div style={{ fontSize: 13, color: '#94a3b8', padding: '4px 0 14px' }}>
          Zatím žádné komponenty. Přidej třeba motor nebo převodovku a u nich hlídané veličiny (teplota, proud…).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {components.map((comp) => {
            const cStatus = componentStatus(comp);
            return (
              <div key={comp.id} style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: comp.params.length ? 8 : 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE[cStatus].dot, flex: 'none' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{comp.name}</span>
                  {comp.code && <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{comp.code}</span>}
                  {canEdit && (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setCompSheet({ id: comp.id, type: comp.type ?? 'other', name: comp.name, code: comp.code ?? '' })}
                        aria-label="Upravit komponentu"
                        style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteComponent(comp.id)}
                        aria-label="Smazat komponentu"
                        style={{ color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </span>
                  )}
                </div>

                {comp.params.map((p) => {
                  const s = paramStatus(p);
                  return (
                    <div
                      key={p.id}
                      {...(canEdit ? { role: 'button', tabIndex: 0, onClick: () => openParamEdit(comp.id, p) } : {})}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', borderTop: '1px solid #f3f6fa',
                        cursor: canEdit ? 'pointer' : 'default', color: '#0f172a',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[s].dot, flex: 'none' }} />
                      <span style={{ fontSize: 13, minWidth: 92 }}>{p.label}</span>
                      <Sparkline values={p.history ?? []} color={TONE[s].dot} />
                      <span style={{ fontSize: 11, color: '#94a3b8', flex: 'none' }}>
                        {p.source === 'live' ? 'živé čidlo' : (p.interval ?? '')}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: p.value != null ? TONE[s].text : '#cbd5e1' }}>
                        {p.value != null ? `${fmt(p.value)} ${p.unit}`.trim() : '— ' + p.unit}
                      </span>
                    </div>
                  );
                })}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openParamNew(comp.id)}
                    style={{
                      marginTop: 10, width: '100%', fontSize: 12, color: '#64748b',
                      border: '1px dashed #cbd5e1', background: 'transparent', borderRadius: 12,
                      padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Plus size={14} /> hlídaná hodnota
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setCompSheet({ id: null, type: 'motor', name: '', code: '' })}
          style={{
            marginTop: 12, width: '100%', fontSize: 13, fontWeight: 700, color: '#0f172a',
            border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 12, padding: '10px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={15} /> přidat komponentu
        </button>
      )}

      {/* ── Sheet: komponenta ── */}
      <BottomSheet
        title={compSheet?.id ? 'Upravit komponentu' : 'Nová komponenta'}
        isOpen={!!compSheet}
        onClose={() => setCompSheet(null)}
        titleActions={
          compSheet?.id ? (
            <button
              type="button"
              onClick={() => { const id = compSheet.id!; setCompSheet(null); deleteComponent(id); }}
              aria-label="Smazat komponentu"
              className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : undefined
        }
      >
        {compSheet && (
          <>
            <div className="mb-4">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Typ komponenty</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COMPONENT_TYPE_PRESETS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCompSheet({ ...compSheet, type: t.id })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${
                      compSheet.type === t.id
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {!compSheet.id && (
                <p className="text-xs text-slate-400 mt-1.5">U motoru/převodovky se rovnou předvyplní typické veličiny.</p>
              )}
            </div>
            <FormField label="Název" value={compSheet.name} onChange={(v) => setCompSheet({ ...compSheet, name: v })} placeholder="např. Hlavní pohon" required autoFocus />
            <FormField label="Kód / inv. číslo" value={compSheet.code} onChange={(v) => setCompSheet({ ...compSheet, code: v })} placeholder="např. MOT-101" />
            <FormFooter onCancel={() => setCompSheet(null)} onSubmit={saveComponent} loading={saving} submitLabel={compSheet.id ? 'Uložit' : 'Přidat'} />
          </>
        )}
      </BottomSheet>

      {/* ── Sheet: veličina ── */}
      <BottomSheet
        title={paramSheet?.id ? 'Hlídaná veličina' : 'Nová veličina'}
        isOpen={!!paramSheet}
        onClose={() => setParamSheet(null)}
        titleActions={
          paramSheet?.id ? (
            <button
              type="button"
              onClick={deleteParam}
              aria-label="Smazat veličinu"
              className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : undefined
        }
      >
        {paramSheet && (
          <>
            {paramSheet.id && (
              <FormField
                label="Nová hodnota (zápis měření)"
                type="number"
                value={paramSheet.newValue}
                onChange={(v) => setParamSheet({ ...paramSheet, newValue: v })}
                placeholder="např. 78"
              />
            )}
            <FormField label="Název veličiny" value={paramSheet.label} onChange={(v) => setParamSheet({ ...paramSheet, label: v })} placeholder="např. Teplota vinutí" required autoFocus={!paramSheet.id} />
            <FormField label="Jednotka" value={paramSheet.unit} onChange={(v) => setParamSheet({ ...paramSheet, unit: v })} placeholder="např. °C" />
            <div className="flex flex-wrap gap-1.5 -mt-2 mb-4">
              {COMMON_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setParamSheet({ ...paramSheet, unit: u })}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Práh sledovat" type="number" value={paramSheet.warn} onChange={(v) => setParamSheet({ ...paramSheet, warn: v })} placeholder="např. 75" />
              <FormField label="Práh mimo limit" type="number" value={paramSheet.crit} onChange={(v) => setParamSheet({ ...paramSheet, crit: v })} placeholder="např. 85" />
            </div>
            <div className="mb-4">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Co se hlídá</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'high', label: 'Překročení (moc vysoké)' },
                  { value: 'low', label: 'Podkročení (moc nízké)' },
                ] as const).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setParamSheet({ ...paramSheet, dir: o.value })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${
                      paramSheet.dir === o.value ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Zdroj hodnoty</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'manual', label: 'Ruční zápis' },
                  { value: 'live', label: 'Živé čidlo' },
                ] as const).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setParamSheet({ ...paramSheet, source: o.value })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${
                      paramSheet.source === o.value ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {paramSheet.source === 'manual' && (
              <FormField
                label="Jak často se měří"
                type="select"
                value={paramSheet.interval}
                onChange={(v) => setParamSheet({ ...paramSheet, interval: v })}
                options={MEASUREMENT_INTERVALS.map((i) => ({ value: i, label: i }))}
              />
            )}
            <FormFooter onCancel={() => setParamSheet(null)} onSubmit={saveParam} loading={saving} submitLabel={paramSheet.id ? 'Uložit' : 'Přidat'} />
          </>
        )}
      </BottomSheet>
    </div>
  );
}
