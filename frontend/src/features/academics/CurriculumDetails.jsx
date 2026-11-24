import React, { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { PageHeader } from '../../components/ui.jsx'
import { curriculumBooks } from './curriculumBooks.js'

function BookCover({ book }) {
  const [failedCover, setFailedCover] = useState(null)
  const hasCover = book.cover && failedCover !== book.cover
  return (
    <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-surface-sunk">
      {hasCover ? <img src={book.cover} alt={book.alt ?? ('Book ' + book.number + ' cover')}
        className="absolute inset-0 size-full object-contain" decoding="async" loading="lazy" onError={() => setFailedCover(book.cover)} /> : (
        <div className="flex flex-col items-center gap-2 p-2 text-center text-muted">
          <BookOpen size={28} aria-hidden="true" />
          <span className="text-xs">Cover not available</span>
        </div>
      )}
    </div>
  )
}

export default function CurriculumDetails() {
  return (
    <>
      <PageHeader title="Course books"
        description="The course follows the 12 student books of this series, from first words to confident speaking, writing, listening and presenting.">
        <p lang="ar" dir="rtl" className="mt-3 w-fit text-3xl leading-relaxed text-teal">العربية بين يدي أولادنا</p>
      </PageHeader>
      <ol aria-label="Course books" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
        {curriculumBooks.map(book => (
          <li key={book.number} className="panel min-w-0 p-2.5 sm:p-3">
            <BookCover book={book} />
            <h2 className="mt-2.5 text-center text-base">Book {book.number}</h2>
          </li>
        ))}
      </ol>
    </>
  )
}
