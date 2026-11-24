import { supabase } from '../auth/supabaseAuth.js'

export const scholarships = [0, 50, 100]
export const paymentStatuses = ['Paid', 'Unpaid']
export const coveredStatus = 'Covered by scholarship'
export const feeNotSetStatus = 'Fee not set'
export const noAmountDueStatus = 'No amount due'
// Client-only status for roster students with no monthly_tuition row for the selected month.
export const notGeneratedStatus = 'Not generated'
export const tuitionStatuses = [...paymentStatuses, coveredStatus, feeNotSetStatus, noAmountDueStatus]

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.')
}

function mapRecord(row) {
  return {
    id: row.id,
    studentUuid: row.student_id,
    batchId: row.batch_id,
    month: row.billing_month.slice(0, 7),
    billingMonth: row.billing_month,
    baseFee: row.base_fee === null ? null : Number(row.base_fee),
    scholarship: row.scholarship_percent,
    due: row.amount_due === null ? null : Number(row.amount_due),
    payment: row.payment_status,
    status: row.display_status,
    paidAt: row.paid_at,
    notes: row.notes ?? '',
  }
}

export async function listMonthlyTuition({ billingMonth, batchId } = {}) {
  requireClient()
  let query = supabase.from('monthly_tuition').select('*').order('billing_month', { ascending: false })
  if (billingMonth) query = query.eq('billing_month', billingMonth.length === 7 ? `${billingMonth}-01` : billingMonth)
  if (batchId) query = query.eq('batch_id', batchId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapRecord)
}

export async function listStudentTuition(studentUuid) {
  requireClient()
  if (!studentUuid) return []
  const { data, error } = await supabase.from('monthly_tuition').select('*').eq('student_id', studentUuid).order('billing_month', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRecord)
}

export async function generateMonthlyTuition(billingMonth, batchId = null) {
  requireClient()
  const month = billingMonth.length === 7 ? `${billingMonth}-01` : billingMonth
  const { data, error } = await supabase.rpc('generate_monthly_tuition', { p_billing_month: month, p_batch_id: batchId })
  if (error) throw error
  return data
}

export async function saveTuition(record, changes) {
  requireClient()
  const patch = {}
  if (Object.hasOwn(changes, 'baseFee')) patch.base_fee = changes.baseFee
  if (Object.hasOwn(changes, 'scholarship')) patch.scholarship_percent = changes.scholarship
  if (Object.hasOwn(changes, 'payment')) patch.payment_status = changes.payment
  if (Object.hasOwn(changes, 'notes')) patch.notes = changes.notes?.trim() || null
  const { data, error } = await supabase.from('monthly_tuition').update(patch).eq('id', record.id).select('*').single()
  if (error) throw error
  return mapRecord(data)
}

export function parseFee(value) {
  const trimmed = String(value ?? '').trim()
  if (trimmed === '') return { value: null }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) > 99999999.99) return { error: 'Enter a valid BDT amount with up to two decimal places.' }
  return { value: Number(trimmed) }
}
