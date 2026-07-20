import React, { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { Palette, Check, RefreshCw } from 'lucide-react'
import { useToast } from '../../components/Toast'

const THEMES = [
  { name: 'Shield Blue',   id: 'blue',   primary: '#0ea5e9', colors: ['#f0f9ff','#e0f2fe','#bae6fd','#7dd3fc','#38bdf8','#0ea5e9','#0284c7','#0369a1','#075985','#0c4a6e','#082f49'] },
  { name: 'Forest Green',  id: 'green',  primary: '#10b981', colors: ['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#10b981','#059669','#047857','#065f46','#064e3b','#022c22'] },
  { name: 'Royal Purple',  id: 'purple', primary: '#8b5cf6', colors: ['#f5f3ff','#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95','#2e1065'] },
  { name: 'Sunset Rose',   id: 'rose',   primary: '#f43f5e', colors: ['#fff1f2','#ffe4e6','#fecdd3','#fda4af','#fb7185','#f43f5e','#e11d48','#be123c','#9f1239','#881337','#4c0519'] },
  { name: 'Amber Gold',    id: 'amber',  primary: '#f59e0b', colors: ['#fffbeb','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#92400e','#78350f','#451a03'] },
]

const hexToRgb = (hex) => {
  const bigint = parseInt(hex.replace('#', ''), 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `${r} ${g} ${b}`
}

// Inner component that renders inside Layout (and therefore inside ToastProvider)
function AppearanceContent() {
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme-id') || 'blue')
  const { addToast } = useToast()

  const applyTheme = (theme) => {
    localStorage.setItem('theme-id', theme.id)
    setCurrentTheme(theme.id)
    
    const root = document.documentElement
    const weights = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    
    weights.forEach((w, i) => {
      root.style.setProperty(`--brand-${w}`, hexToRgb(theme.colors[i]))
    })
    
    addToast(`Theme switched to ${theme.name}`, 'success')
  }

  // Reload theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme-id')
    if (saved) {
      const theme = THEMES.find(t => t.id === saved)
      if (theme) {
        const root = document.documentElement
        const weights = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
        weights.forEach((w, i) => {
          root.style.setProperty(`--brand-${w}`, hexToRgb(theme.colors[i]))
        })
      }
    }
  }, [])

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Palette size={20} className="text-brand-400" />
            UI Customization
          </h2>
          <p className="text-sm text-slate-500">Personalize your DNS Shield experience with custom accent colors</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {THEMES.map(theme => (
          <button
            key={theme.id}
            onClick={() => applyTheme(theme)}
            className={`card group text-left transition-all duration-300 hover:scale-[1.02] border-2 ${
              currentTheme === theme.id ? 'border-brand-500 bg-brand-500/5' : 'border-transparent hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: theme.primary }}>
                 {currentTheme === theme.id && <Check size={24} className="text-white" />}
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{theme.id}</span>
            </div>
            
            <h3 className="font-bold text-white mb-2">{theme.name}</h3>
            
            <div className="flex gap-1">
               {theme.colors.slice(3, 8).map((c, i) => (
                 <div key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: c }} />
               ))}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-col md:flex-row gap-6">
        <div className="flex-1 card bg-slate-900/50 border-dashed">
           <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center shrink-0">
                 <RefreshCw size={20} className="text-brand-400" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-white mb-1">Persistent Customization</h4>
                 <p className="text-xs text-slate-500 leading-relaxed">
                   Your theme preference is saved locally to your browser. These changes are purely visual and do not affect system performance or security filtering.
                 </p>
              </div>
           </div>
        </div>

        <div className="md:w-64 card bg-slate-900/50 flex flex-col justify-between">
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Notification Test</p>
           <button 
             onClick={() => addToast('System integrity check complete. All nodes online.', 'success')}
             className="btn-primary w-full justify-center"
           >
             Trigger Test Alert
           </button>
        </div>
      </div>
    </>
  )
}

export default function Appearance({ user }) {
  return (
    <Layout user={user} currentPath="/settings/appearance" title="Appearance Settings">
      <AppearanceContent />
    </Layout>
  )
}
