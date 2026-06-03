import { useMemo, useState } from 'react';
import { Clock, FileText, Users } from 'lucide-react';
import BottomSheet, { FormField, FormFooter } from './BottomSheet';
import MicButton from './MicButton';

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

const WORK_TYPE_OPTIONS = [
  { value: 'udrzba', label: 'Údržba' },
  { value: 'projekt_milan', label: 'Projekt/Milan' },
  { value: 'revize', label: 'Revize' },
  { value: 'sanitace', label: 'Sanitace' },
];

const RESULT_OPTIONS = [
  { value: 'fixed', label: 'Opraveno' },
  { value: 'monitor', label: 'Sledovat' },
  { value: 'not_fixable', label: 'Nelze opravit' },
  { value: 'handover', label: 'Předat dál' },
];

interface CompleteTaskModalProps {
  taskTitle: string;
  defaultWorkers?: string[];
  workerOptions?: string[];
  onConfirm: (data: {
    resolution: string;
    durationMinutes: number | null;
    completedByName: string;
    completedByNames: string[];
    workType: string;
    performedDate: string;
    result: string;
    auditNote: string;
    cleaningStatus: 'done' | 'not_applicable';
    cleaningDone: boolean;
    cleaningChecked: boolean;
    cleaningNotApplicable: boolean;
    cleaningNote: string;
  }) => Promise<void>;
  onClose: () => void;
}

function normalizePersonKey(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('cs-CZ');
}

function personNameScore(name: string): number {
  const nonAscii = [...name].filter((char) => char.charCodeAt(0) > 127).length;
  const hasReplacement = name.includes('?') || name.includes('\uFFFD');
  return nonAscii * 10 + name.length - (hasReplacement ? 1000 : 0);
}

function uniqueNames(names: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const rawName of names) {
    const cleanName = rawName.trim().replace(/\s+/g, ' ');
    if (!cleanName) continue;
    const key = normalizePersonKey(cleanName);
    const existing = byKey.get(key);
    if (!existing || personNameScore(cleanName) > personNameScore(existing)) {
      byKey.set(key, cleanName);
    }
  }
  return [...byKey.values()];
}

export default function CompleteTaskModal({ taskTitle, defaultWorkers = [], workerOptions = [], onConfirm, onClose }: CompleteTaskModalProps) {
  const [resolution, setResolution] = useState('');
  const [duration, setDuration] = useState(0);
  const [workers, setWorkers] = useState<string[]>(uniqueNames(defaultWorkers));
  const [workType, setWorkType] = useState('');
  const [performedDate, setPerformedDate] = useState(todayDateInput());
  const [result, setResult] = useState('fixed');
  const [auditNote, setAuditNote] = useState('');
  const [cleaningStatus, setCleaningStatus] = useState<'done' | 'not_applicable' | ''>('');
  const [cleaningNote, setCleaningNote] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const workerChoices = useMemo(() => uniqueNames([...workerOptions, ...workers]), [workerOptions, workers]);
  const cleaningSelected = cleaningStatus === 'done' || cleaningStatus === 'not_applicable';
  const isValid = resolution.trim().length >= 5 && pin.length === 4 && workers.length > 0 && workType !== '' && cleaningSelected;

  const toggleWorker = (name: string) => {
    const key = normalizePersonKey(name);
    setWorkers((current) => current.some((item) => normalizePersonKey(item) === key)
      ? current.filter((item) => normalizePersonKey(item) !== key)
      : uniqueNames([...current, name])
    );
  };

  const handleSubmit = async () => {
    if (resolution.trim().length < 5) {
      setError('Popis řešení musí mít alespoň 5 znaků');
      return;
    }
    if (workers.length === 0) {
      setError('Vyber kdo úkol provedl');
      return;
    }
    if (!workType) {
      setError('Vyber typ práce');
      return;
    }
    if (!cleaningSelected) {
      setError('Vyber stav úklidu po zásahu');
      return;
    }
    if (pin.length !== 4) {
      setError('Zadej 4místný PIN pro potvrzení');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onConfirm({
        resolution: resolution.trim(),
        durationMinutes: duration > 0 ? duration : null,
        completedByName: workers.join(', '),
        completedByNames: workers,
        workType,
        performedDate,
        result,
        auditNote: auditNote.trim(),
        cleaningStatus,
        cleaningDone: cleaningStatus === 'done',
        cleaningChecked: true,
        cleaningNotApplicable: cleaningStatus === 'not_applicable',
        cleaningNote: cleaningNote.trim(),
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Nepodařilo se dokončit úkol');
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Dokončit úkol" isOpen onClose={onClose}>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 p-3">
        <div className="text-sm text-slate-500">Úkol:</div>
        <div className="font-medium text-slate-950">{taskTitle}</div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-600">
          <FileText className="mr-1 inline h-4 w-4" />
          Popis řešení <span className="text-red-600">*</span>
        </label>
        <div className="flex items-start gap-2">
          <textarea
            value={resolution}
            onChange={(e) => {
              setResolution(e.target.value);
              if (e.target.value.trim().length >= 5) setError('');
            }}
            placeholder="Co jste udělali? Jaký díl jste vyměnili? Co bylo příčinou?"
            rows={3}
            autoFocus
            className={`min-h-[96px] flex-1 resize-none rounded-xl border bg-white px-4 py-3 text-[15px] text-slate-950 placeholder-slate-400 outline-none transition ${
              error && !isValid ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-emerald-600'
            }`}
          />
          <div className="pt-2">
            <MicButton onTranscript={(t) => setResolution((prev) => prev ? prev + ' ' + t : t)} />
          </div>
        </div>
        <div className="mt-1 flex justify-between">
          {error && !isValid ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : (
            <span className="text-xs text-slate-500">Min. 5 znaků</span>
          )}
          <span className={`text-xs ${resolution.trim().length >= 5 ? 'text-emerald-600' : 'text-slate-500'}`}>
            {resolution.trim().length}/5
          </span>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-slate-600">
          <Users className="mr-1 inline h-4 w-4" />
          Provedli <span className="text-red-600">*</span>
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {workerChoices.map((name) => {
            const active = workers.some((item) => normalizePersonKey(item) === normalizePersonKey(name));
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleWorker(name)}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-300 bg-white text-slate-700 active:bg-slate-50'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                    active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 text-transparent'
                  }`}>
                    ✓
                  </span>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        {workers.length > 0 && (
          <div className="mt-2 text-xs text-slate-600">
            Vybráno: <span className="font-semibold text-slate-950">{workers.join(', ')}</span>
          </div>
        )}
      </div>

      <FormField label="Datum provedení" value={performedDate} onChange={setPerformedDate} type="date" required />
      <FormField label="Typ práce" value={workType} onChange={setWorkType} type="select" required options={WORK_TYPE_OPTIONS} />
      <FormField label="Výsledek" value={result} onChange={setResult} type="select" required options={RESULT_OPTIONS} />

      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-2 text-sm font-bold text-slate-950">Úklid / kontrola po zásahu <span className="text-red-600">*</span></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: 'done', title: 'Provedeno', text: 'Pracoviště uklizeno a zkontrolováno.' },
            { id: 'not_applicable', title: 'Netýká se', text: 'Zásah nevytvořil hygienické riziko.' },
          ].map((option) => {
            const active = cleaningStatus === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setCleaningStatus(option.id as 'done' | 'not_applicable')}
                className={`min-h-16 rounded-xl border p-3 text-left transition ${
                  active ? 'border-emerald-600 bg-white text-slate-950' : 'border-emerald-200 bg-emerald-50 text-slate-700'
                }`}
              >
                <span className="block text-sm font-black">{option.title}</span>
                <span className="mt-1 block text-xs font-semibold">{option.text}</span>
              </button>
            );
          })}
        </div>
        {cleaningSelected && (
          <textarea
            value={cleaningNote}
            onChange={(event) => setCleaningNote(event.target.value)}
            placeholder={cleaningStatus === 'done'
              ? 'Volitelně: co bylo uklizeno / kdo ověřil / poznámka k hygieně...'
              : 'Volitelně: proč se úklid netýká tohoto zásahu...'}
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600"
          />
        )}
      </div>

      <FormField
        label="Poznámka pro audit"
        value={auditNote}
        onChange={setAuditNote}
        type="textarea"
        placeholder="Např. kontrola po opravě OK, bude sledováno při další obchůzce."
      />

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-600">
          <Clock className="mr-1 inline h-4 w-4" />
          Čas práce <span className="text-slate-500">(volitelné)</span>
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-center">
            <span className="text-2xl font-bold text-slate-950">
              {duration > 0 ? `${Math.floor(duration / 60)}h ${duration % 60}min` : '—'}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {duration > 0 ? `${duration} minut` : 'Přetáhni posuvník'}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="480"
            step="15"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full accent-emerald-600"
            style={{ background: `linear-gradient(to right, #059669 ${(duration / 480) * 100}%, #e2e8f0 ${(duration / 480) * 100}%)` }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0</span><span>2h</span><span>4h</span><span>6h</span><span>8h</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-slate-600">
          PIN pro potvrzení <span className="text-red-600">*</span>
        </label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4 číslice"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-950 placeholder-slate-400 outline-none transition focus:border-emerald-600"
        />
        <span className="mt-1 block text-[11px] text-slate-500">Potvrzuji dokončení zadáním PINu</span>
      </div>

      {error && isValid && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <FormFooter
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel="Dokončit a uzavřít"
        loading={saving}
        disabled={!isValid}
        color="green"
      />
    </BottomSheet>
  );
}
