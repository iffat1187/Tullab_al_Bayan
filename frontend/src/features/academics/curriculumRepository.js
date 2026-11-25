import { supabase } from '../auth/supabaseAuth.js'

export async function listSkillDescriptions() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('curriculum_skills').select('id, description')
  if (error) throw error
  return Object.fromEntries(data.map(skill => [skill.id, skill.description]))
}

export async function saveSkillDescription(id, description) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('curriculum_skills')
    .update({ description: description.trim() })
    .eq('id', id)
    .select('description')
    .single()
  if (error) throw error
  return data.description
}
