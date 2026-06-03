import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const filePath = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : 'C:\\Users\\bsvk\\Downloads\\NOMINAL_ukoly_2026-02-19.xlsx';
const write = process.argv.includes('--write');
const pin = '3333';

const firebaseConfig = {
  apiKey: 'AIzaSyDPdaXYoHvU3usmPRurKmlUqNk7atiUEsc',
  authDomain: 'nominal-cmms.firebaseapp.com',
  projectId: 'nominal-cmms',
  storageBucket: 'nominal-cmms.firebasestorage.app',
  messagingSenderId: '756412471928',
  appId: '1:756412471928:web:dd340536ee3e97e2172b8d',
};

const KEYWORDS = ['extrud', 'prevod', 'převod', 'gearbox', 'lozisk', 'ložisk', 'mazan', 'mazán'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hasFocus(row) {
  const haystack = normalize([
    row.title,
    row.description,
    row.assetName,
    row.buildingId,
  ].join(' '));
  return KEYWORDS.some((keyword) => haystack.includes(normalize(keyword)));
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0);
  }
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})/);
  if (!match) return undefined;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
}

function toTimestamp(value) {
  const date = parseDate(value);
  return date ? Timestamp.fromDate(date) : undefined;
}

function cleanStatus(value) {
  const status = normalize(value);
  if (status === 'done') return 'completed';
  if (['backlog', 'planned', 'in_progress', 'paused', 'completed', 'cancelled'].includes(status)) return status;
  return 'backlog';
}

function cleanType(value) {
  const type = normalize(value);
  if (['corrective', 'preventive', 'inspection', 'improvement'].includes(type)) return type;
  return 'corrective';
}

function cleanPriority(value) {
  const priority = text(value).toUpperCase();
  if (['P1', 'P2', 'P3', 'P4'].includes(priority)) return priority;
  return 'P3';
}

function cleanSource(value) {
  const source = normalize(value);
  if (['kiosk', 'web', 'scheduled', 'ai', 'inspection'].includes(source)) return source;
  return 'web';
}

function withoutEmpty(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== '')
  );
}

function parseWorkbook(path) {
  const workbook = XLSX.readFile(path, { cellDates: true });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    for (const row of sheetRows) {
      const parsed = {
        code: text(row.code),
        priority: cleanPriority(row.priority),
        createdAt: toTimestamp(row.createdAt) || Timestamp.now(),
        assetId: text(row.assetId),
        status: cleanStatus(row.status),
        source: cleanSource(row.source),
        description: text(row.description),
        createdByName: text(row.createdByName) || 'Import Excel',
        type: cleanType(row.type),
        updatedAt: toTimestamp(row.updatedAt) || Timestamp.now(),
        buildingId: text(row.buildingId),
        assetName: text(row.assetName),
        createdById: text(row.createdById) || 'import-excel',
        title: text(row.title),
        pausedAt: toTimestamp(row.pausedAt),
        assigneeName: text(row.assigneeName),
        plannedDate: toTimestamp(row.plannedDate || row.scheduledDate),
        startedAt: toTimestamp(row.startedAt),
        assigneeId: text(row.assigneeId),
        actualMinutes: Number(row.actualMinutes) || undefined,
        assigneeColor: text(row.assigneeColor),
        estimatedMinutes: Number(row.estimatedMinutes) || undefined,
        updatedBy: text(row.updatedBy),
        plannedWeek: text(row.plannedWeek),
        importedFrom: 'excel_tasks_history',
      };
      if (parsed.code && parsed.title && hasFocus(parsed)) rows.push(parsed);
    }
  }
  return rows;
}

async function main() {
  const rows = parseWorkbook(filePath);
  console.log(`Parsed focused rows: ${rows.length}`);
  console.table(rows.map((row) => ({
    code: row.code,
    title: row.title,
    status: row.status,
    assetName: row.assetName,
  })));

  if (!write) return;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, `pin_${pin}@nominal.local`, `${pin}00`);

  const existingSnap = await getDocs(collection(db, 'tasks'));
  const existingCodes = new Set(existingSnap.docs.map((item) => text(item.data().code)));
  const rowsToImport = rows.filter((row) => !existingCodes.has(row.code));

  const batch = writeBatch(db);
  for (const row of rowsToImport) {
    const ref = collection(db, 'tasks');
    await addDoc(ref, withoutEmpty({
      ...row,
      updatedAt: row.updatedAt || serverTimestamp(),
    }));
  }

  await batch.commit();
  console.log(JSON.stringify({
    focused: rows.length,
    imported: rowsToImport.length,
    skippedExisting: rows.length - rowsToImport.length,
  }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
