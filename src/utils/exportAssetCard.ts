// src/utils/exportAssetCard.ts
// VIKRR — Asset Shield — PDF & Excel export pro Rodný list (AssetCardPage)
//
// Obě funkce používají dynamický import (code splitting).
// PDF: jsPDF + jspdf-autotable
// Excel: SheetJS (xlsx) + file-saver

import type { Asset, AssetEvent } from '../types/asset';
import { ASSET_STATUS_CONFIG, CRITICALITY_CONFIG } from '../types/asset';

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function formatDateCZ(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateFile(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ _-]/g, '').substring(0, 40);
}

function getEventStatusLabel(evt: AssetEvent): string {
  const today = new Date().toISOString().split('T')[0];
  if (evt.nextDate) {
    return evt.nextDate <= today ? 'Nesplněno' : 'Naplánováno';
  }
  if (evt.lastDate) return 'Splněno';
  return '—';
}

// ═══════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════

export async function exportAssetCardPDF(asset: Asset): Promise<string> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Colors
  const blue = [30, 64, 175] as const;       // #1e40af
  const darkText = [30, 41, 59] as const;    // #1e293b
  const lightGray = [148, 163, 184] as const; // #94a3b8

  // ── Header ──
  doc.setFontSize(18);
  doc.setTextColor(...blue);
  doc.text('VIKRR Asset Shield', margin, y + 6);

  doc.setFontSize(10);
  doc.setTextColor(...lightGray);
  doc.text(`Exportováno: ${formatDateCZ(new Date().toISOString())}`, pageWidth - margin, y + 3, { align: 'right' });
  doc.text('Rodný list zařízení', pageWidth - margin, y + 8, { align: 'right' });

  y += 12;
  doc.setDrawColor(...blue);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Asset title ──
  doc.setFontSize(14);
  doc.setTextColor(...darkText);
  doc.text(asset.name, margin, y + 5);
  y += 8;

  if (asset.code) {
    doc.setFontSize(10);
    doc.setTextColor(...lightGray);
    doc.text(`Kód: ${asset.code}`, margin, y + 3);
    y += 6;
  }

  y += 4;

  // ── Section helper ──
  function sectionTitle(title: string) {
    if (y > 265) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.setTextColor(...blue);
    doc.text(title, margin, y + 4);
    y += 3;
    doc.setDrawColor(226, 232, 240); // #e2e8f0
    doc.setLineWidth(0.3);
    doc.line(margin, y + 2, pageWidth - margin, y + 2);
    y += 6;
  }

  // ── Sekce 1: Identifikace ──
  sectionTitle('1 — Identifikace');
  const statusLabel = ASSET_STATUS_CONFIG[asset.status]?.label ?? asset.status;
  const critLabel = CRITICALITY_CONFIG[asset.criticality]?.label ?? asset.criticality;

  (doc as any).autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { textColor: [30, 41, 59], fontSize: 10 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    head: [['Pole', 'Hodnota']],
    body: [
      ['Název', asset.name],
      ['Kód', asset.code || '—'],
      ['Typ entity', asset.entityType || '—'],
      ['Stav', statusLabel],
      ['Kritičnost', critLabel],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Sekce 2: Technický list ──
  sectionTitle('2 — Technický list');
  (doc as any).autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { textColor: [30, 41, 59], fontSize: 10 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    head: [['Pole', 'Hodnota']],
    body: [
      ['Výrobce', asset.manufacturer || '—'],
      ['Model', asset.model || '—'],
      ['Sériové číslo', asset.serialNumber || '—'],
      ['Rok výroby', asset.year ? String(asset.year) : '—'],
      ['Lokace', asset.location || '—'],
      ['MTH počítadlo', asset.mthCounter != null ? String(asset.mthCounter) : '—'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Sekce 3: Události ──
  const events = asset.events || [];
  sectionTitle(`3 — Události (${events.length})`);

  if (events.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...lightGray);
    doc.text('Žádné události', margin, y + 3);
    y += 8;
  } else {
    const sortedEvents = [...events].sort((a, b) => {
      const aD = a.nextDate || a.lastDate || '';
      const bD = b.nextDate || b.lastDate || '';
      return bD.localeCompare(aD);
    });

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [30, 41, 59], fontSize: 9 },
      head: [['Název', 'Typ', 'Frekvence', 'Poslední', 'Příští', 'Status']],
      body: sortedEvents.map((evt) => [
        evt.name,
        evt.eventType || '—',
        evt.frequencyDays ? `${evt.frequencyDays} dní` : '—',
        formatDateCZ(evt.lastDate),
        formatDateCZ(evt.nextDate),
        getEventStatusLabel(evt),
      ]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Sekce 4: Historie oprav ──
  const repairLog = asset.repairLog || [];
  sectionTitle(`4 — Historie oprav (${repairLog.length})`);

  if (repairLog.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...lightGray);
    doc.text('Žádné záznamy', margin, y + 3);
    y += 8;
  } else {
    const sortedLog = [...repairLog].sort((a, b) => b.date.localeCompare(a.date));
    const totalCost = repairLog.reduce((sum, e) => sum + (e.cost || 0), 0);

    const bodyRows: string[][] = sortedLog.map((entry) => [
      formatDateCZ(entry.date),
      entry.description,
      entry.technicianName || '—',
      entry.parts?.join(', ') || '—',
      entry.cost != null ? `${entry.cost.toLocaleString('cs-CZ')} Kč` : '—',
    ]);

    // Sum row
    bodyRows.push(['', '', '', 'Celkem:', `${totalCost.toLocaleString('cs-CZ')} Kč`]);

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [30, 41, 59], fontSize: 9 },
      head: [['Datum', 'Popis', 'Technik', 'Díly', 'Náklady']],
      body: bodyRows,
      didParseCell: (data: any) => {
        // Bold last row (sum)
        if (data.row.index === bodyRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Sekce 5: Dokumenty ──
  const documents = asset.documents || [];
  sectionTitle(`5 — Dokumenty (${documents.length})`);

  if (documents.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...lightGray);
    doc.text('Žádné dokumenty', margin, y + 3);
    y += 8;
  } else {
    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { textColor: [30, 41, 59], fontSize: 9 },
      head: [['#', 'URL / Odkaz']],
      body: documents.map((url, i) => [String(i + 1), url]),
      columnStyles: { 0: { cellWidth: 12 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Footer na každé stránce ──
  const totalPages = doc.getNumberOfPages();
  const footerText = `VIKRR Asset Shield — Automaticky generovaný dokument — ${formatDateCZ(new Date().toISOString())}`;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...lightGray);
    doc.text(footerText, pageWidth / 2, 290, { align: 'center' });
    doc.text(`${i} / ${totalPages}`, pageWidth - margin, 290, { align: 'right' });
  }

  // ── Save ──
  const filename = `RL_${safeName(asset.name)}_${formatDateFile()}.pdf`;
  doc.save(filename);
  return filename;
}

// ═══════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════

export async function exportAssetCardXLSX(asset: Asset): Promise<string> {
  const XLSX = await import('xlsx');
  const { saveAs } = await import('file-saver');

  const wb = XLSX.utils.book_new();

  // Helper: auto-fit column widths
  function autoFit(ws: any, data: any[][]) {
    const colWidths = data[0].map((_: any, colIdx: number) => ({
      wch: Math.max(
        ...data.map((row) => String(row[colIdx] ?? '').length)
      ) + 2,
    }));
    ws['!cols'] = colWidths;
  }

  // ── Sheet 1: Identifikace ──
  const statusLabel = ASSET_STATUS_CONFIG[asset.status]?.label ?? asset.status;
  const critLabel = CRITICALITY_CONFIG[asset.criticality]?.label ?? asset.criticality;
  const identRows = [
    ['Pole', 'Hodnota'],
    ['Název', asset.name],
    ['Kód', asset.code || ''],
    ['Typ entity', asset.entityType || ''],
    ['Stav', statusLabel],
    ['Kritičnost', critLabel],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(identRows);
  autoFit(ws1, identRows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Identifikace');

  // ── Sheet 2: Technický list ──
  const techRows = [
    ['Pole', 'Hodnota'],
    ['Výrobce', asset.manufacturer || ''],
    ['Model', asset.model || ''],
    ['Sériové číslo', asset.serialNumber || ''],
    ['Rok výroby', asset.year ?? ''],
    ['Lokace', asset.location || ''],
    ['MTH počítadlo', asset.mthCounter ?? ''],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(techRows);
  autoFit(ws2, techRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Technický list');

  // ── Sheet 3: Události ──
  const events = asset.events || [];
  const eventRows: (string | number)[][] = [
    ['Název', 'Typ', 'Frekvence (dní)', 'Poslední', 'Příští', 'Status'],
  ];
  const sortedEvents = [...events].sort((a, b) => {
    const aD = a.nextDate || a.lastDate || '';
    const bD = b.nextDate || b.lastDate || '';
    return bD.localeCompare(aD);
  });
  for (const evt of sortedEvents) {
    eventRows.push([
      evt.name,
      evt.eventType || '',
      evt.frequencyDays ?? '',
      formatDateCZ(evt.lastDate),
      formatDateCZ(evt.nextDate),
      getEventStatusLabel(evt),
    ]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(eventRows);
  autoFit(ws3, eventRows);
  XLSX.utils.book_append_sheet(wb, ws3, 'Události');

  // ── Sheet 4: Historie oprav ──
  const repairLog = asset.repairLog || [];
  const repairRows: (string | number)[][] = [
    ['Datum', 'Popis', 'Technik', 'Díly', 'Náklady (Kč)'],
  ];
  const sortedLog = [...repairLog].sort((a, b) => b.date.localeCompare(a.date));
  let totalCost = 0;
  for (const entry of sortedLog) {
    totalCost += entry.cost || 0;
    repairRows.push([
      formatDateCZ(entry.date),
      entry.description,
      entry.technicianName || '',
      entry.parts?.join(', ') || '',
      entry.cost ?? '',
    ]);
  }
  // Sum row
  repairRows.push(['', '', '', 'Celkem:', totalCost]);
  const ws4 = XLSX.utils.aoa_to_sheet(repairRows);
  autoFit(ws4, repairRows);
  XLSX.utils.book_append_sheet(wb, ws4, 'Historie oprav');

  // ── Sheet 5: Dokumenty ──
  const documents = asset.documents || [];
  const docRows: (string | number)[][] = [['#', 'URL / Odkaz']];
  documents.forEach((url, i) => docRows.push([i + 1, url]));
  if (documents.length === 0) {
    docRows.push(['', 'Žádné dokumenty']);
  }
  const ws5 = XLSX.utils.aoa_to_sheet(docRows);
  autoFit(ws5, docRows);
  XLSX.utils.book_append_sheet(wb, ws5, 'Dokumenty');

  // ── Sheet 6: Info ──
  const infoRows = [
    ['Položka', 'Hodnota'],
    ['Zařízení', asset.name],
    ['Exportováno', new Date().toLocaleString('cs-CZ')],
    ['Systém', 'VIKRR Asset Shield v2.0'],
    ['Počet událostí', events.length],
    ['Počet oprav', repairLog.length],
    ['Celkové náklady', `${totalCost.toLocaleString('cs-CZ')} Kč`],
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(infoRows);
  autoFit(ws6, infoRows);
  XLSX.utils.book_append_sheet(wb, ws6, 'Info');

  // ── Save ──
  const filename = `RL_${safeName(asset.name)}_${formatDateFile()}.xlsx`;
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), filename);
  return filename;
}
