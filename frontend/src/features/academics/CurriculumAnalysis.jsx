import React from 'react'
import { curriculumSkills } from './curriculumSkills.js'

export default function CurriculumAnalysis() {
  return (
    <div lang="en" dir="ltr" className="text-left leading-relaxed">
      <header className="surface-banner rounded-2xl p-5 sm:p-8">
        <h1>Curriculum Analysis</h1>
        <p className="mt-3 text-lg font-semibold text-blue-950">Four skills we develop in the Arabic course</p>
      </header>
      <ul aria-label="Arabic course skills" className="mt-5 grid gap-4 min-[721px]:grid-cols-2">
        {curriculumSkills.map(skill => (
          <li key={skill.id} className="min-w-0 rounded-xl border border-surface-border bg-surface p-5">
            <h2 className="break-words text-xl font-bold text-blue-950">{skill.title}</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{skill.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
