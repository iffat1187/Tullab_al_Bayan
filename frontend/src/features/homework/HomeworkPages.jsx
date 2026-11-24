import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { formatDate } from '../../lib/formatDate.js'
import { AdminBatchPage, buttonClass, fieldClass } from '../admin/AdminBatchPage.jsx'
import { deleteHomework, listHomework, saveHomework } from './homeworkRepository.js'

const dhakaDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Dhaka',
  dateStyle: 'short',
})

function todayInDhaka() {
  return dhakaDateFormatter.format(new Date())
}

function formatPublishedDate(isoTimestamp) {
  if (!isoTimestamp) return ''
  return formatDate(dhakaDateFormatter.format(new Date(isoTimestamp)))
}

function HomeworkList({ assignments, actions }) {
  if (!assignments.length) {
    return <p className="page-description">No homework has been published for this batch yet.</p>
  }

  const today = todayInDhaka()

  return (
    <ol className="mt-4 grid gap-4">
      {assignments.map(item => {
        const isOverdue = Boolean(item.deadline && item.deadline < today)
        return (
          <li key={item.id} className="rounded-xl border border-surface-border bg-field p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-bold text-blue-950 break-words">{item.title}</h3>
              {isOverdue && (
                <span className="inline-block rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-900">
                  Overdue
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Published <time dateTime={item.publishedAt}>{formatPublishedDate(item.publishedAt)}</time>
              {item.deadline && <> · Due <time dateTime={item.deadline}>{formatDate(item.deadline)}</time></>}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-slate-800">{item.instructions}</p>
            {actions?.(item)}
          </li>
        )
      })}
    </ol>
  )
}

function DeleteHomeworkDialog({ assignment, busy, error, onCancel, onConfirm }) {
  const dialog = useRef(null)
  const cancelButton = useRef(null)

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    cancelButton.current.focus()
    return () => {
      if (node.open) node.close()
    }
  }, [])

  function close() {
    if (busy) return
    dialog.current.close()
    onCancel()
  }

  return (
    <dialog ref={dialog} aria-labelledby="delete-homework-title" aria-describedby="delete-homework-description"
      onCancel={event => { event.preventDefault(); close() }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-surface-border bg-surface p-5 shadow-lg backdrop:bg-slate-950/60">
      <h3 id="delete-homework-title" className="text-lg font-bold">Delete homework?</h3>
      <p id="delete-homework-description" className="mt-2 break-words">
        “{assignment.title}” will be removed permanently from the batch’s homework page.
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button ref={cancelButton} type="button" disabled={busy} onClick={close}
          className="rounded-lg border border-field-border px-3 py-2 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" disabled={busy}
          className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white disabled:opacity-50"
          onClick={onConfirm}>
          {busy ? 'Deleting...' : 'Delete homework'}
        </button>
      </div>
    </dialog>
  )
}

function BatchHomework({ batch, batchId }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [result, setResult] = useState(null)

  const reload = useCallback(() => {
    setReloadToken(value => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')

    listHomework(batchId).then(
      items => {
        if (!active) return
        setAssignments(items)
        setLoading(false)
      },
      error => {
        if (!active) return
        setAssignments([])
        setLoadError(error?.message || 'Homework could not be loaded. Please try again.')
        setLoading(false)
      },
    )

    return () => {
      active = false
    }
  }, [batchId, reloadToken])

  function openForm(item = null) {
    setResult(null)
    setForm(item
      ? { id: item.id, title: item.title, instructions: item.instructions, deadline: item.deadline ?? '' }
      : { id: null, title: '', instructions: '', deadline: '' })
  }

  async function publish(event) {
    event.preventDefault()
    if (!form.title.trim()) {
      setResult({ error: true, message: 'Enter a homework title before saving.' })
      return
    }
    if (!form.instructions.trim()) {
      setResult({ error: true, message: 'Enter homework instructions before saving.' })
      return
    }
    if (form.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(form.deadline)) {
      setResult({ error: true, message: 'Enter a valid deadline date (YYYY-MM-DD).' })
      return
    }

    setSaving(true)
    setResult(null)
    try {
      const wasEdit = Boolean(form.id)
      await saveHomework({
        id: form.id,
        batchId,
        title: form.title,
        instructions: form.instructions,
        deadline: form.deadline || null,
      })
      const refreshed = await listHomework(batchId)
      setAssignments(refreshed)
      setForm(null)
      setResult({
        message: wasEdit
          ? 'Homework updated for the ' + batch + ' batch.'
          : 'Homework published to the ' + batch + ' batch.',
      })
    } catch (error) {
      setResult({ error: true, message: error?.message || 'Homework could not be saved. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteHomework(deleteTarget.id)
      if (form?.id === deleteTarget.id) setForm(null)
      const refreshed = await listHomework(batchId)
      setAssignments(refreshed)
      setDeleteTarget(null)
      setResult({ message: 'Homework deleted.' })
    } catch (error) {
      setDeleteError(error?.message || 'Homework could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button className={buttonClass + ' mt-4'} type="button" onClick={() => openForm()}>
        New homework
      </button>

      {form && (
        <form onSubmit={publish} noValidate className="mt-4 rounded-xl border border-surface-border bg-field p-4">
          <h3 className="font-bold">{form.id ? 'Edit homework' : 'New homework'} · {batch} Batch</h3>

          <label className="mt-3 block font-semibold" htmlFor="homework-title">Title</label>
          <input id="homework-title" type="text" required className={fieldClass + ' mt-1'}
            placeholder="e.g. Arabic vocabulary practice"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })} />

          <label className="mt-3 block font-semibold" htmlFor="homework-instructions">Instructions</label>
          <textarea id="homework-instructions" rows={5} required className={fieldClass + ' mt-1'}
            placeholder="Describe the assignment for this batch"
            value={form.instructions}
            onChange={event => setForm({ ...form, instructions: event.target.value })} />

          <label className="mt-3 block font-semibold" htmlFor="homework-deadline">Deadline (optional)</label>
          <input id="homework-deadline" type="date" className={fieldClass + ' mt-1 max-w-xs'}
            value={form.deadline}
            onChange={event => setForm({ ...form, deadline: event.target.value })} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={saving}>
              {saving ? 'Saving...' : 'Save homework'}
            </button>
            <button type="button" disabled={saving}
              className="rounded-lg border border-field-border px-4 py-2 disabled:opacity-50"
              onClick={() => { setForm(null); setResult(null) }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && (
        <p className={'mt-3 text-sm ' + (result.error ? 'text-red-800' : 'text-blue-900')}
          role={result.error ? 'alert' : 'status'}>
          {result.message}
        </p>
      )}

      {loading ? (
        <p role="status" className="mt-4 text-slate-600">Loading homework...</p>
      ) : loadError ? (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p>{loadError}</p>
          <button type="button" className={buttonClass + ' mt-3'} onClick={reload}>Retry</button>
        </div>
      ) : (
        <HomeworkList
          assignments={assignments}
          actions={item => (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-field-border px-3 py-2"
                onClick={() => openForm(item)}>
                Edit
              </button>
              <button type="button" className="rounded-lg border border-field-border px-3 py-2 text-red-800"
                onClick={() => { setDeleteError(''); setDeleteTarget(item) }}>
                Delete
              </button>
            </div>
          )}
        />
      )}

      {deleteTarget && (
        <DeleteHomeworkDialog
          assignment={deleteTarget}
          busy={deleting}
          error={deleteError}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}

export function HomeworkManagement({ role }) {
  return (
    <AdminBatchPage title="Homework Management" workspaceLabel={role === 'teacher' ? 'Teacher workspace' : 'Admin dashboard'}>
      {({ batch, batchId }) => <BatchHomework key={batchId} batch={batch} batchId={batchId} />}
    </AdminBatchPage>
  )
}

export function StudentHomework() {
  const { account } = useOutletContext()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(Boolean(account?.isActive && account?.batchId))
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const canLoad = Boolean(account?.isActive && account?.batchId)

  useEffect(() => {
    if (!canLoad) {
      setAssignments([])
      setLoading(false)
      setError('')
      return
    }

    let active = true
    setLoading(true)
    setError('')

    listHomework(account.batchId).then(
      items => {
        if (!active) return
        setAssignments(items)
        setLoading(false)
      },
      loadError => {
        if (!active) return
        setAssignments([])
        setError(loadError?.message || 'Homework could not be loaded. Please try again.')
        setLoading(false)
      },
    )

    return () => {
      active = false
    }
  }, [canLoad, account?.batchId, reloadToken])

  if (!account?.isActive) {
    return (
      <>
        <h1>Homework</h1>
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950" role="status">
          Your enrollment is currently inactive. Active batch homework is available only to enrolled students.
        </p>
      </>
    )
  }

  if (!account.batchId) {
    return (
      <>
        <h1>Homework</h1>
        <p className="page-description">No active batch was found for your student account.</p>
      </>
    )
  }

  return (
    <>
      <h1>Homework</h1>
      {account.batch && <p className="page-description">{account.batch} Batch</p>}
      {loading ? (
        <p role="status" className="mt-4 text-slate-600">Loading homework...</p>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <p>{error}</p>
          <button type="button" className={buttonClass + ' mt-3'} onClick={() => setReloadToken(v => v + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <HomeworkList assignments={assignments} />
      )}
    </>
  )
}
