import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

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

/** Placeholder rows shaped like the table that is loading, so the layout doesn't jump. */
export function SkeletonRows({ rows = 5, label = 'Loading…' }) {
  return (
    <div role="status" aria-label={label} className="skeleton-rows">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row">
          <span className="skeleton skeleton-circle" />
          <span className="grid flex-1 gap-1.5"><span className="skeleton w-40" /><span className="skeleton w-20" /></span>
          <span className="skeleton hidden w-48 sm:block" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div role="status" aria-label="Loading…" className="stat-strip">
      {Array.from({ length: count }, (_, index) => <div key={index} className="stat"><span className="skeleton w-20" /><span className="skeleton mt-3 h-6 w-12" /></div>)}
    </div>
  )
}

const ToastContext = createContext(() => {})

/** Short confirmations shown near the bottom of the screen, next to where people are working. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)
  const dismiss = useCallback(id => setToasts(list => list.filter(toast => toast.id !== id)), [])
  const show = useCallback((message, tone = 'success') => {
    const id = ++nextId.current
    setToasts(list => [...list.slice(-2), { id, message, tone }])
    setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3200)
  }, [dismiss])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className="toast" data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
            {toast.tone === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  )
}

/** Initials avatar used beside student names in tables and lists. */
export function Person({ name, sub }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase()
  return (
    <span className="person">
      <span className="avatar" aria-hidden="true">{initials}</span>
      <span className="min-w-0"><span className="person-name block">{name}</span>{sub && <span className="cell-sub">{sub}</span>}</span>
    </span>
  )
}

const tones = {
  Present: 'ok', Late: 'warn', Sick: 'violet', Absent: 'danger',
  Paid: 'ok', Unpaid: 'danger', 'Covered by scholarship': 'brand', 'Fee not set': 'warn',
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

/** Eight-point star (khatam) lattice in thin lines, used faintly on dark brand surfaces. */
export function KhatamPattern({ className = '', opacity = 0.22, color = '#ffffff' }) {
  const id = useId()
  return (
    <svg className={className} aria-hidden="true" focusable="false" width="100%" height="100%">
      <defs>
        <pattern id={id} width="44" height="44" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={color} strokeWidth="1" opacity={opacity}>
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
