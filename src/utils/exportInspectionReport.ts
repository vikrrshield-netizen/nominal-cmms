import type { InspectionLog, InspectionStats } from '../hooks/useInspections';

function formatDate(value: InspectionLog['completedAt']) {
  const date = value?.toDate?.();
  return date ? date.toLocaleDateString('cs-CZ') : '';
}

function statusLabel(status: InspectionLog['status']) {
  if (status === 'ok') return 'OK';
  if (status === 'defect') return 'Zavada';
  return 'Ceka';
}

function frequencyLabel(frequency: InspectionLog['frequency']) {
  if (frequency === 'daily') return 'Denne';
  if (frequency === 'weekly') return 'Tydne';
  if (frequency === 'quarterly') return 'Ctvrtletne';
  if (frequency === 'yearly') return 'Rocne';
  return 'Mesicne';
}

function monthLabel(month: string) {
  return new Date(`${month}-01`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}

function reportRows(logs: InspectionLog[]) {
  return logs
    .slice()
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
    .map((log) => ({
      Poradi: log.sortOrder ?? '',
      Budova: log.building || '',
      Patro: log.floor || '',
      Mistnost: log.roomName || '',
      Cislo: log.roomCode || '',
      Popis_kontroly: log.checkPoints || '',
      Interval: frequencyLabel(log.frequency),
      Stav: statusLabel(log.status),
      Zavada: log.defectNote || '',
      Pripominka: log.inspectionNote || '',
      Provedl: log.completedBy || '',
      Datum: formatDate(log.completedAt),
      Ukol_ID: log.taskId || '',
    }));
}

export async function exportInspectionXLSX(logs: InspectionLog[], stats: InspectionStats, month: string) {
  const XLSX = await import('xlsx');
  const { saveAs } = await import('file-saver');

  const wb = XLSX.utils.book_new();
  const rows = reportRows(logs);
  const defects = rows.filter((row) => row.Stav === 'Zavada');

  const info = [
    { Polozka: 'Kontrola', Hodnota: `Kontrola budovy - ${monthLabel(month)}` },
    { Polozka: 'Exportovano', Hodnota: new Date().toLocaleString('cs-CZ') },
    { Polozka: 'Celkem bodu', Hodnota: stats.total },
    { Polozka: 'OK', Hodnota: stats.ok },
    { Polozka: 'Zavady', Hodnota: stats.defect },
    { Polozka: 'Ceka', Hodnota: stats.pending },
    { Polozka: 'Hotovo %', Hodnota: `${stats.percentDone}%` },
  ];

  const infoWs = XLSX.utils.json_to_sheet(info);
  const allWs = XLSX.utils.json_to_sheet(rows);
  const defectWs = XLSX.utils.json_to_sheet(defects);

  allWs['!cols'] = [
    { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 28 }, { wch: 12 },
    { wch: 48 }, { wch: 14 }, { wch: 10 }, { wch: 42 }, { wch: 42 }, { wch: 20 }, { wch: 14 }, { wch: 24 },
  ];
  defectWs['!cols'] = allWs['!cols'];

  XLSX.utils.book_append_sheet(wb, infoWs, 'Info');
  XLSX.utils.book_append_sheet(wb, allWs, 'Kontrola');
  XLSX.utils.book_append_sheet(wb, defectWs, 'Zavady_a_ukoly');

  const filename = `NOMINAL_kontrola_budovy_${month}.xlsx`;
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), filename);
  return filename;
}

export async function exportInspectionPDF(logs: InspectionLog[], stats: InspectionStats, month: string) {
  const jsPDFModule = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const jsPDF = jsPDFModule.default;
  const autoTable = autoTableModule.default;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const title = `Kontrola budovy - ${monthLabel(month)}`;
  const rows = reportRows(logs);
  const defects = rows.filter((row) => row.Stav === 'Zavada');

  pdf.setFontSize(15);
  pdf.text(title, 14, 14);
  pdf.setFontSize(9);
  pdf.text(`Export: ${new Date().toLocaleString('cs-CZ')}`, 14, 21);
  pdf.text(`Celkem: ${stats.total} | OK: ${stats.ok} | Zavady: ${stats.defect} | Ceka: ${stats.pending} | Hotovo: ${stats.percentDone}%`, 14, 27);

  autoTable(pdf, {
    startY: 34,
    head: [['Budova', 'Patro', 'Mistnost', 'Cislo', 'Kontrola', 'Interval', 'Stav', 'Zavada', 'Pripominka', 'Provedl', 'Datum', 'Ukol']],
    body: rows.map((row) => [
      row.Budova,
      row.Patro,
      row.Mistnost,
      row.Cislo,
      row.Popis_kontroly,
      row.Interval,
      row.Stav,
      row.Zavada,
      row.Pripominka,
      row.Provedl,
      row.Datum,
      row.Ukol_ID,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: {
      2: { cellWidth: 28 },
      4: { cellWidth: 42 },
      7: { cellWidth: 34 },
      8: { cellWidth: 34 },
      11: { cellWidth: 20 },
    },
  });

  if (defects.length > 0) {
    pdf.addPage('a4', 'landscape');
    pdf.setFontSize(14);
    pdf.text(`Zavady a navazujici ukoly - ${monthLabel(month)}`, 14, 14);
    autoTable(pdf, {
      startY: 22,
      head: [['Mistnost', 'Cislo', 'Interval', 'Zavada', 'Pripominka', 'Provedl', 'Datum', 'Ukol ID']],
      body: defects.map((row) => [row.Mistnost, row.Cislo, row.Interval, row.Zavada, row.Pripominka, row.Provedl, row.Datum, row.Ukol_ID || 'nezalozen']),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [146, 64, 14] },
      columnStyles: { 3: { cellWidth: 80 }, 4: { cellWidth: 60 }, 7: { cellWidth: 30 } },
    });
  }

  const filename = `NOMINAL_kontrola_budovy_${month}.pdf`;
  pdf.save(filename);
  return filename;
}
