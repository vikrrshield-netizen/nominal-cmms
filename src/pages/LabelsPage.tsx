// src/pages/LabelsPage.tsx
// VIKRR — Asset Shield — „QR štítky". Vytiskni QR na stroje; sken telefonem otevře kartu zařízení.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, QrCode, Printer, Search, X } from 'lucide-react';
import { useAuthContext } from '../context/AuthContext';
import { assetService } from '../services/assetService';
import { isContainerAsset } from '../lib/lines';
import type { Asset } from '../types/asset';

export default function LabelsPage() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId ?? 'main_firm';
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    assetService.getAll(tenantId)
      .then((a) => { if (alive) setAssets(a); })
      .catch((e) => console.error('[Stitky] load error:', e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tenantId]);

  // ?ids=a,b,c → tiskni JEN vybrané položky (přichází z výběru v Kartotéce / z rodného listu).
  const [searchParams, setSearchParams] = useSearchParams();
  const pickedIds = useMemo(() => {
    const raw = searchParams.get('ids') ?? '';
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }, [searchParams]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets
      .filter((a) => (pickedIds.size > 0 ? pickedIds.has(a.id) : !isContainerAsset(a)))
      .filter((a) => !q || `${a.name ?? ''} ${a.code ?? ''}`.toLowerCase().includes(q))
      .slice(0, 300);
  }, [assets, search, pickedIds]);

  // Umístění na štítek — když se štítek odlepí/najde jinde, hned je vidět, kam patří.
  const labelLocation = (a: Asset): string => [
    a.buildingId ? `Budova ${a.buildingId}` : '',
    (a.areaName ?? '').trim(),
  ].filter(Boolean).join(' › ');

  return (
    <div className="lbl-page px-4 py-6 md:px-8 max-w-6xl mx-auto pb-24">
      <style>{`@media print { body * { visibility: hidden !important; } .lbl-print, .lbl-print * { visibility: visible !important; } .lbl-print { position: absolute; left: 0; top: 0; width: 100%; } .lbl-noprint { display: none !important; } .lbl-card { break-inside: avoid; } }`}</style>

      <div className="lbl-noprint flex items-center gap-3 mb-4">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700"><ArrowLeft size={20} /></button>
        <QrCode className="text-emerald-700 flex-shrink-0" size={24} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black text-slate-900">QR štítky</h1>
          <p className="text-[13px] text-slate-500">Vytiskni a nalep na stroje. Sken telefonem otevře kartu zařízení.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white"><Printer size={16} /> Tisk</button>
      </div>

      {pickedIds.size > 0 ? (
        <div className="lbl-noprint mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <QrCode size={18} className="shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1 text-sm font-semibold text-emerald-900">
            Tisknu jen vybrané položky ({items.length})
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[13px] font-bold text-emerald-800"
          >
            <X size={14} /> Zobrazit všechny
          </button>
        </div>
      ) : (
        <label className="lbl-noprint relative block mb-4">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat stroj (zúží, co se vytiskne)…" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-slate-900 outline-none focus:border-emerald-500" />
        </label>
      )}

      {loading ? (
        <div className="lbl-noprint text-slate-500 py-10 text-center">Načítám…</div>
      ) : (
        <div className="lbl-print grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => (
            <div key={a.id} className="lbl-card flex flex-col items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-center">
              <QRCodeSVG value={`${origin}/asset/${a.id}`} size={104} level="M" />
              <div className="text-[13px] font-black leading-tight text-slate-900 line-clamp-2">{a.name ?? '—'}</div>
              {a.code && <div className="font-mono text-[11px] text-slate-500">{a.code}</div>}
              {labelLocation(a) && <div className="text-[11px] font-semibold text-slate-400">{labelLocation(a)}</div>}
            </div>
          ))}
          {items.length === 0 && <div className="lbl-noprint col-span-full py-8 text-center text-slate-500">Nic nenalezeno.</div>}
        </div>
      )}

      <p className="lbl-noprint mt-4 text-[12px] text-slate-400">Tisk vezme jen to, co je teď vidět (zúžíš hledáním). Aktuálně {items.length} štítků.</p>
    </div>
  );
}
