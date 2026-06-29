// src/pages/ProductionLinesPage.tsx
// VIKRR — Asset Shield — „Výrobní linky". Linka = vlastní karta (asset entityType 'Linka')
// složená ze strojů z kartotéky (lineMachineIds). Stav linky = nejhorší z jejích strojů.
// Ukládá se mezi assety → žádná nová kolekce ani změna pravidel.

import { useEffect, useMemo, useState } from 'react';
import { Workflow, Plus, Loader2, Check, ChevronRight } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import type { Asset } from '../types/asset';
import {
  MONITORING_STATUS_CONFIG,
  type MonitoringStatus,
  STATUS_TONE as TONE,
  machineMonitoringStatus,
  worstStatus,
} from '../types/monitoring';
import { LINE_ENTITY_TYPE, isLineAsset, isLineMachineCandidate } from '../lib/lines';
import BottomSheet, { FormField, FormFooter } from '../components/ui/BottomSheet';
import { showToast } from '../components/ui/Toast';
import StrojeLinkyTabs from '../components/StrojeLinkyTabs';
import { useConfirm } from '../hooks/useConfirm';

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-950 text-[15px] placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15 transition min-h-[48px]';

type LineDraft = { id: string | null; name: string; loc: string; purpose: string; machineIds: string[] };

const STATUS_KPI: { key: MonitoringStatus; label: string; hint: string }[] = [
  { key: 'ok', label: 'V provozu', hint: 'linky bez problému' },
  { key: 'warn', label: 'Sledovat', hint: 'stroj blízko limitu' },
  { key: 'crit', label: 'Mimo limit', hint: 'stroj odstaven' },
];

export default function ProductionLinesPage() {
  const { ask } = useConfirm();
  const { user, hasPermission } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const canEdit = hasPermission('asset.update') || hasPermission('asset.create');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LineDraft | null>(null);

  const load = useMemo(
    () => async () => {
      try {
        const all = await assetService.getAll(tenantId);
        setAssets(all);
      } catch (err) {
        console.error('[Linky] load error:', err);
      } finally {
        setLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const lines = useMemo(() => assets.filter(isLineAsset), [assets]);
  const machines = useMemo(() => assets.filter(isLineMachineCandidate), [assets]);
  const knownLocations = useMemo(
    () => Array.from(new Set(assets.map((a) => (a.location || '').trim()).filter(Boolean))).sort(),
    [assets],
  );

  const lineStatus = (line: Asset): MonitoringStatus =>
    worstStatus(
      (line.lineMachineIds ?? [])
        .map((id) => byId.get(id))
        .filter((m): m is Asset => !!m)
        .map((m) => machineMonitoringStatus(m.components)),
    );

  const counts = useMemo(() => {
    const c: Record<MonitoringStatus, number> = { ok: 0, warn: 0, crit: 0 };
    for (const l of lines) c[lineStatus(l)] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, byId]);

  // Umístění odvozené ze strojů: když jsou z jednoho místa, vrátí ho.
  const deriveLoc = (ids: string[]): string => {
    const locs = Array.from(
      new Set(ids.map((id) => { const m = byId.get(id); return (m?.location || m?.areaName || '').trim(); }).filter(Boolean)),
    );
    return locs.length === 1 ? locs[0] : '';
  };

  const toggleMachine = (id: string) => {
    if (!draft) return;
    const has = draft.machineIds.includes(id);
    const machineIds = has ? draft.machineIds.filter((x) => x !== id) : [...draft.machineIds, id];
    let loc = draft.loc;
    if (!loc.trim()) {
      const d = deriveLoc(machineIds);
      if (d) loc = d;
    }
    setDraft({ ...draft, machineIds, loc });
  };

  const saveLine = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      showToast('Zadej název linky', 'error');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await assetService.update(tenantId, draft.id, {
          name,
          location: draft.loc.trim() || null,
          linePurpose: draft.purpose.trim(),
          lineMachineIds: draft.machineIds,
        });
      } else {
        await assetService.add(tenantId, {
          tenantId,
          parentId: null,
          name,
          entityType: LINE_ENTITY_TYPE,
          status: 'operational',
          criticality: 'medium',
          location: draft.loc.trim() || null,
          linePurpose: draft.purpose.trim(),
          lineMachineIds: draft.machineIds,
        });
      }
      setDraft(null);
      await load();
      showToast('Linka uložena', 'success');
    } catch (err) {
      console.error('[Linky] save error:', err);
      showToast('Chyba při ukládání', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteLine = async () => {
    if (!draft?.id) {
      setDraft(null);
      return;
    }
    if (!(await ask({ message: 'Smazat tuto linku? Stroje zůstanou v kartotéce.', danger: true }))) return;
    setSaving(true);
    try {
      await assetService.delete(tenantId, draft.id);
      setDraft(null);
      await load();
      showToast('Linka smazána', 'success');
    } catch (err) {
      console.error('[Linky] delete error:', err);
      showToast('Chyba při mazání', 'error');
    } finally {
      setSaving(false);
    }
  };

  const newLine = () => setDraft({ id: null, name: '', loc: '', purpose: '', machineIds: [] });

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto">
      <StrojeLinkyTabs active="linky" />

      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Workflow className="text-emerald-700" size={26} />
          <div>
            <h1 className="text-xl font-black text-slate-900">Výrobní linky</h1>
            <p className="text-[13px] text-slate-500">Linka se skládá ze strojů z kartotéky. Stav linky se počítá z jejích strojů. Klikni na linku pro úpravu.</p>
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={newLine} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-slate-800 transition flex-shrink-0">
            <Plus size={16} /> Nová linka
          </button>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STATUS_KPI.map((k) => (
          <div key={k.key} className="rounded-2xl border border-[#e2d8c9] bg-white p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: TONE[k.key].text }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE[k.key].dot }} />
              {k.label}
            </div>
            <div className="mt-1 text-3xl font-black text-slate-900">{counts[k.key]}</div>
            <div className="text-[12px] text-slate-400">{k.hint}</div>
          </div>
        ))}
        <div className="rounded-2xl border border-[#e2d8c9] bg-white p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />
            Linek celkem
          </div>
          <div className="mt-1 text-3xl font-black text-slate-900">{lines.length}</div>
          <div className="text-[12px] text-slate-400">{machines.length} strojů v kartotéce</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 className="animate-spin" size={18} /> Načítám linky…
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cdbfa8] bg-white/60 p-8 text-center">
          <div className="text-slate-700 font-semibold mb-1">Zatím žádná linka</div>
          <div className="text-[13px] text-slate-500 mb-4">Vytvoř linku a poskládej ji ze strojů z kartotéky.</div>
          {canEdit && (
            <button type="button" onClick={newLine} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 transition">
              Nová linka
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {lines.map((line) => {
            const status = lineStatus(line);
            const members = (line.lineMachineIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Asset[];
            return (
              <button
                key={line.id}
                type="button"
                onClick={() => setDraft({
                  id: line.id,
                  name: line.name,
                  loc: line.location ?? '',
                  purpose: line.linePurpose ?? '',
                  machineIds: line.lineMachineIds ?? [],
                })}
                className="text-left rounded-2xl border bg-white p-5 transition hover:shadow-md"
                style={{ borderColor: '#eef2f7', borderLeft: `4px solid ${TONE[status].dot}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[17px] font-black text-slate-900 truncate">{line.name}</div>
                    <div className="text-[12px] text-slate-500 truncate">
                      {[line.location, line.linePurpose].filter(Boolean).join(' · ') || 'bez umístění'}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold flex-shrink-0" style={{ background: TONE[status].soft, color: TONE[status].text }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[status].dot }} />
                    {MONITORING_STATUS_CONFIG[status].label}
                  </span>
                </div>

                {members.length > 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {members.map((m, i) => {
                      const ms = machineMonitoringStatus(m.components);
                      return (
                        <span key={m.id} className="inline-flex items-center gap-1.5">
                          {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[12px] text-slate-700">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: TONE[ms].dot }} />
                            {m.name}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 text-[12px] text-slate-400">Zatím bez strojů — klikni a přidej je.</div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Strojů na lince: {members.length}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Sheet: linka (rodný list) ── */}
      <BottomSheet
        title={draft?.id ? 'Linka — rodný list' : 'Nová linka'}
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        titleActions={
          draft?.id ? (
            <button type="button" onClick={deleteLine} aria-label="Smazat linku" className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition">
              <span className="text-lg leading-none">×</span>
            </button>
          ) : undefined
        }
      >
        {draft && (
          <>
            <FormField label="Název linky" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="např. Extruzní linka A" required autoFocus />

            <div className="mb-1">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Umístění</label>
              <input
                list="line-loc-list"
                value={draft.loc}
                onChange={(e) => setDraft({ ...draft, loc: e.target.value })}
                placeholder="napiš nebo vyber stroje a doplní se samo"
                className={INPUT_CLASS}
              />
              <datalist id="line-loc-list">
                {knownLocations.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <p className="text-xs text-slate-400 mb-4">Když přidáš stroje z jednoho místa, umístění se doplní automaticky.</p>

            <FormField label="Produkt (co linka vyrábí)" value={draft.purpose} onChange={(v) => setDraft({ ...draft, purpose: v })} placeholder="např. PE trubky" />
            <p className="text-xs text-slate-400 -mt-2 mb-4">Nepovinné. Co se na lince vyrábí — ukáže se na kartě linky. Můžeš nechat prázdné.</p>

            <div className="mb-4">
              <label className="block text-sm text-slate-600 font-medium mb-1.5">Stroje na lince ({draft.machineIds.length})</label>
              {machines.length === 0 ? (
                <p className="text-[13px] text-slate-400">Zatím žádné stroje v kartotéce. Nejdřív přidej stroj v Kartotéce.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {machines.map((m) => {
                    const selected = draft.machineIds.includes(m.id);
                    const order = draft.machineIds.indexOf(m.id) + 1;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMachine(m.id)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition min-h-[48px] ${selected ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-300 hover:bg-slate-100'}`}
                      >
                        <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[12px] font-bold flex-shrink-0 ${selected ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-transparent'}`}>
                          {selected ? order : <Check size={12} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold text-slate-800 truncate">{m.name}</span>
                          <span className="block text-[12px] text-slate-400 truncate">{[m.entityType || m.category, m.location].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">Pořadí = pořadí na lince (podle toho, jak je přidáš).</p>
            </div>

            <FormFooter onCancel={() => setDraft(null)} onSubmit={saveLine} loading={saving} submitLabel={draft.id ? 'Uložit' : 'Vytvořit'} />
          </>
        )}
      </BottomSheet>
    </div>
  );
}
