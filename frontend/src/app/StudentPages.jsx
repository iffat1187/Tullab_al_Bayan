import React, { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { formatDate } from '../lib/formatDate.js'
import { EmptyState, KhatamPattern, Notice, PageHeader, SkeletonCards, SkeletonRows, StatusPill } from '../components/ui.jsx'
import { listBatches } from '../features/admin/batchRepository.js'
import { classDate } from '../features/academics/academicRepository.js'
import { nextClassDate, scheduledClasses } from '../features/academics/studentSchedule.js'
import { listHomework } from '../features/homework/homeworkRepository.js'
import { listStudentAttendance } from '../features/attendance/attendanceRepository.js'
import { listStudentTuition } from '../features/tuition/tuitionRepository.js'
import { formatBillingMonth, formatTuitionAmount } from '../features/tuition/tuitionFormat.js'
import '../features/dashboard/staffDashboard.css'

const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const emptyAttendance = { history: [], summary: { physical: { attended: 0, marked: 0, rate: null }, online: { attended: 0, marked: 0, rate: null }, overall: { attended: 0, marked: 0, rate: null } } }

function useStudentOverview(account) {
  const [state, setState] = useState({ attendance: emptyAttendance, tuition: [], homework: [], batch: null, loading: true, error: '' })
  useEffect(() => {
    let active = true
    const enrolled = account.isActive && account.batchId
    Promise.all([
      listStudentAttendance(account.studentUuid),
      listStudentTuition(account.studentUuid),
      enrolled ? listHomework(account.batchId) : Promise.resolve([]),
      enrolled ? listBatches().catch(() => []) : Promise.resolve([]),
    ]).then(([attendance, tuition, homework, batches]) => {
      if (active) setState({ attendance, tuition, homework, batch: batches.find(item => item.id === account.batchId) ?? null, loading: false, error: '' })
    }).catch(() => { if (active) setState(current => ({ ...current, loading: false, error: 'Your information could not be loaded. Refresh the page to try again.' })) })
    return () => { active = false }
  }, [account.studentUuid, account.batchId, account.isActive])
  return state
}

function NextClass({ batch }) {
  const today = classDate()
  const next = nextClassDate(batch, today)
  if (!next) return null
  const details = scheduledClasses(batch, next.slice(0, 7)).find(item => item.date === next)
  return (
    <section className="today-card brand-surface" aria-label="Next class">
      <KhatamPattern opacity={0.1} />
      <div>
        <h2>{next === today ? 'Class today' : `Next class: ${longDate.format(new Date(next + 'T00:00:00Z'))}`}</h2>
        <p>{[details?.time, details?.venue].filter(Boolean).join(', ') || `${batch.name} batch, in person`}</p>
      </div>
      <Link className="btn btn-primary" to="/student/academic-calendar"><CalendarDays size={17} aria-hidden="true" /> Class calendar</Link>
    </section>
  )
}

export function StudentOverview() {
  const { account } = useOutletContext()
  const state = useStudentOverview(account)
  const latestTuition = state.tuition[0]
  const overall = state.attendance.summary.overall
  const firstName = account.name.split(' ')[0]

  return <>
    <PageHeader title={`Assalamu alaikum, ${firstName}`}
      description={account.batch ? `${account.batch} batch, student ID ${account.id}` : `Student ID ${account.id}`} />
    {account.isActive === false && <Notice tone="warn" className="mb-4">You're no longer enrolled. You can still see your past attendance and tuition.</Notice>}
    {state.error && <Notice tone="error" className="mb-4">{state.error}</Notice>}
    {state.loading ? <><div className="today-card skeleton-hero" aria-hidden="true" /><div className="mt-4"><SkeletonCards count={4} /></div></> : <>
      {state.batch && <NextClass batch={state.batch} />}
      <dl className="stat-strip mt-4">
        <div className="stat" data-tone="brand"><dt>Attendance</dt><dd>{overall.rate === null ? '—' : percent.format(overall.rate)}</dd></div>
        <div className="stat"><dt>Classes attended</dt><dd>{overall.attended} <small className="text-sm font-normal text-muted">of {overall.marked}</small></dd></div>
        <div className="stat"><dt>Homework</dt><dd>{state.homework.length}</dd></div>
        <div className="stat"><dt>{latestTuition ? formatBillingMonth(latestTuition.month) : 'Tuition'}</dt><dd className="!text-base !font-medium">{latestTuition ? <StatusPill status={latestTuition.status} /> : 'No records'}</dd></div>
      </dl>
      <div className="dash-grid">
        <section className="panel" aria-labelledby="recent-homework">
          <div className="panel-head"><h2 id="recent-homework">Homework</h2><Link to="/student/homework" className="btn btn-ghost btn-sm">See all</Link></div>
          {state.homework.length ? <ul className="progress-list">{state.homework.slice(0, 4).map(item => (
            <li key={item.id}><div className="progress-row"><span className="font-medium break-words">{item.title}</span>{item.deadline && <span>Due <time dateTime={item.deadline}>{formatDate(item.deadline)}</time></span>}</div></li>
          ))}</ul> : <EmptyState>{account.isActive ? 'No homework right now.' : 'Homework is only for enrolled students.'}</EmptyState>}
        </section>
        <section className="panel" aria-labelledby="latest-tuition">
          <div className="panel-head"><h2 id="latest-tuition">Tuition</h2><Link to="/student/tuition" className="btn btn-ghost btn-sm">History</Link></div>
          {latestTuition ? <div className="panel-body">
            <p className="text-sm text-muted">{formatBillingMonth(latestTuition.month)}</p>
            <p className="money">{latestTuition.due === null ? 'Fee not set' : formatTuitionAmount(latestTuition.due)}</p>
            <p className="mt-2"><StatusPill status={latestTuition.status} /></p>
          </div> : <EmptyState>No tuition has been recorded yet.</EmptyState>}
        </section>
      </div>
    </>}
  </>
}

export function StudentAttendance() {
  const { account } = useOutletContext()
  const [state, setState] = useState({ ...emptyAttendance, loading: true, error: '' })
  useEffect(() => {
    let active = true
    listStudentAttendance(account.studentUuid).then(result => { if (active) setState({ ...result, loading: false, error: '' }) }).catch(() => { if (active) setState({ ...emptyAttendance, loading: false, error: 'Attendance could not be loaded. Refresh the page to try again.' }) })
    return () => { active = false }
  }, [account.studentUuid])
  const summaries = [['In person', state.summary.physical], ['Online', state.summary.online], ['Overall', state.summary.overall]]
  return <>
    <PageHeader title="Attendance" description="Present and Late count as attended. Sick and Absent don't." />
    {account.isActive === false && <Notice tone="warn" className="mb-4">You're no longer enrolled. This is a read-only record.</Notice>}
    {state.error && <Notice tone="error" className="mb-4">{state.error}</Notice>}
    {state.loading ? <><SkeletonCards count={3} /><div className="panel mt-4"><SkeletonRows rows={6} label="Loading attendance…" /></div></> : <>
      <dl className="stat-strip">
        {summaries.map(([label, summary]) => (
          <div key={label} className="stat"><dt>{label}</dt><dd>{summary.rate === null ? '—' : percent.format(summary.rate)}</dd><span className="text-sm text-muted">{summary.attended} of {summary.marked} classes</span></div>
        ))}
      </dl>
      <section className="panel mt-4" aria-labelledby="class-history">
        <div className="panel-head"><h2 id="class-history">Every class</h2></div>
        {state.history.length ? <div className="table-scroll" role="region" tabIndex={0} aria-labelledby="class-history">
          <table className="data-table">
            <thead><tr><th scope="col">Date</th><th scope="col">Class</th><th scope="col">Your mark</th></tr></thead>
            <tbody>{state.history.map(session => (
              <tr key={session.id}>
                <th scope="row"><time dateTime={session.date}>{formatDate(session.date)}</time></th>
                <td>{session.type === 'Physical' ? 'In person' : session.type}{session.sessionNo > 1 ? `, session ${session.sessionNo}` : ''}</td>
                <td><StatusPill status={session.status}>{session.status === 'Unrecorded' ? 'Not marked' : session.status}</StatusPill></td>
              </tr>
            ))}</tbody>
          </table>
        </div> : <EmptyState>No classes recorded yet.</EmptyState>}
      </section>
    </>}
  </>
}
