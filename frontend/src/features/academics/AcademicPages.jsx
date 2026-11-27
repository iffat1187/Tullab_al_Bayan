import React, { useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { PageHeader, useToast } from '../../components/ui.jsx'
import { instituteWifi } from './academicRepository.js'

export function WifiInstructions() {
  const { networkName, password } = instituteWifi()
  const [showPassword, setShowPassword] = useState(false)
  const toast = useToast()
  const VisibilityIcon = showPassword ? EyeOff : Eye

  async function copyValue(value, label, manualCopyHint) {
    try {
      await navigator.clipboard.writeText(value)
      toast(label + ' copied.')
    } catch {
      toast('Could not copy automatically. ' + manualCopyHint, 'error')
    }
  }

  return (
    <>
      <PageHeader title="Bayan Wi-Fi" description="Open your device's Wi-Fi settings, select BAYAN, and enter the password below." />
      <section className="panel panel-body grid max-w-2xl gap-5" aria-label="Wi-Fi connection details">
        <div className="grid gap-2">
          <label className="font-medium" htmlFor="bayan-wifi-network">Network name (SSID)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input id="bayan-wifi-network" className="field min-w-32 flex-1 font-mono" value={networkName} readOnly />
            <button className="btn btn-secondary" type="button"
              onClick={() => copyValue(networkName, 'Network name', 'Select the network name to copy it manually.')}>
              <Copy size={16} aria-hidden="true" /> Copy network name
            </button>
          </div>
        </div>
        <div className="grid gap-2">
          <label className="font-medium" htmlFor="bayan-wifi-password">Password</label>
          <div className="flex flex-wrap items-center gap-2">
            <input id="bayan-wifi-password" type={showPassword ? 'text' : 'password'}
              className="field min-w-32 flex-1 font-mono" value={password} autoComplete="off" readOnly />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary" type="button" aria-controls="bayan-wifi-password"
                onClick={() => setShowPassword(visible => !visible)}>
                <VisibilityIcon size={16} aria-hidden="true" /> {showPassword ? 'Hide password' : 'Show password'}
              </button>
              <button className="btn btn-secondary" type="button"
                onClick={() => copyValue(password, 'Password', 'Show the password to copy it manually.')}>
                <Copy size={16} aria-hidden="true" /> Copy password
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
