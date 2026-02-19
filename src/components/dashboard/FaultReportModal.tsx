// src/components/dashboard/FaultReportModal.tsx
// Nominal CMMS — Fault report modal (autocomplete asset, photo upload, P1-P4)

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { createTask } from '../../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../ui/BottomSheet';
import MicButton from '../ui/MicButton';
import { Camera, X } from 'lucide-react';
import { cmmsConfig } from '../../cmmsConfig';

// ── Assets hook ──
interface SimpleAsset { id: string; name: string; code?: string; buildingId?: string; category?: string; }

function useAssets() {
  const [assets, setAssets] = useState<SimpleAsset[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'assets'), (snap) => {
      setAssets(snap.docs.map((d) => ({ id: d.id, name: d.data().name, code: d.data().code, buildingId: d.data().buildingId, category: d.data().category })));
    });
    return () => unsub();
  }, []);
  return assets;
}

// ── Props ──
interface FaultReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function FaultReportModal({ isOpen, onClose, userId, userName }: FaultReportModalProps) {
  const [assetQuery, setAssetQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<SimpleAsset | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const allAssets = useAssets();

  // Autocomplete: filter after 3 chars
  const suggestions = useMemo(() => {
    if (assetQuery.length < 3 || selectedAsset) return [];
    const q = assetQuery.toLowerCase();
    return allAssets
      .filter((a) => a.name.toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [allAssets, assetQuery, selectedAsset]);

  // Show suggestions when results exist
  useEffect(() => { setShowSuggestions(suggestions.length > 0); }, [suggestions]);

  const handleSelectAsset = (asset: SimpleAsset) => {
    setSelectedAsset(asset);
    setAssetQuery(`${asset.name}${asset.code ? ' (' + asset.code + ')' : ''}`);
    setShowSuggestions(false);
  };

  const handleClearAsset = () => {
    setSelectedAsset(null);
    setAssetQuery('');
  };

  // Photo handling
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // Submit
  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const taskId = await createTask({
        title: title.trim(),
        description: `${category ? `[${category.toUpperCase()}] ` : ''}${description.trim()}`.trim() || undefined,
        type: 'corrective',
        priority: priority as any,
        assetId: selectedAsset?.id,
        assetName: selectedAsset?.name,
        buildingId: selectedAsset?.buildingId,
        createdById: userId,
        createdByName: userName,
        source: 'web',
      });

      // Upload photo if present
      if (photoFile && taskId) {
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const storageRef = ref(storage, `fault_photos/${taskId}.${ext}`);
        await uploadBytes(storageRef, photoFile);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'tasks', taskId), { photoUrl: url });
      }

      // Reset
      setTitle(''); setDescription(''); setPriority('P2');
      setCategory(''); handleClearAsset(); clearPhoto();
      onClose();
    } catch (err) {
      console.error('[FaultReport]', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="🚨 Nahlásit poruchu" isOpen={isOpen} onClose={onClose}>
      {/* 1. Asset autocomplete */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Zařízení</label>
        <div className="relative">
          <input
            type="text"
            value={assetQuery}
            onChange={(e) => { setAssetQuery(e.target.value); if (selectedAsset) setSelectedAsset(null); }}
            placeholder="Min. 3 znaky pro hledání..."
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:border-orange-500/50 transition"
          />
          {selectedAsset && (
            <button onClick={handleClearAsset} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
          {showSuggestions && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
              {suggestions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleSelectAsset(a)}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition flex items-center gap-2"
                >
                  <span className="text-slate-500 text-xs">{a.code || '—'}</span>
                  <span className="truncate">{a.name}</span>
                  {a.buildingId && <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0">Bud. {a.buildingId}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Category */}
      <FormField
        label="Kategorie"
        value={category}
        onChange={setCategory}
        type="select"
        options={cmmsConfig.faultCategories.map((c) => ({ value: c.id, label: c.label }))}
      />

      {/* 3. Title */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Název poruchy" value={title} onChange={setTitle} placeholder="Stručný nadpis závady" required />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setTitle((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>

      {/* 4. Description */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Popis závady" value={description} onChange={setDescription} type="textarea" placeholder="Co se děje, kdy to začalo, zvuky, vibrace..." />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>

      {/* 5. Photo / Attachment */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Příloha / Foto</label>
        {photoPreview ? (
          <div className="relative inline-block">
            <img src={photoPreview} alt="Náhled" className="h-24 rounded-xl border border-white/10 object-cover" />
            <button onClick={clearPhoto} className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-slate-800 border border-white/20 rounded-full flex items-center justify-center hover:bg-red-600 transition">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 border-2 border-dashed border-white/15 rounded-xl text-slate-400 text-sm font-medium hover:border-orange-500/30 hover:text-orange-400 transition flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" />
            Vybrat soubor / Vyfotit
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      </div>

      {/* 6. Severity / Priority */}
      <FormField label="Závažnost" value={priority} onChange={setPriority} type="select"
        options={cmmsConfig.priorities.map((p) => ({ value: p.id, label: p.label }))}
      />

      <SubmitButton label="Nahlásit poruchu" onClick={handleSubmit} loading={saving} color="orange" />
    </BottomSheet>
  );
}
