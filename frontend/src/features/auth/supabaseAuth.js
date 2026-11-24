import { createClient } from '@supabase/supabase-js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('auth')

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce' } })
  : null

if (!supabase) {
  log.warn('Supabase is not configured: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing. Sign-in and all data access are disabled.', {
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
  })
}

export async function startGoogleSignIn() {
  if (!supabase) {
    log.warn('Google sign-in was attempted but Supabase is not configured')
    throw new Error('Google sign-in is not configured. Check your Supabase environment settings.')
  }
  log.info('Starting Google sign-in redirect')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: new URL('/sign-in', window.location.origin).href },
  })
  if (error) {
    log.error('Google sign-in could not start', error)
    throw new Error('Google sign-in could not start. Please try again.')
  }
}

export async function signOutUser() {
  if (!supabase) return
  log.info('Signing out')
  const { error } = await supabase.auth.signOut()
  if (error) {
    log.error('Sign-out failed', error)
    throw new Error('Could not sign out cleanly. Please try again.')
  }
  log.info('Signed out')
}

export async function loadProfile(user) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const metadata = user.user_metadata ?? {}
  const basic = {
    userId: user.id,
    name: metadata.full_name || metadata.name || user.email || 'Google account',
    email: user.email ?? '',
    photo: metadata.avatar_url || metadata.picture || null,
  }

  const readRole = () => supabase
    .from('user_roles')
    .select('role, student_id, staff_code, full_name')
    .eq('user_id', user.id)
    .maybeSingle()

  log.debug('Loading portal profile', { userId: user.id })
  let { data: roleRow, error: roleError } = await readRole()
  if (roleError) {
    log.error('Could not read the user role', roleError, { userId: user.id })
    throw roleError
  }

  if (!roleRow) {
    // A student whose Google email is on their student record links automatically.
    // If the call fails or finds no match, the user simply stays pending.
    log.debug('No role assigned yet; trying to auto-link a student record by email', { userId: user.id })
    const { data: claimedStudent, error: claimError } = await supabase.rpc('claim_student_access')
    if (claimError) {
      log.warn('Automatic student linking failed; the user stays pending', { userId: user.id, error: claimError })
    } else if (claimedStudent) {
      log.info('Google account automatically linked to a student record', { userId: user.id })
      ;({ data: roleRow, error: roleError } = await readRole())
      if (roleError) {
        log.error('Could not read the user role after automatic student linking', roleError, { userId: user.id })
        throw roleError
      }
    }
  }

  if (!roleRow) {
    log.info('Signed-in user has no institute access yet (pending)', { userId: user.id })
    return {
      ...basic,
      role: 'pending',
      staffId: null,
      studentUuid: null,
      id: null,
      batchId: null,
      batch: null,
      isActive: true,
      enrolledAt: null,
      batchAssignedAt: null,
    }
  }

  if (roleRow.role === 'admin' || roleRow.role === 'teacher') {
    log.info('Portal profile loaded', { userId: user.id, role: roleRow.role })
    return {
      ...basic,
      role: roleRow.role,
      name: roleRow.full_name || basic.name,
      staffId: roleRow.staff_code ?? null,
      studentUuid: null,
      id: null,
      batchId: null,
      batch: null,
      isActive: true,
      enrolledAt: null,
      batchAssignedAt: null,
    }
  }

  if (roleRow.role === 'student') {
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, student_code, full_name, email, batch_id, is_active, enrolled_at, batch_assigned_at, batches(name)')
      .eq('id', roleRow.student_id)
      .single()
    if (studentError) {
      log.error('Could not load the student record linked to this account', studentError, { userId: user.id, studentId: roleRow.student_id })
      throw studentError
    }
    log.info('Portal profile loaded', { userId: user.id, role: 'student', studentId: student.id, active: Boolean(student.is_active) })

    return {
      ...basic,
      role: 'student',
      name: student.full_name,
      email: student.email || basic.email,
      staffId: null,
      studentUuid: student.id,
      id: student.student_code,
      batchId: student.batch_id,
      batch: student.batches?.name ?? null,
      isActive: Boolean(student.is_active),
      enrolledAt: student.enrolled_at ?? null,
      batchAssignedAt: student.batch_assigned_at ?? null,
    }
  }

  log.error('User has an unsupported role assignment', undefined, { userId: user.id, role: roleRow.role })
  throw new Error('Unsupported portal role assignment.')
}
