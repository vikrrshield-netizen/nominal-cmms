// src/hooks/useReports.ts
// NOMINAL CMMS — Export do XLSX a PDF (přímo v prohlížeči)
//
// Závislosti (npm install):
//   npm install xlsx file-saver @react-pdf/renderer
//   npm install -D @types/file-saver
//
// Použití:
//   const { exportXLSX, exportPDF } = useReports();
//   exportXLSX('inventory', items);
//   exportPDF('service-report', { task, asset, parts });

import { useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

// ═══════════════════════════════════════════
// XLSX EXPORT (pomocí SheetJS)
// ═══════════════════════════════════════════

type ExportType =
  | 'inventory'        // Skladové zásoby
  | 'tasks'            // Seznam úkolů/oprav
  | 'transactions'     // Pohyby na skladu
  | 'revisions'        // Revize a kalibrace
  | 'fleet'            // Vozový park
  | 'audit';           // Audit log

interface ExportOptions {
  filename?: string;
  dateFrom?: Date;
  dateTo?: Date;
  filters?: Record<string, any>;
}

async function exportToXLSX(
  type: ExportType,
  data: Record<string, any>[],
  options?: ExportOptions
) {
  // Dynamický import (code splitting — nenačítá se dokud není potřeba)
  const XLSX = await import('xlsx');
  const { saveAs } = await import('file-saver');

  // Transformace dat na ploché řádky
  const rows = data.map((item) => flattenForExport(item, type));

  // Vytvoř worksheet
  const ws = XLSX.utils.json_to_sheet(rows);

  // Šířky sloupců (auto-fit)
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(
      key.length,
      ...rows.map((r) => String(r[key] || '').length)
    ) + 2,
  }));
  ws['!cols'] = colWidths;

  // Vytvoř workbook
  const wb = XLSX.utils.book_new();
  const sheetName = SHEET_NAMES[type] || 'Data';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Metadata sheet
  const metaWs = XLSX.utils.json_to_sheet([
    { Položka: 'Exportováno', Hodnota: new Date().toLocaleString('cs-CZ') },
    { Položka: 'Typ', Hodnota: sheetName },
    { Položka: 'Počet záznamů', Hodnota: rows.length },
    { Položka: 'Systém', Hodnota: 'NOMINAL CMMS v1.0' },
  ]);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info');

  // Export
  const filename = options?.filename || `NOMINAL_${type}_${formatDateFile(new Date())}.xlsx`;
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), filename);

  return filename;
}

// ═══════════════════════════════════════════
// PDF EXPORT (HTML→Print)
// ═══════════════════════════════════════════

type PDFTemplate =
  | 'service-report'      // Servisní list (po dokončení opravy)
  | 'handover-protocol'   // Předávací protokol
  | 'revision-report'     // Revizní zpráva
  | 'inventory-report'    // Stav skladu
  | 'task-summary';       // Přehled úkolů za období

/**
 * Generuje PDF přes print dialog (window.print).
 * Jednodušší než @react-pdf/renderer, funguje okamžitě,
 * uživatel si vybere tiskárnu nebo "Uložit jako PDF".
 */
async function exportToPDF(
  template: PDFTemplate,
  data: Record<string, any>
) {
  const html = generatePDFHTML(template, data);

  // Otevři nové okno s HTML
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    throw new Error('Pop-up zablokován prohlížečem');
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Počkej na načtení a spusť print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };
}

// ═══════════════════════════════════════════
// PDF HTML TEMPLATES
// ═══════════════════════════════════════════

function generatePDFHTML(template: PDFTemplate, data: Record<string, any>): string {
  const css = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #1e293b; padding: 20mm; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #1e40af; }
      .header h1 { font-size: 16pt; color: #1e40af; }
      .header .meta { text-align: right; font-size: 9pt; color: #64748b; }
      .section { margin: 15px 0; }
      .section h2 { font-size: 12pt; color: #1e40af; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 9pt; border: 1px solid #e2e8f0; }
      td { padding: 6px 8px; font-size: 10pt; border: 1px solid #e2e8f0; }
      .signature { margin-top: 40px; display: flex; justify-content: space-between; }
      .signature div { width: 200px; text-align: center; padding-top: 40px; border-top: 1px solid #1e293b; font-size: 9pt; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: bold; }
      .badge-red { background: #fef2f2; color: #dc2626; }
      .badge-green { background: #f0fdf4; color: #16a34a; }
      .badge-yellow { background: #fefce8; color: #ca8a04; }
      .footer { position: fixed; bottom: 10mm; left: 20mm; right: 20mm; text-align: center; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 5px; }
      @media print { body { padding: 15mm; } .footer { position: fixed; } }
    </style>
  `;

  switch (template) {
    case 'service-report':
      return serviceReportHTML(data, css);
    case 'handover-protocol':
      return handoverProtocolHTML(data, css);
    case 'revision-report':
      return revisionReportHTML(data, css);
    case 'inventory-report':
      return inventoryReportHTML(data, css);
    case 'task-summary':
      return taskSummaryHTML(data, css);
    default:
      return `<html><body>${css}<p>Neznámý template: ${template}</p></body></html>`;
  }
}

// ─────────────────────────────────────────
// SERVISNÍ LIST
// ─────────────────────────────────────────
function serviceReportHTML(data: Record<string, any>, css: string): string {
  const { task, asset, parts = [], technician, completedAt } = data;
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">${css}</head><body>
    <div class="header">
      <div><h1>Servisní list</h1><p>NOMINAL s.r.o. — Kozlov 68, 594 51</p></div>
      <div class="meta">
        <div>Č. dokumentu: SL-${task?.id?.slice(0, 8) || 'XXX'}</div>
        <div>Datum: ${formatDateCZ(completedAt || new Date())}</div>
        <div>NOMINAL CMMS</div>
      </div>
    </div>

    <div class="section">
      <h2>Zařízení</h2>
      <table>
        <tr><th style="width:150px">Název</th><td>${asset?.name || '—'}</td></tr>
        <tr><th>Kód</th><td>${asset?.code || '—'}</td></tr>
        <tr><th>Lokace</th><td>${asset?.areaName || ''}, ${asset?.buildingName || ''}</td></tr>
        <tr><th>Výrobce</th><td>${asset?.manufacturer || '—'}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Popis závady / práce</h2>
      <table>
        <tr><th style="width:150px">Úkol</th><td>${task?.title || '—'}</td></tr>
        <tr><th>Priorita</th><td><span class="badge ${task?.priority === 'P1' ? 'badge-red' : 'badge-yellow'}">${task?.priority || '—'}</span></td></tr>
        <tr><th>Popis</th><td>${task?.description || '—'}</td></tr>
        <tr><th>Řešení</th><td>${task?.resolution || '—'}</td></tr>
      </table>
    </div>

    ${parts.length > 0 ? `
    <div class="section">
      <h2>Spotřebovaný materiál</h2>
      <table>
        <tr><th>Název dílu</th><th>Množství</th></tr>
        ${parts.map((p: any) => `<tr><td>${p.partName}</td><td>${p.quantity} ks</td></tr>`).join('')}
      </table>
    </div>` : ''}

    <div class="section">
      <h2>Realizace</h2>
      <table>
        <tr><th style="width:150px">Technik</th><td>${technician || '—'}</td></tr>
        <tr><th>Dokončeno</th><td>${formatDateCZ(completedAt || new Date())}</td></tr>
      </table>
    </div>

    <div class="signature">
      <div>Provedl (technik)</div>
      <div>Převzal (vedení)</div>
    </div>

    <div class="footer">NOMINAL CMMS — Automaticky generovaný dokument — ${formatDateCZ(new Date())}</div>
  </body></html>`;
}

// ─────────────────────────────────────────
// PŘEDÁVACÍ PROTOKOL
// ─────────────────────────────────────────
function handoverProtocolHTML(data: Record<string, any>, css: string): string {
  const { asset, fromUser, toUser, notes, items = [] } = data;
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">${css}</head><body>
    <div class="header">
      <div><h1>Předávací protokol</h1><p>NOMINAL s.r.o.</p></div>
      <div class="meta"><div>Datum: ${formatDateCZ(new Date())}</div></div>
    </div>

    <div class="section">
      <h2>Předmět předání</h2>
      <table>
        <tr><th>Zařízení</th><td>${asset?.name || '—'}</td></tr>
        <tr><th>Předává</th><td>${fromUser || '—'}</td></tr>
        <tr><th>Přejímá</th><td>${toUser || '—'}</td></tr>
      </table>
    </div>

    ${items.length > 0 ? `
    <div class="section">
      <h2>Předávané položky</h2>
      <table>
        <tr><th>Položka</th><th>Stav</th></tr>
        ${items.map((i: any) => `<tr><td>${i.name}</td><td>${i.condition || 'OK'}</td></tr>`).join('')}
      </table>
    </div>` : ''}

    ${notes ? `<div class="section"><h2>Poznámky</h2><p>${notes}</p></div>` : ''}

    <div class="signature">
      <div>Předávající</div>
      <div>Přejímající</div>
    </div>

    <div class="footer">NOMINAL CMMS — ${formatDateCZ(new Date())}</div>
  </body></html>`;
}

// ─────────────────────────────────────────
// REVIZNÍ ZPRÁVA
// ─────────────────────────────────────────
function revisionReportHTML(data: Record<string, any>, css: string): string {
  const { revision, assets = [] } = data;
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">${css}</head><body>
    <div class="header">
      <div><h1>Revizní zpráva</h1><p>NOMINAL s.r.o.</p></div>
      <div class="meta"><div>Datum: ${formatDateCZ(new Date())}</div></div>
    </div>

    <div class="section">
      <h2>Detail revize</h2>
      <table>
        <tr><th style="width:150px">Název</th><td>${revision?.name || '—'}</td></tr>
        <tr><th>Kategorie</th><td>${revision?.category || '—'}</td></tr>
        <tr><th>Provedeno</th><td>${formatDateCZ(revision?.lastPerformedAt)}</td></tr>
        <tr><th>Příští termín</th><td>${formatDateCZ(revision?.nextDueAt)}</td></tr>
        <tr><th>Provedl</th><td>${revision?.performedBy || '—'}</td></tr>
      </table>
    </div>

    ${assets.length > 0 ? `
    <div class="section">
      <h2>Dotčená zařízení</h2>
      <table>
        <tr><th>Zařízení</th><th>Lokace</th></tr>
        ${assets.map((a: any) => `<tr><td>${a.name}</td><td>${a.areaName || ''}</td></tr>`).join('')}
      </table>
    </div>` : ''}

    <div class="signature">
      <div>Revizní technik</div>
      <div>Odpovědná osoba</div>
    </div>

    <div class="footer">NOMINAL CMMS — ${formatDateCZ(new Date())}</div>
  </body></html>`;
}

// ─────────────────────────────────────────
// STAV SKLADU
// ─────────────────────────────────────────
function inventoryReportHTML(data: Record<string, any>, css: string): string {
  const { items = [], generatedBy } = data;
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">${css}</head><body>
    <div class="header">
      <div><h1>Stav skladu</h1><p>NOMINAL s.r.o.</p></div>
      <div class="meta">
        <div>Datum: ${formatDateCZ(new Date())}</div>
        <div>Vytvořil: ${generatedBy || '—'}</div>
      </div>
    </div>

    <div class="section">
      <table>
        <tr><th>Kód</th><th>Název</th><th>Množství</th><th>Min.</th><th>Stav</th><th>Umístění</th></tr>
        ${items.map((i: any) => `
          <tr>
            <td>${i.code || ''}</td>
            <td>${i.name}</td>
            <td>${i.quantity} ${i.unit}</td>
            <td>${i.minQuantity}</td>
            <td><span class="badge ${i.status === 'ok' ? 'badge-green' : i.status === 'out' ? 'badge-red' : 'badge-yellow'}">${i.status}</span></td>
            <td>${i.location || ''}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="footer">NOMINAL CMMS — ${formatDateCZ(new Date())}</div>
  </body></html>`;
}

// ─────────────────────────────────────────
// PŘEHLED ÚKOLŮ
// ─────────────────────────────────────────
function taskSummaryHTML(data: Record<string, any>, css: string): string {
  const { tasks = [], dateFrom, dateTo, generatedBy } = data;
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">${css}</head><body>
    <div class="header">
      <div><h1>Přehled úkolů</h1><p>NOMINAL s.r.o.</p></div>
      <div class="meta">
        <div>Období: ${formatDateCZ(dateFrom)} – ${formatDateCZ(dateTo)}</div>
        <div>Vytvořil: ${generatedBy || '—'}</div>
      </div>
    </div>

    <div class="section">
      <table>
        <tr><th>Priorita</th><th>Úkol</th><th>Zařízení</th><th>Stav</th><th>Technik</th><th>Dokončeno</th></tr>
        ${tasks.map((t: any) => `
          <tr>
            <td><span class="badge ${t.priority === 'P1' ? 'badge-red' : 'badge-yellow'}">${t.priority}</span></td>
            <td>${t.title}</td>
            <td>${t.assetName || '—'}</td>
            <td>${t.status}</td>
            <td>${t.assignedToName || '—'}</td>
            <td>${t.completedAt ? formatDateCZ(t.completedAt) : '—'}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="footer">NOMINAL CMMS — ${formatDateCZ(new Date())}</div>
  </body></html>`;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const SHEET_NAMES: Record<string, string> = {
  inventory: 'Sklad',
  tasks: 'Úkoly',
  transactions: 'Pohyby skladu',
  revisions: 'Revize',
  fleet: 'Vozidla',
  audit: 'Audit log',
};

function formatDateCZ(d: any): string {
  if (!d) return '—';
  const date = d?.toDate ? d.toDate() : d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateFile(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function flattenForExport(item: Record<string, any>, _type: string): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, val] of Object.entries(item)) {
    // Přeskoč technická pole
    if (['isDeleted', 'id'].includes(key)) continue;

    // Timestamp → čitelný datum
    if (val && typeof val === 'object' && val.toDate) {
      result[key] = formatDateCZ(val);
    }
    // Pole → čárkou oddělený string
    else if (Array.isArray(val)) {
      result[key] = val.join(', ');
    }
    // Vnořený objekt → flatten
    else if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [subKey, subVal] of Object.entries(val)) {
        result[`${key}_${subKey}`] = subVal;
      }
    }
    // Primitivní hodnoty
    else {
      result[key] = val;
    }
  }

  return result;
}

// ═══════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════

export function useReports() {
  const { user } = useAuthContext();

  const exportXLSX = useCallback(
    (type: ExportType, data: Record<string, any>[], options?: ExportOptions) =>
      exportToXLSX(type, data, options),
    []
  );

  const exportPDF = useCallback(
    (template: PDFTemplate, data: Record<string, any>) =>
      exportToPDF(template, data),
    []
  );

  /**
   * Rychlý export skladu (načte z Firestore + stáhne XLSX)
   */
  const exportInventoryXLSX = useCallback(async () => {
    const snap = await getDocs(collection(db, 'inventory'));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((i: any) => !i.isDeleted);
    return exportToXLSX('inventory', items);
  }, []);

  /**
   * Rychlý export úkolů za období
   */
  const exportTasksXLSX = useCallback(async (dateFrom: Date, dateTo: Date) => {
    const q = query(
      collection(db, 'tasks'),
      where('createdAt', '>=', Timestamp.fromDate(dateFrom)),
      where('createdAt', '<=', Timestamp.fromDate(dateTo)),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((t: any) => !t.isDeleted);
    return exportToXLSX('tasks', tasks, {
      filename: `NOMINAL_ukoly_${formatDateFile(dateFrom)}_${formatDateFile(dateTo)}.xlsx`,
    });
  }, []);

  /**
   * Servisní list PDF (po dokončení úkolu)
   */
  const printServiceReport = useCallback(
    (task: any, asset: any, parts?: any[]) =>
      exportToPDF('service-report', {
        task,
        asset,
        parts,
        technician: user?.displayName,
        completedAt: new Date(),
      }),
    [user]
  );

  return {
    exportXLSX,
    exportPDF,
    exportInventoryXLSX,
    exportTasksXLSX,
    printServiceReport,
  };
}
