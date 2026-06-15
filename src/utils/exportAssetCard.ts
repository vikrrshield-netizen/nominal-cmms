import { saveAs } from 'file-saver';
import type { Row, Worksheet } from 'exceljs';
import type { Asset, AssetEvent } from '../types/asset';
import { ASSET_STATUS_CONFIG, CRITICALITY_CONFIG } from '../types/asset';
import appConfig from '../appConfig';

type TableRow = Array<string | number>;

function formatDateCZ(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateFile(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N} _-]/gu, '').substring(0, 40) || 'asset';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getEventStatusLabel(evt: AssetEvent): string {
  const today = new Date().toISOString().slice(0, 10);
  if (evt.nextDate) return evt.nextDate <= today ? 'Nesplněno' : 'Naplánováno';
  if (evt.lastDate) return 'Splněno';
  return '—';
}

function identRows(asset: Asset): TableRow[] {
  const statusLabel = ASSET_STATUS_CONFIG[asset.status]?.label ?? asset.status;
  const critLabel = CRITICALITY_CONFIG[asset.criticality]?.label ?? asset.criticality;
  return [
    ['Pole', 'Hodnota'],
    ['Název', asset.name],
    ['Kód', asset.code || '—'],
    ['Typ entity', asset.entityType || asset.category || '—'],
    ['Stav', statusLabel],
    ['Kritičnost', critLabel],
    ['Budova', asset.buildingId || '—'],
    ['Patro', asset.floor || '—'],
    ['Umístění', asset.location || asset.areaName || '—'],
  ];
}

function technicalRows(asset: Asset): TableRow[] {
  return [
    ['Pole', 'Hodnota'],
    ['Výrobce', asset.manufacturer || '—'],
    ['Model', asset.model || '—'],
    ['Sériové číslo', asset.serialNumber || '—'],
    ['Rok výroby', asset.year ?? '—'],
    ['MTH počítadlo', asset.mthCounter ?? '—'],
    ['KM počítadlo', asset.kmCounter ?? '—'],
    ['Poslední servis', formatDateCZ(asset.lastService)],
    ['Příští servis', formatDateCZ(asset.nextService)],
  ];
}

function eventRows(asset: Asset): TableRow[] {
  const rows: TableRow[] = [['Název', 'Typ', 'Frekvence', 'Poslední', 'Příští', 'Status']];
  [...(asset.events || [])]
    .sort((a, b) => (b.nextDate || b.lastDate || '').localeCompare(a.nextDate || a.lastDate || ''))
    .forEach((evt) => rows.push([
      evt.name,
      evt.eventType || '—',
      evt.frequencyDays ? `${evt.frequencyDays} dní` : '—',
      formatDateCZ(evt.lastDate),
      formatDateCZ(evt.nextDate),
      getEventStatusLabel(evt),
    ]));
  return rows;
}

function repairRows(asset: Asset): TableRow[] {
  const rows: TableRow[] = [['Datum', 'Popis', 'Technik', 'Díly', 'Náklady']];
  let total = 0;
  [...(asset.repairLog || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((entry) => {
      total += entry.cost || 0;
      rows.push([
        formatDateCZ(entry.date),
        entry.description,
        entry.technicianName || '—',
        entry.parts?.join(', ') || '—',
        entry.cost != null ? entry.cost : '—',
      ]);
    });
  rows.push(['', '', '', 'Celkem', total]);
  return rows;
}

function documentRows(asset: Asset): TableRow[] {
  const rows: TableRow[] = [['#', 'URL / odkaz']];
  const docs = asset.documents || [];
  if (!docs.length) rows.push(['', 'Žádné dokumenty']);
  docs.forEach((url, index) => rows.push([index + 1, url]));
  return rows;
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
    column.width = Math.min(max, 46);
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

function addSheet(workbook: import('exceljs').Workbook, name: string, rows: TableRow[]): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.addRows(rows);
  styleHeader(sheet.getRow(1));
  styleSheet(sheet);
}

function tableHtml(rows: TableRow[]): string {
  const [header, ...body] = rows;
  return `<table>
    <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

export async function exportAssetCardPDF(asset: Asset): Promise<string> {
  const filename = `RL_${safeName(asset.name)}_${formatDateFile()}.pdf`;
  const win = window.open('', '_blank', 'width=1000,height=900');
  if (!win) throw new Error('Tiskové okno bylo zablokováno prohlížečem.');

  win.document.write(`<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>Rodný list - ${escapeHtml(asset.name)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; font-family: Arial, sans-serif; color: #1b2620; background: #fff; }
    h1 { margin: 0; font-size: 24px; }
    h2 { margin: 18px 0 8px; font-size: 15px; color: #1a6b4f; }
    .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1a6b4f; padding-bottom: 10px; margin-bottom: 12px; }
    .meta { color: #66756b; font-size: 12px; text-align: right; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1a6b4f; color: #fff; text-align: left; padding: 7px; }
    td { border: 1px solid #d8d0c3; padding: 7px; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
    .footer { margin-top: 14px; color: #66756b; font-size: 10px; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Rodný list zařízení</h1>
      <div>${escapeHtml(asset.name)}${asset.code ? ` · ${escapeHtml(asset.code)}` : ''}</div>
    </div>
    <div class="meta">
      <div>${escapeHtml(appConfig.APP_NAME)}</div>
      <div>Export: ${escapeHtml(new Date().toLocaleString('cs-CZ'))}</div>
    </div>
  </div>
  <h2>Identifikace</h2>${tableHtml(identRows(asset))}
  <h2>Technický list</h2>${tableHtml(technicalRows(asset))}
  <h2>Události</h2>${tableHtml(eventRows(asset))}
  <h2>Historie oprav</h2>${tableHtml(repairRows(asset))}
  <h2>Dokumenty</h2>${tableHtml(documentRows(asset))}
  <div class="footer">${escapeHtml(appConfig.APP_NAME)} · automaticky generovaný dokument</div>
  <script>window.onload = () => setTimeout(() => window.print(), 150);</script>
</body>
</html>`);
  win.document.close();
  return filename;
}

export async function exportAssetCardXLSX(asset: Asset): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = appConfig.APP_NAME;
  workbook.created = new Date();

  addSheet(workbook, 'Identifikace', identRows(asset));
  addSheet(workbook, 'Technický list', technicalRows(asset));
  addSheet(workbook, 'Události', eventRows(asset));
  addSheet(workbook, 'Historie oprav', repairRows(asset));
  addSheet(workbook, 'Dokumenty', documentRows(asset));
  addSheet(workbook, 'Info', [
    ['Položka', 'Hodnota'],
    ['Zařízení', asset.name],
    ['Exportováno', new Date().toLocaleString('cs-CZ')],
    ['Systém', `${appConfig.APP_NAME} ${appConfig.VERSION}`],
    ['Počet událostí', asset.events?.length || 0],
    ['Počet oprav', asset.repairLog?.length || 0],
  ]);

  const filename = `RL_${safeName(asset.name)}_${formatDateFile()}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}
