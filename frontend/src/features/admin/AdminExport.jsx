import React, { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Notice, PageHeader } from '../../components/ui.jsx'
import { classDate } from '../academics/academicRepository.js'
import { supabase } from '../auth/supabaseAuth.js'
import { buildExportArchive, exportFilter, fetchExportRows } from './exportData.js'

function downloadArchive({ bytes, filename }) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AdminExport() {
  const { role, account } = useOutletContext()
  const inProgress = useRef(false)
  const [scope, setScope] = useState('complete')
  const [month, setMonth] = useState(() => classDate().slice(0, 7))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  if (role !== 'admin') return null

  async function submit(event) {
    event.preventDefault()
    if (inProgress.current) return
    setFeedback(null)
    let filter
    try {
      filter = exportFilter(scope, { month, from, to })
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
      return
    }

    inProgress.current = true
    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const rows = await fetchExportRows(supabase, filter)
      if (Object.values(rows).every(table => table.length === 0)) {
        setFeedback({ tone: 'info', message: 'No records matched this export. The archive contains CSV headers and a manifest.' })
      }
      downloadArchive(buildExportArchive(rows, filter, account.email))
      if (Object.values(rows).some(table => table.length > 0)) {
        setFeedback({ tone: 'info', message: 'Your archive is ready. The download has started.' })
      }
    } catch {
      setFeedback({ tone: 'error', message: 'The export could not be completed. Check your access and connection, then try again.' })
    } finally {
      inProgress.current = false
      setLoading(false)
    }
  }

  return <>
    <PageHeader title="Export Data" description="Download six CSV files and a manifest as a ZIP archive." />
    <Notice className="mb-4">Use this export for reporting and archiving. Keep separate Supabase database backups for recovery.</Notice>
    <form className="panel panel-body grid max-w-2xl gap-4" onSubmit={submit}>
      <fieldset disabled={loading} className="grid gap-4">
        <label className="grid gap-1">Export scope
          <select className="field" value={scope} onChange={event => setScope(event.target.value)}>
            <option value="complete">Complete Institute Data</option>
            <option value="billing_month">Selected Billing Month</option>
            <option value="date_range">Custom Date Range</option>
          </select>
        </label>
        {scope === 'billing_month' && <label className="grid gap-1">Billing month
          <input className="field" type="month" required value={month} onChange={event => setMonth(event.target.value)} />
        </label>}
        {scope === 'date_range' && <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">Start date
            <input className="field" type="date" required value={from} onChange={event => setFrom(event.target.value)} />
          </label>
          <label className="grid gap-1">End date
            <input className="field" type="date" required value={to} onChange={event => setTo(event.target.value)} />
          </label>
        </div>}
      </fieldset>
      <div><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Preparing export…' : 'Download ZIP'}</button></div>
      {loading && <p role="status">Loading export records…</p>}
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
    </form>
  </>
}
