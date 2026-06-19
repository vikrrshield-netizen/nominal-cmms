// src/lib/lines.ts
// VIKRR — Asset Shield — Výrobní linka jako asset (entityType 'Linka').
// Linka = seznam strojů z kartotéky (odkazy přes lineMachineIds). Ukládá se mezi assety
// → žádná nová Firestore kolekce ani změna pravidel.

import type { Asset } from '../types/asset';

export const LINE_ENTITY_TYPE = 'Linka';

export function isLineAsset(a?: Partial<Asset> | null): boolean {
  if (!a) return false;
  const t = String(a.entityType || '').trim().toLowerCase();
  return t === 'linka' || t === 'vyrobni linka' || t === 'výrobní linka' || t === 'line';
}
