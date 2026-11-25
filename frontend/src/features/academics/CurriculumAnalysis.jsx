import React, { useEffect, useState } from 'react'
import { BookOpenText, Ear, MessageCircle, PenLine } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { LoadingState, Notice, PageHeader } from '../../components/ui.jsx'
import { listSkillDescriptions, saveSkillDescription } from './curriculumRepository.js'
import { curriculumSkills } from './curriculumSkills.js'

const icons = { speaking: MessageCircle, writing: PenLine, listening: Ear, reading: BookOpenText }

function SkillCard({ skill, description, canEdit, onSaved }) {
  const Icon = icons[skill.id]
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(event) {
    event.preventDefault()
    if (saving) return
    if (!draft.trim()) {
      setError('Enter a description before saving.')
      return
    }
    setSaving(true)
    setError('')
    try {
      onSaved(skill.id, await saveSkillDescription(skill.id, draft))
      setDraft(null)
      setSaved(true)
    } catch {
      setError('The description could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="panel panel-body flex gap-4">
      <span className="grid size-11 flex-none place-items-center rounded-lg bg-brand-wash text-brand"><Icon size={21} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2>{skill.title}</h2>
        {canEdit && draft !== null ? (
          <form className="mt-2 grid gap-2" onSubmit={save}>
            <label className="grid gap-1">{skill.title} description
              <textarea className="field" rows={4} value={draft} disabled={saving} onChange={event => setDraft(event.target.value)} />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => { setDraft(null); setError('') }}>Cancel</button>
            </div>
          </form>
        ) : <>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted">{description ?? 'Description unavailable.'}</p>
          {canEdit && description != null && <button type="button" className="btn btn-secondary btn-sm mt-2" aria-label={`Edit ${skill.title} description`}
            onClick={() => { setDraft(description); setSaved(false) }}>Edit</button>}
          {saved && <p role="status" className="mt-2">Description saved.</p>}
        </>}
      </div>
    </li>
  )
}

export default function CurriculumAnalysis() {
  const { role } = useOutletContext()
  const [descriptions, setDescriptions] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    listSkillDescriptions().then(
      result => { if (active) setDescriptions(result) },
      () => { if (active) setError(true) },
    )
    return () => { active = false }
  }, [attempt])

  function applyDescription(id, description) {
    setDescriptions(current => ({ ...current, [id]: description }))
  }

  return (
    <>
      <PageHeader title="Skills we teach" description="Every lesson works on these four skills together." />
      {error ? <Notice tone="error" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => {
        setError(false)
        setAttempt(value => value + 1)
      }}>Try again</button>}>Skill descriptions could not be loaded.</Notice>
        : !descriptions ? <LoadingState>Loading skill descriptions…</LoadingState>
          : <ul aria-label="Course skills" className="grid gap-3 md:grid-cols-2">
            {curriculumSkills.map(skill => (
              <SkillCard key={skill.id} skill={skill} description={descriptions[skill.id]} canEdit={role === 'admin'} onSaved={applyDescription} />
            ))}
          </ul>}
    </>
  )
}
