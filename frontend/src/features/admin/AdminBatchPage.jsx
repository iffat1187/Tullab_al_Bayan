import React, { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BackToBatches, BatchGrid } from './BatchGrid.jsx'
import { listActiveRosterForRole, listBatches } from './batchRepository.js'

export const fieldClass = 'w-full rounded-lg border border-field-border bg-field px-3 py-2'
export const buttonClass = 'rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50'

export function AdminBatchPage({ title, children, workspaceLabel = 'Admin dashboard' }) {
  const outlet = useOutletContext()
  const role = outlet?.role ?? null
  const [selectedBatchName, setSelectedBatchName] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState({
    loading: true,
    batches: [],
    students: [],
    error: '',
  })

  const reload = useCallback(() => {
    setReloadToken(value => value + 1)
  }, [])

  useEffect(() => {
    let active = true
    setState(current => ({ ...current, loading: true, error: '' }))

    async function load() {
      try {
        const batches = await listBatches()
        const students = await listActiveRosterForRole(role, batches)
        if (!active) return
        setState({ loading: false, batches, students, error: '' })
      } catch (error) {
        if (!active) return
        setState({
          loading: false,
          batches: [],
          students: [],
          error: error?.message || 'Batches and roster could not be loaded. Please try again.',
        })
      }
    }

    load()
    return () => {
      active = false
    }
  }, [role, reloadToken])

  const selectedBatch = selectedBatchName === null
    ? null
    : state.batches.find(item => item.name === selectedBatchName) ?? null
  const members = selectedBatch
    ? state.students.filter(student => student.batchId === selectedBatch.id || student.batch === selectedBatch.name)
    : []

  return (
    <div className="space-y-5">
      <header className="surface-banner rounded-2xl p-5 sm:p-8">
        <p className="text-sm font-semibold text-blue-900">{workspaceLabel}</p>
        <h1>{title}</h1>
      </header>

      {state.loading && !state.batches.length ? (
        <p role="status" className="rounded-xl border border-surface-border bg-surface p-5 text-slate-600">
          Loading batches and roster...
        </p>
      ) : state.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <p>{state.error}</p>
          <button type="button" className={buttonClass + ' mt-3'} onClick={reload}>Retry</button>
        </div>
      ) : selectedBatch === null ? (
        state.batches.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface p-5 text-slate-700">
            <p>No batches are configured.</p>
            <button type="button" className={buttonClass + ' mt-3'} onClick={reload}>Retry</button>
          </div>
        ) : (
          <BatchGrid batches={state.batches} students={state.students} onSelect={setSelectedBatchName} />
        )
      ) : (
        <>
          <BackToBatches onClick={() => setSelectedBatchName(null)} />
          <section className="rounded-2xl border border-surface-border bg-surface p-5 sm:p-6" aria-labelledby="admin-batch-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="admin-batch-title" className="text-xl font-bold">{selectedBatch.name} Batch</h2>
              {state.loading && <span role="status" className="text-sm text-slate-600">Refreshing...</span>}
            </div>
            {children({
              batchId: selectedBatch.id,
              batch: selectedBatch.name,
              batchInfo: selectedBatch,
              students: members,
              reload,
            })}
          </section>
        </>
      )}
    </div>
  )
}
