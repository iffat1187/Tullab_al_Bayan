import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LoadingState, Notice, PageHeader } from '../../components/ui.jsx'
import { listBatches, updateBatchClassDetails } from '../admin/batchRepository.js'
import './batchCalendar.css'
import { classDate } from './academicRepository.js'
import { monthDays, nextClassDate, scheduledClasses, shiftMonth } from './studentSchedule.js'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})

function ClassDetails({ assignment }) {
  return (
    <>
      <span className="block font-medium">In-person class</span>
      {assignment.time && <span className="block">{assignment.time}</span>}
      {assignment.venue && <span className="block">{assignment.venue}</span>}
    </>
  )
}

function BatchCalendar({ batch }) {
  const today = classDate()
  const currentMonth = today.slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const next = nextClassDate(batch, today)
  const classes = scheduledClasses(batch, month)
  const days = monthDays(month)
  const byDate = new Map(classes.map(item => [item.date, item]))
  const label = monthLabel.format(new Date(month + '-01T00:00:00Z'))
  const cells = [...Array(days[0].weekday).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  return (
    <>
      {next && (
        <Notice tone="info" className="mb-4">
          Next class: <time className="font-medium" dateTime={next}>{fullDate.format(new Date(next + 'T00:00:00Z'))}</time>
        </Notice>
      )}
      <section className="panel" aria-labelledby="calendar-month">
        <div className="panel-head">
          <h2 id="calendar-month" aria-live="polite">{label}</h2>
          <div className="flex gap-1">
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous month" onClick={() => setMonth(value => shiftMonth(value, -1))}><ChevronLeft size={17} /></button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonth(currentMonth)} disabled={month === currentMonth}>This month</button>
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Next month" onClick={() => setMonth(value => shiftMonth(value, 1))}><ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="hidden lg:block">
          <table className="calendar-grid" aria-label={label + ' schedule'}>
            <thead><tr>{weekdays.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
            <tbody>{weeks.map((week, index) => (
              <tr key={index}>{week.map((day, column) => {
                const assignment = day && byDate.get(day.date)
                return <td key={column} data-class-day={Boolean(assignment)} data-today={day?.date === today} data-past={Boolean(day && day.date < today)}>
                  {day && <time dateTime={day.date} aria-current={day.date === today ? 'date' : undefined}>{day.day}</time>}
                  {assignment && <div className="calendar-class"><ClassDetails assignment={assignment} /></div>}
                </td>
              })}</tr>
            ))}</tbody>
          </table>
        </div>
        <ol aria-label={label + ' class dates'} className="calendar-list lg:hidden">
          {classes.length ? classes.map(assignment => (
            <li key={assignment.date} data-today={assignment.date === today} data-past={assignment.date < today}>
              <time dateTime={assignment.date} aria-current={assignment.date === today ? 'date' : undefined}>{fullDate.format(new Date(assignment.date + 'T00:00:00Z'))}</time>
              <ClassDetails assignment={assignment} />
            </li>
          )) : <li className="text-muted">No classes this month.</li>}
        </ol>
      </section>
    </>
  )
}

function StudentCalendar({ account }) {
  const [state, setState] = useState({ batch: null, loading: true, error: '' })
  useEffect(() => {
    if (account.isActive === false || !account.batchId) return undefined
    let active = true
    listBatches().then(
      batches => { if (active) setState({ batch: batches.find(item => item.id === account.batchId) ?? null, loading: false, error: '' }) },
      () => { if (active) setState({ batch: null, loading: false, error: 'The class schedule could not be loaded. Refresh to try again.' }) },
    )
    return () => { active = false }
  }, [account.isActive, account.batchId])

  if (account.isActive === false) {
    return (
      <>
        <PageHeader title="Class calendar" />
        <Notice tone="warn">You're no longer enrolled, so there's no class schedule to show.</Notice>
      </>
    )
  }

  const { batch } = state
  return (
    <>
      <PageHeader title="Class calendar" description={batch ? `${batch.name} batch. Times are Dhaka time.` : undefined} />
      {!account.batchId ? <Notice tone="info">You haven't been placed in a batch yet.</Notice>
        : state.loading ? <LoadingState>Loading your schedule…</LoadingState>
          : state.error ? <Notice tone="error">{state.error}</Notice>
            : batch ? <BatchCalendar key={batch.id} batch={batch} />
              : <Notice tone="info">You haven't been placed in a batch yet.</Notice>}
    </>
  )
}

function ClassDetailsEditor({ batch, onSaved, onCancel }) {
  const [classTime, setClassTime] = useState(batch.classTime ?? '')
  const [venue, setVenue] = useState(batch.venue ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      onSaved(await updateBatchClassDetails(batch.id, { classTime, venue }))
    } catch {
      setError('Class details could not be saved. Please try again.')
      setSaving(false)
    }
  }

  return (
    <form className="panel mb-4" onSubmit={save} aria-labelledby="class-details-title">
      <div className="panel-head"><h2 id="class-details-title">Edit class details</h2></div>
      <div className="panel-body grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">Class time (Dhaka time)
            <input className="field" type="time" step="1" value={classTime} disabled={saving} onChange={event => setClassTime(event.target.value)} />
          </label>
          <label className="grid gap-1">Venue
            <input className="field" value={venue} disabled={saving} onChange={event => setVenue(event.target.value)} />
          </label>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  )
}

function StaffBatchCalendar({ role, batch, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  return <>
    {role === 'admin' && (editing
      ? <ClassDetailsEditor batch={batch} onCancel={() => setEditing(false)} onSaved={updated => {
        onSaved(updated)
        setEditing(false)
        setSaved(true)
      }} />
      : <button type="button" className="btn btn-secondary mb-4" onClick={() => { setSaved(false); setEditing(true) }}>Edit class details</button>)}
    {saved && <p role="status" className="mb-4">Class details saved.</p>}
    <BatchCalendar batch={batch} />
  </>
}

function StaffCalendar({ role }) {
  const [batches, setBatches] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const batch = batches?.find(item => item.id === selectedId)

  useEffect(() => {
    let active = true
    listBatches().then(
      result => { if (active) setBatches(result) },
      () => { if (active) setError('Batch calendars could not be loaded.') },
    )
    return () => { active = false }
  }, [attempt])

  function applySavedBatch(updated) {
    setBatches(current => current.map(item => item.id === updated.id ? updated : item))
  }

  return <>
    <PageHeader title={batch ? `${batch.name} batch calendar` : 'Class calendar'}
      description="Each batch meets once a week. Times are Dhaka time."
      actions={batch && <button type="button" className="btn btn-secondary" onClick={() => setSelectedId(null)}>Back to batches</button>} />
    {error ? <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => {
      setError('')
      setAttempt(value => value + 1)
    }}>Try again</button>}>{error}</Notice>
      : !batches ? <LoadingState>Loading batches…</LoadingState>
        : !batches.length ? <Notice tone="info">No batches are set up yet.</Notice>
          : !batch ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Choose a batch calendar">
            {batches.map(item => <button key={item.id} type="button" className="btn btn-secondary aspect-square w-full whitespace-normal"
              onClick={() => setSelectedId(item.id)}>{item.name} Batch</button>)}
          </div> : <StaffBatchCalendar key={batch.id} role={role} batch={batch} onSaved={applySavedBatch} />}
  </>
}

export default function AcademicCalendar() {
  const { role, account } = useOutletContext()
  if (role === 'student') return <StudentCalendar account={account} />
  return <StaffCalendar key={role} role={role} />
}
