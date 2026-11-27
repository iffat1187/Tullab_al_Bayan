import { formatBillingMonth } from './tuitionFormat.js'
import {
  coveredStatus, feeNotSetStatus, noAmountDueStatus, notGeneratedStatus, paymentStatuses,
} from './tuitionStatus.js'

export const reportPeriods = [
  { value: 'month', label: 'Selected billing month' },
  { value: 'range', label: 'Month range' },
  { value: 'all', label: 'All billing months' },
]

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '')

function withinPeriod(month, period, { month: selectedMonth, fromMonth, toMonth }) {
  if (!validMonth(month)) return false
  if (period === 'month') return month === selectedMonth
  if (period === 'range') return month >= fromMonth && month <= toMonth
  return true
}

function sumDue(rows) {
  return rows.reduce((total, row) => total + (typeof row.due === 'number' && Number.isFinite(row.due) ? row.due : 0), 0)
}

/**
 * Shapes the existing roster and tuition rows into one printable report.
 * Pure on purpose: the UI only handles fetching, filters and downloading.
 */
export function buildTuitionReport({
  period = 'month', month = '', fromMonth = '', toMonth = '', batchId = 'all',
  batches = [], students = [], records = [],
}) {
  const batchNames = new Map(batches.map(batch => [String(batch.id), batch.name]))
  const batchNameOrder = new Map(batches.map((batch, index) => [batch.name, index]))
  const studentByUuid = new Map(students.map(student => [student.uuid, student]))
  const recordByStudentMonth = new Map(records.map(record => [`${record.studentUuid}|${record.month}`, record]))
  const matchesBatch = id => batchId === 'all' || String(id) === String(batchId)

  function rowFor(student, record, billingMonth) {
    const batchIdForRow = student?.batchId ?? record?.batchId
    return {
      month: billingMonth,
      studentId: student?.id ?? '—',
      name: student?.name ?? 'Unknown student',
      batch: batchNames.get(String(batchIdForRow)) ?? student?.batch ?? '—',
      baseFee: record?.baseFee ?? null,
      scholarship: record?.scholarship ?? 0,
      due: record?.due ?? null,
      status: record?.status ?? notGeneratedStatus,
    }
  }

  let rows
  if (period === 'month') {
    const scopedRecords = records.filter(record => record.month === month && matchesBatch(record.batchId))
    const ids = new Set([
      ...students.filter(student => student.isActive && matchesBatch(student.batchId)).map(student => student.uuid),
      ...scopedRecords.map(record => record.studentUuid),
    ])
    rows = [...ids].map(uuid => {
      const student = studentByUuid.get(uuid)
      const record = recordByStudentMonth.get(`${uuid}|${month}`)
      if (!student && !record) return null
      return rowFor(student, record, month)
    }).filter(Boolean)
  } else {
    rows = records
      .filter(record => withinPeriod(record.month, period, { month, fromMonth, toMonth }) && matchesBatch(record.batchId))
      .map(record => rowFor(studentByUuid.get(record.studentUuid), record, record.month))
  }

  rows.sort((left, right) => {
    const byMonth = right.month.localeCompare(left.month)
    if (byMonth) return byMonth
    const byBatch = (batchNameOrder.get(left.batch) ?? 99) - (batchNameOrder.get(right.batch) ?? 99)
    if (byBatch) return byBatch
    return left.studentId.localeCompare(right.studentId, 'en', { numeric: true }) || left.name.localeCompare(right.name)
  })

  const statuses = [...paymentStatuses, coveredStatus, feeNotSetStatus, noAmountDueStatus, notGeneratedStatus]
  const statusCounts = Object.fromEntries(statuses.map(status => [status, rows.filter(row => row.status === status).length]))

  const title = period === 'all'
    ? 'Tuition Fee Report - All billing months'
    : period === 'range'
      ? `Tuition Fee Report - ${formatBillingMonth(fromMonth)} to ${formatBillingMonth(toMonth)}`
      : `Tuition Fee Report - ${formatBillingMonth(month)}`

  return {
    period,
    month,
    fromMonth,
    toMonth,
    batchId,
    title,
    periodLabel: period === 'all' ? 'All billing months'
      : period === 'range' ? `${formatBillingMonth(fromMonth)} to ${formatBillingMonth(toMonth)}`
        : formatBillingMonth(month),
    batchLabel: batchId === 'all' ? 'All batches' : batchNames.get(String(batchId)) ?? 'Selected batch',
    rows,
    summary: {
      rowCount: rows.length,
      studentCount: new Set(rows.map(row => row.studentId)).size,
      totalDue: sumDue(rows),
      paidAmount: sumDue(rows.filter(row => row.status === 'Paid')),
      unpaidAmount: sumDue(rows.filter(row => row.status === 'Unpaid')),
      statusCounts,
    },
  }
}
