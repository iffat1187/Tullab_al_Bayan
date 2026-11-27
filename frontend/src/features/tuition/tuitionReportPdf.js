import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatTuitionAmount } from './tuitionFormat.js'

// jsPDF's core fonts are Latin-only, so keep every drawn string ASCII-safe.
function label(value) {
  return String(value ?? '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
}

function amount(value) {
  return value == null ? '-' : label(formatTuitionAmount(value))
}

function slug(value) {
  return label(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'
}

function dhakaStamp(now, withTime) {
  const parts = { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }
  if (withTime) Object.assign(parts, { hour: '2-digit', minute: '2-digit', hour12: false })
  return new Intl.DateTimeFormat('sv-SE', parts).format(now) + ' Dhaka'
}

/** Builds and downloads the tuition fee PDF from an already-filtered report. */
export function downloadTuitionReportPdf(report, { email = '', now = new Date() } = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const { rowCount, studentCount, totalDue, paidAmount, unpaidAmount } = report.summary

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(24, 37, 34)
  doc.setFontSize(17)
  doc.text('Al Bayan Institute', 14, 16)
  doc.setFontSize(12)
  doc.text(label(report.title), 14, 24)
  doc.setFontSize(9)
  doc.setTextColor(85, 95, 92)
  doc.text([
    label(report.batchLabel),
    label(report.periodLabel),
    'Generated ' + dhakaStamp(now, true) + (email ? ' by ' + label(email) : ''),
  ], 14, 31, { lineHeightFactor: 1.35 })

  doc.setFontSize(8.5)
  doc.setTextColor(24, 37, 34)
  doc.text(label([
    `${rowCount} row${rowCount === 1 ? '' : 's'}`,
    `${studentCount} student${studentCount === 1 ? '' : 's'}`,
    'Total due ' + amount(totalDue),
    'Paid ' + amount(paidAmount),
    'Unpaid ' + amount(unpaidAmount),
  ].join('  |  ')), 14, 46)

  autoTable(doc, {
    startY: 51,
    head: [['Student ID', 'Name', 'Batch', 'Month', 'Base fee', 'Scholarship', 'Amount due', 'Status']],
    body: report.rows.map(row => [
      label(row.studentId),
      label(row.name),
      label(row.batch),
      label(row.month),
      amount(row.baseFee),
      label(`${row.scholarship}%`),
      amount(row.due),
      label(row.status),
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 214, 212], lineWidth: 0.1, overflow: 'linebreak' },
    headStyles: { fillColor: [27, 94, 79], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 247] },
    // Let autoTable fit the columns to the page; fixed widths overflow once cell padding is added.
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14, top: 14, bottom: 16 },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.setTextColor(110, 118, 115)
      doc.text('Al Bayan Institute - Tuition Fee Report', 14, pageHeight - 8)
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
    },
  })

  const scope = report.period === 'month'
    ? report.month
    : report.period === 'range' ? `${report.fromMonth}-to-${report.toMonth}` : 'all-months'
  const date = dhakaStamp(now, false).slice(0, 10)
  doc.save(`al-bayan-tuition-${slug(scope)}-${slug(report.batchLabel)}-${date}.pdf`)
}
