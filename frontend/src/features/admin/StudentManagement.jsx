import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Link2, Pencil, Plus, RotateCcw, Upload, UserMinus, UserX, X } from 'lucide-react'
import { BatchSwitcher, EmptyState, Notice, PageHeader, Person, SkeletonRows, StatusPill, useToast } from '../../components/ui.jsx'
import { listBatches } from './batchRepository.js'
import { createLogger } from '../../lib/logger.js'
import { formatScholarship, scholarshipHint } from '../../lib/scholarship.js'
import {
  deactivateStudent,
  importCsvRows,
  linkStudentAccount,
  listPendingAuthUsers,
  listRoster,
  reactivateStudent,
  saveStudent,
  unlinkStudentAccount,
} from '../roster/rosterRepository.js'

const log = createLogger('roster')


function parseCsv(source) {
  // Excel saves UTF-8 CSV with a byte-order mark that would otherwise corrupt the first header.
  const text = source.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(value.trim()); value = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else value += char
  }
  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2) throw new Error('The CSV must include a header and at least one student row.')
  const headers = rows[0].map(item => item.toLowerCase())
  const required = ['student_id', 'full_name', 'email', 'batch']
  if (required.some(name => !headers.includes(name))) throw new Error('CSV headers must include student_id, full_name, email, and batch.')
  return rows.slice(1).map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function downloadTemplate() {
  const csv = 'student_id,full_name,email,batch,default_monthly_fee,default_scholarship_percent\nSAT-001,Example Student,student@example.com,Saturday,1000.00,43.3\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'al-bayan-student-import-template.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function StudentForm({ student, batches, onSaved, onCancel }) {
  const dialog = useRef(null)
  const [fields, setFields] = useState(student)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const change = (key, value) => { setFields(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined, form: undefined })) }
  useEffect(() => { dialog.current.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await saveStudent(fields, student.uuid)
      if (result.errors) setErrors(result.errors)
      else onSaved(result.student)
    } catch { setErrors({ form: 'The student could not be saved. Try again.' }) }
    finally { setSaving(false) }
  }

  const error = key => errors[key] && <span className="field-error">{errors[key]}</span>

  return (
    <dialog ref={dialog} className="dialog max-w-2xl" aria-labelledby="student-form-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel() }}>
      <div className="flex items-start justify-between gap-4">
        <h2 id="student-form-title">{student.uuid ? `Edit ${student.name}` : 'Add a student'}</h2>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onCancel}><X size={18} /></button>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <label className="label">Student ID
          <input className="field" value={fields.id} aria-invalid={Boolean(errors.id)} onChange={event => change('id', event.target.value)} placeholder="SAT-001" />
          {error('id')}
        </label>
        <label className="label">Full name
          <input className="field" value={fields.name} aria-invalid={Boolean(errors.name)} onChange={event => change('name', event.target.value)} />
          {error('name')}
        </label>
        <label className="label sm:col-span-2">Google email
          <input className="field" type="email" value={fields.email} aria-invalid={Boolean(errors.email)} onChange={event => change('email', event.target.value)} />
          {error('email') || <span className="field-hint">The student signs in with this Google account. Their access is linked automatically.</span>}
        </label>
        <label className="label">Batch
          <select className="field" value={fields.batchId} onChange={event => change('batchId', event.target.value)}>
            {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
          </select>
          {error('batchId')}
        </label>
        <label className="label">Monthly fee (BDT)
          <input className="field" type="number" min="0" step="0.01" value={fields.defaultMonthlyFee ?? ''} aria-invalid={Boolean(errors.defaultMonthlyFee)} onChange={event => change('defaultMonthlyFee', event.target.value)} placeholder="Not set" />
          {error('defaultMonthlyFee')}
        </label>
        <label className="label">Scholarship (%)
          <input className="field" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={fields.defaultScholarshipPercent ?? ''} aria-invalid={Boolean(errors.defaultScholarshipPercent)} onChange={event => change('defaultScholarshipPercent', event.target.value)} placeholder="0" />
          {error('defaultScholarshipPercent') || <span className="field-hint">{scholarshipHint}</span>}
        </label>
        {errors.form && <Notice tone="error" className="sm:col-span-2">{errors.form}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : student.uuid ? 'Save changes' : 'Add student'}</button>
        </div>
      </form>
    </dialog>
  )
}

function CsvImportDialog({ onClose, onImported }) {
  const dialog = useRef(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setResult(null); setError('')
    try { setRows(parseCsv(await file.text())) } catch (caught) { log.warn('Student CSV file could not be parsed', { fileName: file.name, sizeBytes: file.size, reason: caught.message }); setRows([]); setError(caught.message) }
  }
  async function submit() {
    setBusy(true); setError('')
    try {
      const next = await importCsvRows(rows)
      setResult(next)
      if (next.imported_count) onImported()
    } catch { setError('The import did not finish. Check the file and try again.') }
    finally { setBusy(false) }
  }
  function close() { dialog.current.close(); onClose() }

  return (
    <dialog ref={dialog} aria-labelledby="csv-title" onCancel={event => { event.preventDefault(); close() }} className="dialog max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="csv-title">Import students from a CSV file</h2><p className="mt-1 text-sm text-muted">Check the preview, then import. Rows with problems are skipped and listed.</p></div>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={close}><X size={18} /></button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="btn btn-secondary"><Upload size={16} aria-hidden="true" /> Choose file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile} /></label>
        <button type="button" className="btn btn-ghost" onClick={downloadTemplate}><Download size={16} aria-hidden="true" /> Download template</button>
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      {rows.length > 0 && <div className="panel table-scroll mt-4 max-h-72"><table className="data-table"><thead><tr>{Object.keys(rows[0]).map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(0, 50).map((row, index) => <tr key={index}>{Object.keys(rows[0]).map(key => <td key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div>}
      {result && <Notice tone={result.errors?.length ? 'warn' : 'success'} className="mt-4"><span>{result.imported_count} imported, {result.skipped_count} skipped.</span>{result.errors?.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{result.errors.map(item => <li key={item.row}>Row {item.row}: {item.message}</li>)}</ul>}</Notice>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn btn-secondary" onClick={close}>Close</button><button type="button" disabled={!rows.length || busy} className="btn btn-primary" onClick={submit}>{busy ? 'Importing…' : `Import ${rows.length} ${rows.length === 1 ? 'student' : 'students'}`}</button></div>
    </dialog>
  )
}

function AccountLinkPanel({ students, pendingUsers, onChanged }) {
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const unlinked = students.filter(student => student.isActive && !student.linkedUserId)
  async function link(student) {
    if (!selected[student.uuid]) return
    const account = pendingUsers.find(user => user.userId === selected[student.uuid])
    const accountEmail = account?.email?.toLowerCase() ?? ''
    if (accountEmail !== (student.email ?? '').toLowerCase()
      && !window.confirm(`The Google account (${accountEmail || 'no email'}) does not match ${student.name}'s recorded email (${student.email || 'none'}). Link anyway?`)) return
    setBusy(student.uuid); setError('')
    try { await linkStudentAccount(student.uuid, selected[student.uuid]); await onChanged() } catch { setError('The account could not be linked. Check that it is still waiting for access.') } finally { setBusy('') }
  }
  return (
    <details className="panel mt-4">
      <summary className="panel-head cursor-pointer list-none">
        <div><h2>Link accounts by hand</h2><p>{pendingUsers.length} {pendingUsers.length === 1 ? 'person is' : 'people are'} signed in but not linked. Use this when their Google email differs from the one on record.</p></div>
        <span className="btn btn-secondary btn-sm">Show</span>
      </summary>
      {error && <Notice tone="error" className="m-4">{error}</Notice>}
      {!unlinked.length ? <EmptyState>Every active student is linked.</EmptyState> : (
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Waiting account</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
          {unlinked.map(student => <tr key={student.uuid}>
            <th scope="row"><Person name={student.name} sub={student.email || 'No email on record'} /></th>
            <td><select className="field min-w-56" aria-label={`Account for ${student.name}`} value={selected[student.uuid] ?? ''} onChange={event => setSelected(current => ({ ...current, [student.uuid]: event.target.value }))}><option value="">Choose an account</option>{pendingUsers.map(user => <option key={user.userId} value={user.userId}>{user.email || user.fullName}</option>)}</select></td>
            <td className="text-right"><button type="button" disabled={busy === student.uuid || !selected[student.uuid]} className="btn btn-secondary btn-sm" onClick={() => link(student)}><Link2 size={15} aria-hidden="true" /> Link</button></td>
          </tr>)}
        </tbody></table></div>
      )}
    </details>
  )
}

export default function StudentManagement() {
  const [data, setData] = useState({ students: [], batches: [], pendingUsers: [], loading: true, error: '' })
  const [batchId, setBatchId] = useState(null)
  const [showActive, setShowActive] = useState(true)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const toast = useToast()

  async function load() {
    setData(current => ({ ...current, loading: true, error: '' }))
    try {
      const [students, batches, pendingUsers] = await Promise.all([listRoster(), listBatches(), listPendingAuthUsers()])
      setData({ students, batches, pendingUsers, loading: false, error: '' })
    } catch { setData(current => ({ ...current, loading: false, error: 'Student records could not be loaded.' })) }
  }
  useEffect(() => { load() }, [])

  const inStatus = data.students.filter(student => student.isActive === showActive)
  const counts = useMemo(() => {
    const map = new Map([[null, inStatus.length]])
    for (const student of inStatus) map.set(student.batchId, (map.get(student.batchId) ?? 0) + 1)
    return map
  }, [inStatus])
  const query = search.trim().toLowerCase()
  const visible = inStatus.filter(student => (batchId === null || student.batchId === batchId) && (!query || `${student.name} ${student.id} ${student.email}`.toLowerCase().includes(query)))

  async function toggleActive(student) {
    if (student.isActive && !window.confirm(`Deactivate ${student.name}? They lose access to homework and are left out of attendance and new tuition.`)) return
    try { if (student.isActive) await deactivateStudent(student.uuid); else await reactivateStudent(student.uuid); toast(`${student.name} was ${student.isActive ? 'deactivated' : 'reactivated'}.`); await load() } catch { toast('The student status could not be changed.', 'error') }
  }
  async function unlink(student) {
    if (!window.confirm(`Unlink ${student.name}'s Google account? They will lose portal access until linked again.`)) return
    try { await unlinkStudentAccount(student.uuid); toast(`${student.name}'s account was unlinked.`); await load() } catch { toast('The account could not be unlinked.', 'error') }
  }
  function newStudent() { setEditor({ uuid: null, id: '', name: '', email: '', batchId: batchId ?? data.batches[0]?.id ?? 1, defaultMonthlyFee: '', defaultScholarshipPercent: 0 }) }

  return <>
    <PageHeader title="Students" description="Add students with their Google email. They can sign in as soon as they're saved."
      actions={<>
        <button type="button" className="btn btn-secondary" onClick={() => setImportOpen(true)}><Upload size={16} aria-hidden="true" /> Import CSV</button>
        <button type="button" className="btn btn-primary" onClick={newStudent} disabled={!data.batches.length}><Plus size={16} aria-hidden="true" /> Add student</button>
      </>} />
    {data.error && <Notice tone="error" className="mb-4" action={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{data.error}</Notice>}
    {data.loading && !data.students.length ? <div className="panel"><SkeletonRows rows={7} label="Loading students…" /></div> : <>
      <BatchSwitcher batches={data.batches} selectedId={batchId} onSelect={setBatchId} counts={counts} allLabel="All batches" />
      <section className="panel" aria-labelledby="students-title">
        <div className="panel-head">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="students-title">{showActive ? 'Current students' : 'Former students'}</h2>
            <div className="flex gap-1.5" role="group" aria-label="Enrollment status">
              <button type="button" className="batch-chip" aria-pressed={showActive} onClick={() => setShowActive(true)}>Active</button>
              <button type="button" className="batch-chip" aria-pressed={!showActive} onClick={() => setShowActive(false)}>Inactive</button>
            </div>
          </div>
          <input className="field sm:max-w-xs" type="search" aria-label="Search students" placeholder="Search by name, ID or email" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        {visible.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Student</th>{batchId === null && <th>Batch</th>}<th>Google email</th><th className="num">Monthly fee</th><th>Scholarship</th><th>Sign-in</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{visible.map(student => <tr key={student.uuid}>
            <th scope="row" className="whitespace-nowrap"><Person name={student.name} sub={student.id} /></th>
            {batchId === null && <td>{student.batch}</td>}
            <td className="whitespace-nowrap">{student.email || <span className="text-danger">Missing</span>}</td>
            <td className="num">{student.defaultMonthlyFee == null ? <span className="text-muted">Not set</span> : `৳${student.defaultMonthlyFee.toLocaleString('en-BD')}`}</td>
            <td>{student.defaultScholarshipPercent ? formatScholarship(student.defaultScholarshipPercent) : <span className="text-muted">None</span>}</td>
            <td>{student.linkedUserId ? <StatusPill status="Linked" /> : <StatusPill tone="neutral">Not signed in yet</StatusPill>}</td>
            <td><div className="flex justify-end gap-0.5 whitespace-nowrap">
              {student.isActive && <button type="button" className="btn btn-ghost btn-sm" title="Edit" aria-label={`Edit ${student.name}`} onClick={() => setEditor(student)}><Pencil size={16} aria-hidden="true" /></button>}
              {student.linkedUserId && <button type="button" className="btn btn-ghost btn-sm" title="Unlink Google account" aria-label={`Unlink ${student.name}'s Google account`} onClick={() => unlink(student)}><UserMinus size={15} aria-hidden="true" /></button>}
              {student.isActive
                ? <button type="button" className="btn btn-ghost btn-sm text-danger" title="Deactivate" aria-label={`Deactivate ${student.name}`} onClick={() => toggleActive(student)}><UserX size={16} aria-hidden="true" /></button>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(student)}><RotateCcw size={15} aria-hidden="true" /> Reactivate</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title={query ? 'No matching students' : 'No students here yet'}>{query ? 'Try a different name or ID.' : showActive ? 'Add a student or import a CSV file.' : 'Deactivated students appear here.'}</EmptyState>}
      </section>
      {data.pendingUsers.length > 0 && <AccountLinkPanel students={data.students} pendingUsers={data.pendingUsers} onChanged={load} />}
    </>}
    {editor && <StudentForm student={editor} batches={data.batches} onCancel={() => setEditor(null)} onSaved={async student => { setEditor(null); toast(`${student.name} was saved.`); await load() }} />}
    {importOpen && <CsvImportDialog onClose={() => setImportOpen(false)} onImported={load} />}
  </>
}
