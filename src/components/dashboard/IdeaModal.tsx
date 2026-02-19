// src/components/dashboard/IdeaModal.tsx
// VIKRR — Asset Shield — Idea/improvement submission modal

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { createTask } from '../../services/taskService';
import BottomSheet, { FormField, SubmitButton } from '../ui/BottomSheet';

interface IdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function IdeaModal({ isOpen, onClose, userId, userName }: IdeaModalProps) {
  const [text, setText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [ideaName, setIdeaName] = useState('');
  const [ideaPin, setIdeaPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const identifiedName = !isAnonymous ? (ideaName.trim() || userName) : 'Anonymní';
      await createTask({
        title: text.trim(),
        type: 'improvement',
        priority: 'P3',
        createdById: isAnonymous ? 'anonymous' : userId,
        createdByName: identifiedName,
        source: 'web',
      });
      // Track engagement for identified submissions
      if (!isAnonymous) {
        try {
          await addDoc(collection(db, 'user_engagement'), {
            userId: userId || ideaPin.trim() || 'unknown',
            userName: identifiedName,
            type: 'idea',
            ideaText: text.trim(),
            createdAt: serverTimestamp(),
          });
        } catch { /* engagement tracking is best-effort */ }
      }
      setText('');
      setIsAnonymous(true);
      setIdeaName('');
      setIdeaPin('');
      onClose();
    } catch (err) {
      console.error('[Idea]', err);
    }
    setSaving(false);
  };

  return (
    <BottomSheet title="💡 Nápad na zlepšení" isOpen={isOpen} onClose={onClose}>
      {/* Mode selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setIsAnonymous(true)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${isAnonymous ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 border border-white/10'}`}
        >
          🔒 Anonymně
        </button>
        <button
          onClick={() => setIsAnonymous(false)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${!isAnonymous ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 border border-white/10'}`}
        >
          👤 Se jménem
        </button>
      </div>
      {/* Identified fields */}
      {!isAnonymous && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <FormField label="Jméno" value={ideaName} onChange={setIdeaName} placeholder="Vaše jméno" />
          <FormField label="PIN (volitelný)" value={ideaPin} onChange={setIdeaPin} placeholder="1234" />
        </div>
      )}
      <FormField label="Váš nápad" value={text} onChange={setText} type="textarea" placeholder="Co byste chtěli zlepšit? Popište svůj nápad..." required />
      <SubmitButton label="Odeslat nápad" onClick={handleSubmit} loading={saving} color="orange" />
    </BottomSheet>
  );
}
