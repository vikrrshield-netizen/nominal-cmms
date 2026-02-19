// src/components/dashboard/FaultReportModal.tsx
// VIKRR — Asset Shield — Quick fault report modal (s kategoriemi a výběrem zařízení)

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { createTask } from '../../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../ui/BottomSheet';
import MicButton from '../ui/MicButton';

// ── Asset category grouping ──
const FAULT_CATEGORIES = [
  { value: 'stroje', label: '⚙️ Stroje', cats: ['extruder', 'mixer', 'packer', 'compressor', 'boiler', 'conveyor'] },
  { value: 'budovy', label: '🏢 Budovy', cats: ['hvac', 'electrical'] },
  { value: 'vozidla', label: '🚛 Vozidla', cats: ['forklift'] },
];

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

interface FaultReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function FaultReportModal({ isOpen, onClose, userId, userName }: FaultReportModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [category, setCategory] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [saving, setSaving] = useState(false);

  const allAssets = useAssets();

  // Filter assets by selected category
  const filteredAssets = useMemo(() => {
    if (!category) return [];
    const group = FAULT_CATEGORIES.find((c) => c.value === category);
    if (!group) return allAssets;
    return allAssets.filter((a) => group.cats.includes(a.category || ''));
  }, [allAssets, category]);

  // Reset asset when category changes
  useEffect(() => { setSelectedAssetId(''); }, [category]);

  const selectedAsset = allAssets.find((a) => a.id === selectedAssetId);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const severityMap: Record<string, string> = { low: 'P3', medium: 'P2', high: 'P1' };
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'corrective',
        priority: severityMap[severity] as any,
        assetId: selectedAsset?.id,
        assetName: selectedAsset?.name,
        buildingId: selectedAsset?.buildingId,
        createdById: userId,
        createdByName: userName,
        source: 'web',
      });
      setTitle(''); setDescription(''); setSeverity('medium');
      setCategory(''); setSelectedAssetId('');
      onClose();
    } catch (err) {
      console.error('[FaultReport]', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="🚨 Nahlásit poruchu" isOpen={isOpen} onClose={onClose}>
      <FormField
        label="Kategorie"
        value={category}
        onChange={setCategory}
        type="select"
        options={FAULT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
      />
      {category && filteredAssets.length > 0 && (
        <FormField
          label="Zařízení"
          value={selectedAssetId}
          onChange={setSelectedAssetId}
          type="select"
          options={filteredAssets.map((a) => ({ value: a.id, label: `${a.name}${a.code ? ' (' + a.code + ')' : ''}` }))}
        />
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Název poruchy" value={title} onChange={setTitle} placeholder="Např. Nefunguje extruder č. 3" required />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setTitle((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormField label="Popis závady" value={description} onChange={setDescription} type="textarea" placeholder="Detailní popis problému — co se děje, kdy to začalo, zvuky, vibrace..." />
        </div>
        <div className="mb-4">
          <MicButton onTranscript={(t) => setDescription((prev) => prev ? prev + ' ' + t : t)} />
        </div>
      </div>
      <FormField label="Závažnost" value={severity} onChange={(v) => setSeverity(v as any)} type="select"
        options={[
          { value: 'high', label: '🔴 Vysoká — Havárie (P1)' },
          { value: 'medium', label: '🟡 Střední — Urgentní (P2)' },
          { value: 'low', label: '🟢 Nízká — Běžná (P3)' },
        ]}
      />
      <SubmitButton label="Nahlásit poruchu" onClick={handleSubmit} loading={saving} color="orange" />
    </BottomSheet>
  );
}
