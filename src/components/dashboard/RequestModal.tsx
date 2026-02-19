// src/components/dashboard/RequestModal.tsx
// VIKRR — Asset Shield — Tool/material request modal

import { useState } from 'react';
import { createTask } from '../../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../ui/BottomSheet';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function RequestModal({ isOpen, onClose, userId, userName }: RequestModalProps) {
  const [requestType, setRequestType] = useState('tool');
  const [text, setText] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const labels: Record<string, string> = { tool: 'Chybí nářadí', clothing: 'Chybí pracovní oděv', material: 'Chybí materiál' };
      await createTask({
        title: `${labels[requestType]}: ${text.trim()}`,
        description: detail.trim() || undefined,
        type: 'preventive',
        priority: 'P3',
        createdById: userId,
        createdByName: userName,
        source: 'web',
      });
      setText('');
      setDetail('');
      setRequestType('tool');
      onClose();
    } catch (err) {
      console.error('[Request]', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="📦 Objednat díl / Požadavek" isOpen={isOpen} onClose={onClose}>
      <FormField label="Typ požadavku" value={requestType} onChange={setRequestType} type="select"
        options={[
          { value: 'tool', label: '🔧 Chybí nářadí' },
          { value: 'clothing', label: '👕 Chybí pracovní oděv' },
          { value: 'material', label: '📦 Chybí materiál' },
        ]}
      />
      <FormField label="Co potřebujete" value={text} onChange={setText} placeholder="Stručný popis" required />
      <FormField label="Upřesnění objednávky" value={detail} onChange={setDetail} type="textarea" placeholder="Přesné rozměry, typ, katalogové číslo... Např. Ložisko 6204-2RS" />
      <SubmitButton label="Odeslat požadavek" onClick={handleSubmit} loading={saving} color="orange" />
    </BottomSheet>
  );
}
