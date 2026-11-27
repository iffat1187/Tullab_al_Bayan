import React, { useEffect, useRef, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Notice } from '../../components/ui.jsx'
import { listRoster } from '../roster/rosterRepository.js'
import { listMonthlyTuition } from './tuitionRepository.js'
import { buildTuitionReport, reportPeriods } from './tuitionReport.js'

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '')

export default function TuitionPdfDialog({ month, batchId, batches = [], email = '', onClose, onDownloaded }) {
  const dialog = useRef(null)
  const inProgress = useRef(false)
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(month)
  const [fromMonth, setFromMonth] = useState(month)
  const [toMonth, setToMonth] = useState(month)
  const [selectedBatch, setSelectedBatch] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { dialog.current.showModal() }, [])

  function close() {
    if (!inProgress.current) onClose()
  }

  async function submit(event) {
    event.preventDefault()
    if (inProgress.current) return
    if (period === 'month' && !validMonth(selectedMonth)) {
      setError('Choose a valid billing month.')
      return
    }
    if (period === 'range' && (!validMonth(fromMonth) || !validMonth(toMonth) || fromMonth > toMonth)) {
      setError('Choose valid start and end months in order.')
      return
    }

    inProgress.current = true
    setLoading(true)
    setError('')
    try {
      const [students, records] = await Promise.all([listRoster(), listMonthlyTuition()])
      const report = buildTuitionReport({
        period, month: selectedMonth, fromMonth, toMonth,
        batchId: selectedBatch, batches, students, records,
      })
      if (!report.rows.length) throw new Error('No tuition records match these filters.')
      const { downloadTuitionReportPdf } = await import('./tuitionReportPdf.js')
      downloadTuitionReportPdf(report, { email, now: new Date() })
      onDownloaded(`PDF ready: ${report.rows.length} row${report.rows.length === 1 ? '' : 's'} downloaded.`)
      onClose()
    } catch (failure) {
      setError(failure?.message || 'The PDF could not be created. Check your connection and try again.')
    } finally {
      inProgress.current = false
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialog} className="dialog max-w-lg" aria-labelledby="tuition-pdf-title"
      onCancel={event => { event.preventDefault(); close() }}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <h2 id="tuition-pdf-title" className="font-semibold">Download tuition fee PDF</h2>
        <p className="text-sm text-muted">Choose the period and batch to include. The report uses the currently saved tuition records.</p>
        <fieldset disabled={loading} className="grid gap-4">
          <label className="grid gap-1">Report period
            <select className="field" value={period} onChange={event => { setPeriod(event.target.value); setError('') }}>
              {reportPeriods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {period === 'month' && (
            <label className="grid gap-1">Billing month
              <input className="field" type="month" required value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} />
            </label>
          )}
          {period === 'range' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">From month
                <input className="field" type="month" required value={fromMonth} onChange={event => setFromMonth(event.target.value)} />
              </label>
              <label className="grid gap-1">To month
                <input className="field" type="month" required value={toMonth} onChange={event => setToMonth(event.target.value)} />
              </label>
            </div>
          )}
          <label className="grid gap-1">Batch
            <select className="field" value={selectedBatch} onChange={event => setSelectedBatch(event.target.value)}>
              <option value="all">All batches</option>
              {batches.map(batch => (
                <option key={batch.id} value={String(batch.id)}>{batch.name}{batch.id === batchId ? ' (current)' : ''}</option>
              ))}
            </select>
          </label>
        </fieldset>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <FileDown size={16} aria-hidden="true" /> {loading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
