export interface ColumnMapping {
  excelColumn: string;
  mappedTo: string;
  confidence: number;
}

export interface ParseResult {
  rows: Record<string, unknown>[];
  columns: string[];
  mappings: ColumnMapping[];
  sheetName: string;
  rowCount: number;
}

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['název', 'jméno', 'name', 'nazev', 'stroj', 'machine', 'item', 'položka', 'polozka'],
  code: ['kód', 'kod', 'code', 'číslo', 'cislo', 'number', 'katalog', 'id'],
  buildingId: ['budova', 'building', 'hala', 'objekt'],
  areaName: ['místnost', 'mistnost', 'area', 'room', 'sekce', 'úsek', 'usek'],
  status: ['stav', 'status', 'kondice'],
  category: ['kategorie', 'category'],
  entityType: ['typ entity', 'entity type', 'entita', 'typ stroje', 'typ zařízení', 'druh', 'typ', 'type'],
  criticality: ['kritičnost', 'kriticnost', 'criticality', 'důležitost', 'dulezitost'],
  parentName: ['nadřazený', 'nadrazeny', 'parent', 'patří do', 'umístění v', 'rodič', 'rodic', 'parent name'],
  serialNumber: ['sériové číslo', 'sériové č.', 'serial', 'serial number', 'výrobní číslo', 'sn', 'ser. č.'],
  year: ['rok', 'rok výroby', 'year', 'vyrobeno', 'rok vyroby'],
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-\s.]+/g, ' ');
}

function fuzzyMatchColumn(columnName: string): { field: string; confidence: number } | null {
  const normalized = normalize(columnName);
  let bestMatch: { field: string; confidence: number } | null = null;

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (normalized === normalizedAlias) return { field, confidence: 1 };
      if (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        const confidence = Math.min(normalized.length, normalizedAlias.length) / Math.max(normalized.length, normalizedAlias.length);
        if (!bestMatch || confidence > bestMatch.confidence) bestMatch = { field, confidence: confidence * 0.8 };
      }
      if (normalized.startsWith(normalizedAlias.slice(0, 3)) && (!bestMatch || bestMatch.confidence < 0.4)) {
        bestMatch = { field, confidence: 0.4 };
      }
    }
  }

  return bestMatch;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((part) => part.text || '').join('');
    const result = (value as { result?: unknown }).result;
    if (result != null) return cellText(result);
    const text = (value as { text?: unknown }).text;
    if (text != null) return cellText(text);
  }
  return String(value).trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ';' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

function rowsToRecords(rawRows: string[][], sheetName: string): ParseResult {
  const headerIndex = rawRows.findIndex((row) => row.some(Boolean));
  if (headerIndex < 0) throw new Error('Soubor neobsahuje žádná data');
  const columns = rawRows[headerIndex].map((cell, index) => cell || `Sloupec ${index + 1}`);
  const mappings = columns.map((column) => {
    const match = fuzzyMatchColumn(column);
    return { excelColumn: column, mappedTo: match?.field || column, confidence: match?.confidence || 0 };
  });

  const rows = rawRows.slice(headerIndex + 1)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      mappings.forEach((mapping, index) => {
        const target = mapping.confidence > 0.3 ? mapping.mappedTo : mapping.excelColumn;
        mapped[target] = row[index] ?? '';
      });
      return mapped;
    });

  return { rows, columns, mappings, sheetName, rowCount: rows.length };
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFileAsArrayBuffer(file));

  for (const sheet of workbook.worksheets) {
    const rawRows: string[][] = [];
    const rowCount = sheet.actualRowCount || sheet.rowCount;
    const colCount = sheet.actualColumnCount || sheet.columnCount;
    for (let r = 1; r <= rowCount; r++) {
      const row: string[] = [];
      for (let c = 1; c <= colCount; c++) row.push(cellText(sheet.getCell(r, c).value));
      rawRows.push(row);
    }
    if (rawRows.some((row) => row.some(Boolean))) return rowsToRecords(rawRows, sheet.name);
  }

  throw new Error('Soubor neobsahuje žádná data');
}

export async function parseExcelFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  try {
    if (ext === 'csv') return rowsToRecords(parseCsv(await readFileAsText(file)), file.name);
    if (ext === 'xlsx') return parseXlsx(file);
    if (ext === 'xls') throw new Error('Formát .xls není podporovaný. Uložte soubor jako .xlsx nebo .csv.');
    throw new Error('Podporované formáty jsou .xlsx a .csv.');
  } catch (err) {
    throw new Error('Chyba při čtení souboru: ' + (err as Error).message);
  }
}
