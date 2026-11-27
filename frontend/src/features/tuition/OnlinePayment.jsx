import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { EmptyState, LoadingState, Notice, PageHeader } from '../../components/ui.jsx'
import { deletePaymentInstruction, listPaymentInstructions, savePaymentInstruction } from './paymentRepository.js'

const methods = [
  {
    id: 'bank',
    title: 'Bank Payment',
    fields: [
      { key: 'bank_name', label: 'Bank' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'account_name', label: 'Account Name' },
      { key: 'account_number', label: 'A/C No.', inputMode: 'numeric' },
      { key: 'routing_number', label: 'Routing No.', inputMode: 'numeric' },
    ],
  },
  {
    id: 'bkash',
    title: 'bKash Payment',
    fields: [
      { key: 'mobile_number', label: 'Number', inputMode: 'tel' },
      { key: 'transfer_instruction', label: 'Transfer instructions', multiline: true },
      { key: 'reference_instruction', label: 'Reference', multiline: true },
      { key: 'cash_out_instruction', label: 'Cash-out instructions', multiline: true },
    ],
  },
]

function PaymentMethodCard({ method, instruction, canEdit, onChange }) {
  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState('')
  const [feedback, setFeedback] = useState(null)
  const headingId = method.id + '-payment-title'

  function startEditing() {
    setFeedback(null)
    setDraft(Object.fromEntries(method.fields.map(({ key }) => [key, instruction?.[key] ?? ''])))
  }

  async function save(event) {
    event.preventDefault()
    if (!canEdit || pending) return
    const details = Object.fromEntries(method.fields.map(({ key }) => [key, draft[key].trim()]))
    if (Object.values(details).some(value => !value)) {
      setFeedback({ tone: 'error', text: 'Fill in every field before saving.' })
      return
    }

    setPending('save')
    setFeedback(null)
    try {
      const saved = await savePaymentInstruction(method.id, details, Boolean(instruction))
      onChange(method.id, saved)
      setDraft(null)
      setFeedback({ tone: 'success', text: method.title + ' instructions saved.' })
    } catch {
      setFeedback({ tone: 'error', text: 'The instructions could not be saved. Try again.' })
    } finally {
      setPending('')
    }
  }

  async function remove() {
    if (!canEdit || pending || !window.confirm('Delete ' + method.title + ' instructions? Students will stop seeing this method.')) return
    setPending('delete')
    setFeedback(null)
    try {
      await deletePaymentInstruction(method.id)
      onChange(method.id, null)
      setFeedback({ tone: 'success', text: method.title + ' instructions deleted.' })
    } catch {
      setFeedback({ tone: 'error', text: 'The instructions could not be deleted. Try again.' })
    } finally {
      setPending('')
    }
  }

  return (
    <section className="panel panel-body min-w-0" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId}>{method.title}</h2>
        {canEdit && instruction && !draft && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" disabled={Boolean(pending)} onClick={startEditing}>Edit</button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(pending)} onClick={remove}>{pending === 'delete' ? 'Deleting…' : 'Delete'}</button>
          </div>
        )}
      </div>

      {canEdit && draft ? (
        <form className="mt-4 grid gap-3" aria-labelledby={headingId} onSubmit={save}>
          {method.fields.map(({ key, label, inputMode, multiline }) => {
            const fieldProps = {
              id: method.id + '-' + key,
              className: 'field',
              value: draft[key],
              required: true,
              disabled: Boolean(pending),
              onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })),
            }
            return (
              <div className="grid gap-1" key={key}>
                <label htmlFor={fieldProps.id}>{label}</label>
                {multiline ? <textarea {...fieldProps} rows={2} /> : <input {...fieldProps} inputMode={inputMode} />}
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={Boolean(pending)}>{pending === 'save' ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(pending)} onClick={() => {
              setDraft(null)
              setFeedback(null)
            }}>Cancel</button>
          </div>
        </form>
      ) : instruction ? (
        <dl className="mt-4 grid gap-3">
          {method.fields.map(({ key, label, multiline }) => (
            <div key={key}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className={multiline ? 'whitespace-pre-wrap break-words' : 'break-words font-medium tabular-nums'}>{instruction[key]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          <p className="mt-3 text-muted">This payment method is unpublished.</p>
          <button type="button" className="btn btn-primary mt-3" onClick={startEditing}>Add payment method</button>
        </>
      )}

      {feedback && <Notice className="mt-4" tone={feedback.tone}>{feedback.text}</Notice>}
    </section>
  )
}

export default function OnlinePayment() {
  const { role } = useOutletContext()
  const canEdit = role === 'admin' || role === 'teacher'
  const [instructions, setInstructions] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    listPaymentInstructions().then(
      rows => { if (active) setInstructions(Object.fromEntries(rows.map(row => [row.method, row]))) },
      () => { if (active) setLoadError(true) },
    )
    return () => { active = false }
  }, [attempt])

  function updateInstruction(methodId, instruction) {
    setInstructions(current => ({ ...current, [methodId]: instruction }))
  }

  const visibleMethods = instructions && methods.filter(method => canEdit || instructions[method.id])

  return (
    <>
      <PageHeader title="Online Payment" description="Payment instructions for Al Bayan Institute tuition." />
      {loadError ? (
        <Notice tone="error" action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            setLoadError(false)
            setAttempt(value => value + 1)
          }}>Try again</button>
        }>Payment instructions could not be loaded.</Notice>
      ) : !visibleMethods ? (
        <LoadingState>Loading payment instructions…</LoadingState>
      ) : visibleMethods.length ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {visibleMethods.map(method => (
            <PaymentMethodCard key={method.id} method={method} instruction={instructions[method.id]}
              canEdit={canEdit} onChange={updateInstruction} />
          ))}
        </div>
      ) : (
        <div className="panel"><EmptyState>No payment instructions are published.</EmptyState></div>
      )}
    </>
  )
}
