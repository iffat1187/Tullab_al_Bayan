import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.jsx'
import { createLogger, installGlobalErrorHandlers, reactRootErrorHandlers } from './lib/logger.js'
import './styles/globals.css'

installGlobalErrorHandlers()
createLogger('app').info('Portal starting', { mode: import.meta.env.MODE })

createRoot(document.getElementById('root'), reactRootErrorHandlers).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
