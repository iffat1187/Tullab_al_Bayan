import { supabase } from '../auth/supabaseAuth.js'
import { createLogger, logged } from '../../lib/logger.js'

const log = createLogger('online-payment')
const columns = 'method, bank_name, branch_name, account_name, account_number, routing_number, mobile_number, transfer_instruction, reference_instruction, cash_out_instruction'

export const listPaymentInstructions = logged(log, 'Load payment instructions', async function listPaymentInstructions() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('payment_instructions').select(columns)
  if (error) throw error
  return data ?? []
}, { result: rows => ({ count: rows.length }) })

export async function savePaymentInstruction(method, details, editing) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const table = supabase.from('payment_instructions')
  const mutation = editing ? table.update(details).eq('method', method) : table.insert({ ...details, method })
  const { data, error } = await mutation.select(columns).single()
  if (error) throw error
  return data
}

export async function deletePaymentInstruction(method) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('payment_instructions').delete().eq('method', method).select('method').single()
  if (error) throw error
}
