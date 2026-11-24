import React, { useState } from 'react'

export default function AccountAvatar({ account, className = '' }) {
  const [failedPhoto, setFailedPhoto] = useState(null)
  const initials = account.name.trim().split(/\s+/).slice(0, 2)
    .map(word => Array.from(word)[0]).join('').toUpperCase()
  const photo = typeof account.photo === 'string' && account.photo.startsWith('https://')
    && failedPhoto !== account.photo

  return photo ? (
    <img src={account.photo} alt="" referrerPolicy="no-referrer" onError={() => setFailedPhoto(account.photo)}
      className={className + ' shrink-0 rounded-full object-cover'} />
  ) : (
    <span aria-hidden="true" className={className + ' grid shrink-0 place-items-center rounded-full bg-teal-wash font-semibold text-teal'}>
      {initials}
    </span>
  )
}
