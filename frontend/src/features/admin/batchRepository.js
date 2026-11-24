import { supabase } from '../auth/supabaseAuth.js'
import { createLogger, logged } from '../../lib/logger.js'

const log = createLogger('batches')

export const listBatches = logged(log, 'Load batches', async function listBatches() {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const { data, error } = await supabase
    .from('batches')
    .select('id, name, day_of_week, display_order, class_time, venue')
    .order('display_order', { ascending: true })
  if (error) throw error

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    dayOfWeek: row.day_of_week,
    displayOrder: row.display_order,
    classTime: row.class_time ?? null,
    venue: row.venue ?? null,
  }))
}, { result: rows => ({ count: rows.length }) })

export const listActiveRosterForRole = logged(log, 'Load active roster', async function listActiveRosterForRole(role, knownBatches) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  if (role === 'admin') {
    const { data, error } = await supabase
      .from('students')
      .select('id, student_code, full_name, email, batch_id, default_monthly_fee, default_scholarship_percent, is_active, batches(name)')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    if (error) throw error

    return (data ?? []).map(row => ({
      uuid: row.id,
      id: row.student_code,
      name: row.full_name,
      email: row.email ?? null,
      batchId: row.batch_id,
      batch: row.batches?.name ?? null,
      defaultMonthlyFee: row.default_monthly_fee === null ? null : Number(row.default_monthly_fee),
      defaultScholarshipPercent: row.default_scholarship_percent,
      isActive: Boolean(row.is_active),
    }))
  }

  if (role === 'teacher') {
    const batches = knownBatches ?? await listBatches()
    const batchNameById = new Map(batches.map(item => [item.id, item.name]))
    const { data, error } = await supabase.rpc('get_teacher_roster')
    if (error) throw error

    return (data ?? []).map(row => ({
      uuid: row.id,
      id: row.student_code,
      name: row.full_name,
      batchId: row.batch_id,
      batch: batchNameById.get(row.batch_id) ?? null,
      isActive: true,
    }))
  }

  throw new Error('Only administrators and teachers can access the batch roster.')
}, { context: role => ({ role }), result: rows => ({ count: rows.length }) })
