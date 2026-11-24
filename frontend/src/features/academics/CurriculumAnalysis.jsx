import React from 'react'
import { BookOpenText, Ear, MessageCircle, PenLine } from 'lucide-react'
import { PageHeader } from '../../components/ui.jsx'
import { curriculumSkills } from './curriculumSkills.js'

const icons = { speaking: MessageCircle, writing: PenLine, listening: Ear, reading: BookOpenText }

export default function CurriculumAnalysis() {
  return (
    <>
      <PageHeader title="Skills we teach" description="Every lesson works on these four skills together." />
      <ul aria-label="Course skills" className="grid gap-3 md:grid-cols-2">
        {curriculumSkills.map(skill => {
          const Icon = icons[skill.id] ?? BookOpenText
          return (
            <li key={skill.id} className="panel panel-body flex gap-4">
              <span className="grid size-11 flex-none place-items-center rounded-lg bg-brand-wash text-brand"><Icon size={21} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 className="break-words">{skill.title}</h2>
                <p className="mt-1 whitespace-pre-wrap break-words text-muted">{skill.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
