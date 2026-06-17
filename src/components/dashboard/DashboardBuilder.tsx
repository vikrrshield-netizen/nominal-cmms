// src/components/dashboard/DashboardBuilder.tsx
// Uživatelská „stavebnice" dashboardu — panely se dají přetáhnout (myš), nastavit
// šířku (1/2/3 sloupce), skrýt/přidat. Uloženo na zařízení (localStorage).
// React-19-bezpečné: žádná externí DnD knihovna (HTML5 drag + CSS grid).

import { useState, useRef, type ReactNode } from 'react';
import { GripVertical, X, Plus, Pencil, Check, RotateCcw } from 'lucide-react';

export interface BuilderPanel {
  id: string;
  title: string;
  node: ReactNode;
  defaultSpan?: 1 | 2 | 3;     // výchozí šířka ve sloupcích (PC)
  defaultHidden?: boolean;
}

interface SavedLayout {
  order: string[];
  spans: Record<string, number>;
  hidden: string[];
}

function loadLayout(key: string): SavedLayout | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.order)) return v as SavedLayout;
  } catch { /* ignore */ }
  return null;
}

export default function DashboardBuilder({ panels, storageKey }: { panels: BuilderPanel[]; storageKey: string }) {
  const [editing, setEditing] = useState(false);
  const dragId = useRef<string | null>(null);

  const [layout, setLayout] = useState<SavedLayout>(() => {
    const saved = loadLayout(storageKey);
    const base: SavedLayout = {
      order: panels.map((p) => p.id),
      spans: Object.fromEntries(panels.map((p) => [p.id, p.defaultSpan ?? 1])),
      hidden: panels.filter((p) => p.defaultHidden).map((p) => p.id),
    };
    if (!saved) return base;
    // doplň nově přidané panely (v kódu) do uloženého rozložení
    const known = new Set(saved.order);
    const order = [...saved.order.filter((id) => panels.some((p) => p.id === id)), ...panels.filter((p) => !known.has(p.id)).map((p) => p.id)];
    return {
      order,
      spans: { ...base.spans, ...saved.spans },
      hidden: saved.hidden.filter((id) => panels.some((p) => p.id === id)),
    };
  });

  const save = (next: SavedLayout) => {
    setLayout(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const byId = (id: string) => panels.find((p) => p.id === id);
  const visibleIds = layout.order.filter((id) => byId(id) && !layout.hidden.includes(id));
  const hiddenPanels = layout.order.filter((id) => byId(id) && layout.hidden.includes(id));

  const reorder = (targetId: string) => {
    const from = dragId.current; dragId.current = null;
    if (!from || from === targetId) return;
    const next = layout.order.filter((id) => id !== from);
    const idx = next.indexOf(targetId);
    next.splice(idx < 0 ? next.length : idx, 0, from);
    save({ ...layout, order: next });
  };
  const setSpan = (id: string, span: number) => save({ ...layout, spans: { ...layout.spans, [id]: span } });
  const setHidden = (id: string, hidden: boolean) => save({ ...layout, hidden: hidden ? [...layout.hidden, id] : layout.hidden.filter((x) => x !== id) });
  const reset = () => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setLayout({
      order: panels.map((p) => p.id),
      spans: Object.fromEntries(panels.map((p) => [p.id, p.defaultSpan ?? 1])),
      hidden: panels.filter((p) => p.defaultHidden).map((p) => p.id),
    });
  };

  return (
    <div>
      {/* lišta režimu úprav */}
      <div className="mb-3 flex items-center justify-end gap-2">
        {editing && (
          <button type="button" onClick={() => { if (window.confirm('Obnovit výchozí rozložení dashboardu?')) reset(); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-stone-50 transition">
            <RotateCcw className="h-3.5 w-3.5" /> Obnovit
          </button>
        )}
        <button type="button" onClick={() => setEditing((v) => !v)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${editing ? 'bg-emerald-600 text-white' : 'border border-stone-200 bg-white text-slate-600 hover:bg-stone-50'}`}>
          {editing ? <><Check className="h-3.5 w-3.5" /> Hotovo</> : <><Pencil className="h-3.5 w-3.5" /> Upravit rozložení</>}
        </button>
      </div>

      {/* mřížka panelů */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {visibleIds.map((id) => {
          const p = byId(id)!;
          const span = Math.min(3, Math.max(1, layout.spans[id] ?? 1));
          return (
            <div
              key={id}
              draggable={editing}
              onDragStart={() => { if (editing) dragId.current = id; }}
              onDragOver={(e) => { if (editing) e.preventDefault(); }}
              onDrop={() => editing && reorder(id)}
              style={{ gridColumn: `span ${span}` }}
              className={`min-w-0 ${editing ? 'rounded-2xl ring-2 ring-emerald-200 ring-offset-2 ring-offset-[#f1ece3]' : ''}`}
            >
              {editing && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5">
                  <span className="cursor-grab active:cursor-grabbing text-emerald-700"><GripVertical className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-700">{p.title}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button" onClick={() => setSpan(id, n)}
                        className={`h-6 w-6 rounded-md text-[11px] font-bold transition ${span === n ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-stone-100'}`}
                        title={`Šířka ${n} ${n === 1 ? 'sloupec' : 'sloupce'}`}>{n}</button>
                    ))}
                  </span>
                  <button type="button" onClick={() => setHidden(id, true)}
                    className="h-6 w-6 rounded-md bg-white text-red-600 hover:bg-red-50 flex items-center justify-center transition" title="Skrýt panel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className={editing ? 'pointer-events-none select-none opacity-95' : ''}>{p.node}</div>
            </div>
          );
        })}
      </div>

      {/* zásobník skrytých panelů */}
      {editing && hiddenPanels.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Skryté panely — klepni pro přidání</div>
          <div className="flex flex-wrap gap-2">
            {hiddenPanels.map((id) => (
              <button key={id} type="button" onClick={() => setHidden(id, false)}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition">
                <Plus className="h-3.5 w-3.5 text-emerald-700" /> {byId(id)!.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
