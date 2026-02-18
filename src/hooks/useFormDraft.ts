// src/hooks/useFormDraft.ts
// VIKRR — Asset Shield — Save Draft (localStorage sync)
// Náhrada za useState ve formulářích — přežije refresh i pád appky

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pro automatické ukládání stavu formuláře do localStorage.
 * 
 * Použití:
 *   const [form, setForm, clearDraft] = useFormDraft('new_task', { title: '', description: '' });
 *   // ... po úspěšném odeslání:
 *   clearDraft();
 * 
 * @param key  Unikátní klíč (např. 'new_task', 'kiosk_fault', 'complete_task_XYZ')
 * @param initialValue  Výchozí hodnota formuláře
 * @param debounceMs  Jak často ukládat (default 500ms)
 */
export function useFormDraft<T>(
  key: string,
  initialValue: T,
  debounceMs = 500
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = `nominal_draft_${key}`;

  // Inicializace — načti z localStorage nebo použij default
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ověř že struktura sedí (má stejné klíče)
        if (typeof parsed === 'object' && parsed !== null && typeof initialValue === 'object') {
          return { ...initialValue, ...parsed };
        }
        return parsed;
      }
    } catch {
      // Corrupted data — ignoruj
    }
    return initialValue;
  });

  // Debounced save do localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        // Neukládej pokud je formulář prázdný (všechny hodnoty falsy)
        const hasContent = typeof value === 'object' && value !== null
          ? Object.values(value).some((v) => v !== '' && v !== null && v !== undefined && v !== 0)
          : !!value;

        if (hasContent) {
          localStorage.setItem(storageKey, JSON.stringify(value));
        }
      } catch {
        // localStorage plný nebo nedostupný — tiše ignoruj
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, storageKey, debounceMs]);

  // Vymazat draft po úspěšném odeslání
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setValue(initialValue);
  }, [storageKey, initialValue]);

  return [value, setValue, clearDraft];
}

/**
 * Utility: Vyčisti všechny drafty (např. při logout)
 */
export function clearAllDrafts() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('nominal_draft_'));
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
