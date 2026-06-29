// src/components/dashboard/DashboardBuilder.tsx
// Uživatelská „stavebnice" dashboardu. Panely se přetahují (@dnd-kit — auto-scroll
// při tažení k okraji + dotyk), nastaví se šířka (1/2/3 sloupce), skryjí/přidají.
// Každý panel je `@container` → jeho obsah se přizpůsobí ŠÍŘCE PANELU (ne okna).
// Uloženo na zařízení (localStorage). React-19-safe (žádný findDOMNode).

import { useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Plus, Pencil, Check, RotateCcw } from 'lucide-react';
import { useConfirm } from '../../hooks/useConfirm';

export interface BuilderPanel {
  id: string;
  title: string;
  node: ReactNode;
  defaultSpan?: 1 | 2 | 3;
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

function SortablePanel({
  id, title, span, editing, onSpan, onHide, children,
}: {
  id: string; title: string; span: number; editing: boolean;
  onSpan: (n: number) => void; onHide: () => void; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  // Drag řeší DragOverlay (plovoucí klon). Původní místo zůstává v toku jako ztlumený
  // placeholder se stejným rozměrem → nic se nepřekrývá.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    gridColumn: `span ${span}`,
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={`@container min-w-0 ${editing ? 'rounded-2xl ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#f1ece3]' : ''}`}>
      {editing && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5">
          <button
            type="button"
            className="cursor-grab touch-none text-emerald-700 active:cursor-grabbing"
            aria-label={`Přesunout ${title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-700">{title}</span>
          <span className="flex items-center gap-0.5">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => onSpan(n)}
                className={`h-6 w-6 rounded-md text-[11px] font-bold transition ${span === n ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-stone-100'}`}
                title={`Šířka ${n} ${n === 1 ? 'sloupec' : 'sloupce'}`}>{n}</button>
            ))}
          </span>
          <button type="button" onClick={onHide}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-red-600 transition hover:bg-red-50" title="Skrýt panel">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className={editing ? 'pointer-events-none select-none' : ''}>{children}</div>
    </div>
  );
}

export default function DashboardBuilder({ panels, storageKey }: { panels: BuilderPanel[]; storageKey: string }) {
  const { ask } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [layout, setLayout] = useState<SavedLayout>(() => {
    const base: SavedLayout = {
      order: panels.map((p) => p.id),
      spans: Object.fromEntries(panels.map((p) => [p.id, p.defaultSpan ?? 1])),
      hidden: panels.filter((p) => p.defaultHidden).map((p) => p.id),
    };
    const saved = loadLayout(storageKey);
    if (!saved) return base;
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = (id: string) => panels.find((p) => p.id === id);
  const visibleIds = layout.order.filter((id) => byId(id) && !layout.hidden.includes(id));
  const hiddenPanels = layout.order.filter((id) => byId(id) && layout.hidden.includes(id));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(String(active.id));
    const to = layout.order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    save({ ...layout, order: arrayMove(layout.order, from, to) });
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
      <div className="mb-3 flex items-center justify-end gap-2">
        {editing && (
          <button type="button" onClick={async () => { if (await ask({ message: 'Obnovit výchozí rozložení dashboardu?', danger: true })) reset(); }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-stone-50">
            <RotateCcw className="h-3.5 w-3.5" /> Obnovit
          </button>
        )}
        <button type="button" onClick={() => setEditing((v) => !v)}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${editing ? 'bg-emerald-600 text-white' : 'border border-stone-200 bg-white text-slate-600 hover:bg-stone-50'}`}>
          {editing ? <><Check className="h-3.5 w-3.5" /> Hotovo</> : <><Pencil className="h-3.5 w-3.5" /> Upravit rozložení</>}
        </button>
      </div>

      {editing && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs font-semibold text-emerald-800">
          Chyť panel za <GripVertical className="inline h-3.5 w-3.5" /> a přetáhni. Tlačítky <b>1/2/3</b> měníš šířku, <b>✕</b> skryje. U okraje se stránka sama posune.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)} autoScroll>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          {/* normální tok dokumentu: auto-rows-min + items-start → řádky podle obsahu, nic se nepřekrývá */}
          <div className="grid grid-cols-1 items-start gap-4 auto-rows-min lg:grid-cols-3">
            {visibleIds.map((id) => {
              const p = byId(id)!;
              const span = Math.min(3, Math.max(1, layout.spans[id] ?? 1));
              return (
                <SortablePanel key={id} id={id} title={p.title} span={span} editing={editing}
                  onSpan={(n) => setSpan(id, n)} onHide={() => setHidden(id, true)}>
                  {p.node}
                </SortablePanel>
              );
            })}
          </div>
        </SortableContext>
        {/* Plovoucí klon taženého panelu — původní místo drží rozměr (placeholder), nic se nepřekrývá */}
        <DragOverlay dropAnimation={null}>
          {activeId ? (
            <div className="@container rounded-2xl shadow-2xl ring-2 ring-emerald-400">
              {byId(activeId)?.node}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing && hiddenPanels.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Skryté panely — klepni pro přidání</div>
          <div className="flex flex-wrap gap-2">
            {hiddenPanels.map((id) => (
              <button key={id} type="button" onClick={() => setHidden(id, false)}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50">
                <Plus className="h-3.5 w-3.5 text-emerald-700" /> {byId(id)!.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
