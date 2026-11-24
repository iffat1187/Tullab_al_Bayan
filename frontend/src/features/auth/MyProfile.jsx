import React from 'react'
import { formatDate } from '../../lib/formatDate.js'
import AccountAvatar from './AccountAvatar.jsx'

const roleNames = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  pending: 'Awaiting access',
}

export default function MyProfile({ account, role }) {
  const isStudent = role === 'student'
  const isFormerStudent = isStudent && !account.isActive

  return (
    <>
      <h1>My Profile</h1>
      <section className="mt-5 max-w-xl rounded-2xl border border-surface-border bg-surface p-5 sm:p-7" aria-label="Account details">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <AccountAvatar account={account} className="size-16 text-xl" />
            <h2 className="break-words text-xl font-bold">{account.name}</h2>
          </div>
          {isStudent && (
            <span className={
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ' +
              (account.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900')
            }>
              {account.isActive ? 'Active' : 'Inactive (Former student)'}
            </span>
          )}
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-600">Email</dt>
            <dd className="break-all font-semibold">{account.email || 'Not recorded'}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Account role</dt>
            <dd className="font-semibold">{roleNames[role] ?? 'Portal user'}</dd>
          </div>
          {!isStudent && account.staffId && (
            <div>
              <dt className="text-sm text-slate-600">Staff ID</dt>
              <dd className="font-semibold">{account.staffId}</dd>
            </div>
          )}
          {isStudent && (
            <>
              <div>
                <dt className="text-sm text-slate-600">Student ID</dt>
                <dd className="font-semibold">{account.id ?? 'Not assigned'}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-600">Batch</dt>
                <dd className="font-semibold">{account.batch ? account.batch + ' Batch' : 'Unassigned'}</dd>
              </div>
              {account.enrolledAt && (
                <div>
                  <dt className="text-sm text-slate-600">Enrolled since</dt>
                  <dd className="font-semibold">{formatDate(account.enrolledAt)}</dd>
                </div>
              )}
            </>
          )}
        </dl>

        {isFormerStudent && (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Your enrollment is inactive. You retain read-only access to your past attendance and tuition history.
          </p>
        )}
        {role === 'pending' && (
          <p className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
            Your Google account is signed in, but an institute administrator has not linked it to an active portal role yet. Contact the Al Bayan office to activate access, then check again.
          </p>
        )}
      </section>
    </>
  )
}
