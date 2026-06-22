// src/lib/lines.ts
// VIKRR — Asset Shield — Výrobní linka jako asset (entityType 'Linka').
// Linka = seznam strojů z kartotéky (odkazy přes lineMachineIds). Ukládá se mezi assety
// → žádná nová Firestore kolekce ani změna pravidel.

import type { Asset } from '../types/asset';

export const LINE_ENTITY_TYPE = 'Linka';

const norm = (s?: string | null): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function isLineAsset(a?: Partial<Asset> | null): boolean {
  if (!a) return false;
  const t = norm(a.entityType);
  return t === 'linka' || t === 'vyrobni linka' || t === 'line';
}

// Budova / místnost (kontejner) — replikuje logiku z AssetCardPage, aby se chovala stejně.
const ROOM_RE = /\b(mistnost|room|area|hala|prostor|sekce|stredisko|oddeleni|pracoviste|stanoviste|balirna|expedice|extrudovna|vyroba|louparna|satny)\b/;

function isContainerAsset(a: Partial<Asset>): boolean {
  const t = norm(`${a.name || ''} ${a.entityType || ''} ${a.category || ''}`);
  return ROOM_RE.test(t) || t.includes('budova') || t.includes('building');
}

// Stroj, který může být na lince: není linka ani budova/místnost.
export function isLineMachineCandidate(a?: Partial<Asset> | null): boolean {
  if (!a) return false;
  return !isLineAsset(a) && !isContainerAsset(a);
}
