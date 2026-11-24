import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { formatDate } from '../../lib/formatDate.js'
import { AdminBatchPage } from '../admin/AdminBatchPage.jsx'
import { listBatches } from '../admin/batchRepository.js'
import './batchCalendar.css'
import { classDate } from './academicRepository.js'
import { monthDays, nextClassDate, scheduledClasses, shiftMonth } from './studentSchedule.js'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const controlClass = 'rounded-lg border border-field-border bg-field px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-sky-100'

function ClassDetails({ assignment }) {
  return (
    <>
      <span className="block font-semibold text-blue-950">In-person class</span>
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
      <div className="mt-5 rounded-xl border border-surface-border bg-surface p-4">
        {next && <p className="mt-1">Next class <time className="font-semibold" dateTime={next}>{fullDate.format(new Date(next + 'T00:00:00Z'))}</time></p>}
        <p className="mt-1 text-sm text-slate-600">Scheduled classes · Asia/Dhaka</p>
      </div>
      <section className="mt-5" aria-labelledby="calendar-month">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="calendar-month" aria-live="polite" className="text-xl font-bold">{label}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={controlClass} onClick={() => setMonth(value => shiftMonth(value, -1))}>Previous month</button>
            <button type="button" className={controlClass} onClick={() => setMonth(currentMonth)}>Today</button>
            <button type="button" className={controlClass} onClick={() => setMonth(value => shiftMonth(value, 1))}>Next month</button>
          </div>
        </div>
        <div className="mt-3 hidden overflow-hidden rounded-xl border border-surface-border bg-surface lg:block">
          <table className="table-fixed" aria-label={label + ' schedule'}>
            <thead><tr>{weekdays.map(day => <th scope="col" key={day} className="p-2">{day}</th>)}</tr></thead>
            <tbody>{weeks.map((week, index) => (
              <tr key={index}>{week.map((day, column) => {
                const assignment = day && byDate.get(day.date)
                return <td key={column} className="h-20 border-r border-surface-border p-2 last:border-r-0" data-class-day={Boolean(assignment)} data-today={day?.date === today}>
                  {day && <time dateTime={day.date} aria-current={day.date === today ? 'date' : undefined}
                    className={day.date === today ? 'font-bold' : undefined}>{day.day}</time>}
                  {assignment && <div className="mt-1 break-words text-xs"><ClassDetails assignment={assignment} /></div>}
                </td>
              })}</tr>
            ))}</tbody>
          </table>
        </div>
        <ol aria-label={label + ' class dates'} className="mt-3 divide-y divide-surface-border rounded-xl border border-surface-border bg-surface lg:hidden">
          {classes.map(assignment => (
            <li key={assignment.date} className="px-4 py-3" data-class-day="true" data-today={assignment.date === today}>
              <time dateTime={assignment.date} className="block text-sm text-slate-700"
                aria-current={assignment.date === today ? 'date' : undefined}>{formatDate(assignment.date)}</time>
              <ClassDetails assignment={assignment} />
            </li>
          ))}
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
        <h1>Academic Calendar</h1>
        <p className="mt-5 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          Your enrollment is inactive. Active weekly class schedules are unavailable for former students.
        </p>
      </>
    )
  }

  const { batch } = state
  return (
    <>
      <h1>Academic Calendar</h1>
      {!account.batchId ? <p className="page-description">Your batch has not been assigned yet.</p>
        : state.loading ? <p className="page-description">Loading schedule…</p>
          : state.error ? <p role="alert" className="mt-4 text-red-800">{state.error}</p>
            : batch ? <><p className="page-description font-semibold">{batch.name} Batch</p><BatchCalendar key={batch.id} batch={batch} /></>
              : <p className="page-description">Your batch has not been assigned yet.</p>}
    </>
  )
}

export default function AcademicCalendar() {
  const { role, account } = useOutletContext()
  if (role === 'student') return <StudentCalendar account={account} />

  return (
    <AdminBatchPage title="Academic Calendar" workspaceLabel={role === 'teacher' ? 'Teacher workspace' : 'Admin dashboard'}>
      {({ batchInfo }) => <BatchCalendar key={batchInfo.id} batch={batchInfo} />}
    </AdminBatchPage>
  )
}
