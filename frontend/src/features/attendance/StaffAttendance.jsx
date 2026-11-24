import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, Plus, Trash2 } from 'lucide-react'
import { AdminBatchPage } from '../admin/AdminBatchPage.jsx'
import { EmptyState, Notice, Person, SkeletonRows, useToast } from '../../components/ui.jsx'
import './staffAttendance.css'
import { createSession, deleteSession, listSessions, markOptions, saveMark, sessionTypes } from './attendanceRepository.js'

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka', dateStyle: 'short' }).format(new Date())
const markTones = { Present: 'ok', Late: 'warn', Sick: 'violet', Absent: 'danger' }
const sessionTypeLabel = type => (type === 'Physical' ? 'In person' : type)

function BatchAttendance({ batchId, batch, students }) {
  const [date, setDate] = useState(today)
  const [type, setType] = useState(sessionTypes[0])
  const [selectedId, setSelectedId] = useState('')
  const [state, setState] = useState({ sessions: [], loading: true, error: '' })
  const [actionError, setActionError] = useState('')
  const [markErrors, setMarkErrors] = useState({})
  const [saving, setSaving] = useState({})
  const [bulkSaving, setBulkSaving] = useState(false)
  const toast = useToast()
  const [creating, setCreating] = useState(false)
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
      if (id === requestId.current) setState({ sessions: [], loading: false, error: 'Attendance could not be loaded. Try again.' })
    }
  }
  useEffect(() => {
    load()
    return () => { requestId.current += 1 }
  }, [batchId, date])
  const session = state.sessions.find(item => item.id === selectedId) ?? state.sessions[0]
  const roster = useMemo(() => students.map(student => ({ ...student, mark: session?.marks[student.uuid] ?? 'Unmarked' })), [students, session])
  const totals = Object.fromEntries([...markOptions, 'Unmarked'].map(mark => [mark, 0]))
  for (const student of roster) totals[student.mark] += 1

  async function addSession(event) {
    event.preventDefault(); setActionError(''); setCreating(true)
    try {
      const created = await createSession(batchId, date, type)
      await load(created.id)
      toast(`${sessionTypeLabel(type)} session started for ${batch}.`)
    } catch { setActionError('The session could not be started. Check the date and try again.') } finally { setCreating(false) }
  }
  async function removeSession() {
    if (!session || session.markCount > 0) return
    try { await deleteSession(session.id); await load(); toast('Empty session deleted.') } catch { setActionError('Only a session with no marks can be deleted.') }
  }

  // Marks change on screen immediately and save in the background; a failed save puts the old mark back.
  function applyMark(sessionId, studentUuid, mark) {
    setState(current => ({ ...current, sessions: current.sessions.map(item => {
      if (item.id !== sessionId) return item
      const marks = { ...item.marks }
      if (mark) marks[studentUuid] = mark
      else delete marks[studentUuid]
      return { ...item, marks, markCount: Object.keys(marks).length }
    }) }))
  }
  async function persistMark(sessionId, student, mark, previous) {
    setSaving(current => ({ ...current, [student.uuid]: true }))
    try {
      await saveMark({ sessionId, studentUuid: student.uuid, mark })
      return true
    } catch (error) {
      applyMark(sessionId, student.uuid, previous)
      setMarkErrors(current => ({ ...current, [student.uuid]: error?.code === '42501' ? 'ineligible' : true }))
      return false
    } finally {
      setSaving(current => ({ ...current, [student.uuid]: false }))
    }
  }
  async function updateMark(student, mark) {
    if (!session) { setActionError('Start a session before marking attendance.'); return }
    const previous = session.marks[student.uuid] ?? null
    if (previous === mark) return
    setMarkErrors(current => ({ ...current, [student.uuid]: false }))
    applyMark(session.id, student.uuid, mark)
    const ok = await persistMark(session.id, student, mark, previous)
    if (!ok) toast(`Couldn't save ${student.name}'s mark. It was put back.`, 'error')
  }
  async function markRestPresent() {
    if (!session) return
    const rest = roster.filter(student => student.mark === 'Unmarked')
    if (!rest.length) return
    setBulkSaving(true)
    rest.forEach(student => applyMark(session.id, student.uuid, 'Present'))
    const results = await Promise.all(rest.map(student => persistMark(session.id, student, 'Present', null)))
    setBulkSaving(false)
    const failed = results.filter(ok => !ok).length
    if (failed) toast(`${rest.length - failed} marked present. ${failed} couldn't be saved.`, 'error')
    else toast(`${rest.length} ${rest.length === 1 ? 'student' : 'students'} marked present.`)
  }

  return <>
    <section className="panel panel-body attendance-toolbar" aria-label="Class session">
      <label className="label">Class date
        <input className="field" type="date" required value={date} onChange={event => { setDate(event.target.value); setMarkErrors({}); setActionError('') }} />
      </label>
      <div>
        <span className="label">Session</span>
        <div className="session-tabs mt-1.5">
          {state.sessions.length ? state.sessions.map(item => (
            <button key={item.id} type="button" className="session-tab" aria-pressed={item.id === session?.id} onClick={() => setSelectedId(item.id)}>
              {sessionTypeLabel(item.type)} {item.sessionNo > 1 ? item.sessionNo : ''}<small>{item.markCount}/{students.length}</small>
            </button>
          )) : <span className="py-2 text-sm text-muted">{state.loading ? 'Loading sessions…' : 'No session yet for this date.'}</span>}
        </div>
      </div>
      <form className="new-session" onSubmit={addSession}>
        <select className="field" aria-label="New session type" value={type} onChange={event => setType(event.target.value)}>
          {sessionTypes.map(option => <option key={option} value={option}>{sessionTypeLabel(option)}</option>)}
        </select>
        <button type="submit" className={'btn ' + (state.sessions.length ? 'btn-secondary' : 'btn-primary')} disabled={creating}>
          <Plus size={16} aria-hidden="true" /> {creating ? 'Starting…' : 'Start session'}
        </button>
      </form>
    </section>

    {(actionError || state.error) && <Notice tone="error" className="mt-4">{actionError || state.error}</Notice>}

    {session && (
      <dl className="stat-strip mt-4">
        {markOptions.map(mark => <div key={mark} className="stat" data-tone={markTones[mark]}><dt>{mark}</dt><dd>{totals[mark]}</dd></div>)}
        <div className="stat" data-tone="brand"><dt>Not marked yet</dt><dd>{totals.Unmarked}</dd></div>
      </dl>
    )}

    <section className="panel mt-4" aria-labelledby="roster-title">
      <div className="panel-head">
        <div>
          <h2 id="roster-title">{batch} roster</h2>
          <p>{session ? `${sessionTypeLabel(session.type)} session on this date. Marks save as you tap.` : 'Start a session to mark attendance.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session && totals.Unmarked > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={bulkSaving} onClick={markRestPresent}>
              <CheckCheck size={16} aria-hidden="true" /> {bulkSaving ? 'Saving…' : `Mark the rest present (${totals.Unmarked})`}
            </button>
          )}
          {session && session.markCount === 0 && (
            <button type="button" className="btn btn-danger-quiet btn-sm" onClick={removeSession}>
              <Trash2 size={15} aria-hidden="true" /> Delete empty session
            </button>
          )}
        </div>
      </div>
      {!students.length ? <EmptyState title="No students in this batch">Add students from the Students page.</EmptyState>
        : state.loading && !state.sessions.length ? <SkeletonRows rows={6} label="Loading roster…" />
          : <table className="data-table attendance-roster" aria-label="Attendance roster">
            <thead><tr><th scope="col">Student</th><th scope="col">Mark</th></tr></thead>
            <tbody>{roster.map(student => (
              <tr key={student.uuid} className={session && student.mark === 'Unmarked' ? 'roster-row-unmarked' : undefined}>
                <th scope="row"><Person name={student.name} sub={student.id} /></th>
                <td>
                  <div role="group" aria-label={`Attendance for ${student.name}`} className="mark-group" aria-busy={Boolean(saving[student.uuid])}>
                    {markOptions.map(mark => <button key={mark} type="button" disabled={!session} data-mark={mark} aria-pressed={student.mark === mark} onClick={() => updateMark(student, mark)}>{mark}</button>)}
                  </div>
                  {markErrors[student.uuid] && <p className="field-error" role="alert">{markErrors[student.uuid] === 'ineligible' ? `${student.name} wasn't in this batch on this date.` : `Couldn't save. Tap the mark again.`}</p>}
                </td>
              </tr>
            ))}</tbody>
          </table>}
    </section>
  </>
}

export default function StaffAttendance() {
  return (
    <AdminBatchPage title="Attendance" description="Pick the batch and date, start a session, then tap a mark for each student.">
      {({ batchId, batch, students }) => <BatchAttendance key={batchId} batchId={batchId} batch={batch} students={students} />}
    </AdminBatchPage>
  )
}
