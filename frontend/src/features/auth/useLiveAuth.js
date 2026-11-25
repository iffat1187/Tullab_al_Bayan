import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger, describeError } from '../../lib/logger.js'
import { loadProfile, signOutUser, supabase } from './supabaseAuth.js'

const log = createLogger('auth')

const OAUTH_ERROR_PARAMS = ['error', 'error_description', 'error_code']

export function hasOAuthUrlError(location = window.location) {
  const query = new URLSearchParams(location.search)
  const fragment = new URLSearchParams((location.hash || '').replace(/^#/, ''))
  return [query, fragment].some(params =>
    OAUTH_ERROR_PARAMS.some(name => params.has(name)))
}

export function hasPkceCode(location = window.location) {
  return new URLSearchParams(location.search).has('code')
}

export function clearOAuthCallbackParams() {
  const url = new URL(window.location.href)
  let changed = false

  for (const param of ['code', ...OAUTH_ERROR_PARAMS]) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param)
      changed = true
    }
  }

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.slice(1))
    let hashChanged = false
    for (const param of OAUTH_ERROR_PARAMS) {
      if (hashParams.has(param)) {
        hashParams.delete(param)
        hashChanged = true
      }
    }
    if (hashChanged) {
      const nextHash = hashParams.toString()
      url.hash = nextHash ? `#${nextHash}` : ''
      changed = true
    }
  }

  if (changed) {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
}

export function useLiveAuth() {
  const [session, setSession] = useState(() => (supabase ? undefined : null))
  const [sessionChecked, setSessionChecked] = useState(() => !supabase)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [profileRefresh, setProfileRefresh] = useState(0)
  const [oauthUrlError, setOauthUrlError] = useState(() => hasOAuthUrlError())
  const [pendingPkceCode, setPendingPkceCode] = useState(() => hasPkceCode())
  const [signOutError, setSignOutError] = useState('')

  const user = session?.user ?? null
  const userId = user?.id ?? null

  const latestUserRef = useRef(user)
  latestUserRef.current = user
  const prevUserIdRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!supabase) return

    let active = true
    let refreshTimer

    function applySession(nextSession, event) {
      const nextUser = nextSession?.user ?? null
      const nextUserId = nextUser?.id ?? null
      const isNewSession = Boolean(nextUserId) && (event === 'SIGNED_IN' || prevUserIdRef.current !== nextUserId)

      if (nextUserId) {
        setPendingPkceCode(false)
        setOauthUrlError(false)
      } else {
        requestIdRef.current += 1
        setResult(null)
      }

      if (isNewSession) {
        setSignOutError('')
      }

      prevUserIdRef.current = nextUserId
      latestUserRef.current = nextUser
      setSession(nextSession ?? null)
    }

    supabase.auth.getSession().then(
      ({ data, error }) => {
        if (!active) return
        if (error) log.error('Could not restore the saved session; continuing as signed out', error)
        else log.debug(data?.session ? 'Restored existing session' : 'No existing session found', { userId: data?.session?.user?.id })
        applySession(error ? null : (data?.session ?? null), 'GET_SESSION')
        setSessionChecked(true)
      },
      error => {
        if (!active) return
        log.error('Session lookup threw unexpectedly; continuing as signed out', error)
        applySession(null, 'GET_SESSION_ERROR')
        setSessionChecked(true)
      },
    )

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        log.info(`Auth state changed: ${event}`, { userId: next?.user?.id })
      } else {
        log.debug(`Auth state changed: ${event}`, { userId: next?.user?.id })
      }
      applySession(next ?? null, event)
      if (next?.user && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        clearTimeout(refreshTimer)
        // Run the profile check after the Supabase auth callback releases its lock.
        refreshTimer = setTimeout(() => setProfileRefresh(value => value + 1), 0)
      }
    })

    return () => {
      active = false
      clearTimeout(refreshTimer)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionChecked) return
    if (hasOAuthUrlError()) {
      const params = new URLSearchParams(window.location.search + '&' + (window.location.hash || '').replace(/^#/, ''))
      log.warn('Google sign-in returned an error', { error: params.get('error'), code: params.get('error_code'), description: params.get('error_description') })
    }
    clearOAuthCallbackParams()
  }, [sessionChecked])

  useEffect(() => {
    if (!supabase || !userId) return

    const targetUser = latestUserRef.current
    if (!targetUser || targetUser.id !== userId) return

    let active = true
    const requestId = ++requestIdRef.current

    loadProfile(targetUser).then(
      profile => {
        if (active && requestId === requestIdRef.current) {
          setResult({ userId, attempt, profile, error: null })
        }
      },
      error => {
        log.warn('Institute access check failed; showing the retry screen', { userId, attempt, error: describeError(error) })
        if (active && requestId === requestIdRef.current) {
          setResult({
            userId,
            attempt,
            profile: null,
            error: 'Your institute access could not be checked. Please try again.',
          })
        }
      },
    )

    return () => {
      active = false
      requestIdRef.current += 1
    }
  }, [userId, attempt, profileRefresh])

  const retry = useCallback(() => {
    log.info('Retrying institute access check')
    setAttempt(value => value + 1)
  }, [])

  const signOut = useCallback(async () => {
    setSignOutError('')
    try {
      await signOutUser()
    } catch (error) {
      setSignOutError(error?.message || 'Sign out failed. Please try again.')
      throw error
    }
    requestIdRef.current += 1
    prevUserIdRef.current = null
    latestUserRef.current = null
    setPendingPkceCode(false)
    setOauthUrlError(false)
    setSession(null)
    setResult(null)
  }, [])

  const checked = userId && result?.userId === userId && result.attempt === attempt ? result : null
  const loading = Boolean(supabase) && (!sessionChecked || session === undefined || Boolean(userId && !checked))
  const callbackError = oauthUrlError || (!loading && !session && pendingPkceCode)

  return {
    configured: Boolean(supabase),
    loading,
    session: session ?? null,
    profile: checked?.profile ?? null,
    error: checked?.error ?? null,
    callbackError,
    signOutError,
    retry,
    signOut,
  }
}
