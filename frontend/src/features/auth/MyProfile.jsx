import React from 'react'
import { formatDate } from '../../lib/formatDate.js'
import { Notice, PageHeader, StatusPill } from '../../components/ui.jsx'
import AccountAvatar from './AccountAvatar.jsx'

const roleNames = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  pending: 'Waiting for access',
}

function Detail({ label, children }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

export default function MyProfile({ account, role }) {
  const isStudent = role === 'student'
  const isFormerStudent = isStudent && !account.isActive

  return (
    <>
      <PageHeader title="My profile" description="Your details as the institute has them. Contact the office to change anything." />
      <section className="panel max-w-2xl" aria-label="Account details">
        <div className="panel-head">
          <div className="flex min-w-0 items-center gap-4">
            <AccountAvatar account={account} className="size-14 text-lg" />
            <div className="min-w-0">
              <h2 className="break-words text-xl">{account.name}</h2>
              <p>{roleNames[role] ?? 'Portal user'}</p>
            </div>
          </div>
          {isStudent && <StatusPill status={account.isActive ? 'Active' : 'Inactive'}>{account.isActive ? 'Enrolled' : 'Former student'}</StatusPill>}
        </div>

        <dl className="divide-y divide-surface-border px-5">
          <Detail label="Google email">{account.email || 'Not recorded'}</Detail>
          {!isStudent && account.staffId && <Detail label="Staff ID">{account.staffId}</Detail>}
          {isStudent && <>
            <Detail label="Student ID">{account.id ?? 'Not assigned'}</Detail>
            <Detail label="Batch">{account.batch ? account.batch + ' batch' : 'Not assigned'}</Detail>
            {account.enrolledAt && <Detail label="Enrolled since">{formatDate(account.enrolledAt)}</Detail>}
          </>}
        </dl>

        {isFormerStudent && (
          <div className="p-5 pt-0"><Notice tone="warn">You're no longer enrolled. You can still see your past attendance and tuition.</Notice></div>
        )}
        {role === 'pending' && (
          <div className="p-5 pt-0"><Notice tone="info">This Google account isn't linked to a student or staff record yet. Ask the Al Bayan office to add it, then check again.</Notice></div>
        )}
      </section>
    </>
  )
}
