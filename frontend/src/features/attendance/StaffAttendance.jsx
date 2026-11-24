import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AdminBatchPage, buttonClass, fieldClass } from '../admin/AdminBatchPage.jsx'
import './staffAttendance.css'
import { createSession, deleteSession, listSessions, markOptions, saveMark, sessionTypes } from './attendanceRepository.js'

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka', dateStyle: 'short' }).format(new Date())

function BatchAttendance({ batchId, students }) {
  const [date, setDate] = useState(today)
  const [type, setType] = useState(sessionTypes[0])
  const [selectedId, setSelectedId] = useState('')
  const [state, setState] = useState({ sessions: [], loading: true, error: '' })
  const [actionError, setActionError] = useState('')
  const [markErrors, setMarkErrors] = useState({})
  const requestId = useRef(0)

  async function load(preferredId = '') {
    const id = ++requestId.current
    setState(current => ({ ...current, loading: true, error: '' }))
    try {
      const sessions = await listSessions({ batchId, classDate: date })
      if (id !== requestId.current) return
      setState({ sessions, loading: false, error: '' })
      setSelectedId(current => preferredId || (sessions.some(item => item.id === current) ? current : sessions[0]?.id ?? ''))
    } catch {
      if (id === requestId.current) setState({ sessions: [], loading: false, error: 'Attendance could not be loaded. Retry to continue.' })
    }
  }
  useEffect(() => {
    load()
    return () => { requestId.current += 1 }
  }, [batchId, date])
  const session = state.sessions.find(item => item.id === selectedId) ?? state.sessions[0]
  const roster = useMemo(() => students.map(student => ({ ...student, mark: session?.marks[student.uuid] ?? 'Unmarked' })), [students, session])
  const totals = Object.fromEntries(['Total Students', ...markOptions, 'Unmarked'].map(mark => [mark, 0]))
  totals['Total Students'] = roster.length
  for (const student of roster) totals[student.mark] += 1

  async function addSession(event) {
    event.preventDefault(); setActionError('')
    try { const created = await createSession(batchId, date, type); await load(created.id) } catch { setActionError('The session could not be created. Check the date and try again.') }
  }
  async function removeSession() {
    if (!session || session.markCount > 0) return
    try { await deleteSession(session.id); await load() } catch { setActionError('Only an empty session can be deleted.') }
  }
  async function updateMark(student, mark) {
    if (!session) { setActionError('Create a session before marking attendance.'); return }
    try { await saveMark({ sessionId: session.id, studentUuid: student.uuid, mark }); setMarkErrors(current => ({ ...current, [student.uuid]: false })); await load(session.id) } catch (error) { setMarkErrors(current => ({ ...current, [student.uuid]: error?.code === '42501' ? 'ineligible' : true })) }
  }

  return <>
    <form className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={addSession}>
      <label className="text-sm font-semibold">Class date<input className={fieldClass + ' mt-1'} type="date" required value={date} onChange={event => { setDate(event.target.value); setMarkErrors({}); setActionError('') }} /></label>
      <label className="text-sm font-semibold">Session<select className={fieldClass + ' mt-1'} value={session?.id ?? ''} disabled={!state.sessions.length} onChange={event => setSelectedId(event.target.value)}>{!state.sessions.length && <option value="">No sessions for this date</option>}{state.sessions.map(item => <option key={item.id} value={item.id}>{item.type} · Session {item.sessionNo}</option>)}</select></label>
      <label className="text-sm font-semibold">New session type<select className={fieldClass + ' mt-1'} value={type} onChange={event => setType(event.target.value)}>{sessionTypes.map(option => <option key={option}>{option}</option>)}</select></label>
      <button type="submit" className={buttonClass}>Create session</button>
    </form>
    <div className="mt-3 flex items-center gap-3">{session && <button type="button" disabled={session.markCount > 0} title={session.markCount > 0 ? 'Sessions with marks cannot be deleted' : 'Delete empty session'} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-800 disabled:opacity-50" onClick={removeSession}><Trash2 size={16} /> Delete empty session</button>}{state.loading && <span>Loading…</span>}</div>
    {(actionError || state.error) && <p role="alert" className="mt-3 text-red-800">{actionError || state.error}</p>}
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(totals).map(([mark, count]) => <div key={mark} className="rounded-xl bg-blue-50 px-3 py-2"><dt className="text-sm font-semibold text-slate-700">{mark}</dt><dd className="text-xl font-bold tabular-nums">{count}</dd></div>)}</dl>
    {!students.length ? <p className="mt-5 text-slate-600">No students in this batch yet.</p> : <div className="staff-roster"><table aria-label="Attendance roster"><thead><tr>{['Student Name', 'Student ID', 'Current Status', 'Mark Attendance'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{roster.map(student => <tr key={student.uuid}><th scope="row" className="staff-student-name">{student.name}</th><td>{student.id}</td><td><span className="staff-status" data-mark={student.mark}>{student.mark}</span></td><td className="staff-mark-cell"><div role="group" aria-label={`Attendance for ${student.name}`} className="staff-mark-buttons">{markOptions.map(mark => <button key={mark} type="button" disabled={!session} data-mark={mark} aria-pressed={student.mark === mark} onClick={() => updateMark(student, mark)}>{mark}</button>)}</div>{markErrors[student.uuid] && <p className="staff-mark-error" role="alert">{markErrors[student.uuid] === 'ineligible' ? `${student.name} was not enrolled in this batch on this date.` : `Could not save the mark for ${student.name}. Try again.`}</p>}</td></tr>)}</tbody></table></div>}
  </>
}

export default function StaffAttendance({ workspaceLabel = 'Admin dashboard' }) {
  return <AdminBatchPage title="Attendance" workspaceLabel={workspaceLabel}>{({ batchId, students }) => <BatchAttendance key={batchId} batchId={batchId} students={students} />}</AdminBatchPage>
}
