import React from 'react'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import './index.css'

// Resolve page components dynamically
const pages = import.meta.glob('./pages/**/*.jsx', { eager: true })

createInertiaApp({
  resolve: (name) => {
    const key = `./pages/${name}.jsx`
    const mod = pages[key]
    if (!mod) {
      throw new Error(`DNS Shield: page not found — "${name}"`)
    }
    return mod.default
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})
