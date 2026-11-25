import React, { useEffect, useRef, useState } from 'react'
import { EmptyState, LoadingState, Notice, PageHeader } from '../../components/ui.jsx'
import { approveTeacher, listTeacherManagementAccounts, revokeTeacher } from './teacherRepository.js'

function AccountList({ title, accounts, empty, action, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2></div>
      {accounts.length ? (
        <ul className="divide-y">
          {accounts.map(account => (
            <li key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 break-words">
                <p className="font-medium">{account.full_name || 'Name unavailable'}</p>
                <p className="text-sm text-muted">{account.email}</p>
                {account.staff_code && <p className="text-sm">Staff code {account.staff_code}</p>}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect(account)}>{action}</button>
            </li>
          ))}
        </ul>
      ) : <EmptyState>{empty}</EmptyState>}
    </section>
  )
}

function TeacherActionDialog({ account, approval, onCancel, onSaved }) {
  const dialog = useRef(null)
  const [name, setName] = useState(account.full_name ?? '')
  const [staffCode, setStaffCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const title = approval ? 'Approve as Teacher' : 'Revoke teacher access'

  useEffect(() => { dialog.current.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    if (approval && !name.trim()) {
      setError('Enter the verified name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (approval) await approveTeacher(account.user_id, name, staffCode)
      else await revokeTeacher(account.user_id)
      onSaved(approval ? 'Teacher access approved.' : 'Teacher access revoked.')
    } catch (failure) {
      setError(failure?.message || 'The account change could not be saved.')
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className="dialog max-w-lg" aria-labelledby="teacher-action-title"
      onCancel={event => { event.preventDefault(); if (!saving) onCancel() }}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <h2 id="teacher-action-title" className="font-semibold">{title}</h2>
        <p className="break-words">{account.full_name || account.email}{account.full_name && account.email ? ' (' + account.email + ')' : ''}</p>
        {approval ? <>
          <label className="grid gap-1">Verified name
            <input className="field" required value={name} disabled={saving} onChange={event => setName(event.target.value)} />
          </label>
          <label className="grid gap-1">Staff code (optional)
            <input className="field" value={staffCode} disabled={saving} onChange={event => setStaffCode(event.target.value)} />
          </label>
        </> : <p>Revoking access preserves the teacher’s existing homework and attendance records.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : title}</button>
        </div>
      </form>
    </dialog>
  )
}

export default function TeacherManagement() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    listTeacherManagementAccounts().then(
      data => { if (active) setAccounts(data) },
      () => { if (active) setError('Teacher accounts could not be loaded.') },
    )
    return () => { active = false }
  }, [revision])

  function reload() {
    setAccounts(null)
    setError('')
    setRevision(value => value + 1)
  }

  return <>
    <PageHeader title="Teacher Management" description="Verify Google accounts before granting teacher access." />
    {message && <p className="mb-4" role="status">{message}</p>}
    {error ? <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Try again</button>}>{error}</Notice>
      : !accounts ? <LoadingState /> : <div className="grid gap-4">
        <AccountList title="Pending Google accounts" accounts={accounts.pending} empty="No pending Google accounts."
          action="Approve as Teacher" onSelect={account => setSelection({ account, approval: true })} />
        <AccountList title="Approved teachers" accounts={accounts.teachers} empty="No approved teachers."
          action="Revoke teacher access" onSelect={account => setSelection({ account, approval: false })} />
      </div>}
    {selection && <TeacherActionDialog {...selection} onCancel={() => setSelection(null)} onSaved={notice => {
      setMessage(notice)
      setSelection(null)
      reload()
    }} />}
  </>
}
