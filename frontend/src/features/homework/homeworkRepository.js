import { supabase } from '../auth/supabaseAuth.js'
import { createLogger, logged, ValidationError } from '../../lib/logger.js'

const log = createLogger('homework')

const SELECT_COLUMNS = 'id, batch_id, title, instructions, deadline, published_at, updated_at, batches(name)'

function mapHomeworkRow(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    batchName: row.batches?.name ?? null,
    title: row.title,
    instructions: row.instructions,
    deadline: row.deadline ?? null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

export const listHomework = logged(log, 'Load homework', async function listHomework(batchId) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  let query = supabase
    .from('homework_assignments')
    .select(SELECT_COLUMNS)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('published_at', { ascending: false })

  if (batchId !== undefined && batchId !== null) {
    query = query.eq('batch_id', batchId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapHomeworkRow)
}, { context: batchId => ({ batchId }), result: rows => ({ count: rows.length }) })

export const saveHomework = logged(log, 'Save homework', async function saveHomework({ id, batchId, title, instructions, deadline }) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const numericBatchId = Number(batchId)
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  const rawInstructions = typeof instructions === 'string' ? instructions : ''
  const cleanDeadline = typeof deadline === 'string' && deadline.trim() ? deadline.trim() : null

  if (!Number.isInteger(numericBatchId) || numericBatchId < 1 || numericBatchId > 7) {
    throw new ValidationError('Select a valid batch before saving homework.')
  }
  if (!cleanTitle) {
    throw new ValidationError('Enter a homework title.')
  }
  if (!rawInstructions.trim()) {
    throw new ValidationError('Enter homework instructions.')
  }
  if (cleanDeadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDeadline)) {
    throw new ValidationError('Enter a valid deadline date (YYYY-MM-DD).')
  }

  if (id) {
    const { data, error } = await supabase
      .from('homework_assignments')
      .update({
        title: cleanTitle,
        instructions: rawInstructions,
        deadline: cleanDeadline,
      })
      .eq('id', id)
      .eq('batch_id', numericBatchId)
      .select(SELECT_COLUMNS)
      .single()
    if (error) throw error
    return mapHomeworkRow(data)
  }

  const { data, error } = await supabase
    .from('homework_assignments')
    .insert({
      batch_id: numericBatchId,
      title: cleanTitle,
      instructions: rawInstructions,
      deadline: cleanDeadline,
    })
    .select(SELECT_COLUMNS)
    .single()
  if (error) throw error
  return mapHomeworkRow(data)
}, { context: ({ id, batchId }) => ({ homeworkId: id ?? 'new', batchId }), result: saved => ({ homeworkId: saved.id }), successLevel: 'info', success: 'Homework saved' })

export const deleteHomework = logged(log, 'Delete homework', async function deleteHomework(id) {
  if (!supabase) throw new Error('Supabase client is not configured.')
  if (!id) throw new ValidationError('Homework assignment ID is required.')

  const { data, error } = await supabase
    .from('homework_assignments')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Homework was not deleted. It may already have been removed, or you lack permission.')
}, { context: id => ({ homeworkId: id }), successLevel: 'info', success: 'Homework deleted' })
