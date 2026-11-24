import React, { useEffect, useState } from 'react'
import { ArrowUpRight, BookOpenCheck, CalendarDays, ClipboardCheck, CreditCard, Users } from 'lucide-react'
import './staffDashboard.css'
import { Link, useOutletContext } from 'react-router-dom'
import { formatDate } from '../../lib/formatDate.js'
import { academicCalendar, classDate } from '../academics/academicRepository.js'
import { listHomework } from '../homework/homeworkRepository.js'
import { listSessions, markOptions } from '../attendance/attendanceRepository.js'
import { listActiveRosterForRole, listBatches } from '../admin/batchRepository.js'
import { coveredStatus, listMonthlyTuition } from '../tuition/tuitionRepository.js'
import { formatBillingMonth, formatTuitionAmount } from '../tuition/tuitionFormat.js'

const shortcutGroups = {
  admin: [
    ['students', 'Student Management'], ['attendance', 'Attendance'], ['tuition', 'Tuition Management'],
    ['scholarship-management', 'Scholarship Management'], ['homework', 'Homework Management'],
  ],
  teacher: [['attendance', 'Take attendance'], ['academic-calendar', 'Academic Calendar'], ['homework', 'Homework Management']],
}

function Summary({ title, period, to, icon: Icon, children }) {
  return (
    <Link className="dashboard-card interactive-card" to={to}>
      <div className="dashboard-card-icons">
        <span><Icon size={21} aria-hidden="true" /></span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{period}</p>
      <div className="mt-4">{children}</div>
    </Link>
  )
}

function AttendanceCompletion({ sessions, students, batchNames }) {
  if (!sessions.length) return <p>No attendance sessions have been opened today.</p>
  return (
    <ul className="divide-y divide-blue-100">
      {sessions.map(session => {
        const roster = students.filter(student => student.batchId === session.batchId)
        const marked = roster.filter(student => markOptions.includes(session.marks[student.uuid])).length
        return (
          <li key={session.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>{batchNames.get(session.batchId) ?? 'Unknown'} Batch · {session.type} · Session {session.sessionNo}</span>
            <span className="font-semibold">{marked} / {roster.length} marked</span>
          </li>
        )
      })}
    </ul>
  )
}

function TuitionSummary({ month }) {
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

  if (!month) return null
  if (state.loading) return <p className="text-sm">Loading tuition…</p>
  if (state.error) return <p className="text-sm text-red-800">{state.error}</p>
  if (!state.records.length) return <p className="text-sm">Tuition has not been generated for this month.</p>

  const unpaid = state.records.filter(record => record.status === 'Unpaid')
  const outstanding = unpaid.reduce((total, record) => total + (record.due ?? 0), 0)
  return (
    <div className="text-sm">
      <p className="font-bold">{formatTuitionAmount(outstanding)} outstanding</p>
      <p>{state.records.filter(record => record.status === 'Paid').length} paid · {unpaid.length} unpaid</p>
      <p>{state.records.filter(record => record.status === coveredStatus).length} covered by scholarship</p>
    </div>
  )
}

function AdminSummary({ students, batches, sessions, today }) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const marks = sessions.flatMap(session => Object.values(session.marks)).filter(mark => markOptions.includes(mark))

  return (
    <div className="space-y-3">
      <label className="dashboard-month">
        <span>Billing month</span>
        <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
      </label>
      <div className="grid gap-4 lg:grid-cols-3">
        <Summary title="Active students" period={'Across ' + batches.length + ' batches'} to="/admin/students" icon={Users}>
          <p className="text-3xl font-bold">{students.length}</p>
        </Summary>
        <Summary title="Recorded attendance" period={formatDate(today)} to="/admin/attendance" icon={ClipboardCheck}>
          <p className="font-bold">{marks.length} marks · {sessions.length} sessions</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 text-sm">
            {markOptions.map(mark => <div key={mark}><dt>{mark}</dt><dd className="font-bold">{marks.filter(value => value === mark).length}</dd></div>)}
          </dl>
        </Summary>
        <Summary title="Tuition summary" period={month ? formatBillingMonth(month) : 'Select a billing month'}
          to={month ? '/admin/tuition?month=' + encodeURIComponent(month) : '/admin/tuition'} icon={CreditCard}>
          <TuitionSummary month={month} />
        </Summary>
      </div>
    </div>
  )
}

function TeacherSummary({ students, batches, sessions, today, homework }) {
  const batchNames = new Map(batches.map(batch => [batch.id, batch.name]))
  const calendar = academicCalendar(batches)
  const classes = calendar.filter(item => item.date === today)
  const upcoming = calendar.filter(item => item.date > today).slice(0, 3)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Summary title="Today's classes" period={formatDate(today)} to="/teacher/academic-calendar" icon={CalendarDays}>
        {classes.length ? classes.map(item => (
          <p key={item.batch} className="mb-2 font-semibold">{item.batch} Batch · {item.type}</p>
        )) : <p>No classes scheduled today.</p>}
        {upcoming.length > 0 && <>
          <h3 className="mt-4 text-sm font-bold">Upcoming classes</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {upcoming.map(item => <li key={item.date + item.batch}>{formatDate(item.date)} · {item.batch} Batch · {item.type}</li>)}
          </ul>
        </>}
      </Summary>
      <Summary title="Attendance progress" period={formatDate(today)} to="/teacher/attendance" icon={ClipboardCheck}>
        <AttendanceCompletion sessions={sessions} students={students} batchNames={batchNames} />
      </Summary>
      <Summary title="Homework" period="Recently published by batch" to="/teacher/homework" icon={BookOpenCheck}>
        {homework.length ? <ul className="space-y-2">
          {homework.map(item => <li key={item.id}>{item.batchName ?? batchNames.get(item.batchId)} Batch · {item.title}</li>)}
        </ul> : <p>No homework has been published yet.</p>}
      </Summary>
    </div>
  )
}

function DashboardData({ role }) {
  const [today] = useState(classDate)
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
        .slice(0, 3)
      return { students, batches, sessions, homework: recentHomework }
    }
    load().then(
      data => { if (active) setState({ ...data, loading: false, error: '' }) },
      () => { if (active) setState(current => ({ ...current, loading: false, error: 'Dashboard records could not be loaded.' })) },
    )
    return () => { active = false }
  }, [role, today, reloadToken])

  if (state.loading) return <p role="status">Loading dashboard…</p>
  if (state.error) {
    return (
      <p className="text-red-800" role="alert">
        {state.error} <button type="button" className="underline" onClick={() => setReloadToken(value => value + 1)}>Retry</button>
      </p>
    )
  }
  const SummaryPage = role === 'admin' ? AdminSummary : TeacherSummary
  return <SummaryPage {...state} today={today} />
}

export default function StaffDashboard() {
  const { role } = useOutletContext()
  return (
    <div className="space-y-5">
      <header className="surface-banner rounded-2xl p-5 sm:p-8">
        <p className="text-sm font-semibold text-sky-900">Al Bayan Institute</p>
        <h1>{role === 'admin' ? 'Admin Dashboard' : 'Teacher Dashboard'}</h1>
      </header>
      <nav aria-label="Dashboard shortcuts" className="flex flex-wrap gap-2">
        {shortcutGroups[role].map(([path, label], index) => (
          <Link key={path} to={'/' + role + '/' + path}
            className={'interactive-action dashboard-shortcut ' +
              (role === 'teacher' && index === 0 ? 'dashboard-shortcut-primary' : '')}>
            {label}
          </Link>
        ))}
      </nav>
      <DashboardData role={role} />
    </div>
  )
}
