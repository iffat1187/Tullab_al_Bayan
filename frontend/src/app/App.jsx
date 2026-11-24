import React, { useEffect, useState } from 'react'
import { LogOut, Menu, RefreshCw, X } from 'lucide-react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AccountAvatar from '../features/auth/AccountAvatar.jsx'
import MyProfile from '../features/auth/MyProfile.jsx'
import { startGoogleSignIn } from '../features/auth/supabaseAuth.js'
import { useLiveAuth } from '../features/auth/useLiveAuth.js'
import { KhatamPattern, Notice, ToastProvider } from '../components/ui.jsx'
import { navigationFor, roleLabels, WorkspacePage } from './portalNavigation.jsx'
import './portal.css'

function StarMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12.00,1.50 14.37,6.27 19.42,4.58 17.73,9.63 22.50,12.00 17.73,14.37 19.42,19.42 14.37,17.73 12.00,22.50 9.63,17.73 4.58,19.42 6.27,14.37 1.50,12.00 6.27,9.63 4.58,4.58 9.63,6.27" fill="currentColor" />
      <circle cx="12" cy="12" r="3" fill="var(--brand-deep)" />
    </svg>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><StarMark /></span>
      <span className="brand-text">
        <strong lang="ar" dir="rtl">طُلَّابُ الْبَيَانِ</strong>
        <small>Al Bayan Institute</small>
      </span>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function SignIn({ configured, callbackError }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const displayedError = error || (callbackError
    ? 'Google sign-in did not finish. Try signing in again.'
    : '')

  async function handleGoogleSignIn() {
    setError('')
    setStarting(true)
    try {
      await startGoogleSignIn()
    } catch (signInError) {
      setError(signInError?.message || 'Google sign-in could not start. Please try again.')
      setStarting(false)
    }
  }

  return (
    <main className="sign-in">
      <section className="sign-in-intro brand-surface" aria-label="Al Bayan Institute">
        <KhatamPattern opacity={0.12} />
        <Brand />
        <div>
          <p className="sign-in-greeting" lang="ar" dir="rtl">السَّلَامُ عَلَيْكُمْ</p>
          <h1>Your Arabic classroom, in one place.</h1>
          <p>Homework, attendance and tuition for every class at Al Bayan Institute.</p>
        </div>
        <div className="sign-in-points" aria-label="What you can do here">
          <span>Daily attendance</span><span>Batch homework</span><span>Monthly tuition</span><span>Class calendar</span>
        </div>
      </section>
      <section className="sign-in-content" aria-labelledby="form-title">
        <div className="sign-in-card">
          <h2 id="form-title">Sign in</h2>
          <p>Use the Google account you gave the institute office.</p>

          {!configured && (
            <Notice tone="warn" className="mt-5">
              Sign-in is not set up on this computer. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>.
            </Notice>
          )}

          <button
            type="button"
            className="google-button"
            disabled={!configured || starting}
            aria-describedby={displayedError ? 'sign-in-error' : undefined}
            onClick={handleGoogleSignIn}
          >
            <GoogleLogo />
            {starting ? 'Opening Google…' : 'Continue with Google'}
          </button>

          {displayedError && (
            <p id="sign-in-error" className="field-error mt-3" role="alert">{displayedError}</p>
          )}

          <p className="sign-in-help">Can't get in? Ask the office to check that your email is on your student record.</p>
        </div>
      </section>
    </main>
  )
}

function StatusScreen({ title, message, error, children }) {
  return (
    <main className="status-screen">
      <div className="status-card">
        <div className="status-card-brand brand-surface"><KhatamPattern opacity={0.12} /><Brand /></div>
        <section className="status-card-body">
          <h1>{title}</h1>
          <p role={error ? 'alert' : 'status'}>{message}</p>
          {children}
        </section>
      </div>
    </main>
  )
}

function AccessStatusScreen({ title, message, error, actionLabel, onAction, onSignOut, signOutError }) {
  return (
    <StatusScreen title={title} message={message} error={error}>
      {signOutError && <p className="field-error" role="alert">{signOutError}</p>}
      {(onAction || onSignOut) && (
        <div className="status-actions">
          {onAction && <button type="button" className="btn btn-primary" onClick={onAction}><RefreshCw size={16} aria-hidden="true" /> {actionLabel}</button>}
          {onSignOut && <button type="button" className="btn btn-secondary" onClick={onSignOut}><LogOut size={16} aria-hidden="true" /> Sign out</button>}
        </div>
      )}
    </StatusScreen>
  )
}

function PendingAccessScreen({ account, onRetry, onSignOut, signOutError }) {
  return (
    <StatusScreen
      title="Waiting for access"
      message={`You're signed in as ${account.email || account.name}, but this account isn't linked to a student or staff record yet.`}
    >
      <ol className="mt-4 grid gap-2 text-sm">
        <li><strong className="font-medium">1.</strong> Ask the Al Bayan office to add this email to your record.</li>
        <li><strong className="font-medium">2.</strong> Come back here and choose <em>Check again</em>.</li>
      </ol>
      {signOutError && <p className="field-error" role="alert">{signOutError}</p>}
      <div className="status-actions">
        <button type="button" className="btn btn-primary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Check again</button>
        <button type="button" className="btn btn-secondary" onClick={onSignOut}><LogOut size={16} aria-hidden="true" /> Use another account</button>
      </div>
    </StatusScreen>
  )
}

function PortalLayout({ role, account, onSignOut, signOutError, groups }) {
  const label = roleLabels[role]
  const { key: locationKey, pathname } = useLocation()
  const [openAt, setOpenAt] = useState(null)
  const menuOpen = openAt === locationKey
  const closeMenu = () => setOpenAt(null)
  const accountSubtitle = role === 'student'
    ? (account.id ?? 'Student') + (account.isActive ? '' : ', inactive')
    : label

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = event => { if (event.key === 'Escape') setOpenAt(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function navigationLinks(pages) {
    return pages.filter(page => !page.hiddenFromSidebar).map(({ path, title, icon: Icon }) => (
      <NavLink key={path} to={path ? '/' + role + '/' + path : '/' + role} onClick={closeMenu} end>
        <Icon size={18} aria-hidden="true" /> {title}
      </NavLink>
    ))
  }

  return (
    <ToastProvider>
    <div className="portal">
      <a href="#portal-content" className="skip-link">Skip to content</a>
      <header className="portal-topbar brand-surface">
        <Brand />
        <button type="button" className="portal-menu-toggle" aria-controls="portal-sidebar" aria-expanded={menuOpen}
          onClick={() => setOpenAt(menuOpen ? null : locationKey)}>
          {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />} Menu
        </button>
      </header>
      <div className="sidebar-backdrop" data-open={menuOpen} onClick={closeMenu} aria-hidden="true" />
      <aside id="portal-sidebar" className="sidebar brand-surface" data-open={menuOpen}>
        <KhatamPattern opacity={0.1} />
        <div className="sidebar-brand"><Brand /></div>
        <nav aria-label={label + ' navigation'}>
          {groups.filter(group => group.pages.some(page => !page.hiddenFromSidebar)).map(group => (
            <section key={group.title} aria-labelledby={'nav-' + group.title.toLowerCase()}>
              <h2 id={'nav-' + group.title.toLowerCase()}>{group.title}</h2>
              <div className="sidebar-links">{navigationLinks(group.pages)}</div>
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink className="sidebar-account" to={'/' + role + '/profile'} onClick={closeMenu} end
            aria-label={'My profile, ' + account.name}>
            <AccountAvatar account={account} className="size-9 text-sm" />
            <span className="sidebar-account-details">
              <strong>{account.name}</strong>
              <small>{accountSubtitle}</small>
            </span>
          </NavLink>
          <button type="button" className="sidebar-sign-out" onClick={onSignOut}>
            <LogOut size={17} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      <main id="portal-content" tabIndex={-1} className="portal-content">
        {signOutError && <Notice tone="error" className="mb-4">{signOutError}</Notice>}
        <div key={pathname} className="page-enter"><Outlet context={{ role, account }} /></div>
      </main>
    </div>
    </ToastProvider>
  )
}

export default function App() {
  const auth = useLiveAuth()

  async function handleSignOut() {
    try {
      await auth.signOut()
    } catch {
      // Sign-out failures are captured and cleared inside useLiveAuth.
    }
  }

  if (auth.loading) {
    return (
      <AccessStatusScreen
        title="Signing you in"
        message="Checking your Google account and what you can access…"
      />
    )
  }

  if (auth.error) {
    return (
      <AccessStatusScreen
        title="Couldn't check your access"
        message={auth.error}
        error
        actionLabel="Try again"
        onAction={auth.retry}
        onSignOut={auth.session ? handleSignOut : undefined}
        signOutError={auth.signOutError}
      />
    )
  }

  const account = auth.profile
  const role = account?.role ?? null

  if (role === 'pending') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={
            <PendingAccessScreen
              account={account}
              onRetry={auth.retry}
              onSignOut={handleSignOut}
              signOutError={auth.signOutError}
            />
          } />
        </Routes>
      </BrowserRouter>
    )
  }

  const home = role ? '/' + role : '/sign-in'

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={
          role ? <Navigate to={home} replace /> : <SignIn configured={auth.configured} callbackError={auth.callbackError} />
        } />
        {Object.keys(roleLabels).map(workspace => {
          const groups = navigationFor(workspace)
          return (
            <Route key={workspace} path={'/' + workspace} element={
              role === workspace
                ? <PortalLayout role={role} account={account} onSignOut={handleSignOut} signOutError={auth.signOutError} groups={groups} />
                : <Navigate to={home} replace />
            }>
              <Route path="profile" element={<MyProfile key={workspace} account={account} role={role} />} />
              {groups.flatMap(group => group.pages).map(section => section.path
                ? <Route key={section.path} path={section.path} element={<WorkspacePage key={section.path} section={section} />} />
                : <Route key="dashboard" index element={<WorkspacePage key="dashboard" section={section} />} />)}
            </Route>
          )
        })}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
