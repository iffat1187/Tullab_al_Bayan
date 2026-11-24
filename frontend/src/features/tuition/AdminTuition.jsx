import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminBatchPage, buttonClass, fieldClass } from '../admin/AdminBatchPage.jsx'
import { formatTuitionAmount } from './tuitionFormat.js'
import { TuitionHistory } from './StudentTuition.jsx'
import { listRoster } from '../roster/rosterRepository.js'
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
  scholarships,
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

const filterStatuses = [...tuitionStatuses, notGeneratedStatus]

function effectiveStatus(record, scholarship, due) {
  if (!record) return notGeneratedStatus
  if (scholarship === 100) return coveredStatus
  if (due === null) return feeNotSetStatus
  if (due <= 0) return noAmountDueStatus
  return record.status
}

function TuitionRow({ student, record, mode, onSaved }) {
  const [fee, setFee] = useState(record?.baseFee?.toFixed(2) ?? '')
  const [scholarship, setScholarship] = useState(record?.scholarship ?? student.defaultScholarshipPercent ?? 0)
  const [payment, setPayment] = useState(record?.payment ?? 'Unpaid')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFee(record?.baseFee?.toFixed(2) ?? '')
    setScholarship(record?.scholarship ?? student.defaultScholarshipPercent ?? 0)
    setPayment(record?.payment ?? 'Unpaid')
    setError('')
  }, [record, student])

  const parsed = parseFee(fee)
  const due = scholarship === 100 ? 0 : parsed.value == null ? null : Math.round(parsed.value * (100 - scholarship)) / 100
  const paymentDisabled = due == null || due <= 0
  const rowStatus = effectiveStatus(record, scholarship, due)

  async function save() {
    if (!record) {
      setError('Generate this month before editing its record.')
      return
    }
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    if (record.payment === 'Paid' && (parsed.value !== record.baseFee || scholarship !== record.scholarship) && !window.confirm('This record is already Paid. Change its fee or scholarship?')) {
      return
    }
    setSaving(true)
    setError('')
    try {
      // Nothing is payable when the fee is unset or fully waived, so the record cannot stay Paid.
      await saveTuition(record, { baseFee: parsed.value, scholarship, payment: paymentDisabled ? 'Unpaid' : payment })
      onSaved(student.name)
    } catch (caught) {
      setError(caught.message || 'The tuition record could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <th scope="row" className="bg-transparent">
        <strong className="block">{student.name}</strong>
        <span className="text-xs font-normal text-slate-600">{student.id}{student.note ? ' · ' + student.note : ''}</span>
      </th>
      <td>
        {mode === 'payment' ? (
          record?.baseFee == null ? feeNotSetStatus : formatTuitionAmount(record.baseFee)
        ) : (
          <input
            aria-label={`Base fee for ${student.name}`}
            className={fieldClass + ' min-w-32'}
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
          `${scholarship}%`
        ) : (
          <select
            aria-label={`Scholarship for ${student.name}`}
            className={fieldClass}
            disabled={!record}
            value={scholarship}
            onChange={event => { setScholarship(Number(event.target.value)); setError('') }}
          >
            {scholarships.map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
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
            onChange={event => { setPayment(event.target.value); setError('') }}
          >
            {paymentStatuses.map(value => <option key={value}>{value}</option>)}
          </select>
        ) : (
          <span className="inline-block rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-900">
            {rowStatus}
          </span>
        )}
      </td>
      <td>
        <button type="button" className={buttonClass} disabled={!record || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error && <p role="alert" className="mt-1 max-w-xs text-xs text-red-800">{error}</p>}
      </td>
    </tr>
  )
}

function BatchTuition({ batchId, batch, students, month, onMonthChange, mode }) {
  const [state, setState] = useState({ records: [], loading: true, error: '' })
  const [notice, setNotice] = useState(null)
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
      await load({
        message: `${count} tuition record${count === 1 ? '' : 's'} generated for ${batch}.`,
        error: false,
      })
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
      <section className="mt-5 rounded-2xl border border-surface-border bg-surface p-5">
        <label className="block max-w-lg font-semibold">
          Student
          <select className={fieldClass + ' mt-1'} value={selectedStudentUuid} onChange={event => setSelectedStudentUuid(event.target.value)}>
            <option value="">Select a student</option>
            {students.map(student => <option key={student.uuid} value={student.uuid}>{student.name} · {student.id}</option>)}
            {formerStudents.length > 0 && (
              <optgroup label="Former students">
                {formerStudents.map(student => <option key={student.uuid} value={student.uuid}>{student.name} · {student.id}</option>)}
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
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="block min-w-0 text-sm font-semibold">
          Billing month
          <input
            type="month"
            className={fieldClass + ' mt-1'}
            value={month}
            required
            onChange={event => {
              onMonthChange(event.target.value)
              selectFilter('All statuses')
            }}
          />
        </label>
        <label className="block text-sm font-semibold">
          Filter by payment status
          <select className={fieldClass + ' mt-1'} value={filter} onChange={event => selectFilter(event.target.value)}>
            {['All statuses', ...filterStatuses].map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="block min-w-0 text-sm font-semibold">
          Search roster
          <input
            type="search"
            className={fieldClass + ' mt-1'}
            placeholder="Name or student ID"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
      </div>

      {mode === 'management' && (
        <p className="mt-4 text-sm text-slate-600">Payment status tracks payments received outside the portal.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={generating} onClick={generate}>
          {generating ? 'Generating…' : 'Generate Monthly Tuition'}
        </button>
        {ungeneratedMonth && (
          <p role="status" className="text-sm font-medium text-amber-900">
            Month not generated yet — generate monthly tuition to enable edits.
          </p>
        )}
      </div>

      <section aria-label="Batch payment summary" className="mt-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[...paymentStatuses, coveredStatus, feeNotSetStatus].map(status => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              className="interactive-card rounded-xl border border-surface-border bg-field px-3 py-2 text-left aria-pressed:border-sky-700 aria-pressed:bg-sky-100 aria-pressed:ring-1 aria-pressed:ring-sky-700"
              onClick={() => selectFilter(status)}
            >
              <span className="block text-sm font-semibold text-slate-700">{status}</span>
              <span className="block text-xl font-bold tabular-nums">{counts[status]}</span>
            </button>
          ))}
        </div>
        {[noAmountDueStatus, notGeneratedStatus].filter(status => counts[status] > 0).map(status => (
          <p key={status} className="mt-2 text-sm text-slate-600">{status} · {counts[status]}</p>
        ))}
        {filter !== 'All statuses' && (
          <button
            type="button"
            className="mt-3 rounded-lg border border-field-border px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-sky-100"
            onClick={() => selectFilter('All statuses')}
          >
            Clear filter
          </button>
        )}
      </section>

      {notice && (
        <p className={'mt-4 text-sm ' + (notice.error ? 'text-red-800' : 'text-blue-900')} role={notice.error ? 'alert' : 'status'}>
          {notice.message}
        </p>
      )}
      {state.error && <p role="alert" className="mt-3 text-red-800">{state.error}</p>}

      {state.loading ? (
        <p className="mt-4">Loading tuition…</p>
      ) : !roster.length ? (
        <p className="mt-5 text-slate-600">No students in this batch yet.</p>
      ) : !rows.length ? (
        <p className="mt-5 text-slate-600" role="status">
          {counts[filter] === 0 ? emptyByStatus[filter] : 'No students match your search and payment filter.'}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto" role="region" tabIndex={0} aria-label="Tuition roster">
          <table className="min-w-full">
            <thead>
              <tr>
                {['Student', 'Base fee', 'Scholarship', 'Amount due', 'Payment status', 'Action'].map(label => (
                  <th key={label} scope="col">{label}</th>
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
                  onSaved={studentName => load({ message: `Tuition updated for ${studentName}.`, error: false })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function AdminTuition({ title = 'Tuition Management', mode = 'management' }) {
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
    <AdminBatchPage title={title} workspaceLabel="Admin dashboard">
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
