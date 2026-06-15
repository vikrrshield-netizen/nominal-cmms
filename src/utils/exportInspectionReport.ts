import { saveAs } from 'file-saver';
import type { InspectionLog, InspectionStats } from '../hooks/useInspections';

type ReportRow = {
  poradi: string | number;
  budova: string;
  patro: string;
  mistnost: string;
  cislo: string;
  kontrola: string;
  interval: string;
  stav: string;
  zavada: string;
  pripominka: string;
  provedl: string;
  datum: string;
  ukolId: string;
};

function asDate(value: InspectionLog['completedAt']): Date | null {
  const date = value?.toDate?.();
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value: InspectionLog['completedAt']): string {
  const date = asDate(value);
  return date ? date.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : '';
}

function statusLabel(status: InspectionLog['status']): string {
  if (status === 'ok') return 'OK';
  if (status === 'defect') return 'Závada';
  return 'Čeká';
}

function frequencyLabel(frequency: InspectionLog['frequency']): string {
  if (frequency === 'daily') return 'Denně';
  if (frequency === 'weekly') return 'Týdně';
  if (frequency === 'quarterly') return 'Čtvrtletně';
  if (frequency === 'yearly') return 'Ročně';
  return 'Měsíčně';
}

function monthLabel(month: string): string {
  return new Date(`${month}-01`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}

function reportRows(logs: InspectionLog[]): ReportRow[] {
  return logs
    .slice()
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map((log) => ({
      poradi: log.sortOrder ?? '',
      budova: log.building || '',
      patro: log.floor || '',
      mistnost: log.roomName || '',
      cislo: log.roomCode || '',
      kontrola: log.checkPoints || '',
      interval: frequencyLabel(log.frequency),
      stav: statusLabel(log.status),
      zavada: log.defectNote || '',
      pripominka: log.inspectionNote || '',
      provedl: log.completedBy || '',
      datum: formatDate(log.completedAt),
      ukolId: log.taskId || '',
    }));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openPrintWindow(title: string, html: string): void {
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) throw new Error('Tiskové okno bylo zablokováno prohlížečem.');
  win.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 11mm; }
    body { margin: 0; font-family: Arial, sans-serif; color: #1b2620; background: white; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #66756b; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0; }
    .box { border: 1px solid #d8d0c3; border-radius: 8px; padding: 8px; background: #fbf9f4; }
    .label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #66756b; }
    .value { font-size: 18px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #1a6b4f; color: white; text-align: left; padding: 6px; }
    td { border: 1px solid #d8d0c3; padding: 6px; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
    tr.defect td { background: #fff1f2; }
    tr.ok td { background: #f0fdf4; }
    .footer { margin-top: 10px; color: #66756b; font-size: 10px; }
  </style>
</head>
<body>
  ${html}
  <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`);
  win.document.close();
}

function styleHeader(row: import('exceljs').Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B4F' } };
}

function styleSheet(sheet: import('exceljs').Worksheet): void {
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

export async function exportInspectionXLSX(logs: InspectionLog[], stats: InspectionStats, month: string): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nominal CMMS';
  workbook.created = new Date();

  const rows = reportRows(logs);
  const defects = rows.filter((row) => row.stav === 'Závada');

  const infoSheet = workbook.addWorksheet('Info');
  infoSheet.addRows([
    ['Položka', 'Hodnota'],
    ['Kontrola', `Kontrola budovy - ${monthLabel(month)}`],
    ['Exportováno', new Date().toLocaleString('cs-CZ')],
    ['Celkem bodů', stats.total],
    ['OK', stats.ok],
    ['Závady', stats.defect],
    ['Čeká', stats.pending],
    ['Hotovo %', `${stats.percentDone}%`],
  ]);
  styleHeader(infoSheet.getRow(1));
  styleSheet(infoSheet);

  const allSheet = workbook.addWorksheet('Kontrola', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const headers = ['Pořadí', 'Budova', 'Patro', 'Místnost', 'Číslo', 'Popis kontroly', 'Interval', 'Stav', 'Závada', 'Připomínka', 'Provedl', 'Datum', 'Úkol ID'];
  allSheet.addRow(headers);
  rows.forEach((row) => allSheet.addRow([row.poradi, row.budova, row.patro, row.mistnost, row.cislo, row.kontrola, row.interval, row.stav, row.zavada, row.pripominka, row.provedl, row.datum, row.ukolId]));
  styleHeader(allSheet.getRow(1));
  styleSheet(allSheet);

  const defectSheet = workbook.addWorksheet('Závady a úkoly', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  defectSheet.addRow(headers);
  defects.forEach((row) => defectSheet.addRow([row.poradi, row.budova, row.patro, row.mistnost, row.cislo, row.kontrola, row.interval, row.stav, row.zavada, row.pripominka, row.provedl, row.datum, row.ukolId]));
  styleHeader(defectSheet.getRow(1));
  styleSheet(defectSheet);

  const filename = `NOMINAL_kontrola_budovy_${month}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}

export async function exportInspectionPDF(logs: InspectionLog[], stats: InspectionStats, month: string): Promise<string> {
  const title = `Kontrola budovy - ${monthLabel(month)}`;
  const rows = reportRows(logs);
  const tableRows = rows.map((row) => `
    <tr class="${row.stav === 'Závada' ? 'defect' : row.stav === 'OK' ? 'ok' : ''}">
      <td>${escapeHtml(row.budova)}</td>
      <td>${escapeHtml(row.patro)}</td>
      <td>${escapeHtml(row.mistnost)}</td>
      <td>${escapeHtml(row.cislo)}</td>
      <td>${escapeHtml(row.kontrola)}</td>
      <td>${escapeHtml(row.interval)}</td>
      <td>${escapeHtml(row.stav)}</td>
      <td>${escapeHtml(row.zavada)}</td>
      <td>${escapeHtml(row.pripominka)}</td>
      <td>${escapeHtml(row.provedl)}</td>
      <td>${escapeHtml(row.datum)}</td>
      <td>${escapeHtml(row.ukolId)}</td>
    </tr>
  `).join('');

  openPrintWindow(title, `
    <h1>${escapeHtml(title)}</h1>
    <div class="muted">Export: ${escapeHtml(new Date().toLocaleString('cs-CZ'))}</div>
    <div class="summary">
      <div class="box"><div class="label">Celkem</div><div class="value">${stats.total}</div></div>
      <div class="box"><div class="label">OK</div><div class="value">${stats.ok}</div></div>
      <div class="box"><div class="label">Závady</div><div class="value">${stats.defect}</div></div>
      <div class="box"><div class="label">Čeká</div><div class="value">${stats.pending}</div></div>
      <div class="box"><div class="label">Hotovo</div><div class="value">${stats.percentDone}%</div></div>
    </div>
    <table>
      <thead>
        <tr><th>Budova</th><th>Patro</th><th>Místnost</th><th>Číslo</th><th>Kontrola</th><th>Interval</th><th>Stav</th><th>Závada</th><th>Připomínka</th><th>Provedl</th><th>Datum</th><th>Úkol</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="footer">Nominal CMMS · ${escapeHtml(title)}</div>
  `);
  return `NOMINAL_kontrola_budovy_${month}.pdf`;
}
