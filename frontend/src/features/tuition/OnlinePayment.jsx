import React from 'react'
import { PageHeader } from '../../components/ui.jsx'

const bankDetails = [
  ['Bank', 'The City Bank PLC'],
  ['Branch', 'Gulshan Avenue Branch'],
  ['Account Name', 'AL BAYAN INSTITUTE'],
  ['A/C No.', '1781430000816'],
  ['Routing No.', '225261732'],
]

export default function OnlinePayment() {
  return (
    <>
      <PageHeader title="Online Payment" description="Payment instructions for Al Bayan Institute tuition." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="panel panel-body min-w-0" aria-labelledby="bank-payment-title">
          <h2 id="bank-payment-title">Bank Payment</h2>
          <dl className="mt-4 grid gap-3">
            {bankDetails.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel panel-body min-w-0" aria-labelledby="bkash-payment-title">
          <h2 id="bkash-payment-title">bKash Payment</h2>
          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-sm text-muted">Number</dt>
              <dd className="font-medium tabular-nums">+8801701050904</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Reference</dt>
              <dd>Enter your full name and batch. Example: Ayesha Rahman – Saturday Batch.</dd>
            </div>
          </dl>
          <p className="mt-4">Use the <strong>Send Money</strong> option.</p>
          <p className="mt-2">Please include the cash-out charge when sending your payment.</p>
        </section>
      </div>
    </>
  )
}
