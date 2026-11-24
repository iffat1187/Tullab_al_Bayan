import { supabase } from '../auth/supabaseAuth.js'

export const sessionTypes = ['Physical', 'Online']
export const markOptions = ['Present', 'Late', 'Sick', 'Absent']

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.')
}

function mapSession(row) {
  const marks = row.attendance_marks ?? []
  return {
    id: row.id,
    batchId: row.batch_id,
    date: row.class_date,
    type: row.class_type,
    sessionNo: row.session_no,
    marks: Object.fromEntries(marks.map(mark => [mark.student_id, mark.status])),
    markCount: marks.length,
  }
}

export async function listSessions({ batchId, classDate, fromDate, toDate } = {}) {
  requireClient()
  let query = supabase.from('attendance_sessions').select('id, batch_id, class_date, class_type, session_no, attendance_marks(student_id, status)').order('class_date', { ascending: false }).order('session_no', { ascending: true })
  if (batchId) query = query.eq('batch_id', batchId)
  if (classDate) query = query.eq('class_date', classDate)
  if (fromDate) query = query.gte('class_date', fromDate)
  if (toDate) query = query.lte('class_date', toDate)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapSession)
}

export async function createSession(batchId, date, type) {
  requireClient()
  const { data, error } = await supabase.rpc('create_attendance_session', { p_batch_id: batchId, p_class_date: date, p_class_type: type })
  if (error) throw error
  return mapSession({ ...data, attendance_marks: [] })
}

export async function deleteSession(sessionId) {
  requireClient()
  const { error } = await supabase.rpc('delete_empty_attendance_session', { p_session_id: sessionId })
  if (error) throw error
}

export async function saveMark({ sessionId, studentUuid, mark }) {
  requireClient()
  if (!markOptions.includes(mark)) throw new Error('Choose an attendance mark.')
  const { error } = await supabase.from('attendance_marks').upsert({ session_id: sessionId, student_id: studentUuid, status: mark }, { onConflict: 'session_id,student_id' })
  if (error) throw error
}

function summarize(history) {
  const forType = type => {
    const rows = type ? history.filter(item => item.type === type) : history
    const marked = rows.filter(item => markOptions.includes(item.status))
    const attended = marked.filter(item => ['Present', 'Late'].includes(item.status)).length
    return { attended, marked: marked.length, rate: marked.length ? attended / marked.length : null }
  }
  return { physical: forType('Physical'), online: forType('Online'), overall: forType(null) }
}

export async function listStudentAttendance(studentUuid) {
  requireClient()
  if (!studentUuid) return { history: [], summary: summarize([]) }
  const { data: sessions, error } = await supabase.from('attendance_sessions').select('id, class_date, class_type, session_no, attendance_marks(student_id, status)').order('class_date', { ascending: false }).order('session_no', { ascending: false })
  if (error) throw error
  const history = (sessions ?? []).map(row => {
    const mark = (row.attendance_marks ?? []).find(item => item.student_id === studentUuid)
    return { id: row.id, date: row.class_date, type: row.class_type, sessionNo: row.session_no, status: mark?.status ?? 'Unrecorded' }
  })
  return { history, summary: summarize(history) }
}
