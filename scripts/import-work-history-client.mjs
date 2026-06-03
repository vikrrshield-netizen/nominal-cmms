import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    args.set(arg.slice(2), process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1] ?? true);
  }
}

const filePath = args.get('file') || 'C:\\Users\\bsvk\\Downloads\\deník_výroba.. (1).xlsx';
const write = args.has('write');
const tenantId = String(args.get('tenant') || 'main_firm');
const pin = String(args.get('pin') || '3333');
const keywords = String(args.get('keywords') || '')
  .split(',')
  .map((item) => normalize(item))
  .filter(Boolean);

const firebaseConfig = {
  apiKey: 'AIzaSyDPdaXYoHvU3usmPRurKmlUqNk7atiUEsc',
  authDomain: 'nominal-cmms.firebaseapp.com',
  projectId: 'nominal-cmms',
  storageBucket: 'nominal-cmms.firebasestorage.app',
  messagingSenderId: '756412471928',
  appId: '1:756412471928:web:dd340536ee3e97e2172b8d',
};

const ROMAN_MONTHS = {
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

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function parseNames(value) {
  return value
    .split(/,|;|\/|\+|\ba\b/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifyType(content) {
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

function parseMonth(value) {
  const roman = value.toUpperCase().match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\b/);
  if (roman) return ROMAN_MONTHS[roman[1]] ?? null;
  const numeric = value.match(/^\s*\d{1,2}\s*[.\-/]\s*(\d{1,2})/);
  return numeric ? Number(numeric[1]) : null;
}

function parseDay(value) {
  const match = value.match(/^\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function parseExplicitYear(value) {
  const match = value.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function parseHistoryDate(raw, state) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    state.year = raw.getFullYear();
    state.lastMonth = raw.getMonth() + 1;
    return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0);
  }

  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed?.y && parsed?.m && parsed?.d) {
      state.year = parsed.y;
      state.lastMonth = parsed.m;
      return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0);
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

function nearestSection(row, dateCol, fallback) {
  for (let col = dateCol; col >= 0; col -= 1) {
    const value = text(row[col]);
    if (value) return value;
  }
  return fallback;
}

function detectHeaderRow(rows) {
  const maxRows = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const hits = rows[rowIndex].filter((cell) => normalize(cell) === 'datum').length;
    if (hits >= 2) return rowIndex;
  }
  return 1;
}

function findDateColumns(header) {
  return header
    .map((cell, index) => normalize(cell) === 'datum' ? index : -1)
    .filter((index) => index >= 0);
}

function parseWorkbook(path) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const parsedRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (rows.length < 3) continue;

    const headerRowIndex = detectHeaderRow(rows);
    const sectionRow = rows[Math.max(0, headerRowIndex - 1)] || [];
    const header = rows[headerRowIndex] || [];
    const dateColumns = findDateColumns(header);
    const dateStates = new Map();

    for (const dateCol of dateColumns) {
      dateStates.set(dateCol, { year: 2025 });
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
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

function rowSearchText(row) {
  return normalize([
    row.sheetName,
    row.location,
    row.assetName,
    row.content,
    row.performedBy,
    row.checkedBy,
  ].join(' '));
}

function filterRows(rows) {
  if (keywords.length === 0) return rows;
  return rows.filter((row) => {
    const haystack = rowSearchText(row);
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

function findAsset(assets, assetName) {
  const wanted = normalize(assetName);
  if (!wanted) return undefined;

  const exact = assets.find((asset) => normalize(asset.name) === wanted || normalize(asset.code) === wanted);
  if (exact) return exact;

  if (wanted.length < 4) return undefined;
  return assets.find((asset) => {
    const name = normalize(asset.name);
    return name.length >= 4 && (name.includes(wanted) || wanted.includes(name));
  });
}

function buildExistingKeys(logs) {
  return new Set(logs.map((log) => {
    const date = log.performedAt?.toDate ? log.performedAt.toDate() : log.createdAt?.toDate?.() || new Date();
    return [
      isoDay(date),
      normalize(log.location),
      normalize(log.assetName),
      normalize(log.content),
    ].join('|');
  }));
}

function rowKey(row) {
  return [
    isoDay(row.performedAt),
    normalize(row.location),
    normalize(row.assetName),
    normalize(row.content),
  ].join('|');
}

function withoutUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function printSummary(rows, assets = [], existingLogs = []) {
  const existingKeys = buildExistingKeys(existingLogs);
  const seenKeys = new Set();
  let duplicates = 0;
  let matched = 0;
  const bySheet = new Map();
  const byType = new Map();
  const unmatched = new Map();

  for (const row of rows) {
    const key = rowKey(row);
    if (existingKeys.has(key) || seenKeys.has(key)) duplicates += 1;
    seenKeys.add(key);
    if (findAsset(assets, row.assetName)) matched += 1;
    else unmatched.set(row.assetName, (unmatched.get(row.assetName) || 0) + 1);
    bySheet.set(row.sheetName, (bySheet.get(row.sheetName) || 0) + 1);
    byType.set(row.type, (byType.get(row.type) || 0) + 1);
  }

  console.log(JSON.stringify({
    filePath,
    mode: write ? 'WRITE' : 'DRY_RUN',
    keywords,
    parsed: rows.length,
    willImport: rows.length - duplicates,
    duplicates,
    matchedAssets: matched,
    sheets: Object.fromEntries(bySheet),
    types: Object.fromEntries(byType),
    firstRows: rows.slice(0, 8).map((row) => ({
      date: isoDay(row.performedAt),
      location: row.location,
      assetName: row.assetName,
      type: row.type,
      content: row.content,
      performedBy: row.performedBy,
      checkedBy: row.checkedBy,
    })),
    unmatchedTop: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
  }, null, 2));
}

async function main() {
  const parsedRows = parseWorkbook(filePath);
  const rows = filterRows(parsedRows);

  if (!write) {
    printSummary(rows);
    return;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  console.log('Signing in to Firebase...');
  const credential = await signInWithEmailAndPassword(auth, `pin_${pin}@nominal.local`, `${pin}00`);
  const userId = credential.user.uid;
  console.log(`Signed in as ${userId}. Loading assets and existing logs...`);

  const [assetsSnap, logsSnap] = await Promise.all([
    getDocs(collection(db, 'assets')),
    getDocs(query(collection(db, 'workLogs'))),
  ]);
  const assets = assetsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((asset) => (asset.tenantId === tenantId || !asset.tenantId) && !asset.isDeleted);
  const existingLogs = logsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  console.log(`Loaded ${assets.length} assets and ${existingLogs.length} existing logs.`);

  printSummary(rows, assets, existingLogs);

  const existingKeys = buildExistingKeys(existingLogs);
  const seenKeys = new Set();
  const rowsToImport = rows.filter((row) => {
    const key = rowKey(row);
    if (existingKeys.has(key) || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  let imported = 0;
  let failed = 0;
  const batchSize = 450;
  const collectionRef = collection(db, 'workLogs');

  for (let i = 0; i < rowsToImport.length; i += batchSize) {
    const chunk = rowsToImport.slice(i, i + batchSize);
    const batch = writeBatch(db);

    for (const row of chunk) {
      const ref = doc(collectionRef);
      const matchedAsset = findAsset(assets, row.assetName);
      const workers = parseNames(row.performedBy);
      const inspectors = parseNames(row.checkedBy);
      const userName = row.performedBy || row.checkedBy || 'Import Excel';
      const contentParts = [
        row.content,
        row.checkedBy ? `Kontrola: ${row.checkedBy}` : '',
        `Import z Excelu: ${row.sheetName}`,
      ].filter(Boolean);

      batch.set(ref, withoutUndefined({
        tenantId,
        userId,
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
      console.log(`Imported ${imported}/${rowsToImport.length}`);
    } catch (err) {
      failed += chunk.length;
      console.error(err);
    }
  }

  console.log(JSON.stringify({ imported, failed, skippedDuplicates: rows.length - rowsToImport.length }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
