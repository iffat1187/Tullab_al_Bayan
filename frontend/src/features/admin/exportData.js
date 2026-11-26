import { strToU8, zipSync } from 'fflate'

const columns = {
  batches: 'id, name, day_of_week, display_order, class_time, venue',
  students: 'id, student_code, full_name, email, batch_id, batch_name, default_monthly_fee, default_scholarship_percent, is_active, enrolled_at, batch_assigned_at, deactivated_at',
  attendance_sessions: 'id, batch_id, batch_name, class_date, class_type, session_no, created_at',
  attendance_marks: 'session_id, class_date, class_type, batch_name, student_id, student_code, student_name, status, marked_at, updated_at',
  monthly_tuition: 'id, student_id, student_code, student_name, batch_id, batch_name, billing_month, base_fee, scholarship_percent, amount_due, payment_status, display_status, paid_at, notes, updated_at',
  homework_assignments: 'id, batch_id, batch_name, title, instructions, deadline, published_at, updated_at',
}

const derivedColumns = new Set(['batch_name', 'student_name'])
const dhakaClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
})

function dhakaOffset(date) {
  const zone = dhakaClock.formatToParts(date).find(part => part.type === 'timeZoneName').value
  return zone === 'GMT' ? '+00:00' : zone.slice(3)
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function endOfPeriod(date, nextMonth = false) {
  const next = new Date(date + 'T00:00:00Z')
  if (nextMonth) next.setUTCMonth(next.getUTCMonth() + 1)
  else next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().split('T')[0]
}

function dhakaMidnight(date) {
  const time = date + 'T00:00:00'
  return time + dhakaOffset(new Date(time + 'Z'))
}

export function exportFilter(scope, { month, from, to }) {
  if (scope === 'complete') return { scope, value: null }

  if (scope === 'billing_month') {
    if (!validDate(month + '-01')) throw new Error('Choose a valid billing month.')
    from = month + '-01'
  } else if (scope !== 'date_range' || !validDate(from) || !validDate(to) || from > to) {
    throw new Error('Choose valid start and end dates in order.')
  }

  const until = scope === 'billing_month' ? endOfPeriod(from, true) : endOfPeriod(to)
  return {
    scope,
    value: scope === 'billing_month' ? month : { from_date: from, to_date: to },
    from, until,
    homeworkFrom: dhakaMidnight(from),
    homeworkUntil: dhakaMidnight(until),
    tuitionFrom: from.slice(0, 7) + '-01',
    tuitionTo: (scope === 'billing_month' ? month : to.slice(0, 7)) + '-01',
  }
}

async function pageRows(client, table, filter = query => query) {
  const keys = table === 'attendance_marks' ? ['session_id', 'student_id'] : ['id']
  const select = table === 'attendance_marks'
    ? 'session_id, student_id, status, marked_at, updated_at'
    : columns[table].split(', ').filter(column => !derivedColumns.has(column) &&
      !(table === 'monthly_tuition' && column === 'student_code')).join(', ')
  const rows = []
  for (;;) {
    const ordered = keys.reduce((query, key) => query.order(key), client.from(table).select(select))
    const { data, error } = await filter(ordered).range(rows.length, rows.length + 499)
    if (error) throw error
    if (!data.length) return rows
    rows.push(...data)
  }
}

async function relatedRows(client, table, column, ids) {
  const unique = [...new Set(ids)]
  const rows = []
  // Chunk IN filters to limit request URL size, then paginate each chunk.
  for (let index = 0; index < unique.length; index += 100) {
    rows.push(...await pageRows(client, table, query => query.in(column, unique.slice(index, index + 100))))
  }
  return rows
}

export async function fetchExportRows(client, filter) {
  const { data: role, error } = await client.rpc('current_user_role')
  if (error) throw error
  if (role !== 'admin') throw new Error('Only Admin accounts can export institute data.')

  const { scope, from, until, homeworkFrom, homeworkUntil, tuitionFrom, tuitionTo } = filter
  if (scope === 'complete') {
    const entries = await Promise.all(Object.keys(columns).map(async table => [table, await pageRows(client, table)]))
    return Object.fromEntries(entries)
  }

  const [sessions, tuition, homework] = await Promise.all([
    pageRows(client, 'attendance_sessions', query => query.gte('class_date', from).lt('class_date', until)),
    pageRows(client, 'monthly_tuition', query => query.gte('billing_month', tuitionFrom).lte('billing_month', tuitionTo)),
    pageRows(client, 'homework_assignments', query => query.gte('published_at', homeworkFrom).lt('published_at', homeworkUntil)),
  ])
  const marks = await relatedRows(client, 'attendance_marks', 'session_id', sessions.map(row => row.id))
  const students = await relatedRows(client, 'students', 'id', [...marks, ...tuition].map(row => row.student_id))
  const batches = await relatedRows(client, 'batches', 'id', [...sessions, ...tuition, ...homework, ...students].map(row => row.batch_id))

  return {
    batches, students, attendance_sessions: sessions, attendance_marks: marks,
    monthly_tuition: tuition, homework_assignments: homework,
  }
}

function csvValue(value) {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}

export function buildExportArchive(rows, filter, email, now = new Date()) {
  const byId = table => new Map(rows[table].map(row => [row.id, row]))
  const batches = byId('batches')
  const students = byId('students')
  const sessions = byId('attendance_sessions')
  const formatRow = (table, row) => {
    const session = table === 'attendance_marks' ? sessions.get(row.session_id) : null
    const student = row.student_id ? students.get(row.student_id) : null
    const batchId = session?.batch_id ?? row.batch_id
    const batch = batchId == null ? null : batches.get(batchId)
    if ((row.session_id && !session) || (row.student_id && !student) || (batchId != null && !batch)) {
      throw new Error('A referenced record was unavailable. Try exporting again.')
    }
    return {
      ...row,
      batch_name: batch?.name,
      student_code: student?.student_code ?? row.student_code,
      student_name: student?.full_name,
      class_date: session?.class_date ?? row.class_date,
      class_type: session?.class_type ?? row.class_type,
    }
  }

  const files = {}
  const counts = {}
  for (const [table, header] of Object.entries(columns)) {
    const fields = header.split(', ')
    const lines = rows[table].map(row => {
      const values = formatRow(table, row)
      return fields.map(field => csvValue(values[field])).join(',')
    })
    files[table + '.csv'] = strToU8('\uFEFF' + [fields.join(','), ...lines].join('\r\n') + '\r\n')
    counts[table] = lines.length
  }

  const parts = Object.fromEntries(dhakaClock.formatToParts(now).map(part => [part.type, part.value]))
  const date = [parts.year, parts.month, parts.day].join('-')
  files['manifest.json'] = strToU8(JSON.stringify({
    exported_at_dhaka: date + 'T' + [parts.hour, parts.minute, parts.second].join(':') + dhakaOffset(now),
    exported_by_email: email,
    scope: filter.scope,
    filter_value: filter.value,
    schema_version: 1,
    row_counts: counts,
  }, null, 2))
  return { bytes: zipSync(files), filename: 'al-bayan-export-' + date + '.zip' }
}
