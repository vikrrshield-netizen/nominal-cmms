// src/components/asset/AssetMonitoringSection.tsx
// VIKRR — Asset Shield — „Skladba stroje": komponenty + hlídané veličiny na Kartě stroje (pod Rodný list).
// Vzhled dle prototypu NOMINAL (řetěz karet komponent + boční panel Kondice / Jak to jede / Servisní stopa).
// Data jsou uložená přímo na assetu (asset.components). Logika výpočtu stavu je v src/types/monitoring.ts.

import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Plus, Pencil, Trash2, FileText, AlertTriangle, Wrench, ExternalLink, Loader2, Link2 } from 'lucide-react';
import type { Asset } from '../../types/asset';
import { assetService } from '../../services/assetService';
import { isGearboxAsset } from '../../services/gearboxService';
import { isLineAsset } from '../../lib/lines';
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
  MONITORING_STATUS_CONFIG,
  componentStatus,
  paramStatus,
  machineMonitoringStatus,
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
  onReportFault?: () => void;
  onCreateTask?: () => void;
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

type CompDraft = { id: string | null; type: string; name: string; code: string; maker: string; serial: string; since: string };
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

export default function AssetMonitoringSection({ asset, tenantId, canEdit, onChanged, onReportFault, onCreateTask }: Props) {
  const components = asset.components ?? [];
  const [saving, setSaving] = useState(false);
  const [compSheet, setCompSheet] = useState<CompDraft | null>(null);
  const [paramSheet, setParamSheet] = useState<ParamDraft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<Asset[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const navigate = useNavigate();

  // Nezakládat prázdnou sekci lidem bez práva editace.
  if (components.length === 0 && !canEdit) return null;

  const cond = machineCondition(components);
  const condTone = conditionTone(cond);
  const mStatus = machineMonitoringStatus(components);

  const daysSinceLastRepair = (() => {
    const dates = (asset.repairLog ?? []).map((r) => r.date).filter(Boolean).sort();
    if (!dates.length) return null;
    const last = new Date(dates[dates.length - 1]);
    if (Number.isNaN(last.getTime())) return null;
    const diff = Math.floor((Date.now() - last.getTime()) / 86400000);
    return diff >= 0 ? diff : null;
  })();

  const serviceTrail = [...(asset.repairLog ?? [])]
    .filter((r) => r.date || r.description)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 3);

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
    const fields = {
      type: compSheet.type,
      name,
      code: compSheet.code.trim() || undefined,
      maker: compSheet.maker.trim() || undefined,
      serial: compSheet.serial.trim() || undefined,
      since: compSheet.since.trim() || undefined,
    };
    let next: AssetComponent[];
    if (compSheet.id) {
      const existing = components.find((c) => c.id === compSheet.id);
      if (!existing) return;
      next = upsertComponent(components, { ...existing, ...fields });
    } else {
      const preset = COMPONENT_TYPE_PRESETS.find((p) => p.id === compSheet.type);
      const created: AssetComponent = preset
        ? componentFromPreset(preset, name)
        : { id: newMonitoringId('cmp'), type: compSheet.type, name, params: [] };
      next = upsertComponent(components, { ...created, ...fields });
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

  const openCompEdit = (c: AssetComponent) =>
    setCompSheet({
      id: c.id,
      type: c.type ?? 'other',
      name: c.name,
      code: c.code ?? '',
      maker: c.maker ?? '',
      serial: c.serial ?? '',
      since: c.since ?? '',
    });

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

  const openPicker = async () => {
    setPickerOpen(true);
    if (pickerAssets.length === 0) {
      setPickerLoading(true);
      try {
        setPickerAssets(await assetService.getAll(tenantId));
      } catch (err) {
        console.error('[Monitoring] picker load error:', err);
      } finally {
        setPickerLoading(false);
      }
    }
  };

  // Připojí EXISTUJÍCÍ asset z kartotéky jako komponentu (odkaz, ne kopie).
  const createFromAsset = async (a: Asset) => {
    const preset = isGearboxAsset(a) ? COMPONENT_TYPE_PRESETS.find((p) => p.id === 'gearbox') : undefined;
    const base: AssetComponent = preset
      ? componentFromPreset(preset, a.name)
      : { id: newMonitoringId('cmp'), type: 'other', name: a.name, params: [] };
    const created: AssetComponent = {
      ...base,
      name: a.name,
      code: a.code || undefined,
      maker: a.manufacturer || undefined,
      serial: a.serialNumber || undefined,
      linkedAssetId: a.id,
      linkedAssetName: a.name,
    };
    setPickerOpen(false);
    setPickerQuery('');
    await persist(upsertComponent(components, created), 'Zařízení připojeno');
  };

  const railBtn: CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#475569', background: 'none',
    border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
  };

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Activity size={18} style={{ color: '#0f172a' }} />
        <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', margin: 0 }}>
          Skladba stroje
        </h3>
        {canEdit && (
          <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={openPicker}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#1a6b4f', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Link2 size={15} /> přidat z kartotéky
            </button>
            <button
              type="button"
              onClick={() => setCompSheet({ id: null, type: 'motor', name: '', code: '', maker: '', serial: '', since: '' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#1a6b4f', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={15} /> nová komponenta
            </button>
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-4">
        {/* ── Skladba: karty komponent ── */}
        <div className="lg:col-span-2">
          {components.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '4px 0 14px' }}>
              Zatím žádné komponenty. Přidej třeba motor nebo převodovku a u nich hlídané veličiny (teplota, proud…).
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {components.map((comp) => {
                const cStatus = componentStatus(comp);
                return (
                  <div key={comp.id} style={{ border: '1px solid #eef2f7', borderLeft: `3px solid ${TONE[cStatus].dot}`, borderRadius: 16, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: comp.params.length ? 6 : 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{comp.name}</span>
                      {comp.code && <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{comp.code}</span>}
                      {comp.linkedAssetId && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); navigate(`/asset/${comp.linkedAssetId}`); }}
                          title="Otevřít v kartotéce"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#1a6b4f', background: '#eaf3ee', border: 'none', borderRadius: 8, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          <ExternalLink size={11} /> z kartotéky
                        </button>
                      )}
                      {canEdit && (
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                          <button type="button" onClick={() => openCompEdit(comp)} aria-label="Upravit komponentu" style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" onClick={() => deleteComponent(comp.id)} aria-label="Smazat komponentu" style={{ color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                            <Trash2 size={15} />
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
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid #f3f6fa', cursor: canEdit ? 'pointer' : 'default', color: '#0f172a' }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[s].dot, flex: 'none' }} />
                          <span style={{ fontSize: 13, minWidth: 88 }}>{p.label}</span>
                          <Sparkline values={p.history ?? []} color={TONE[s].dot} />
                          <span style={{ fontSize: 11, color: '#94a3b8', flex: 'none' }}>{p.source === 'live' ? 'živé čidlo' : (p.interval ?? '')}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: p.value != null ? TONE[s].text : '#cbd5e1' }}>
                            {p.value != null ? `${fmt(p.value)} ${p.unit}`.trim() : '— ' + p.unit}
                          </span>
                        </div>
                      );
                    })}

                    {canEdit && (
                      <button type="button" onClick={() => openParamNew(comp.id)} style={{ marginTop: 8, width: '100%', fontSize: 12, color: '#64748b', border: '1px dashed #cbd5e1', background: 'transparent', borderRadius: 12, padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Plus size={14} /> hlídaná hodnota
                      </button>
                    )}

                    <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f3f6fa' }}>
                      {canEdit && (
                        <button type="button" onClick={() => openCompEdit(comp)} style={railBtn}>
                          <FileText size={13} /> Rodný list
                        </button>
                      )}
                      {onReportFault && (
                        <button type="button" onClick={onReportFault} style={{ ...railBtn, color: '#dc2626' }}>
                          <AlertTriangle size={13} /> Porucha
                        </button>
                      )}
                      {onCreateTask && (
                        <button type="button" onClick={onCreateTask} style={{ ...railBtn, color: '#d97706' }}>
                          <Wrench size={13} /> Údržba
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Boční panel ── */}
        <aside className="mt-4 lg:mt-0 lg:col-span-1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 8 }}>Kondice stroje</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: TONE[condTone].text, lineHeight: 1 }}>{cond} %</div>
            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ width: `${cond}%`, height: '100%', background: TONE[condTone].dot }} />
            </div>
          </div>

          <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 8 }}>Jak to jede</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: TONE[mStatus].text }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[mStatus].dot }} />
              {MONITORING_STATUS_CONFIG[mStatus].label}
            </div>
            {daysSinceLastRepair != null && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{daysSinceLastRepair} dní bez poruchy</div>
            )}
          </div>

          <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 8 }}>Servisní stopa</div>
            {serviceTrail.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Zatím žádný záznam.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {serviceTrail.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1', marginTop: 6, flex: 'none' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#0f172a' }}>{r.description || 'Záznam'}</div>
                      {r.date && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.date}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Sheet: komponenta (vč. rodného listu) ── */}
      <BottomSheet
        title={compSheet?.id ? 'Komponenta — rodný list' : 'Nová komponenta'}
        isOpen={!!compSheet}
        onClose={() => setCompSheet(null)}
        titleActions={
          compSheet?.id ? (
            <button type="button" onClick={() => { const id = compSheet.id!; setCompSheet(null); deleteComponent(id); }} aria-label="Smazat komponentu" className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition">
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
                  <button key={t.id} type="button" onClick={() => setCompSheet({ ...compSheet, type: t.id })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${compSheet.type === t.id ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {!compSheet.id && <p className="text-xs text-slate-400 mt-1.5">U motoru/převodovky se rovnou předvyplní typické veličiny.</p>}
            </div>
            <FormField label="Název" value={compSheet.name} onChange={(v) => setCompSheet({ ...compSheet, name: v })} placeholder="např. Hlavní pohon" required autoFocus />
            <FormField label="Kód / inv. číslo" value={compSheet.code} onChange={(v) => setCompSheet({ ...compSheet, code: v })} placeholder="např. MOT-101" />
            <FormField label="Výrobce" value={compSheet.maker} onChange={(v) => setCompSheet({ ...compSheet, maker: v })} placeholder="např. Siemens" />
            <FormField label="Sériové číslo" value={compSheet.serial} onChange={(v) => setCompSheet({ ...compSheet, serial: v })} />
            <FormField label="V provozu od" type="date" value={compSheet.since} onChange={(v) => setCompSheet({ ...compSheet, since: v })} />
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
            <button type="button" onClick={deleteParam} aria-label="Smazat veličinu" className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : undefined
        }
      >
        {paramSheet && (
          <>
            {paramSheet.id && (
              <FormField label="Nová hodnota (zápis měření)" type="number" value={paramSheet.newValue} onChange={(v) => setParamSheet({ ...paramSheet, newValue: v })} placeholder="např. 78" />
            )}
            <FormField label="Název veličiny" value={paramSheet.label} onChange={(v) => setParamSheet({ ...paramSheet, label: v })} placeholder="např. Teplota vinutí" required autoFocus={!paramSheet.id} />
            <FormField label="Jednotka" value={paramSheet.unit} onChange={(v) => setParamSheet({ ...paramSheet, unit: v })} placeholder="např. °C" />
            <div className="flex flex-wrap gap-1.5 -mt-2 mb-4">
              {COMMON_UNITS.map((u) => (
                <button key={u} type="button" onClick={() => setParamSheet({ ...paramSheet, unit: u })} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
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
                {([{ value: 'high', label: 'Překročení (moc vysoké)' }, { value: 'low', label: 'Podkročení (moc nízké)' }] as const).map((o) => (
                  <button key={o.value} type="button" onClick={() => setParamSheet({ ...paramSheet, dir: o.value })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${paramSheet.dir === o.value ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Zdroj hodnoty</label>
              <div className="grid grid-cols-2 gap-2">
                {([{ value: 'manual', label: 'Ruční zápis' }, { value: 'live', label: 'Živé čidlo' }] as const).map((o) => (
                  <button key={o.value} type="button" onClick={() => setParamSheet({ ...paramSheet, source: o.value })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition min-h-[44px] ${paramSheet.source === o.value ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {paramSheet.source === 'manual' && (
              <FormField label="Jak často se měří" type="select" value={paramSheet.interval} onChange={(v) => setParamSheet({ ...paramSheet, interval: v })} options={MEASUREMENT_INTERVALS.map((i) => ({ value: i, label: i }))} />
            )}
            <FormFooter onCancel={() => setParamSheet(null)} onSubmit={saveParam} loading={saving} submitLabel={paramSheet.id ? 'Uložit' : 'Přidat'} />
          </>
        )}
      </BottomSheet>

      {/* ── Sheet: přidat z kartotéky (existující zařízení jako komponenta) ── */}
      <BottomSheet title="Přidat z kartotéky" isOpen={pickerOpen} onClose={() => { setPickerOpen(false); setPickerQuery(''); }}>
        <p className="text-[13px] text-slate-500 mb-3">Vyber existující zařízení z kartotéky (např. převodovku) a připoj ho jako komponentu tohoto stroje.</p>
        <input
          value={pickerQuery}
          onChange={(e) => setPickerQuery(e.target.value)}
          placeholder="hledat podle názvu nebo kódu…"
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-950 text-[15px] placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white transition min-h-[48px] mb-3"
        />
        {pickerLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-6 justify-center"><Loader2 className="animate-spin" size={18} /> Načítám…</div>
        ) : (() => {
          const linkedIds = new Set(components.map((c) => c.linkedAssetId).filter(Boolean) as string[]);
          const q = pickerQuery.trim().toLowerCase();
          const cands = pickerAssets
            .filter((a) => a.id !== asset.id && !linkedIds.has(a.id) && !isLineAsset(a))
            .filter((a) => !q || `${a.name} ${a.code ?? ''}`.toLowerCase().includes(q))
            .slice(0, 50);
          if (cands.length === 0) return <p className="text-[13px] text-slate-400 py-4 text-center">Nic nenalezeno.</p>;
          return (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {cands.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => createFromAsset(a)}
                  disabled={saving}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:bg-emerald-50 hover:border-emerald-300 transition min-h-[48px] disabled:opacity-50"
                >
                  <Link2 size={16} className="text-emerald-700 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-slate-800 truncate">{a.name}</span>
                    <span className="block text-[12px] text-slate-400 truncate">{[a.entityType || a.category, a.code, a.location].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}
