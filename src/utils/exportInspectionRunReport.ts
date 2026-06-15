import { saveAs } from 'file-saver';
import type { InspectionRun, InspectionRunItem } from '../types/inspectionRun';

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDate(value: unknown): string {
  const date = asDate(value);
  return date
    ? date.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', hour12: false })
    : '';
}

function statusLabel(status: InspectionRunItem['status']): string {
  if (status === 'ok') return 'OK';
  if (status === 'defect') return 'Závada';
  return 'Čeká';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileBase(run: InspectionRun): string {
  return `NOMINAL_kontrola_${run.month}_${run.id.slice(0, 8)}`;
}

export async function exportInspectionRunXLSX(run: InspectionRun): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nominal CMMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Doklad kontroly', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'Doklad kontroly budovy';
  sheet.getCell('A1').font = { bold: true, size: 16 };

  sheet.addRow(['Měsíc', run.month, 'Stav', run.status === 'closed' ? 'Uzavřeno' : 'Rozpracováno', 'Zahájil', run.startedByName, 'Uzavřel', run.closedByName || '']);
  sheet.addRow(['Zahájeno', formatDate(run.startedAt), 'Uzavřeno', formatDate(run.closedAt), 'OK', run.summary?.ok || 0, 'Závady', run.summary?.defect || 0]);
  sheet.addRow([]);
  sheet.addRow(['Budova', 'Patro', 'Místnost', 'Bod kontroly', 'Stav', 'Poznámka/závada', 'Provedl', 'Čas']);

  const header = sheet.getRow(5);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B4F' } };

  for (const item of run.items || []) {
    sheet.addRow([
      item.building,
      item.floor,
      item.roomName || item.roomCode,
      item.checkPoints,
      statusLabel(item.status),
      item.defectNote || item.inspectionNote || '',
      item.completedBy,
      formatDate(item.completedAt),
    ]);
  }

  sheet.columns.forEach((column) => {
    let max = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length + 2);
    });
    column.width = Math.min(max, 42);
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

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(run)}.xlsx`);
}

export function exportInspectionRunPDF(run: InspectionRun): void {
  const rows = (run.items || []).map((item) => `
    <tr class="${item.status}">
      <td>${escapeHtml(item.building)}</td>
      <td>${escapeHtml(item.floor)}</td>
      <td>${escapeHtml(item.roomName || item.roomCode)}</td>
      <td>${escapeHtml(item.checkPoints)}</td>
      <td>${escapeHtml(statusLabel(item.status))}</td>
      <td>${escapeHtml(item.defectNote || item.inspectionNote || '')}</td>
      <td>${escapeHtml(item.completedBy)}</td>
      <td>${escapeHtml(formatDate(item.completedAt))}</td>
    </tr>
  `).join('');

  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) throw new Error('Print window blocked');
  win.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>Doklad kontroly ${escapeHtml(run.month)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #1b2620; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .box { border: 1px solid #d8d0c3; border-radius: 8px; padding: 8px; background: #fbf9f4; }
    .label { color: #66756b; font-size: 11px; text-transform: uppercase; font-weight: 700; }
    .value { font-size: 16px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1a6b4f; color: white; text-align: left; padding: 7px; }
    td { border: 1px solid #d8d0c3; padding: 7px; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
    tr.defect td { background: #fff1f2; }
    tr.ok td { background: #f0fdf4; }
    .footer { margin-top: 10px; color: #66756b; font-size: 10px; }
  </style>
</head>
<body>
  <h1>Doklad kontroly budovy</h1>
  <div>${escapeHtml(run.month)} · ${escapeHtml(run.status === 'closed' ? 'Uzavřeno' : 'Rozpracováno')}</div>
  <div class="meta">
    <div class="box"><div class="label">Zahájeno</div><div class="value">${escapeHtml(formatDate(run.startedAt))}</div></div>
    <div class="box"><div class="label">Uzavřeno</div><div class="value">${escapeHtml(formatDate(run.closedAt) || '—')}</div></div>
    <div class="box"><div class="label">Provedl</div><div class="value">${escapeHtml(run.closedByName || run.startedByName)}</div></div>
    <div class="box"><div class="label">Výsledek</div><div class="value">${run.summary?.ok || 0} OK / ${run.summary?.defect || 0} závad</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Budova</th><th>Patro</th><th>Místnost</th><th>Bod</th><th>Stav</th><th>Poznámka / závada</th><th>Provedl</th><th>Čas</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Nominal CMMS · ID kontroly: ${escapeHtml(run.id)}</div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}
