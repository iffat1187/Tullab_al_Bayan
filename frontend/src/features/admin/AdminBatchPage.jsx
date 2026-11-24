import React, { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BatchSwitcher, defaultBatchId, LoadingState, Notice, PageHeader, rememberBatch } from '../../components/ui.jsx'
import { listActiveRosterForRole, listBatches } from './batchRepository.js'

export const fieldClass = 'field'
export const buttonClass = 'btn btn-primary'

/**
 * Page frame for every batch-based staff page (attendance, homework, tuition, calendar).
 * The batch switcher stays on screen; the choice is remembered across pages and
 * defaults to today's class.
 */
export function AdminBatchPage({ title, description, children }) {
  const outlet = useOutletContext()
  const role = outlet?.role ?? null
  const [selectedId, setSelectedId] = useState(null)
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
        setSelectedId(current => current ?? defaultBatchId(batches))
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

  function select(id) {
    setSelectedId(id)
    rememberBatch(id)
  }

  const selectedBatch = state.batches.find(item => item.id === selectedId) ?? null
  const members = selectedBatch
    ? state.students.filter(student => student.batchId === selectedBatch.id || student.batch === selectedBatch.name)
    : []
  const counts = new Map(state.batches.map(batch => [batch.id, state.students.filter(student => student.batchId === batch.id).length]))

  return (
    <>
      <PageHeader title={title} description={description} />

      {state.loading && !state.batches.length ? (
        <LoadingState>Loading batches…</LoadingState>
      ) : state.error ? (
        <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Try again</button>}>
          {state.error}
        </Notice>
      ) : !state.batches.length ? (
        <Notice tone="info" action={<button type="button" className="btn btn-secondary btn-sm" onClick={reload}>Try again</button>}>
          No batches are set up yet.
        </Notice>
      ) : (
        <>
          <BatchSwitcher batches={state.batches} selectedId={selectedBatch?.id ?? null} onSelect={select} counts={counts} />
          {selectedBatch && children({
            batchId: selectedBatch.id,
            batch: selectedBatch.name,
            batchInfo: selectedBatch,
            students: members,
            reload,
          })}
        </>
      )}
    </>
  )
}
