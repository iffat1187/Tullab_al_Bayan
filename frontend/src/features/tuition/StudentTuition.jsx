import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { EmptyState, LoadingState, Notice, PageHeader, StatusPill } from '../../components/ui.jsx'
import { formatBillingMonth, formatTuitionAmount } from './tuitionFormat.js'
import { feeNotSetStatus, listStudentTuition } from './tuitionRepository.js'

export function TuitionHistory({ studentUuid, waiverOnly = false }) {
  const [state, setState] = useState({ records: [], loading: true, error: '' })
  useEffect(() => {
    let active = true
    setState({ records: [], loading: true, error: '' })
    listStudentTuition(studentUuid)
      .then(records => { if (active) setState({ records, loading: false, error: '' }) })
      .catch(() => { if (active) setState({ records: [], loading: false, error: 'Tuition records could not be loaded. Refresh the page to try again.' }) })
    return () => { active = false }
  }, [studentUuid])
  if (state.loading) return <LoadingState>Loading tuition records…</LoadingState>
  if (state.error) return <Notice tone="error" className="mt-4">{state.error}</Notice>
  const records = waiverOnly ? state.records.filter(record => record.scholarship > 0) : state.records
  if (!records.length) return <EmptyState>{waiverOnly ? 'No scholarship has been recorded.' : 'No tuition has been recorded yet.'}</EmptyState>
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Monthly tuition records">
      <table className="data-table">
        <thead><tr><th scope="col">Month</th><th scope="col" className="num">Base fee</th><th scope="col">Scholarship</th><th scope="col" className="num">Amount due</th><th scope="col">Status</th></tr></thead>
        <tbody>{records.map(record => (
          <tr key={record.id}>
            <th scope="row">{formatBillingMonth(record.month)}</th>
            <td className="num">{record.baseFee === null ? feeNotSetStatus : formatTuitionAmount(record.baseFee)}</td>
            <td>{record.scholarship ? `${record.scholarship}%` : 'None'}</td>
            <td className="num font-medium">{record.due === null ? '—' : formatTuitionAmount(record.due)}</td>
            <td><StatusPill status={record.status} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export default function StudentTuition({ title, waiverOnly }) {
  const { account } = useOutletContext()
  return (
    <>
      <PageHeader title={title} description="Your monthly fees and payments. Pay at the institute office; the office marks payments here." />
      {account.isActive === false && <Notice tone="warn" className="mb-4">You're no longer enrolled. This is a read-only record of your past tuition.</Notice>}
      <section className="panel"><TuitionHistory studentUuid={account.studentUuid} waiverOnly={waiverOnly} /></section>
    </>
  )
}
