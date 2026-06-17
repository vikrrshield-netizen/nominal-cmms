import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ClipboardList, Forklift, Search, Wrench } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import type { Asset } from '../types/asset';

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isVzv(asset: Asset) {
  const text = normalize(`${asset.name} ${asset.code} ${asset.entityType} ${asset.category} ${asset.location} ${asset.areaName}`);
  return text.includes('vzv') || text.includes('forklift') || text.includes('vysokozdv') || asset.category === 'forklift';
}

function placeLabel(asset: Asset) {
  return [asset.buildingId ? `Budova ${asset.buildingId}` : '', asset.floor, asset.areaName || asset.location]
    .filter(Boolean)
    .join(' | ') || 'Umístění není vyplněné';
}

export default function VzvPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'assets'),
      (snapshot) => setAssets(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Asset))),
      () => setAssets([]),
    );
    return () => unsubscribe();
  }, []);

  const vzvAssets = useMemo(() => {
    const query = normalize(search);
    return assets
      .filter((asset) => !asset.isDeleted)
      .filter((asset) => asset.tenantId === user?.tenantId || !asset.tenantId || !user?.tenantId)
      .filter(isVzv)
      .filter((asset) => {
        if (!query) return true;
        return normalize(`${asset.name} ${asset.code} ${placeLabel(asset)} ${asset.status}`).includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  }, [assets, search, user?.tenantId]);

  const active = vzvAssets.filter((asset) => asset.status === 'operational').length;
  const broken = vzvAssets.length - active;

  return (
    <div className="min-h-screen bg-[#f1ece3] text-slate-900 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-700">
            <Forklift className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black">VZV</h1>
            <p className="text-sm text-slate-400">Vysokozdvižné vozíky z kartotéky</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-black">{vzvAssets.length}</div>
            <div className="text-xs font-bold uppercase text-slate-500">Celkem</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="text-2xl font-black text-emerald-700">{active}</div>
            <div className="text-xs font-bold uppercase text-emerald-100/70">V provozu</div>
          </div>
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
            <div className="text-2xl font-black text-red-700">{broken}</div>
            <div className="text-xs font-bold uppercase text-red-100/70">Mimo provoz</div>
          </div>
        </section>

        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hledat VZV, kód nebo stanoviště..."
            className="min-h-14 w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base text-slate-900 outline-none focus:border-cyan-400"
          />
        </label>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {vzvAssets.map((asset) => (
            <article key={asset.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-700">
                  <Forklift className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black">{asset.name}</h2>
                  <p className="text-sm text-slate-400">{asset.code || 'Bez kódu'}</p>
                  <p className="mt-1 text-sm text-slate-600">{placeLabel(asset)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/asset/${asset.id}`, { state: { from: '/vzv', backStack: ['/vzv'] } })}
                  className="min-h-12 rounded-xl bg-cyan-600 px-3 font-bold text-white"
                >
                  Otevřít kartu
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/tasks?asset=${asset.id}`)}
                  className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-900"
                >
                  <span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Úkoly</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/work-diary?asset=${asset.id}`)}
                  className="col-span-2 min-h-12 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-900"
                >
                  <span className="inline-flex items-center gap-2"><Wrench className="h-4 w-4" /> Zapsat práci na VZV</span>
                </button>
              </div>
            </article>
          ))}
        </section>

        {vzvAssets.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">
            V kartotéce zatím není žádné VZV. Přidej ho v kartotéce jako typ/kategorii VZV nebo forklift.
          </div>
        )}
      </main>
    </div>
  );
}
