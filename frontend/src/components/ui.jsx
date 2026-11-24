import React, { useEffect, useId, useRef } from 'react'

export function PageHeader({ title, description, actions, children }) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}

const noticeRole = { error: 'alert', warn: 'status', info: 'status', success: 'status' }

export function Notice({ tone = 'info', children, action, className = '' }) {
  return (
    <div role={noticeRole[tone]} className={`notice notice-${tone} ${className}`}>
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  )
}

export function LoadingState({ children = 'Loading…' }) {
  return <p role="status" className="loading-state">{children}</p>
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  )
}

const tones = {
  Present: 'ok', Late: 'warn', Sick: 'violet', Absent: 'danger',
  Paid: 'ok', Unpaid: 'danger', 'Covered by scholarship': 'teal', 'Fee not set': 'warn',
  Active: 'ok', Inactive: 'warn', Linked: 'ok', Overdue: 'danger',
}

export function StatusPill({ status, tone, children }) {
  return <span className="pill" data-tone={tone ?? tones[status] ?? 'neutral'}>{children ?? status}</span>
}

/** Weekday (0 = Sunday) in Dhaka, used to pre-select today's batch. */
export function dhakaWeekday() {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', weekday: 'short' }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/**
 * A row of batch buttons that stays visible above the page content.
 * `counts` maps batch id -> number shown beside the name; `allLabel` adds an "all batches" option (id null).
 */
export function BatchSwitcher({ batches, selectedId, onSelect, counts, allLabel }) {
  const today = dhakaWeekday()
  const options = allLabel ? [{ id: null, name: allLabel }, ...batches] : batches
  const row = useRef(null)
  useEffect(() => {
    // Keep the chosen batch visible when the row scrolls sideways on small screens.
    const chip = row.current?.querySelector('[aria-pressed="true"]')
    if (chip && row.current.scrollWidth > row.current.clientWidth) {
      row.current.scrollLeft = chip.offsetLeft - (row.current.clientWidth - chip.offsetWidth) / 2
    }
  }, [selectedId])
  return (
    <div ref={row} className="batch-switcher" role="group" aria-label="Choose a batch">
      {options.map(batch => (
        <button key={batch.id ?? 'all'} type="button" className="batch-chip"
          aria-pressed={selectedId === batch.id} onClick={() => onSelect(batch.id)}>
          {batch.dayOfWeek === today && <span className="today-dot" title="Today's class" aria-label="Today's class" />}
          {batch.name}
          {counts && <small>{counts.get(batch.id) ?? 0}</small>}
        </button>
      ))}
    </div>
  )
}

const BATCH_KEY = 'tab:batchId'

export function readRememberedBatch() {
  try { return Number(localStorage.getItem(BATCH_KEY)) || null } catch { return null }
}

export function rememberBatch(id) {
  try { if (id == null) localStorage.removeItem(BATCH_KEY); else localStorage.setItem(BATCH_KEY, String(id)) } catch { /* storage unavailable */ }
}

/** Picks the remembered batch, else today's batch, else the first one. */
export function defaultBatchId(batches) {
  if (!batches.length) return null
  const remembered = readRememberedBatch()
  if (remembered && batches.some(batch => batch.id === remembered)) return remembered
  const today = dhakaWeekday()
  return (batches.find(batch => batch.dayOfWeek === today) ?? batches[0]).id
}

/** Eight-point star (khatam) lattice in thin gilt lines, used on dark brand surfaces. */
export function KhatamPattern({ className = '', opacity = 0.22 }) {
  const id = useId()
  return (
    <svg className={className} aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id={id} width="44" height="44" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#d9ac4f" strokeWidth="1" opacity={opacity}>
            <rect x="10" y="10" width="24" height="24" />
            <rect x="10" y="10" width="24" height="24" transform="rotate(45 22 22)" />
            <path d="M0 22h5M39 22h5M22 0v5M22 39v5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
