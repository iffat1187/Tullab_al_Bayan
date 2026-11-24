import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce' } })
  : null

export async function startGoogleSignIn() {
  if (!supabase) {
    throw new Error('Google sign-in is not configured. Check your Supabase environment settings.')
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: new URL('/sign-in', window.location.origin).href },
  })
  if (error) throw new Error('Google sign-in could not start. Please try again.')
}

export async function signOutUser() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error('Could not sign out cleanly. Please try again.')
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

  let { data: roleRow, error: roleError } = await readRole()
  if (roleError) throw roleError

  if (!roleRow) {
    // A student whose Google email is on their student record links automatically.
    // If the call fails or finds no match, the user simply stays pending.
    const { data: claimedStudent, error: claimError } = await supabase.rpc('claim_student_access')
    if (!claimError && claimedStudent) {
      ;({ data: roleRow, error: roleError } = await readRole())
      if (roleError) throw roleError
    }
  }

  if (!roleRow) {
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
    if (studentError) throw studentError

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

  throw new Error('Unsupported portal role assignment.')
}
