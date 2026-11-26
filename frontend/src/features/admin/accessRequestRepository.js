import { supabase } from '../auth/supabaseAuth.js'
import { createLogger, logged } from '../../lib/logger.js'

const log = createLogger('access-requests')

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase client is not configured.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

function mapRequest(row) {
  return {
    userId: row.user_id,
    email: row.email ?? '',
    fullName: row.full_name ?? '',
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    hasGoogleIdentity: Boolean(row.has_google_identity),
  }
}

export const listAccessRequests = logged(log, 'Load access requests', async function listAccessRequests(status = 'pending') {
  return ((await rpc('list_access_requests', { p_status: status })) ?? []).map(mapRequest)
}, { context: status => ({ status }), result: rows => ({ count: rows.length }) })

const scholarships = [0, 50, 100]

/** Returns `{ errors }` for invalid input, otherwise `{ studentId }`. */
export const approveAsStudent = logged(log, 'Approve access request as student', async function approveAsStudent(userId, input) {
  const fields = {
    p_user_id: userId,
    p_student_code: input.studentCode?.trim() ?? '',
    p_full_name: input.fullName?.trim() ?? '',
    p_batch_id: Number(input.batchId),
    p_default_monthly_fee: input.defaultMonthlyFee === '' || input.defaultMonthlyFee == null ? null : Number(input.defaultMonthlyFee),
    p_default_scholarship_percent: Number(input.defaultScholarshipPercent ?? 0),
  }
  const errors = {}
  if (!fields.p_student_code) errors.studentCode = 'Enter a student ID.'
  if (!fields.p_full_name) errors.fullName = 'Enter a full name.'
  if (!Number.isInteger(fields.p_batch_id) || fields.p_batch_id < 1) errors.batchId = 'Select a batch.'
  if (fields.p_default_monthly_fee !== null && (!Number.isFinite(fields.p_default_monthly_fee) || fields.p_default_monthly_fee < 0)) {
    errors.defaultMonthlyFee = 'Enter a non-negative BDT amount.'
  }
  if (!scholarships.includes(fields.p_default_scholarship_percent)) errors.defaultScholarshipPercent = 'Select 0%, 50%, or 100%.'
  if (Object.keys(errors).length) return { errors }

  try {
    return { studentId: await rpc('approve_access_request_as_student', fields) }
  } catch (error) {
    if (error?.code === '23505') return { errors: { form: 'That student ID or email is already on another student record. Use “Link to existing student” instead, or choose a different ID.' } }
    if (error?.code === '23514') return { errors: { form: 'This account already has institute access. Refresh the list.' } }
    throw error
  }
}, { context: userId => ({ userId }), result: outcome => (outcome.errors ? { rejected: Object.keys(outcome.errors) } : { studentId: outcome.studentId }), successLevel: 'info', success: 'Access request approved as student' })

export const rejectAccessRequest = logged(log, 'Decline access request', userId => rpc('reject_access_request', { p_user_id: userId }), {
  context: userId => ({ userId }), successLevel: 'info', success: 'Access request declined',
})

export const restoreAccessRequest = logged(log, 'Restore access request', userId => rpc('restore_access_request', { p_user_id: userId }), {
  context: userId => ({ userId }), successLevel: 'info', success: 'Access request restored to the queue',
})
