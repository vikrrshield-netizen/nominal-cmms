// src/config/kioskTiles.ts
// Sdílený seznam dlaždic kiosku — zdroj pravdy pro admin (viditelnost) i kiosk.
// POZN.: jen ID + popisek pro UI; ikony/akce si drží KioskPage.

export interface KioskTileOption {
  id: string;
  label: string;
}

// Dlaždice, kterou nelze nikdy vypnout (hlavní účel kiosku).
export const KIOSK_ALWAYS_ON = 'breakdown';

export const KIOSK_TILES: KioskTileOption[] = [
  { id: 'breakdown', label: 'Nahlásit poruchu' },
  { id: 'order', label: 'Požadavek na díl' },
  { id: 'handover', label: 'Předání směny' },
  { id: 'datalogger', label: 'Datalogery' },
  { id: 'prefilter', label: 'Výměna předfiltru' },
  { id: 'gearbox', label: 'Teplota převodovky' },
  { id: 'idea', label: 'Nápad' },
  { id: 'assistant', label: 'Jak postupovat' },
  { id: 'message', label: 'Schránka důvěry' },
  { id: 'profile', label: 'Profil' },
];

export const KIOSK_TILE_IDS = KIOSK_TILES.map((t) => t.id);
