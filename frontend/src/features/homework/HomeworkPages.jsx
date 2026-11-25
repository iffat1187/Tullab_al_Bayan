import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { formatDate } from '../../lib/formatDate.js'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { AdminBatchPage, buttonClass, fieldClass } from '../admin/AdminBatchPage.jsx'
import { EmptyState, LoadingState, Notice, PageHeader, StatusPill, useToast } from '../../components/ui.jsx'
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

function HomeworkList({ assignments, actions, emptyText = 'No homework has been published for this batch yet.' }) {
  if (!assignments.length) {
    return <div className="panel"><EmptyState>{emptyText}</EmptyState></div>
  }

  const today = todayInDhaka()

  return (
    <ol className="grid gap-3">
      {assignments.map(item => {
        const isOverdue = Boolean(item.deadline && item.deadline < today)
        return (
          <li key={item.id} className="panel panel-body">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg break-words">{item.title}</h3>
              {item.deadline && (isOverdue
                ? <StatusPill status="Overdue">Was due {formatDate(item.deadline)}</StatusPill>
                : <StatusPill tone="brand">Due {formatDate(item.deadline)}</StatusPill>)}
            </div>
            <p className="mt-1 text-sm text-muted">
              Published <time dateTime={item.publishedAt}>{formatPublishedDate(item.publishedAt)}</time>
            </p>
            <p className="mt-3 max-w-[70ch] whitespace-pre-wrap break-words">{item.instructions}</p>
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
      className="dialog max-w-md">
      <h3 id="delete-homework-title" className="text-lg">Delete this homework?</h3>
      <p id="delete-homework-description" className="mt-2 break-words">
        “{assignment.title}” will be removed permanently from the batch’s homework page.
      </p>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancelButton} type="button" disabled={busy} onClick={close} className="btn btn-secondary">
          Cancel
        </button>
        <button type="button" disabled={busy} className="btn btn-danger" onClick={onConfirm}>
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
  const toast = useToast()

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
      setResult(null)
      toast(wasEdit ? 'Homework updated.' : `Homework published to the ${batch} batch.`)
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
      toast('Homework deleted.')
    } catch (error) {
      setDeleteError(error?.message || 'Homework could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {!form && (
        <button className="btn btn-primary mb-4" type="button" onClick={() => openForm()}>
          <Plus size={16} aria-hidden="true" /> New homework for {batch}
        </button>
      )}

      {form && (
        <form onSubmit={publish} noValidate className="panel panel-body mb-4 grid gap-4">
          <h2>{form.id ? 'Edit homework' : `New homework for the ${batch} batch`}</h2>

          <label className="label" htmlFor="homework-title">Title
            <input id="homework-title" type="text" required className={fieldClass}
              placeholder="For example: Lesson 4 vocabulary"
              value={form.title}
              onChange={event => setForm({ ...form, title: event.target.value })} />
          </label>

          <label className="label" htmlFor="homework-instructions">What students should do
            <textarea id="homework-instructions" rows={5} required className={fieldClass}
              placeholder="Pages, exercises and anything students should bring"
              value={form.instructions}
              onChange={event => setForm({ ...form, instructions: event.target.value })} />
          </label>

          <label className="label max-w-xs" htmlFor="homework-deadline">Due date <span className="font-normal text-muted">(optional)</span>
            <input id="homework-deadline" type="date" className={fieldClass}
              value={form.deadline}
              onChange={event => setForm({ ...form, deadline: event.target.value })} />
          </label>

          {result?.error && <Notice tone="error">{result.message}</Notice>}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={saving}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Publish homework'}
            </button>
            <button type="button" disabled={saving} className="btn btn-secondary"
              onClick={() => { setForm(null); setResult(null) }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {result && !(form && result.error) && (
        <Notice tone={result.error ? 'error' : 'success'} className="mb-4">{result.message}</Notice>
      )}

      {loading ? (
        <LoadingState>Loading homework…</LoadingState>
      ) : loadError ? (
        <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Try again</button>}>{loadError}</Notice>
      ) : (
        <HomeworkList
          assignments={assignments}
          emptyText={`Nothing published for the ${batch} batch yet.`}
          actions={item => (
            <div className="mt-4 flex flex-wrap gap-1 border-t border-surface-border pt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openForm(item)}>
                <Pencil size={15} aria-hidden="true" /> Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm text-danger"
                onClick={() => { setDeleteError(''); setDeleteTarget(item) }}>
                <Trash2 size={15} aria-hidden="true" /> Delete
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
    <AdminBatchPage title="Homework" description="Publish homework to a batch. Students in that batch see it right away.">
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
        <PageHeader title="Homework" />
        <Notice tone="warn">You're no longer enrolled, so there's no batch homework to show.</Notice>
      </>
    )
  }

  if (!account.batchId) {
    return (
      <>
        <PageHeader title="Homework" />
        <Notice tone="info">You haven't been placed in a batch yet. Ask the office to assign one.</Notice>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Homework" description={account.batch ? `Set by your teachers for the ${account.batch} batch.` : undefined} />
      {loading ? (
        <LoadingState>Loading homework…</LoadingState>
      ) : error ? (
        <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadToken(v => v + 1)}>Try again</button>}>{error}</Notice>
      ) : (
        <HomeworkList assignments={assignments} emptyText="No homework right now. Check back after your next class." />
      )}
    </>
  )
}
