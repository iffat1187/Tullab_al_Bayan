import React, { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, CalendarDays, CreditCard } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { formatDate } from '../lib/formatDate.js'
import { listHomework } from '../features/homework/homeworkRepository.js'
import { listStudentAttendance, markOptions } from '../features/attendance/attendanceRepository.js'
import { listStudentTuition } from '../features/tuition/tuitionRepository.js'
import { formatBillingMonth } from '../features/tuition/tuitionFormat.js'
import './student.css'

const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
const emptyAttendance = { history: [], summary: { physical: { attended: 0, marked: 0, rate: null }, online: { attended: 0, marked: 0, rate: null }, overall: { attended: 0, marked: 0, rate: null } } }

function useStudentOverview(account) {
  const [state, setState] = useState({ attendance: emptyAttendance, tuition: [], homework: [], loading: true, error: '' })
  useEffect(() => {
    let active = true
    Promise.all([
      listStudentAttendance(account.studentUuid),
      listStudentTuition(account.studentUuid),
      account.isActive && account.batchId ? listHomework(account.batchId) : Promise.resolve([]),
    ]).then(([attendance, tuition, homework]) => { if (active) setState({ attendance, tuition, homework, loading: false, error: '' }) })
      .catch(() => { if (active) setState(current => ({ ...current, loading: false, error: 'Student information could not be loaded. Refresh to try again.' })) })
    return () => { active = false }
  }, [account.studentUuid, account.batchId, account.isActive])
  return state
}

export function StudentOverview() {
  const { account } = useOutletContext()
  const state = useStudentOverview(account)
  const latestTuition = state.tuition[0]
  const overall = state.attendance.summary.overall
  const cards = [
    { path: 'attendance', title: 'Attendance', icon: CalendarDays, value: overall.rate === null ? 'No records' : percent.format(overall.rate), detail: `${overall.attended} of ${overall.marked} marked classes attended` },
    { path: 'homework', title: 'Homework', icon: BookOpen, value: state.homework.length, detail: account.isActive ? `${state.homework.length} assignment${state.homework.length === 1 ? '' : 's'} available` : 'Unavailable for former students' },
    { path: 'tuition', title: 'Tuition', icon: CreditCard, value: latestTuition?.status ?? 'Unrecorded', detail: latestTuition ? formatBillingMonth(latestTuition.month) : 'No billing records' },
  ]
  return <>
    <header className="student-welcome surface-banner"><p className="eyebrow">Student dashboard</p><h1>Welcome, {account.name.split(' ')[0]}</h1><p>{account.name} <span aria-hidden="true">·</span> Student ID {account.id}</p></header>
    {account.isActive === false && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">Your enrollment is inactive. This portal is a read-only archive of your recorded attendance and tuition history.</p>}
    {state.error && <p role="alert" className="student-empty">{state.error}</p>}
    {state.loading ? <p>Loading overview…</p> : <><div className="summary-grid student-summary">{cards.map(({ path, title, icon: Icon, value, detail }) => <Link className="summary-card interactive-card" to={`/student/${path}`} key={path}><span className="card-icon"><Icon size={21} /></span><ArrowRight className="card-arrow" size={18} /><h2>{title}</h2><strong>{value}</strong><p>{detail}</p></Link>)}</div>
    <section className="student-panel"><div className="student-panel-heading"><h2>Recent homework</h2><Link to="/student/homework">View homework <ArrowRight size={16} /></Link></div>{state.homework.length ? <ul className="assignment-list">{state.homework.slice(0, 3).map(item => <li key={item.id}><strong className="break-all">{item.title}</strong>{item.deadline && <time dateTime={item.deadline}>{formatDate(item.deadline)}</time>}</li>)}</ul> : <p className="student-empty">{account.isActive ? 'No assignments yet.' : 'Homework is unavailable for former students.'}</p>}</section></>}
  </>
}

export function StudentAttendance() {
  const { account } = useOutletContext()
  const [state, setState] = useState({ ...emptyAttendance, loading: true, error: '' })
  useEffect(() => {
    let active = true
    listStudentAttendance(account.studentUuid).then(result => { if (active) setState({ ...result, loading: false, error: '' }) }).catch(() => { if (active) setState({ ...emptyAttendance, loading: false, error: 'Attendance could not be loaded.' }) })
    return () => { active = false }
  }, [account.studentUuid])
  const sessionsByDate = state.history.reduce((map, session) => map.set(session.date, [...(map.get(session.date) ?? []), session]), new Map())
  const summaries = [['Physical', state.summary.physical], ['Online', state.summary.online], ['Overall', state.summary.overall]]
  return <>
    <p className="eyebrow">Student dashboard</p><h1>Class attendance</h1>
    {account.isActive === false && <p className="rounded-lg bg-amber-50 p-3 text-amber-950">Showing recorded attendance only. This archive is read-only.</p>}
    {state.error && <p role="alert" className="student-empty">{state.error}</p>}
    {state.loading ? <p>Loading attendance…</p> : <><section className="student-panel"><div className="grid gap-3 sm:grid-cols-3">{summaries.map(([label, summary]) => <div key={label} className="rounded-xl bg-blue-50 p-4"><h2 className="text-base">{label}</h2><strong className="text-2xl">{summary.rate === null ? 'No records' : percent.format(summary.rate)}</strong><p>{summary.attended} of {summary.marked} marked</p></div>)}</div></section>
    <section className="student-panel daily-attendance"><div className="student-panel-heading"><h2>Class Attendance Record</h2></div><div className="attendance-table" role="region" tabIndex={0}><table><thead><tr>{['Date', 'Total', ...markOptions].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{Array.from(sessionsByDate, ([date, sessions]) => { const counts = markOptions.map(status => sessions.filter(session => session.status === status).length); const marked = counts.reduce((sum, count) => sum + count, 0); const attended = counts[0] + counts[1]; return <tr key={date}><th scope="row"><time dateTime={date}>{formatDate(date)}</time><div className="daily-rate"><span>{marked ? percent.format(attended / marked) : '—'}</span></div></th><td>{sessions.length}</td>{counts.map((count, index) => <td key={markOptions[index]}>{count}</td>)}</tr> })}</tbody></table></div><p className="daily-attendance-note">Attendance rate counts Present and Late out of all marked sessions, including Sick and Absent.</p></section>
    <details className="student-panel class-history"><summary>Class history</summary>{state.history.length ? <div className="attendance-table" role="region" tabIndex={0}><table><thead><tr><th>Date</th><th>Class type</th><th>Status</th></tr></thead><tbody>{state.history.map(session => <tr key={session.id}><td><time dateTime={session.date}>{formatDate(session.date)}</time></td><td>{session.type === 'Physical' ? 'In person' : session.type}</td><td><span className="attendance-status" data-status={session.status}>{session.status}</span></td></tr>)}</tbody></table></div> : <p className="student-empty">No class sessions yet.</p>}</details></>}
  </>
}
