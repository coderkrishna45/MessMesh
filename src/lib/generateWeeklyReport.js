/**
 * Client-side Weekly Report PDF generator for Warden Dashboard.
 * Uses jsPDF + jspdf-autotable for professional multi-section layout.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
  emerald: [16, 185, 129],
  terracotta: [249, 115, 22],
  amber: [245, 158, 11],
  dark: [12, 13, 14],
  card: [22, 24, 27],
  border: [40, 42, 45],
  white: [255, 255, 255],
  muted: [148, 163, 184],
  text: [30, 30, 30],
  lightBg: [248, 250, 252],
  rowAlt: [241, 245, 249],
  successBg: [236, 253, 245],
  dangerBg: [254, 242, 242],
};

function riskColor(level) {
  if (level === 'HIGH') return COLORS.terracotta;
  if (level === 'LOW') return COLORS.emerald;
  return COLORS.amber;
}

/**
 * @param {object} reportData - Payload from /api/admin/stats (+ optional warden meta)
 * @param {{ wardenName?: string, wardenWing?: string }} meta
 */
export function generateWeeklyReportPDF(reportData, meta = {}) {
  const {
    stats = {},
    wingScores = [],
    wingWaste = [],
    dailyHistory = [],
    topDishes = [],
    bottomDishes = [],
    wasteTrend = {},
    forecast = {},
    weekRange = {},
  } = reportData;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const weekLabel = weekRange.label || 'Current Week';
  const generatedAt = new Date().toLocaleString();
  const wardenLine = [meta.wardenName, meta.wardenWing].filter(Boolean).join(' · ') || 'Warden';

  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 36, 'F');

  doc.setFillColor(...COLORS.emerald);
  doc.rect(0, 36, pageWidth, 1.5, 'F');

  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('MessMesh', margin, 14);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.emerald);
  doc.text('Weekly Performance Report', margin, 22);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Week: ${weekLabel}`, margin, 30);
  doc.text(`Prepared for: ${wardenLine}`, pageWidth - margin, 14, { align: 'right' });
  doc.text(`Generated: ${generatedAt}`, pageWidth - margin, 22, { align: 'right' });
  if (weekRange.currentDate) {
    doc.text(
      `Sim date: ${weekRange.dayOfWeekName || ''} ${weekRange.currentDate}`,
      pageWidth - margin,
      30,
      { align: 'right' }
    );
  }

  let y = 46;

  const kpis = [
    { label: 'Students', value: String(stats.totalStudents ?? 0) },
    { label: 'Active Votes', value: String(stats.totalVotes ?? 0) },
    { label: 'Waste Logs', value: String(stats.totalLogs ?? 0) },
    { label: 'Hostel Avg Score', value: `${stats.avgScore ?? 100}/100` },
  ];

  const kpiW = contentWidth / kpis.length;
  kpis.forEach((kpi, i) => {
    const x = margin + i * kpiW;
    doc.setFillColor(...COLORS.lightBg);
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(x + 1, y, kpiW - 2, 16, 2, 2, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), x + 4, y + 5.5);
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + 4, y + 12.5);
  });

  y += 24;

  // Adds a page break when remaining vertical space is tight
  const sectionTitle = (title) => {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...COLORS.emerald);
    doc.rect(margin, y, 2.5, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.text);
    doc.text(title, margin + 5, y + 4.5);
    y += 10;
  };

  sectionTitle('Wing-wise Leaderboard & Average Scores');

  const leaderboardBody = (wingScores.length > 0 ? wingScores : []).map((w, idx) => {
    const waste = wingWaste.find((ww) => ww.wing === w.wing);
    const feast = (w.avgScore ?? 0) >= 90 ? 'Unlocked' : 'Locked';
    return [
      String(idx + 1),
      w.wing,
      `${w.avgScore ?? 0}/100`,
      String(w.studentCount ?? '—'),
      waste ? String(waste.avgWaste) : '—',
      feast,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Rank', 'Wing', 'Avg Clean Plate', 'Students', 'Avg Waste', 'Sunday Feast']],
    body:
      leaderboardBody.length > 0
        ? leaderboardBody
        : [['—', 'No wing data', '—', '—', '—', '—']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.dark,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: { fontSize: 8, textColor: COLORS.text, halign: 'center' },
    alternateRowStyles: { fillColor: COLORS.rowAlt },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { halign: 'left', fontStyle: 'bold' },
      5: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const v = String(data.cell.raw || '');
        if (v === 'Unlocked') {
          data.cell.styles.textColor = COLORS.emerald;
          data.cell.styles.fillColor = COLORS.successBg;
        } else if (v === 'Locked') {
          data.cell.styles.textColor = COLORS.terracotta;
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 12;

  sectionTitle('Top 5 Dishes (by Taste Rating)');

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Dish', 'Category', 'Avg Rating', 'Reviews']],
    body:
      topDishes.length > 0
        ? topDishes.map((d, i) => [
            String(i + 1),
            d.name,
            d.category || '—',
            `${d.avgRating?.toFixed?.(2) ?? d.avgRating}/5`,
            String(d.ratingCount ?? 0),
          ])
        : [['—', 'No ratings yet', '—', '—', '—']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.emerald,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.successBg },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { fontStyle: 'bold' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  sectionTitle('Bottom 5 Dishes (by Taste Rating)');

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Dish', 'Category', 'Avg Rating', 'Reviews']],
    body:
      bottomDishes.length > 0
        ? bottomDishes.map((d, i) => [
            String(i + 1),
            d.name,
            d.category || '—',
            `${d.avgRating?.toFixed?.(2) ?? d.avgRating}/5`,
            String(d.ratingCount ?? 0),
          ])
        : [['—', 'No ratings yet', '—', '—', '—']],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.terracotta,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.dangerBg },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { fontStyle: 'bold' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
  });

  y = doc.lastAutoTable.finalY + 12;

  if (y > pageHeight - 80) {
    doc.addPage();
    y = 20;
  }
  sectionTitle('Waste Trend Summary');

  const peak = wasteTrend.peakDay;
  const best = wasteTrend.bestDay;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Metric', 'Value']],
    body: [
      ['Week average waste index (1–5)', String(wasteTrend.weekAvgWaste ?? stats.avgWasteIndex ?? '—')],
      ['Days tracked this period', String(wasteTrend.daysTracked ?? dailyHistory.length ?? 0)],
      ['Total plate audits (period)', String(wasteTrend.totalWeekLogs ?? '—')],
      [
        'Highest waste day',
        peak ? `${peak.dayLabel || peak.date} · ${peak.avgWaste}` : '—',
      ],
      [
        'Cleanest day',
        best ? `${best.dayLabel || best.date} · ${best.avgWaste}` : '—',
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.dark,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { fontStyle: 'normal' },
    },
    alternateRowStyles: { fillColor: COLORS.rowAlt },
  });

  y = doc.lastAutoTable.finalY + 8;

  if (dailyHistory.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Day', 'Avg Waste', 'Logs']],
      body: dailyHistory.map((d) => [
        d.date,
        d.dayLabel,
        String(d.avgWaste),
        String(d.logCount),
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      bodyStyles: { fontSize: 8, textColor: COLORS.text, halign: 'center' },
    });
    y = doc.lastAutoTable.finalY + 12;
  } else {
    y += 4;
  }

  if (y > pageHeight - 55) {
    doc.addPage();
    y = 20;
  }
  sectionTitle("Prophet Next-Week / Tomorrow Prediction");

  const risk = forecast.riskLevel || 'MODERATE';
  const rc = riskColor(risk);

  doc.setFillColor(...COLORS.lightBg);
  doc.setDrawColor(...rc);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('PREDICTED WASTE INDEX', margin + 4, y + 7);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text(String(forecast.tomorrowForecast ?? '—'), margin + 4, y + 17);

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Scale 1–5  ·  Confidence ${forecast.confidenceInterval || '±0.25'}`,
    margin + 4,
    y + 23
  );

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rc);
  doc.text(`Risk: ${risk}`, margin + 55, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.text);
  const rec = doc.splitTextToSize(
    forecast.recommendation || 'No forecast recommendation available.',
    contentWidth - 60
  );
  doc.text(rec, margin + 55, y + 16);

  y += 36;

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'normal');
    doc.text('MessMesh · Smart Mess Management · Confidential hostel report', margin, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  const fileName = `MessMesh_Weekly_Report_${(weekRange.start || 'week').replace(/-/g, '')}.pdf`;
  doc.save(fileName);
  return fileName;
}
