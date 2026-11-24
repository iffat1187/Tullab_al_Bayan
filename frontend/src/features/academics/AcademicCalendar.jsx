import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AdminBatchPage } from '../admin/AdminBatchPage.jsx'
import { LoadingState, Notice, PageHeader } from '../../components/ui.jsx'
import { listBatches } from '../admin/batchRepository.js'
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
      <span className="block font-medium">Class</span>
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
              <span className="text-sm text-muted">{[assignment.time, assignment.venue].filter(Boolean).join(', ') || 'In person'}</span>
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

export default function AcademicCalendar() {
  const { role, account } = useOutletContext()
  if (role === 'student') return <StudentCalendar account={account} />

  return (
    <AdminBatchPage title="Class calendar" description="Each batch meets once a week. Times are Dhaka time.">
      {({ batchInfo }) => <BatchCalendar key={batchInfo.id} batch={batchInfo} />}
    </AdminBatchPage>
  )
}
