import { supabase } from '../auth/supabaseAuth.js'

async function teacherRpc(name, args) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export async function listTeacherManagementAccounts() {
  const [teachers, pending] = await Promise.all([
    teacherRpc('list_teacher_accounts'),
    teacherRpc('list_pending_teacher_accounts'),
  ])
  return { teachers: teachers ?? [], pending: pending ?? [] }
}

export function approveTeacher(userId, name, staffCode) {
  return teacherRpc('link_teacher_account', {
    p_user_id: userId,
    p_full_name: name.trim(),
    p_staff_code: staffCode.trim() || null,
  })
}

export function revokeTeacher(userId) {
  return teacherRpc('unlink_teacher_account', { p_user_id: userId })
}
