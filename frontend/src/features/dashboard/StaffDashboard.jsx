import React, { useEffect, useState } from 'react'
import { BookOpenCheck, ChevronRight, ClipboardCheck, CreditCard, Tags, Users } from 'lucide-react'
import './staffDashboard.css'
import { Link, useOutletContext } from 'react-router-dom'
import { formatDate } from '../../lib/formatDate.js'
import { EmptyState, KhatamPattern, LoadingState, Notice, PageHeader, SkeletonCards, SkeletonRows } from '../../components/ui.jsx'
import { academicCalendar, classDate } from '../academics/academicRepository.js'
import { listHomework } from '../homework/homeworkRepository.js'
import { listSessions, markOptions } from '../attendance/attendanceRepository.js'
import { listActiveRosterForRole, listBatches } from '../admin/batchRepository.js'
import { coveredStatus, listMonthlyTuition } from '../tuition/tuitionRepository.js'
import { formatBillingMonth, formatTuitionAmount } from '../tuition/tuitionFormat.js'

const shortcuts = {
  admin: [
    ['students', 'Add or edit students', Users],
    ['tuition', 'Generate this month’s tuition', CreditCard],
    ['payment-records', 'Record a payment', CreditCard],
    ['scholarship-management', 'Manage scholarships', Tags],
    ['homework', 'Publish homework', BookOpenCheck],
  ],
  teacher: [
    ['attendance', 'Take attendance', ClipboardCheck],
    ['homework', 'Publish homework', BookOpenCheck],
    ['academic-calendar', 'See the class calendar', ClipboardCheck],
  ],
}

function TodayCard({ role, todaysClasses, upcoming }) {
  const first = todaysClasses[0]
  return (
    <section className="today-card brand-surface" aria-label="Today's class">
      <KhatamPattern opacity={0.1} />
      <div>
        {first ? <>
          <h2>{todaysClasses.map(item => item.batch).join(' and ')} batch today</h2>
          <p>{[first.time, first.venue].filter(Boolean).join(', ') || 'In-person class'}</p>
        </> : <>
          <h2>No class today</h2>
          <p>{upcoming ? `Next class: ${upcoming.batch} batch on ${formatDate(upcoming.date)}` : 'No classes in the next two weeks.'}</p>
        </>}
      </div>
      {first && <Link className="btn btn-primary" to={`/${role}/attendance`}><ClipboardCheck size={17} aria-hidden="true" /> Take attendance</Link>}
    </section>
  )
}

function AttendanceProgress({ sessions, students, batchNames, role }) {
  return (
    <section className="panel" aria-labelledby="progress-title">
      <div className="panel-head">
        <h2 id="progress-title">Today’s attendance</h2>
        <Link to={`/${role}/attendance`} className="btn btn-ghost btn-sm">Open</Link>
      </div>
      {!sessions.length ? <EmptyState>No sessions started today.</EmptyState> : (
        <ul className="progress-list">
          {sessions.map(session => {
            const roster = students.filter(student => student.batchId === session.batchId)
            const marked = roster.filter(student => markOptions.includes(session.marks[student.uuid])).length
            const percent = roster.length ? Math.round((marked / roster.length) * 100) : 0
            return (
              <li key={session.id}>
                <div className="progress-row">
                  <span>{batchNames.get(session.batchId) ?? 'Unknown'} batch, {session.type === 'Physical' ? 'in person' : 'online'}</span>
                  <span>{marked} of {roster.length} marked</span>
                </div>
                <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Marked">
                  <span style={{ width: percent + '%' }} data-done={percent === 100} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function TuitionSummary({ month, onMonthChange }) {
  const [state, setState] = useState({ records: [], loading: true, error: '' })

  useEffect(() => {
    if (!month) return undefined
    let active = true
    setState(current => ({ ...current, loading: true, error: '' }))
    listMonthlyTuition({ billingMonth: month }).then(
      records => { if (active) setState({ records, loading: false, error: '' }) },
      () => { if (active) setState({ records: [], loading: false, error: 'Tuition could not be loaded.' }) },
    )
    return () => { active = false }
  }, [month])

  const unpaid = state.records.filter(record => record.status === 'Unpaid')
  const outstanding = unpaid.reduce((total, record) => total + (record.due ?? 0), 0)

  return (
    <section className="panel" aria-labelledby="tuition-title">
      <div className="panel-head">
        <h2 id="tuition-title">Tuition</h2>
        <input className="field w-auto" type="month" aria-label="Billing month" value={month} onChange={event => onMonthChange(event.target.value)} />
      </div>
      <div className="panel-body">
        {!month ? <p className="text-muted">Choose a billing month.</p>
          : state.loading ? <LoadingState />
            : state.error ? <Notice tone="error">{state.error}</Notice>
              : !state.records.length ? (
                <p className="text-muted">Tuition for {formatBillingMonth(month)} hasn’t been generated yet. <Link className="text-brand underline" to={'/admin/tuition?month=' + encodeURIComponent(month)}>Generate it</Link></p>
              ) : <>
                <p className="text-sm text-muted">Still to collect for {formatBillingMonth(month)}</p>
                <p className="money">{formatTuitionAmount(outstanding)}</p>
                <dl className="tuition-breakdown">
                  <div><dt>Paid</dt><dd>{state.records.filter(record => record.status === 'Paid').length}</dd></div>
                  <div><dt>Unpaid</dt><dd>{unpaid.length}</dd></div>
                  <div><dt>Scholarship</dt><dd>{state.records.filter(record => record.status === coveredStatus).length}</dd></div>
                </dl>
                <Link className="btn btn-secondary btn-sm mt-4" to={'/admin/payment-records?month=' + encodeURIComponent(month)}>Record payments</Link>
              </>}
      </div>
    </section>
  )
}

function Shortcuts({ role }) {
  return (
    <section className="panel" aria-labelledby="shortcuts-title">
      <div className="panel-head"><h2 id="shortcuts-title">Common tasks</h2></div>
      <ul className="link-list">
        {shortcuts[role].map(([path, label, Icon]) => (
          <li key={path}><Link to={`/${role}/${path}`}><span className="inline-flex items-center gap-3"><Icon size={17} aria-hidden="true" /> {label}</span><ChevronRight size={16} aria-hidden="true" /></Link></li>
        ))}
      </ul>
    </section>
  )
}

function RecentHomework({ homework, batchNames }) {
  return (
    <section className="panel" aria-labelledby="homework-title">
      <div className="panel-head">
        <h2 id="homework-title">Recent homework</h2>
        <Link to="/teacher/homework" className="btn btn-ghost btn-sm">All homework</Link>
      </div>
      {homework.length ? (
        <ul className="progress-list">
          {homework.map(item => (
            <li key={item.id}>
              <div className="progress-row"><span className="font-medium">{item.title}</span><span>{item.batchName ?? batchNames.get(item.batchId)} batch</span></div>
            </li>
          ))}
        </ul>
      ) : <EmptyState>No homework published yet.</EmptyState>}
    </section>
  )
}

function DashboardData({ role }) {
  const [today] = useState(classDate)
  const [month, setMonth] = useState(() => classDate().slice(0, 7))
  const [state, setState] = useState({ loading: true, error: '', students: [], batches: [], sessions: [], homework: [] })
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setState(current => ({ ...current, loading: true, error: '' }))
    async function load() {
      const batches = await listBatches()
      const [students, sessions, homework] = await Promise.all([
        listActiveRosterForRole(role, batches),
        listSessions({ classDate: today }),
        role === 'teacher' ? listHomework() : Promise.resolve([]),
      ])
      const recentHomework = [...homework]
        .sort((first, second) => String(second.publishedAt).localeCompare(String(first.publishedAt)))
        .slice(0, 4)
      return { students, batches, sessions, homework: recentHomework }
    }
    load().then(
      data => { if (active) setState({ ...data, loading: false, error: '' }) },
      () => { if (active) setState(current => ({ ...current, loading: false, error: 'Dashboard could not be loaded.' })) },
    )
    return () => { active = false }
  }, [role, today, reloadToken])

  if (state.loading) return <><div className="today-card skeleton-hero" aria-hidden="true" /><div className="mt-4"><SkeletonCards count={5} /></div><div className="panel mt-4"><SkeletonRows rows={3} /></div></>
  if (state.error) {
    return <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadToken(value => value + 1)}>Try again</button>}>{state.error}</Notice>
  }

  const batchNames = new Map(state.batches.map(batch => [batch.id, batch.name]))
  const calendar = academicCalendar(state.batches)
  const todaysClasses = calendar.filter(item => item.date === today)
  const upcoming = calendar.find(item => item.date > today)
  const marks = state.sessions.flatMap(session => Object.values(session.marks)).filter(mark => markOptions.includes(mark))

  return <>
    <TodayCard role={role} todaysClasses={todaysClasses} upcoming={upcoming} />
    {role === 'admin' && (
      <dl className="stat-strip mt-4">
        <div className="stat" data-tone="brand"><dt>Active students</dt><dd>{state.students.length}</dd></div>
        <div className="stat"><dt>Batches</dt><dd>{state.batches.length}</dd></div>
        <div className="stat"><dt>Sessions today</dt><dd>{state.sessions.length}</dd></div>
        <div className="stat" data-tone="ok"><dt>Present or late today</dt><dd>{marks.filter(mark => mark === 'Present' || mark === 'Late').length}</dd></div>
        <div className="stat" data-tone="danger"><dt>Absent today</dt><dd>{marks.filter(mark => mark === 'Absent').length}</dd></div>
      </dl>
    )}
    <div className="dash-grid">
      <div className="grid content-start gap-4">
        <AttendanceProgress sessions={state.sessions} students={state.students} batchNames={batchNames} role={role} />
        {role === 'teacher' && <RecentHomework homework={state.homework} batchNames={batchNames} />}
      </div>
      <div className="grid content-start gap-4">
        {role === 'admin' && <TuitionSummary month={month} onMonthChange={setMonth} />}
        <Shortcuts role={role} />
      </div>
    </div>
  </>
}

export default function StaffDashboard() {
  const { role, account } = useOutletContext()
  const firstName = account.name.split(' ')[0]
  return (
    <>
      <PageHeader title={`Assalamu alaikum, ${firstName}`} description={formatDate(classDate())} />
      <DashboardData role={role} />
    </>
  )
}
