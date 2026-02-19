// src/components/dashboard/WasteModal.tsx
// VIKRR — Asset Shield — Waste report modal

import { useState } from 'react';
import { createTask } from '../../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../ui/BottomSheet';

interface WasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function WasteModal({ isOpen, onClose, userId, userName }: WasteModalProps) {
  const [wasteType, setWasteType] = useState('plevy');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const labels: Record<string, string> = { plevy: 'Vyvézt vůz (plevy)', popelnice: 'Plná popelnice', kontejner: 'Plný kontejner' };
      await createTask({
        title: labels[wasteType] + (note.trim() ? ` — ${note.trim()}` : ''),
        type: 'corrective',
        priority: 'P2',
        createdById: userId,
        createdByName: userName,
        source: 'web',
      });
      setNote('');
      setWasteType('plevy');
      onClose();
    } catch (err) {
      console.error('[Waste]', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="🚜 Odpad / Plevy" isOpen={isOpen} onClose={onClose}>
      <FormField label="Typ" value={wasteType} onChange={setWasteType} type="select"
        options={[
          { value: 'plevy', label: '🌾 Vyvézt vůz (plevy)' },
          { value: 'popelnice', label: '🗑️ Plná popelnice' },
          { value: 'kontejner', label: '📦 Plný kontejner' },
        ]}
      />
      <FormField label="Poznámka (volitelné)" value={note} onChange={setNote} placeholder="Lokace, poznámka..." />
      <SubmitButton label="Nahlásit" onClick={handleSubmit} loading={saving} color="orange" />
    </BottomSheet>
  );
}
