import React from 'react'
import { EmptyState, PageHeader } from '../../components/ui.jsx'
import { instituteWifi } from './academicRepository.js'

export function WifiInstructions() {
  const instructions = instituteWifi()
  return (
    <>
      <PageHeader title="Wi-Fi" description="How to connect at the institute." />
      <section className="panel">
        {instructions ? <div className="panel-body whitespace-pre-wrap">{instructions}</div>
          : <EmptyState title="Not added yet">Ask at the office for the Wi-Fi name and password.</EmptyState>}
      </section>
    </>
  )
}
