import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminBatchPage, fieldClass } from '../admin/AdminBatchPage.jsx'
import { formatBillingMonth, formatTuitionAmount } from './tuitionFormat.js'
import { Check } from 'lucide-react'
import { EmptyState, Notice, Person, SkeletonRows, StatusPill, useToast } from '../../components/ui.jsx'
import { TuitionHistory } from './StudentTuition.jsx'
import { listRoster } from '../roster/rosterRepository.js'
import { formatScholarship, parseScholarship } from '../../lib/scholarship.js'
import {
  coveredStatus,
  feeNotSetStatus,
  generateMonthlyTuition,
  listMonthlyTuition,
  noAmountDueStatus,
  notGeneratedStatus,
  parseFee,
  paymentStatuses,
  saveTuition,
  tuitionStatuses,
} from './tuitionRepository.js'

const currentMonth = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka', dateStyle: 'short' }).format(new Date()).slice(0, 7)

const emptyByStatus = {
  Paid: 'No paid students for this batch and month.',
  Unpaid: 'No unpaid students for this batch and month.',
  [coveredStatus]: 'No students covered by scholarship for this batch and month.',
  [feeNotSetStatus]: 'No students with unset fees for this batch and month.',
  [noAmountDueStatus]: 'No students with zero fees due for this batch and month.',
  [notGeneratedStatus]: 'Every student in this batch has a record for this month.',
}

const statusTones = { Paid: 'ok', Unpaid: 'danger', [coveredStatus]: 'brand', [feeNotSetStatus]: 'warn' }

const filterStatuses = [...tuitionStatuses, notGeneratedStatus]

function effectiveStatus(record, scholarship, due) {
  if (!record) return notGeneratedStatus
  if (scholarship === 100) return coveredStatus
  if (due === null) return feeNotSetStatus
  if (due <= 0) return noAmountDueStatus
  return record.status
}

const initialScholarship = (record, student) => String(record?.scholarship ?? student.defaultScholarshipPercent ?? 0)

function amountDue(fee, scholarship) {
  if (scholarship === 100) return 0
  if (fee == null) return null
  // Matches the database: round(base_fee * (100 - scholarship) / 100, 2).
  return Math.round((fee * (100 - scholarship) / 100 + Number.EPSILON) * 100) / 100
}

function TuitionRow({ student, record, mode, onSaved }) {
  const [fee, setFee] = useState(record?.baseFee?.toFixed(2) ?? '')
  const [scholarshipText, setScholarshipText] = useState(() => initialScholarship(record, student))
  const [payment, setPayment] = useState(record?.payment ?? 'Unpaid')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFee(record?.baseFee?.toFixed(2) ?? '')
    setScholarshipText(initialScholarship(record, student))
    setPayment(record?.payment ?? 'Unpaid')
    setError('')
  }, [record, student])

  const parsed = parseFee(fee)
  const parsedScholarship = parseScholarship(scholarshipText)
  // While the typed scholarship is invalid, preview with the saved value.
  const scholarship = parsedScholarship.value ?? record?.scholarship ?? student.defaultScholarshipPercent ?? 0
  const due = amountDue(parsed.value, scholarship)
  const paymentDisabled = due == null || due <= 0
  const rowStatus = effectiveStatus(record, scholarship, due)
  const effectivePayment = paymentDisabled ? 'Unpaid' : payment
  const dirty = Boolean(record) && !parsed.error && !parsedScholarship.error && (
    (parsed.value ?? null) !== (record.baseFee ?? null) || scholarship !== record.scholarship || effectivePayment !== record.payment)

  function reset() {
    setFee(record?.baseFee?.toFixed(2) ?? '')
    setScholarshipText(initialScholarship(record, student))
    setPayment(record?.payment ?? 'Unpaid')
    setError('')
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && dirty) { event.preventDefault(); save() }
    if (event.key === 'Escape') reset()
  }

  async function save(nextPayment = payment) {
    if (!record) {
      setError('Generate this month before editing its record.')
      return
    }
    if (parsed.error || parsedScholarship.error) {
      setError(parsed.error || parsedScholarship.error)
      return
    }
    if (record.payment === 'Paid' && (parsed.value !== record.baseFee || scholarship !== record.scholarship) && !window.confirm('This record is already Paid. Change its fee or scholarship?')) {
      return
    }
    setSaving(true)
    setError('')
    try {
      // Nothing is payable when the fee is unset or fully waived, so the record cannot stay Paid.
      const savedPayment = paymentDisabled ? 'Unpaid' : nextPayment
      await saveTuition(record, { baseFee: parsed.value, scholarship, payment: savedPayment })
      onSaved(mode === 'payment'
        ? `${student.name} marked ${savedPayment.toLowerCase()}.`
        : `Tuition saved for ${student.name}.`)
    } catch (caught) {
      if (mode === 'payment') setPayment(record.payment)
      setError(caught.message || 'The tuition record could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr data-dirty={dirty || undefined} onKeyDown={onKeyDown}>
      <th scope="row">
        <Person name={student.name} sub={student.id + (student.note ? ', ' + student.note.toLowerCase() : '')} />
      </th>
      <td>
        {mode === 'payment' ? (
          record?.baseFee == null ? feeNotSetStatus : formatTuitionAmount(record.baseFee)
        ) : (
          <input
            aria-label={`Base fee for ${student.name}`}
            className={fieldClass + ' min-w-28'}
            type="number"
            min="0"
            step="0.01"
            disabled={!record}
            value={fee}
            onChange={event => { setFee(event.target.value); setError('') }}
          />
        )}
      </td>
      <td>
        {mode === 'payment' ? (
          formatScholarship(scholarship, '0%')
        ) : (
          <span className="inline-flex items-center gap-1">
            <input
              aria-label={`Scholarship percent for ${student.name}`}
              aria-invalid={Boolean(parsedScholarship.error)}
              className={fieldClass + ' w-24'}
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              disabled={!record}
              value={scholarshipText}
              onChange={event => { setScholarshipText(event.target.value); setError('') }}
            />
            <span aria-hidden="true">%</span>
          </span>
        )}
      </td>
      <td className="whitespace-nowrap font-semibold tabular-nums">
        {due === null ? feeNotSetStatus : formatTuitionAmount(due)}
      </td>
      <td>
        {record && !paymentDisabled && ['management', 'payment'].includes(mode) ? (
          <select
            aria-label={`Payment for ${student.name}`}
            className={fieldClass}
            value={payment}
            disabled={saving}
            onChange={event => {
              setPayment(event.target.value); setError('')
              // On the Payments page a change is the whole task, so it saves right away.
              if (mode === 'payment') save(event.target.value)
            }}
          >
            {paymentStatuses.map(value => <option key={value}>{value}</option>)}
          </select>
        ) : (
          <StatusPill status={rowStatus} />
        )}
      </td>
      <td className="w-px whitespace-nowrap">
        {mode === 'payment' ? (
          saving ? <span className="text-sm text-muted">Saving…</span> : null
        ) : dirty || saving ? (
          <span className="row-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!saving && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Undo</button>}
          </span>
        ) : record ? (
          <span className="saved-mark" title="No unsaved changes"><Check size={16} aria-hidden="true" /><span className="sr-only">Saved</span></span>
        ) : null}
        {error && <p role="alert" className="field-error max-w-xs whitespace-normal">{error}</p>}
      </td>
    </tr>
  )
}

function BatchTuition({ batchId, batch, students, month, onMonthChange, mode }) {
  const [state, setState] = useState({ records: [], loading: true, error: '' })
  const [notice, setNotice] = useState(null)
  const toast = useToast()
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState('All statuses')
  const [search, setSearch] = useState('')
  const [selectedStudentUuid, setSelectedStudentUuid] = useState('')
  // Every student (active and inactive), so records of students who were deactivated or moved
  // batch after billing still appear, and admins can open former students' ledgers.
  const [allStudents, setAllStudents] = useState([])
  const requestId = useRef(0)

  useEffect(() => {
    let active = true
    listRoster().then(list => { if (active) setAllStudents(list) }, () => {})
    return () => { active = false }
  }, [])

  async function load(nextNotice) {
    const id = ++requestId.current
    setState(current => ({ ...current, loading: true, error: '' }))
    if (nextNotice !== undefined) setNotice(nextNotice)
    try {
      const records = await listMonthlyTuition({ billingMonth: month, batchId })
      if (id === requestId.current) setState({ records, loading: false, error: '' })
    } catch {
      if (id === requestId.current) setState({ records: [], loading: false, error: 'Tuition records could not be loaded.' })
    }
  }

  useEffect(() => {
    if (mode !== 'ledger') load()
    return () => { requestId.current += 1 }
  }, [batchId, month, mode])

  const byStudent = useMemo(() => new Map(state.records.map(record => [record.studentUuid, record])), [state.records])

  const roster = useMemo(() => {
    const activeIds = new Set(students.map(student => student.uuid))
    const everyone = new Map(allStudents.map(student => [student.uuid, student]))
    const extras = state.records
      .filter(record => !activeIds.has(record.studentUuid))
      .map(record => {
        const known = everyone.get(record.studentUuid)
        const note = !known ? '' : !known.isActive ? 'Inactive' : known.batchId !== batchId ? 'Moved to ' + (known.batch ?? 'another batch') : ''
        return { ...(known ?? { uuid: record.studentUuid, id: '—', name: 'Unknown student' }), note }
      })
    return [...students, ...extras].map(student => {
      const record = byStudent.get(student.uuid)
      return { student, record, status: record?.status ?? notGeneratedStatus }
    })
  }, [students, allStudents, state.records, byStudent, batchId])

  const counts = useMemo(() => {
    const map = Object.fromEntries(filterStatuses.map(status => [status, 0]))
    for (const item of roster) {
      if (Object.hasOwn(map, item.status)) map[item.status] += 1
    }
    return map
  }, [roster])

  const query = search.trim().toLowerCase()
  const rows = useMemo(() => roster.filter(({ student, status }) =>
    (filter === 'All statuses' || status === filter) &&
    (!query || student.name.toLowerCase().includes(query) || student.id.toLowerCase().includes(query)),
  ), [roster, filter, query])

  function selectFilter(nextFilter) {
    setFilter(nextFilter)
    setNotice(null)
  }

  async function generate() {
    setGenerating(true)
    setNotice(null)
    try {
      const count = await generateMonthlyTuition(month, batchId)
      await load()
      toast(count ? `${count} tuition record${count === 1 ? '' : 's'} created for ${batch}.` : `Every ${batch} student already has a record for this month.`)
    } catch {
      setNotice({ message: 'Monthly tuition could not be generated.', error: true })
    } finally {
      setGenerating(false)
    }
  }

  const formerStudents = allStudents.filter(student => !student.isActive && student.batchId === batchId)
  const historyStudent = [...students, ...formerStudents].find(student => student.uuid === selectedStudentUuid)

  if (mode === 'ledger') {
    return (
      <section className="panel panel-body">
        <label className="label max-w-lg">
          Student
          <select className={fieldClass} value={selectedStudentUuid} onChange={event => setSelectedStudentUuid(event.target.value)}>
            <option value="">Select a student</option>
            {students.map(student => <option key={student.uuid} value={student.uuid}>{student.name} ({student.id})</option>)}
            {formerStudents.length > 0 && (
              <optgroup label="Former students">
                {formerStudents.map(student => <option key={student.uuid} value={student.uuid}>{student.name} ({student.id})</option>)}
              </optgroup>
            )}
          </select>
        </label>
        {historyStudent && <TuitionHistory studentUuid={historyStudent.uuid} />}
      </section>
    )
  }

  const ungeneratedMonth = !state.loading && !state.error && students.length > 0 && state.records.length === 0

  return (
    <>
      <section className="panel panel-body grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_minmax(0,1fr)_auto] lg:items-end" aria-label="Tuition filters">
        <label className="label">
          Billing month
          <input
            type="month"
            className={fieldClass}
            value={month}
            required
            onChange={event => {
              onMonthChange(event.target.value)
              selectFilter('All statuses')
            }}
          />
        </label>
        <label className="label">
          Search
          <input
            type="search"
            className={fieldClass}
            placeholder="Name or student ID"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <button type="button" className={'btn ' + (ungeneratedMonth ? 'btn-primary' : 'btn-secondary')} disabled={generating} onClick={generate}>
          {generating ? 'Generating…' : state.records.length ? 'Add missing students' : 'Generate tuition for this month'}
        </button>
      </section>

      {ungeneratedMonth && (
        <Notice tone="warn" className="mt-4">
          Tuition for {formatBillingMonth(month)} hasn’t been generated for the {batch} batch. Generate it to start recording fees and payments.
        </Notice>
      )}
      {notice && <Notice tone={notice.error ? 'error' : 'success'} className="mt-4">{notice.message}</Notice>}
      {state.error && <Notice tone="error" className="mt-4">{state.error}</Notice>}

      <section aria-label="Filter by status" className="stat-strip mt-4">
        {[...paymentStatuses, coveredStatus, feeNotSetStatus].map(status => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            className="stat"
            data-tone={statusTones[status]}
            onClick={() => selectFilter(filter === status ? 'All statuses' : status)}
          >
            <span className="stat-label">{status}</span>
            <span className="stat-value">{counts[status]}</span>
          </button>
        ))}
      </section>
      <p className="mt-2 text-sm text-muted">
        {filter === 'All statuses' ? 'Tap a number to show only those students.' : <>Showing {filter.toLowerCase()} only. <button type="button" className="text-brand underline" onClick={() => selectFilter('All statuses')}>Show everyone</button></>}
        {[noAmountDueStatus, notGeneratedStatus].filter(status => counts[status] > 0).map(status => ` ${status}: ${counts[status]}.`)}
      </p>

      <section className="panel mt-4" aria-label="Tuition roster">
        {state.loading && !state.records.length ? (
          <SkeletonRows rows={6} label="Loading tuition…" />
        ) : !roster.length ? (
          <EmptyState title="No students in this batch">Add students from the Students page.</EmptyState>
        ) : !rows.length ? (
          <EmptyState>{counts[filter] === 0 ? emptyByStatus[filter] : 'No students match your search.'}</EmptyState>
        ) : (
          <div className="table-scroll" role="region" tabIndex={0} aria-label="Tuition roster">
            <table className="data-table">
              <thead>
                <tr>
                  {['Student', 'Base fee', 'Scholarship', 'Amount due', 'Status', ''].map(label => (
                    <th key={label || 'action'} scope="col">{label || <span className="sr-only">Action</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student, record }) => (
                  <TuitionRow
                    key={`${month}:${student.uuid}`}
                    student={student}
                    record={record}
                    mode={mode}
                    onSaved={message => { toast(message); load() }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

const descriptions = {
  management: 'Generate each month’s tuition, then adjust fees, scholarships and payments for each student.',
  payment: 'Mark students as paid when they pay at the office.',
  scholarship: 'Set each student’s fee and scholarship for the month.',
  ledger: 'See the full tuition history for any student, including former students.',
}

export default function AdminTuition({ title = 'Monthly tuition', mode = 'management' }) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('month')
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested ?? '') ? requested : currentMonth()

  function changeMonth(nextMonth) {
    setParams(current => {
      const next = new URLSearchParams(current)
      if (nextMonth) next.set('month', nextMonth)
      else next.delete('month')
      return next
    }, { replace: true })
  }

  return (
    <AdminBatchPage title={title} description={descriptions[mode]}>
      {({ batchId, batch, students }) => (
        <BatchTuition
          key={`${batchId}-${mode}`}
          batchId={batchId}
          batch={batch}
          students={students}
          month={month}
          onMonthChange={changeMonth}
          mode={mode}
        />
      )}
    </AdminBatchPage>
  )
}
