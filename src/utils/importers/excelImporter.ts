// src/utils/importers/excelImporter.ts
// VIKRR — Asset Shield — Excel file parser with auto-column mapping
//
// Drag & drop file → Parse → Auto-map columns → Return rows

import * as XLSX from 'xlsx';

export interface ColumnMapping {
  excelColumn: string;
  mappedTo: string;
  confidence: number; // 0-1
}

export interface ParseResult {
  rows: Record<string, unknown>[];
  columns: string[];
  mappings: ColumnMapping[];
  sheetName: string;
  rowCount: number;
}

// Known field aliases for fuzzy matching
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['název', 'jméno', 'name', 'nazev', 'stroj', 'machine', 'item', 'položka', 'polozka'],
  code: ['kód', 'kod', 'code', 'číslo', 'cislo', 'number', 'katalog', 'id'],
  buildingId: ['budova', 'building', 'hala', 'objekt'],
  areaName: ['místnost', 'mistnost', 'area', 'room', 'sekce', 'úsek', 'usek'],
  status: ['stav', 'status', 'kondice'],
  category: ['kategorie', 'category', 'typ', 'type', 'druh'],
  quantity: ['množství', 'mnozstvi', 'qty', 'quantity', 'počet', 'pocet', 'ks'],
  unit: ['jednotka', 'unit', 'mj', 'měrná jednotka'],
  minQuantity: ['minimum', 'min', 'min. množství', 'minquantity'],
  location: ['umístění', 'umisteni', 'location', 'pozice', 'regál', 'regal', 'police'],
  supplier: ['dodavatel', 'supplier', 'vendor'],
  price: ['cena', 'price', 'cost', 'náklady'],
  manufacturer: ['výrobce', 'vyrobce', 'manufacturer', 'značka', 'znacka', 'brand'],
  model: ['model', 'typ', 'verze'],
  priority: ['priorita', 'priority', 'důležitost'],
  title: ['název', 'titul', 'title', 'popis úkolu', 'task'],
  description: ['popis', 'description', 'detail', 'pozn', 'poznámka', 'note'],
  assignedToName: ['přiřazeno', 'assigned', 'zodpovědný', 'odpovědný', 'technik', 'worker'],
};

/**
 * Fuzzy match column name to known field.
 */
function fuzzyMatchColumn(columnName: string): { field: string; confidence: number } | null {
  const normalized = columnName.toLowerCase().trim().replace(/[_\-\s.]+/g, ' ');

  let bestMatch: { field: string; confidence: number } | null = null;

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase();

      // Exact match
      if (normalized === normalizedAlias) {
        return { field, confidence: 1.0 };
      }

      // Contains match
      if (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        const conf = Math.min(normalized.length, normalizedAlias.length) / Math.max(normalized.length, normalizedAlias.length);
        if (!bestMatch || conf > bestMatch.confidence) {
          bestMatch = { field, confidence: conf * 0.8 };
        }
      }

      // Starts-with match
      if (normalized.startsWith(normalizedAlias.substring(0, 3))) {
        if (!bestMatch || bestMatch.confidence < 0.4) {
          bestMatch = { field, confidence: 0.4 };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Parse an Excel/CSV file and auto-map columns.
 */
export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (rawRows.length === 0) {
          reject(new Error('Soubor neobsahuje žádná data'));
          return;
        }

        const columns = Object.keys(rawRows[0]);

        // Auto-map columns
        const mappings: ColumnMapping[] = columns.map((col) => {
          const match = fuzzyMatchColumn(col);
          return {
            excelColumn: col,
            mappedTo: match?.field || col,
            confidence: match?.confidence || 0,
          };
        });

        // Remap rows using mappings
        const rows = rawRows.map((row) => {
          const mapped: Record<string, unknown> = {};
          for (const mapping of mappings) {
            if (mapping.confidence > 0.3) {
              mapped[mapping.mappedTo] = row[mapping.excelColumn];
            } else {
              mapped[mapping.excelColumn] = row[mapping.excelColumn];
            }
          }
          return mapped;
        });

        resolve({
          rows,
          columns,
          mappings,
          sheetName,
          rowCount: rows.length,
        });
      } catch (err) {
        reject(new Error('Chyba při čtení souboru: ' + (err as Error).message));
      }
    };

    reader.onerror = () => reject(new Error('Chyba při načítání souboru'));
    reader.readAsArrayBuffer(file);
  });
}
