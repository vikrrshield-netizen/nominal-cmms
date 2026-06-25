// src/pages/MapaArealuPage.tsx
// VIKRR — Asset Shield — „Mapa areálu". Chráněný prohlížeč půdorysu (1.NP / 2.NP).
// Plánek je ve Firebase Storage (facility_plans/{floor}.jpg) — čtení jen po přihlášení (storage.rules).
// v1 = nahrát + zobrazit plán. Další krok: klikací zóny podle stavu strojů.

import { useEffect, useState } from 'react';
import { Map as MapIcon, Loader2, Upload, ImageOff } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { showToast } from '../components/ui/Toast';
import StrojeLinkyTabs from '../components/StrojeLinkyTabs';

type Floor = '1np' | '2np';
const FLOORS: { key: Floor; label: string }[] = [
  { key: '1np', label: '1. NP' },
  { key: '2np', label: '2. NP' },
];

export default function MapaArealuPage() {
  const { hasPermission } = useAuthContext();
  const canEdit = hasPermission('asset.update');
  const [floor, setFloor] = useState<Floor>('1np');
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadPlan = (f: Floor) => {
    setLoading(true);
    setUrl(null);
    getDownloadURL(ref(storage, `facility_plans/${f}.jpg`))
      .then((u) => setUrl(u))
      .catch(() => setUrl(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPlan(floor); }, [floor]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Nahraj prosím obrázek (JPG / PNG).', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Obrázek je moc velký (max 10 MB).', 'error');
      return;
    }
    setUploading(true);
    try {
      await uploadBytes(ref(storage, `facility_plans/${floor}.jpg`), file, { contentType: file.type || 'image/jpeg' });
      loadPlan(floor);
      showToast('Plánek nahrán', 'success');
    } catch (err) {
      console.error('[Mapa] upload error:', err);
      showToast('Nahrání selhalo (oprávnění?)', 'error');
    } finally {
      setUploading(false);
    }
  };

  const floorLabel = floor === '1np' ? '1. NP' : '2. NP';

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto">
      <StrojeLinkyTabs active="mapa" />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <MapIcon className="text-emerald-700" size={26} />
        <div className="mr-auto">
          <h1 className="text-xl font-black text-slate-900">Mapa areálu</h1>
          <p className="text-[13px] text-slate-500">Půdorys patra. Plánek je chráněný — vidíš ho jen po přihlášení.</p>
        </div>
        <div className="flex gap-2">
          {FLOORS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFloor(f.key)}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition ${floor === f.key ? 'bg-emerald-600 text-white' : 'bg-white border border-[#e2d8c9] text-slate-600 hover:bg-slate-50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#e2d8c9] bg-white p-3">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 py-16 justify-center"><Loader2 className="animate-spin" size={18} /> Načítám plánek…</div>
        ) : url ? (
          <img src={url} alt={`Půdorys ${floorLabel}`} className="w-full h-auto rounded-xl" />
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ImageOff size={28} className="text-slate-300" />
            <div className="text-slate-700 font-semibold">Plánek {floorLabel} ještě není nahraný</div>
            {canEdit ? (
              <label className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 transition flex items-center gap-2">
                <Upload size={16} /> {uploading ? 'Nahrávám…' : 'Nahrát plánek'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
              </label>
            ) : (
              <div className="text-[13px] text-slate-400">Nahraje ho správce.</div>
            )}
          </div>
        )}
      </div>

      {url && canEdit && (
        <div className="mt-3 flex justify-end">
          <label className="cursor-pointer text-[13px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-2">
            <Upload size={14} /> {uploading ? 'Nahrávám…' : 'Nahradit plánek'}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      )}

      <p className="mt-4 text-[12px] text-slate-400">Další krok: na plánek přidáme klikací body podle stavu strojů (zóna → stroje té místnosti). Nejdřív nahraj plánek.</p>
    </div>
  );
}
