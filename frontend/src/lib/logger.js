// Central application logger.
//
// Usage:
//   const log = createLogger('tuition')
//   log.info('Tuition record saved', { recordId })
//   log.error('Tuition record could not be saved', error, { recordId })
//
// Level resolution (first match wins):
//   1. localStorage "tab:logLevel"   – lets you turn on debug logs in production from devtools
//   2. VITE_LOG_LEVEL                – build/env configuration
//   3. "debug" in development, "warn" in production
//
// Context objects are sanitised before printing: secrets are redacted and
// email addresses are masked so personal data does not end up in consoles,
// screenshots or bug reports.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }
const STORAGE_KEY = 'tab:logLevel'
const SECRET_KEY = /token|password|secret|apikey|api_key|authorization|code_verifier|cookie/i
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
const MAX_DEPTH = 4

const isDev = Boolean(import.meta.env?.DEV)

function readStoredLevel() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function resolveLevel() {
  const candidates = [readStoredLevel(), import.meta.env?.VITE_LOG_LEVEL, isDev ? 'debug' : 'warn']
  const found = candidates.find(value => typeof value === 'string' && Object.hasOwn(LEVELS, value.toLowerCase()))
  return found.toLowerCase()
}

let threshold = LEVELS[resolveLevel()]

/** Change the active log level at runtime (also persisted for this browser). */
export function setLogLevel(level) {
  const normalized = String(level).toLowerCase()
  if (!Object.hasOwn(LEVELS, normalized)) throw new Error(`Unknown log level "${level}". Use one of: ${Object.keys(LEVELS).join(', ')}.`)
  threshold = LEVELS[normalized]
  try { globalThis.localStorage?.setItem(STORAGE_KEY, normalized) } catch { /* storage unavailable */ }
}

export function maskEmail(value) {
  return typeof value === 'string' ? value.replace(EMAIL, '$1***@$2') : value
}

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return maskEmail(value)
  if (typeof value !== 'object') return value
  if (value instanceof Error) return describeError(value)
  if (depth >= MAX_DEPTH) return '[…]'
  if (Array.isArray(value)) {
    return value.length > 20
      ? [...value.slice(0, 20).map(item => sanitize(item, depth + 1)), `…${value.length - 20} more`]
      : value.map(item => sanitize(item, depth + 1))
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1),
  ]))
}

/**
 * Turns any thrown value (Error, Supabase PostgrestError/AuthError, string…)
 * into a small plain object that is safe and useful to log.
 */
export function describeError(error) {
  if (error === null || error === undefined) return { message: 'Unknown error (no error value was provided)' }
  if (typeof error !== 'object') return { message: maskEmail(String(error)) }
  const described = {
    name: error.name && error.name !== 'Error' ? error.name : undefined,
    message: maskEmail(error.message || 'No error message'),
    code: error.code,
    status: error.status,
    details: maskEmail(error.details),
    hint: maskEmail(error.hint),
  }
  return Object.fromEntries(Object.entries(described).filter(([, item]) => item !== undefined && item !== null && item !== ''))
}

/** True for errors raised by our own input validation rather than by the backend or the network. */
export function isValidationError(error) {
  return error?.name === 'ValidationError'
}

/** An Error subclass for user-input problems; logged as a warning instead of an error. */
export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

const CONSOLE_METHOD = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' }
const LEVEL_STYLE = {
  debug: 'color:#64748b',
  info: 'color:#1d4ed8',
  warn: 'color:#b45309;font-weight:600',
  error: 'color:#b91c1c;font-weight:600',
}

function timestamp() {
  const now = new Date()
  return now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

function emit(level, scope, message, error, context) {
  if (LEVELS[level] < threshold) return
  const prefix = `[${timestamp()}] ${level.toUpperCase().padEnd(5)} [${scope}]`
  const args = isDev ? [`%c${prefix}%c ${message}`, LEVEL_STYLE[level], ''] : [`${prefix} ${message}`]
  const payload = {}
  if (context && Object.keys(context).length) Object.assign(payload, sanitize(context))
  if (error !== undefined) payload.error = describeError(error)
  if (Object.keys(payload).length) args.push(payload)
  // In development keep the original Error so devtools shows a clickable stack trace.
  if (isDev && error instanceof Error && level === 'error') args.push(error)
  console[CONSOLE_METHOD[level]](...args) // eslint-disable-line no-console
}

/**
 * Creates a logger bound to a module/feature name.
 * debug/info/warn take (message, context?); error takes (message, error?, context?).
 */
export function createLogger(scope) {
  return {
    debug: (message, context) => emit('debug', scope, message, undefined, context),
    info: (message, context) => emit('info', scope, message, undefined, context),
    warn: (message, context) => emit('warn', scope, message, undefined, context),
    error: (message, error, context) => emit('error', scope, message, error, context),
    /** Logs a caught error at the right level: warning for validation, error otherwise. */
    failure(message, error, context) {
      if (isValidationError(error)) emit('warn', scope, `${message}: ${error.message}`, undefined, context)
      else emit('error', scope, message, error, context)
    },
  }
}

/**
 * Wraps an async repository operation so that every call is logged consistently:
 *   - debug when it starts,
 *   - `successLevel` (debug for reads, info for writes) when it finishes, with duration,
 *   - warn/error when it fails (the error is re-thrown unchanged).
 *
 * options.context(...args) -> object   safe identifiers describing the call (no raw form data)
 * options.result(value)    -> object   safe summary of the result (e.g. a row count)
 * options.success          -> string   message used on success (defaults to `${action} succeeded`)
 * options.failure          -> string   message used on failure (defaults to `${action} failed`)
 */
export function logged(log, action, fn, options = {}) {
  const { context = () => undefined, result = () => undefined, successLevel = 'debug', success, failure } = options
  return async function loggedOperation(...args) {
    let callContext
    try { callContext = context(...args) } catch { callContext = undefined }
    const started = performance.now()
    log.debug(`${action} started`, callContext)
    try {
      const value = await fn(...args)
      let summary
      try { summary = result(value) } catch { summary = undefined }
      log[successLevel](success ?? `${action} succeeded`, { ...callContext, ...summary, durationMs: Math.round(performance.now() - started) })
      return value
    } catch (error) {
      log.failure(failure ?? `${action} failed`, error, { ...callContext, durationMs: Math.round(performance.now() - started) })
      throw error
    }
  }
}

const appLog = createLogger('app')
let globalHandlersInstalled = false

/** Logs errors that escape every try/catch: uncaught exceptions and unhandled promise rejections. */
export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true
  window.addEventListener('error', event => {
    appLog.error('Uncaught error', event.error ?? event.message, { source: event.filename, line: event.lineno, column: event.colno })
  })
  window.addEventListener('unhandledrejection', event => {
    appLog.error('Unhandled promise rejection', event.reason)
  })
}

/** Error callbacks for React's createRoot so render-time crashes are logged with their component stack. */
export const reactRootErrorHandlers = {
  onUncaughtError(error, info) {
    appLog.error('React render crashed (no error boundary caught it)', error, { componentStack: info?.componentStack?.trim().split('\n').slice(0, 6).join('\n') })
  },
  onCaughtError(error, info) {
    appLog.error('React error boundary caught an error', error, { componentStack: info?.componentStack?.trim().split('\n').slice(0, 6).join('\n') })
  },
  onRecoverableError(error) {
    appLog.warn('React recovered from an error', { error: describeError(error) })
  },
}
