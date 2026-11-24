import React from 'react'
import { instituteWifi } from './academicRepository.js'

export function WifiInstructions() {
  const instructions = instituteWifi()
  return (
    <>
      <h1>Bayan Wi-Fi</h1>
      <div className="mt-5"><p>{instructions ?? 'Wi-Fi connection instructions have not been provided by the institute yet.'}</p></div>
    </>
  )
}
