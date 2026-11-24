import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, Pencil, Plus, RotateCcw, Upload, UserMinus, X } from 'lucide-react'
import { BackToBatches, BatchGrid } from './BatchGrid.jsx'
import { listBatches } from './batchRepository.js'
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

const fieldClass = 'w-full rounded-lg border border-field-border bg-field px-3 py-2'

function parseCsv(text) {
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
  const csv = 'student_id,full_name,email,batch,default_monthly_fee,default_scholarship_percent\nSAT-001,Example Student,student@example.com,Saturday,1000.00,0\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'al-bayan-student-import-template.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

function StudentForm({ student, batches, onSaved, onCancel }) {
  const [fields, setFields] = useState(student)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const change = (key, value) => { setFields(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: undefined, form: undefined })) }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await saveStudent(fields, student.uuid)
      if (result.errors) setErrors(result.errors)
      else onSaved(result.student)
    } catch { setErrors({ form: 'The student could not be saved. Please try again.' }) }
    finally { setSaving(false) }
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-bold">{student.uuid ? 'Edit student' : 'Add student'}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        {[['id', 'Student ID', 'text'], ['name', 'Full name', 'text'], ['email', 'Google email', 'email']].map(([key, label, type]) => (
          <label key={key} className="text-sm font-semibold">{label}
            <input className={fieldClass + ' mt-1'} type={type} value={fields[key]} onChange={event => change(key, event.target.value)} />
            {errors[key] && <span className="mt-1 block font-normal text-red-800">{errors[key]}</span>}
          </label>
        ))}
        <label className="text-sm font-semibold">Student batch
          <select className={fieldClass + ' mt-1'} value={fields.batchId} onChange={event => change('batchId', event.target.value)}>
            {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
          </select>
          {errors.batchId && <span className="mt-1 block font-normal text-red-800">{errors.batchId}</span>}
        </label>
        <label className="text-sm font-semibold">Default monthly fee (BDT)
          <input className={fieldClass + ' mt-1'} type="number" min="0" step="0.01" value={fields.defaultMonthlyFee ?? ''} onChange={event => change('defaultMonthlyFee', event.target.value)} />
          {errors.defaultMonthlyFee && <span className="mt-1 block font-normal text-red-800">{errors.defaultMonthlyFee}</span>}
        </label>
        <label className="text-sm font-semibold">Default scholarship
          <select className={fieldClass + ' mt-1'} value={fields.defaultScholarshipPercent} onChange={event => change('defaultScholarshipPercent', event.target.value)}>
            {[0, 50, 100].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
        </label>
        {errors.form && <p role="alert" className="text-sm text-red-800 sm:col-span-2">{errors.form}</p>}
        <div className="flex gap-3 sm:col-span-2">
          <button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save student'}</button>
          <button type="button" className="rounded-lg border border-surface-border px-4 py-2 font-semibold" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
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
    try { setRows(parseCsv(await file.text())) } catch (caught) { setRows([]); setError(caught.message) }
  }
  async function submit() {
    setBusy(true); setError('')
    try {
      const next = await importCsvRows(rows)
      setResult(next)
      if (next.imported_count) onImported()
    } catch { setError('The CSV import could not be completed.') }
    finally { setBusy(false) }
  }
  function close() { dialog.current.close(); onClose() }

  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} className="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-2xl border border-surface-border bg-surface p-5 text-blue-950 shadow-xl backdrop:bg-slate-950/60">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Import students from CSV</h2><p className="mt-1 text-sm text-slate-600">Preview rows before sending them through server-side validation.</p></div><button type="button" aria-label="Close" onClick={close}><X /></button></div>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="rounded-lg border border-surface-border px-4 py-2 font-semibold" onClick={downloadTemplate}>Download template</button><input type="file" accept=".csv,text/csv" onChange={chooseFile} /></div>
      {error && <p role="alert" className="mt-3 text-red-800">{error}</p>}
      {rows.length > 0 && <div className="mt-4 max-h-72 overflow-auto"><table className="min-w-full text-sm"><thead><tr>{Object.keys(rows[0]).map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(0, 50).map((row, index) => <tr key={index}>{Object.keys(rows[0]).map(key => <td key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div>}
      {result && <div className="mt-4 rounded-lg bg-blue-50 p-3"><p>{result.imported_count} imported; {result.skipped_count} skipped.</p>{result.errors?.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-red-800">{result.errors.map(item => <li key={item.row}>Row {item.row}: {item.message}</li>)}</ul>}</div>}
      <div className="mt-5 flex justify-end gap-3"><button type="button" className="rounded-lg border px-4 py-2 font-semibold" onClick={close}>Close</button><button type="button" disabled={!rows.length || busy} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={submit}>{busy ? 'Importing…' : `Import ${rows.length} rows`}</button></div>
    </dialog>
  )
}

function AccountLinkPanel({ students, pendingUsers, onChanged }) {
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function link(student) {
    if (!selected[student.uuid]) return
    setBusy(student.uuid); setError('')
    try { await linkStudentAccount(student.uuid, selected[student.uuid]); await onChanged() } catch { setError('The account could not be linked. Verify that it is still pending.') } finally { setBusy('') }
  }
  async function unlink(student) {
    setBusy(student.uuid); setError('')
    try { await unlinkStudentAccount(student.uuid); await onChanged() } catch { setError('The account could not be unlinked.') } finally { setBusy('') }
  }
  return (
    <details className="rounded-2xl border border-surface-border bg-surface p-5">
      <summary className="cursor-pointer font-bold">Google account linking</summary>
      <p className="mt-2 text-sm text-slate-600">Link a verified pending Google account to an existing student record.</p>
      {error && <p role="alert" className="mt-2 text-red-800">{error}</p>}
      <div className="mt-4 max-h-80 space-y-3 overflow-auto">{students.map(student => <div key={student.uuid} className="grid gap-2 rounded-lg bg-blue-50 p-3 lg:grid-cols-[1fr_1fr_auto] lg:items-center"><span><strong>{student.name}</strong><span className="block text-sm">{student.id} · {student.email}</span></span>{student.linkedUserId ? <span className="text-sm font-semibold text-green-800">Linked</span> : <select className={fieldClass} value={selected[student.uuid] ?? ''} onChange={event => setSelected(current => ({ ...current, [student.uuid]: event.target.value }))}><option value="">Select pending account</option>{pendingUsers.map(user => <option key={user.userId} value={user.userId}>{user.email || user.fullName}</option>)}</select>}<button type="button" disabled={busy === student.uuid || (!student.linkedUserId && !selected[student.uuid])} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 font-semibold disabled:opacity-50" onClick={() => student.linkedUserId ? unlink(student) : link(student)}>{student.linkedUserId ? <><UserMinus size={16} /> Unlink</> : <><Link2 size={16} /> Link</>}</button></div>)}</div>
    </details>
  )
}

export default function StudentManagement() {
  const [data, setData] = useState({ students: [], batches: [], pendingUsers: [], loading: true, error: '' })
  const [batch, setBatch] = useState(null)
  const [activeTab, setActiveTab] = useState(true)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [notice, setNotice] = useState('')

  async function load() {
    setData(current => ({ ...current, loading: true, error: '' }))
    try {
      const [students, batches, pendingUsers] = await Promise.all([listRoster(), listBatches(), listPendingAuthUsers()])
      setData({ students, batches, pendingUsers, loading: false, error: '' })
    } catch { setData(current => ({ ...current, loading: false, error: 'Student records could not be loaded. Retry to continue.' })) }
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => data.students.filter(student => student.isActive === activeTab && (!batch || student.batch === batch) && (!search.trim() || `${student.name} ${student.id}`.toLowerCase().includes(search.trim().toLowerCase()))), [data.students, activeTab, batch, search])
  async function toggleActive(student) {
    try { if (student.isActive) await deactivateStudent(student.uuid); else await reactivateStudent(student.uuid); setNotice(`${student.name} was ${student.isActive ? 'deactivated' : 'reactivated'}.`); await load() } catch { setNotice('The student status could not be changed.') }
  }
  function newStudent() { setEditor({ uuid: null, id: '', name: '', email: '', batchId: data.batches.find(item => item.name === batch)?.id ?? data.batches[0]?.id ?? 1, defaultMonthlyFee: '', defaultScholarshipPercent: 0 }) }

  return <div className="space-y-5">
    <header className="surface-banner rounded-2xl p-5 sm:p-8"><p className="text-sm font-semibold text-blue-900">Admin dashboard</p><h1>Student Management</h1><p className="mt-3 text-blue-900">Manage the live roster, imports, enrollment status, and Google account links.</p></header>
    {data.error && <p role="alert" className="text-red-800">{data.error} <button className="underline" onClick={load}>Retry</button></p>}
    {data.loading ? <p>Loading students…</p> : batch === null ? <>
      <div className="flex flex-wrap gap-3"><button className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" onClick={() => setImportOpen(true)}><Upload size={17} /> Import CSV</button><button className="rounded-lg border px-4 py-2 font-semibold" onClick={() => setActiveTab(current => !current)}>{activeTab ? 'View inactive students' : 'View active students'}</button></div>
      <BatchGrid batches={data.batches} students={data.students.filter(student => student.isActive === activeTab)} onSelect={setBatch} />
      <AccountLinkPanel students={data.students} pendingUsers={data.pendingUsers} onChanged={load} />
    </> : <div className="space-y-5">
      <BackToBatches onClick={() => { setBatch(null); setEditor(null); setSearch('') }} />
      <div className="flex flex-wrap gap-3"><button className="rounded-lg border px-4 py-2 font-semibold" onClick={() => setActiveTab(current => !current)}>{activeTab ? 'Show inactive' : 'Show active'}</button>{activeTab && <button className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" onClick={newStudent}><Plus size={17} /> Add student</button>}</div>
      {notice && <p role="status" className="rounded-lg bg-blue-50 p-3">{notice}</p>}
      {editor && <StudentForm student={editor} batches={data.batches} onCancel={() => setEditor(null)} onSaved={async student => { setEditor(null); setNotice(`${student.name} was saved.`); await load() }} />}
      <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex flex-wrap items-end justify-between gap-4 p-5"><div><h2 className="text-lg font-bold">{batch} · {activeTab ? 'Active' : 'Inactive'} students</h2><p className="text-sm text-slate-600">{visible.length} shown</p></div><input className={fieldClass + ' max-w-sm'} type="search" placeholder="Search name or student ID" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {visible.length ? <div className="overflow-x-auto"><table className="min-w-full"><thead><tr>{['Student ID', 'Name', 'Email', 'Fee', 'Scholarship', 'Account', 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(student => <tr key={student.uuid}><td>{student.id}</td><td className="font-semibold">{student.name}</td><td>{student.email || 'Email required'}</td><td>{student.defaultMonthlyFee == null ? 'Not set' : `BDT ${student.defaultMonthlyFee.toFixed(2)}`}</td><td>{student.defaultScholarshipPercent}%</td><td>{student.linkedUserId ? 'Linked' : 'Unlinked'}</td><td className="whitespace-nowrap">{student.isActive && <button className="mr-2 inline-flex items-center gap-1 font-semibold text-blue-800" onClick={() => setEditor(student)}><Pencil size={15} /> Edit</button>}<button className="inline-flex items-center gap-1 font-semibold text-red-800" onClick={() => toggleActive(student)}>{student.isActive ? <><UserMinus size={15} /> Deactivate</> : <><RotateCcw size={15} /> Reactivate</>}</button></td></tr>)}</tbody></table></div> : <p className="border-t p-5 text-slate-600">No matching students.</p>}</section>
    </div>}
    {importOpen && <CsvImportDialog onClose={() => setImportOpen(false)} onImported={load} />}
  </div>
}
