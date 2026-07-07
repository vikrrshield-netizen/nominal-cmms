import { useCallback } from 'react';
import type { Row, Worksheet } from 'exceljs';
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import appConfig from '../appConfig';

type ExportType = 'inventory' | 'tasks' | 'transactions' | 'revisions' | 'fleet' | 'waste' | 'audit';
type PDFTemplate = 'service-report' | 'handover-protocol' | 'revision-report' | 'inventory-report' | 'task-summary';

interface ExportOptions {
  filename?: string;
  dateFrom?: Date;
  dateTo?: Date;
  filters?: Record<string, unknown>;
}

const SHEET_NAMES: Record<ExportType, string> = {
  inventory: 'Sklad',
  tasks: 'Úkoly',
  transactions: 'Pohyby skladu',
  revisions: 'Revize',
  fleet: 'Vozidla',
  waste: 'Odpady',
  audit: 'Audit log',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateCZ(value: unknown): string {
  if (!value) return '—';
  const date = value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateFile(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function flattenForExport(item: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(Object(item))) {
    if (['isDeleted', 'id'].includes(key)) continue;
    if (value && typeof value === 'object' && 'toDate' in value) {
      result[key] = formatDateCZ(value);
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else if (value && typeof value === 'object') {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        result[`${key}_${subKey}`] = subValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function styleHeader(row: Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B4F' } };
}

function styleSheet(sheet: Worksheet): void {
  sheet.columns.forEach((column) => {
    let max = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length + 2);
    });
    column.width = Math.min(max, 48);
    column.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE7E0D4' } },
        left: { style: 'thin', color: { argb: 'FFE7E0D4' } },
        bottom: { style: 'thin', color: { argb: 'FFE7E0D4' } },
        right: { style: 'thin', color: { argb: 'FFE7E0D4' } },
      };
    });
  });
}

async function exportToXLSX(type: ExportType, data: unknown[], options?: ExportOptions): Promise<string> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');
  const rows = data.map(flattenForExport);
  const headers = Object.keys(rows[0] || {});
  const workbook = new ExcelJS.Workbook();
  workbook.creator = appConfig.APP_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAMES[type] || 'Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((key) => row[key] ?? '')));
  styleHeader(sheet.getRow(1));
  styleSheet(sheet);

  const info = workbook.addWorksheet('Info');
  info.addRows([
    ['Položka', 'Hodnota'],
    ['Exportováno', new Date().toLocaleString('cs-CZ')],
    ['Typ', SHEET_NAMES[type] || 'Data'],
    ['Počet záznamů', rows.length],
    ['Systém', `${appConfig.APP_NAME} ${appConfig.VERSION}`],
  ]);
  styleHeader(info.getRow(1));
  styleSheet(info);

  const filename = options?.filename || `${appConfig.APP_NAME_SHORT}_${type}_${formatDateFile(new Date())}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}

// „Audit balíček" — vícelistý XLSX pro auditora (IFS/BRC): plány údržby na všech zařízeních,
// propadlé termíny, provedená údržba za 12 měsíců. Jen čtení, nic nemění.
async function exportAuditPackXLSX(): Promise<string> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');

  type Row = Record<string, unknown> & { id: string };
  const assetsSnap = await getDocs(collection(db, 'assets'));
  const assets: Row[] = assetsSnap.docs
    .map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id } as Row))
    .filter((a) => !a.isDeleted);

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const tasksSnap = await getDocs(query(
    collection(db, 'tasks'),
    where('createdAt', '>=', Timestamp.fromDate(yearAgo)),
    orderBy('createdAt', 'desc'),
  ));
  const doneTasks: Row[] = tasksSnap.docs
    .map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id } as Row))
    .filter((t) => !t.isDeleted && String(t.status) === 'completed');

  const dayStart = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const daysTo = (iso: unknown): number | null => {
    const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return Math.round((new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() - dayStart(new Date())) / 86400000);
  };
  const locOf = (a: Record<string, unknown>) =>
    [a.buildingId ? `Budova ${a.buildingId}` : '', String(a.areaName ?? a.location ?? '')].filter(Boolean).join(' › ');
  const dateOnly = (v: unknown) => String(v ?? '').slice(0, 10) || '—';

  const wb = new ExcelJS.Workbook();
  wb.creator = appConfig.APP_NAME;
  wb.created = new Date();
  const sheetOpts = { views: [{ state: 'frozen' as const, ySplit: 1 }] };

  // List 1: plány údržby — řádek na událost; zařízení bez plánu = zvýrazněný řádek
  const s1 = wb.addWorksheet('Plány údržby', sheetOpts);
  s1.addRow(['Zařízení', 'Kód', 'Typ', 'Umístění', 'Událost', 'Frekvence (dní)', 'Poslední', 'Další termín', 'Dní do termínu', 'Stav']);
  const overdueRows: Array<Array<unknown>> = [];
  for (const a of assets) {
    const events = (Array.isArray(a.events) ? a.events : []) as Array<Record<string, unknown>>;
    const named = events.filter((ev) => String(ev?.name ?? '').trim());
    if (!named.length) {
      s1.addRow([a.name ?? '', a.code ?? '', a.entityType ?? '', locOf(a), '— BEZ PLÁNU —', '', '', '', '', 'CHYBÍ']);
      continue;
    }
    for (const ev of named) {
      const d = daysTo(ev.nextDate);
      s1.addRow([
        a.name ?? '', a.code ?? '', a.entityType ?? '', locOf(a),
        ev.name ?? '', Number(ev.frequencyDays) || '', dateOnly(ev.lastDate), dateOnly(ev.nextDate),
        d ?? '', d !== null && d < 0 ? 'PO TERMÍNU' : 'OK',
      ]);
      if (d !== null && d < 0) {
        overdueRows.push([a.name ?? '', a.code ?? '', locOf(a), ev.name ?? '', dateOnly(ev.nextDate), Math.abs(d)]);
      }
    }
  }
  styleHeader(s1.getRow(1));
  styleSheet(s1);

  // List 2: propadlé termíny (seřazené od nejstaršího)
  const s2 = wb.addWorksheet('Propadlé termíny', sheetOpts);
  s2.addRow(['Zařízení', 'Kód', 'Umístění', 'Událost', 'Termín', 'Dní po termínu']);
  overdueRows.sort((x, y) => Number(y[5]) - Number(x[5])).forEach((r) => s2.addRow(r));
  styleHeader(s2.getRow(1));
  styleSheet(s2);

  // List 3: provedená údržba za 12 měsíců (dokončené úkoly)
  const s3 = wb.addWorksheet('Provedeno (12 měs.)', sheetOpts);
  s3.addRow(['Kód úkolu', 'Název', 'Typ', 'Zařízení', 'Priorita', 'Dokončeno', 'Dokončil', 'Zdroj']);
  doneTasks.forEach((t) => s3.addRow([
    t.code ?? '', t.title ?? '', t.type ?? '', t.assetName ?? '', t.priority ?? '',
    formatDateCZ(t.completedAt), t.completedBy ?? t.completedByName ?? '', t.source ?? '',
  ]));
  styleHeader(s3.getRow(1));
  styleSheet(s3);

  const info = wb.addWorksheet('Info');
  info.addRows([
    ['Položka', 'Hodnota'],
    ['Exportováno', new Date().toLocaleString('cs-CZ')],
    ['Typ', 'Audit balíček (IFS/BRC) — plány, propadlé termíny, provedená údržba'],
    ['Zařízení celkem', assets.length],
    ['Dokončených úkolů (12 měs.)', doneTasks.length],
    ['Systém', `${appConfig.APP_NAME} ${appConfig.VERSION}`],
  ]);
  styleHeader(info.getRow(1));
  styleSheet(info);

  const filename = `${appConfig.APP_NAME_SHORT}_audit_balicek_${formatDateFile(new Date())}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}

function printDocument(title: string, body: string): void {
  const win = window.open('', '_blank', 'width=1000,height=900');
  if (!win) throw new Error('Tiskové okno bylo zablokováno prohlížečem.');
  win.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #1b2620; margin: 0; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    h2 { margin: 16px 0 8px; font-size: 15px; color: #1a6b4f; }
    .header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #1a6b4f; padding-bottom: 10px; margin-bottom: 14px; }
    .muted { color: #66756b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th { background: #1a6b4f; color: white; text-align: left; padding: 7px; }
    td { border: 1px solid #d8d0c3; padding: 7px; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
    .badge { display: inline-block; border-radius: 999px; padding: 2px 8px; background: #f3f4f6; font-weight: 700; }
    .signature { display: flex; gap: 60px; margin-top: 42px; }
    .signature div { width: 220px; border-top: 1px solid #1b2620; padding-top: 8px; text-align: center; }
  </style>
</head>
<body>
  ${body}
  <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`);
  win.document.close();
}

function row(label: string, value: unknown): string {
  return `<tr><th style="width:170px">${escapeHtml(label)}</th><td>${escapeHtml(value || '—')}</td></tr>`;
}

function exportToPDF(template: PDFTemplate, data: Record<string, unknown>): void {
  const title = {
    'service-report': 'Servisní list',
    'handover-protocol': 'Předávací protokol',
    'revision-report': 'Revizní zpráva',
    'inventory-report': 'Stav skladu',
    'task-summary': 'Přehled úkolů',
  }[template];

  const body = renderTemplate(template, data, title);
  printDocument(title, body);
}

function renderTemplate(template: PDFTemplate, data: Record<string, unknown>, title: string): string {
  const task = data.task as Record<string, unknown> | undefined;
  const asset = data.asset as Record<string, unknown> | undefined;
  const revision = data.revision as Record<string, unknown> | undefined;
  const items = (data.items || data.parts || data.assets || data.tasks || []) as Array<Record<string, unknown>>;

  const header = `<div class="header"><div><h1>${escapeHtml(title)}</h1><div class="muted">${escapeHtml(appConfig.COMPANY_NAME)}</div></div><div class="muted">Datum: ${formatDateCZ(new Date())}<br>${escapeHtml(appConfig.APP_NAME)}</div></div>`;

  if (template === 'service-report') {
    return `${header}
      <h2>Zařízení</h2><table>${row('Název', asset?.name)}${row('Kód', asset?.code)}${row('Lokace', asset?.areaName || asset?.location)}${row('Výrobce', asset?.manufacturer)}</table>
      <h2>Úkol a řešení</h2><table>${row('Úkol', task?.title)}${row('Priorita', task?.priority)}${row('Popis', task?.description)}${row('Řešení', task?.resolution)}${row('Technik', data.technician)}${row('Dokončeno', formatDateCZ(data.completedAt))}</table>
      ${items.length ? `<h2>Materiál</h2><table><tr><th>Název</th><th>Množství</th></tr>${items.map((item) => `<tr><td>${escapeHtml(item.partName || item.name)}</td><td>${escapeHtml(item.quantity || '')}</td></tr>`).join('')}</table>` : ''}
      <div class="signature"><div>Provedl</div><div>Převzal</div></div>`;
  }

  if (template === 'revision-report') {
    return `${header}
      <h2>Detail revize</h2><table>${row('Název', revision?.name)}${row('Kategorie', revision?.category)}${row('Provedeno', formatDateCZ(revision?.lastPerformedAt))}${row('Příští termín', formatDateCZ(revision?.nextDueAt))}${row('Provedl', revision?.performedBy)}</table>
      ${items.length ? `<h2>Dotčená zařízení</h2><table><tr><th>Zařízení</th><th>Lokace</th></tr>${items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.areaName || item.location)}</td></tr>`).join('')}</table>` : ''}
      <div class="signature"><div>Revizní technik</div><div>Odpovědná osoba</div></div>`;
  }

  if (template === 'inventory-report') {
    return `${header}<h2>Položky skladu</h2><table><tr><th>Kód</th><th>Název</th><th>Množství</th><th>Min.</th><th>Umístění</th></tr>${items.map((item) => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(`${item.quantity ?? ''} ${item.unit ?? ''}`)}</td><td>${escapeHtml(item.minQuantity)}</td><td>${escapeHtml(item.location)}</td></tr>`).join('')}</table>`;
  }

  if (template === 'task-summary') {
    return `${header}<h2>Úkoly</h2><table><tr><th>Priorita</th><th>Úkol</th><th>Zařízení</th><th>Stav</th><th>Technik</th><th>Dokončeno</th></tr>${items.map((item) => `<tr><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.assetName)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.assignedToName)}</td><td>${escapeHtml(formatDateCZ(item.completedAt))}</td></tr>`).join('')}</table>`;
  }

  return `${header}<h2>Předání</h2><table>${row('Zařízení', asset?.name)}${row('Předává', data.fromUser)}${row('Přejímá', data.toUser)}${row('Poznámka', data.notes)}</table><div class="signature"><div>Předávající</div><div>Přejímající</div></div>`;
}

export function useReports() {
  const { user } = useAuthContext();

  const exportXLSX = useCallback(
    (type: ExportType, data: unknown[], options?: ExportOptions) => exportToXLSX(type, data, options),
    []
  );

  const exportPDF = useCallback(
    (template: PDFTemplate, data: Record<string, unknown>) => exportToPDF(template, data),
    []
  );

  const exportInventoryXLSX = useCallback(async () => {
    const snap = await getDocs(collection(db, 'inventory'));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item: Record<string, unknown>) => !item.isDeleted);
    return exportToXLSX('inventory', items);
  }, []);

  const exportTasksXLSX = useCallback(async (dateFrom: Date, dateTo: Date) => {
    const taskQuery = query(
      collection(db, 'tasks'),
      where('createdAt', '>=', Timestamp.fromDate(dateFrom)),
      where('createdAt', '<=', Timestamp.fromDate(dateTo)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(taskQuery);
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((task: Record<string, unknown>) => !task.isDeleted);
    return exportToXLSX('tasks', tasks, {
      filename: `NOMINAL_ukoly_${formatDateFile(dateFrom)}_${formatDateFile(dateTo)}.xlsx`,
    });
  }, []);

  const printServiceReport = useCallback(
    (task: Record<string, unknown>, asset: Record<string, unknown>, parts?: Record<string, unknown>[]) =>
      exportToPDF('service-report', {
        task,
        asset,
        parts,
        technician: user?.displayName,
        completedAt: new Date(),
      }),
    [user]
  );

  const exportAuditPack = useCallback(() => exportAuditPackXLSX(), []);

  return {
    exportXLSX,
    exportPDF,
    exportInventoryXLSX,
    exportTasksXLSX,
    exportAuditPack,
    printServiceReport,
  };
}
