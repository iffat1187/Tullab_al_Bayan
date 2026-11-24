import { supabase } from '../auth/supabaseAuth.js'

const scholarships = [0, 50, 100]

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.')
}

function mapStudent(row, linkedUserByStudent) {
  return {
    uuid: row.id,
    id: row.student_code,
    name: row.full_name,
    email: row.email ?? '',
    batchId: row.batch_id,
    batch: row.batches?.name ?? null,
    defaultMonthlyFee: row.default_monthly_fee === null ? null : Number(row.default_monthly_fee),
    defaultScholarshipPercent: row.default_scholarship_percent,
    isActive: Boolean(row.is_active),
    enrolledAt: row.enrolled_at,
    batchAssignedAt: row.batch_assigned_at,
    deactivatedAt: row.deactivated_at,
    linkedUserId: linkedUserByStudent?.get(row.id) ?? null,
  }
}

export async function listRoster({ isActive } = {}) {
  requireClient()
  let query = supabase
    .from('students')
    .select('id, student_code, full_name, email, batch_id, default_monthly_fee, default_scholarship_percent, is_active, enrolled_at, batch_assigned_at, deactivated_at, batches(name)')
    .order('full_name', { ascending: true })
  if (typeof isActive === 'boolean') query = query.eq('is_active', isActive)

  const [{ data, error }, { data: roles, error: rolesError }] = await Promise.all([
    query,
    supabase.from('user_roles').select('user_id, student_id').eq('role', 'student'),
  ])
  if (error) throw error
  if (rolesError) throw rolesError
  const linked = new Map((roles ?? []).map(row => [row.student_id, row.user_id]))
  return (data ?? []).map(row => mapStudent(row, linked))
}

function validateStudent(input) {
  const student = {
    student_code: input.id?.trim() ?? '',
    full_name: input.name?.trim() ?? '',
    email: input.email?.trim().toLowerCase() ?? '',
    batch_id: Number(input.batchId),
    default_monthly_fee: input.defaultMonthlyFee === '' || input.defaultMonthlyFee == null ? null : Number(input.defaultMonthlyFee),
    default_scholarship_percent: Number(input.defaultScholarshipPercent ?? 0),
  }
  const errors = {}
  if (!student.student_code) errors.id = 'Enter a student ID.'
  if (!student.full_name) errors.name = 'Enter a full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) errors.email = 'Enter a valid Google account email.'
  if (!Number.isInteger(student.batch_id) || student.batch_id < 1 || student.batch_id > 7) errors.batchId = 'Select a batch.'
  if (student.default_monthly_fee !== null && (!Number.isFinite(student.default_monthly_fee) || student.default_monthly_fee < 0)) {
    errors.defaultMonthlyFee = 'Enter a non-negative BDT amount.'
  }
  if (!scholarships.includes(student.default_scholarship_percent)) errors.defaultScholarshipPercent = 'Select 0%, 50%, or 100%.'
  return { student, errors }
}

export async function saveStudent(input, studentUuid = null) {
  requireClient()
  const { student, errors } = validateStudent(input)
  if (Object.keys(errors).length) return { errors }
  const query = studentUuid
    ? supabase.from('students').update(student).eq('id', studentUuid)
    : supabase.from('students').insert(student)
  const { data, error } = await query
    .select('id, student_code, full_name, email, batch_id, default_monthly_fee, default_scholarship_percent, is_active, enrolled_at, batch_assigned_at, deactivated_at, batches(name)')
    .single()
  if (error) {
    if (error.code === '23505') return { errors: { form: 'Student ID or email is already in use.' } }
    throw error
  }
  return { student: mapStudent(data) }
}

async function setActive(studentUuid, isActive) {
  requireClient()
  const { error } = await supabase.from('students').update({ is_active: isActive }).eq('id', studentUuid)
  if (error) throw error
}

export const deactivateStudent = studentUuid => setActive(studentUuid, false)
export const reactivateStudent = studentUuid => setActive(studentUuid, true)

export async function importCsvRows(rows) {
  requireClient()
  const { data, error } = await supabase.rpc('import_students_csv', { p_rows: rows })
  if (error) throw error
  return data
}

export async function listPendingAuthUsers() {
  requireClient()
  const { data, error } = await supabase.rpc('list_pending_auth_users')
  if (error) throw error
  return (data ?? []).map(row => ({ userId: row.user_id, email: row.email ?? '', fullName: row.full_name ?? '', createdAt: row.created_at }))
}

export async function linkStudentAccount(studentUuid, userId) {
  requireClient()
  const { error } = await supabase.rpc('link_student_account', { p_student_id: studentUuid, p_user_id: userId })
  if (error) throw error
}

export async function unlinkStudentAccount(studentUuid) {
  requireClient()
  const { error } = await supabase.rpc('unlink_student_account', { p_student_id: studentUuid })
  if (error) throw error
}
