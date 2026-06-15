import type { Worksheet } from 'exceljs';
import { collection, doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Asset } from '../../types/asset';
import type { WorkLog } from '../../types/workLog';

type WorkLogType = WorkLog['type'];

export interface WorkHistoryImportResult {
  parsed: number;
  imported: number;
  skippedDuplicates: number;
  failed: number;
  errors: string[];
}

interface ImportWorkHistoryInput {
  arrayBuffer: ArrayBuffer;
  tenantId: string;
  userId: string;
  userName: string;
  assets: Asset[];
  existingLogs: WorkLog[];
}

interface ParsedHistoryRow {
  sheetName: string;
  location: string;
  assetName: string;
  performedAt: Date;
  performedBy: string;
  checkedBy: string;
  content: string;
  type: WorkLogType;
}

interface DateState {
  year: number;
  lastMonth?: number;
}

const ROMAN_MONTHS: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown): string {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseNames(value: string): string[] {
  return value
    .split(/,|;|\/|\+|\ba\b/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifyType(content: string): WorkLogType {
  const value = normalize(content);
  if (/\b(oprava|vymena|vymen|servis|serizeni|demontaz|montaz|instalace|kabel|motor)\b/.test(value)) {
    return 'repair';
  }
  if (/\b(kontrola|kontrol)\b/.test(value) && !/\b(sanitace|mazani|mazan)\b/.test(value)) {
    return 'inspection';
  }
  if (/\b(sanitace|mazani|mazan|lozis|alergen|lepek)\b/.test(value)) {
    return 'maintenance';
  }
  return 'note';
}

function parseMonth(value: string): number | null {
  const roman = value.toUpperCase().match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\b/);
  if (roman) return ROMAN_MONTHS[roman[1]] ?? null;
  const numeric = value.match(/^\s*\d{1,2}\s*[.\-/]\s*(\d{1,2})/);
  return numeric ? Number(numeric[1]) : null;
}

function parseDay(value: string): number | null {
  const match = value.match(/^\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function parseExplicitYear(value: string): number | null {
  const match = value.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function excelSerialToDate(value: number): Date | null {
  if (!Number.isFinite(value) || value < 1) return null;
  const utcMs = Math.round((value - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0);
}

function parseHistoryDate(raw: unknown, state: DateState): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    state.year = raw.getFullYear();
    state.lastMonth = raw.getMonth() + 1;
    return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0);
  }

  if (typeof raw === 'number') {
    const parsed = excelSerialToDate(raw);
    if (parsed) {
      state.year = parsed.getFullYear();
      state.lastMonth = parsed.getMonth() + 1;
      return parsed;
    }
  }

  const value = text(raw).replace(/,/g, '.').replace(/\*/g, '');
  if (!value) return null;

  const day = parseDay(value);
  const month = parseMonth(value);
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;

  const explicitYear = parseExplicitYear(value);
  if (explicitYear) {
    state.year = explicitYear;
  } else if (state.lastMonth && month < state.lastMonth - 4) {
    state.year += 1;
  }
  state.lastMonth = month;

  return new Date(state.year, month - 1, day, 12, 0, 0);
}

function nearestSection(row: unknown[], dateCol: number, fallback: string): string {
  for (let col = dateCol; col >= 0; col--) {
    const value = text(row[col]);
    if (value) return value;
  }
  return fallback;
}

function detectHeaderRow(rows: unknown[][]): number {
  const maxRows = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const hits = rows[rowIndex].filter((cell) => normalize(cell) === 'datum').length;
    if (hits >= 2) return rowIndex;
  }
  return 1;
}

function findDateColumns(header: unknown[]): number[] {
  return header
    .map((cell, index) => normalize(cell) === 'datum' ? index : -1)
    .filter((index) => index >= 0);
}

function findAsset(assets: Asset[], assetName: string): Asset | undefined {
  const wanted = normalize(assetName);
  if (!wanted) return undefined;

  const exact = assets.find((asset) =>
    normalize(asset.name) === wanted ||
    normalize(asset.code) === wanted
  );
  if (exact) return exact;

  if (wanted.length < 4) return undefined;
  return assets.find((asset) => {
    const name = normalize(asset.name);
    return name.length >= 4 && (name.includes(wanted) || wanted.includes(name));
  });
}

function buildExistingKeys(logs: WorkLog[]): Set<string> {
  return new Set(logs.map((log) => {
    const date = log.performedAt || log.createdAt;
    return [
      isoDay(date),
      normalize(log.location),
      normalize(log.assetName),
      normalize(log.content),
    ].join('|');
  }));
}

function rowKey(row: ParsedHistoryRow): string {
  return [
    isoDay(row.performedAt),
    normalize(row.location),
    normalize(row.assetName),
    normalize(row.content),
  ].join('|');
}

function withoutUndefined(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function cellValue(value: unknown): unknown {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const result = (value as { result?: unknown }).result;
    if (result != null) return result;
    const textValue = (value as { text?: unknown }).text;
    if (textValue != null) return textValue;
    const richText = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(richText)) return richText.map((part) => part.text || '').join('');
  }
  return value;
}

function sheetToRows(sheet: Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const rowCount = sheet.actualRowCount || sheet.rowCount;
  const colCount = sheet.actualColumnCount || sheet.columnCount;
  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
    const row: unknown[] = [];
    for (let colIndex = 1; colIndex <= colCount; colIndex++) {
      row.push(cellValue(sheet.getCell(rowIndex, colIndex).value));
    }
    rows.push(row);
  }
  return rows;
}

async function parseWorkbook(arrayBuffer: ArrayBuffer): Promise<ParsedHistoryRow[]> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const parsedRows: ParsedHistoryRow[] = [];

  for (const sheet of workbook.worksheets) {
    const sheetName = sheet.name;
    const rows = sheetToRows(sheet);
    if (rows.length < 3) continue;

    const headerRowIndex = detectHeaderRow(rows);
    const sectionRow = rows[Math.max(0, headerRowIndex - 1)] || [];
    const header = rows[headerRowIndex] || [];
    const dateColumns = findDateColumns(header);
    const dateStates = new Map<number, DateState>();

    for (const dateCol of dateColumns) {
      dateStates.set(dateCol, { year: 2025 });
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      for (const dateCol of dateColumns) {
        const state = dateStates.get(dateCol) || { year: 2025 };
        const performedAt = parseHistoryDate(row[dateCol], state);
        dateStates.set(dateCol, state);
        if (!performedAt) continue;

        const content = text(row[dateCol + 1]);
        if (!content) continue;

        const assetFromHeader = text(header[dateCol + 1]);
        const assetFromFirstCol = text(row[0]);
        const assetName = normalize(assetFromHeader) && !['provedl', 'kontrola'].includes(normalize(assetFromHeader))
          ? assetFromHeader
          : assetFromFirstCol || text(header[dateCol + 1]) || sheetName;
        const performedBy = text(row[dateCol + 2]);
        const checkedBy = text(row[dateCol + 3]);
        const location = nearestSection(sectionRow, dateCol, sheetName);

        parsedRows.push({
          sheetName,
          location,
          assetName,
          performedAt,
          performedBy,
          checkedBy,
          content,
          type: classifyType(content),
        });
      }
    }
  }

  return parsedRows;
}

export async function importWorkHistoryWorkbook(input: ImportWorkHistoryInput): Promise<WorkHistoryImportResult> {
  const parsed = await parseWorkbook(input.arrayBuffer);
  const existingKeys = buildExistingKeys(input.existingLogs);
  const seenKeys = new Set<string>();
  const errors: string[] = [];
  let imported = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  const rowsToImport = parsed.filter((row) => {
    const key = rowKey(row);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      skippedDuplicates++;
      return false;
    }
    seenKeys.add(key);
    return true;
  });

  const collectionRef = collection(db, 'workLogs');
  const batchSize = 450;

  for (let i = 0; i < rowsToImport.length; i += batchSize) {
    const chunk = rowsToImport.slice(i, i + batchSize);
    const batch = writeBatch(db);

    for (const row of chunk) {
      const ref = doc(collectionRef);
      const matchedAsset = findAsset(input.assets, row.assetName);
      const workers = parseNames(row.performedBy);
      const inspectors = parseNames(row.checkedBy);
      const userName = row.performedBy || row.checkedBy || input.userName || 'Import Excel';
      const contentParts = [
        row.content,
        row.checkedBy ? `Kontrola: ${row.checkedBy}` : '',
        `Import z Excelu: ${row.sheetName}`,
      ].filter(Boolean);

      batch.set(ref, withoutUndefined({
        tenantId: input.tenantId,
        userId: input.userId,
        userName,
        workerNames: workers.length ? workers : undefined,
        completedByNames: inspectors.length ? inspectors : undefined,
        type: row.type,
        content: contentParts.join('\n'),
        location: row.location,
        assetId: matchedAsset?.id,
        assetName: matchedAsset?.name || row.assetName,
        performedAt: Timestamp.fromDate(row.performedAt),
        auditReady: true,
        importedFrom: 'excel_work_history',
        importedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }));
    }

    try {
      await batch.commit();
      imported += chunk.length;
    } catch (err) {
      failed += chunk.length;
      errors.push(String(err));
    }
  }

  return {
    parsed: parsed.length,
    imported,
    skippedDuplicates,
    failed,
    errors,
  };
}
