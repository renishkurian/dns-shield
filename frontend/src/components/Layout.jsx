import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import NotificationCentre from './NotificationCentre'
import ConnectionStatusBadge from './ConnectionStatusBadge'
import { Search, Bell } from 'lucide-react'
import { ToastProvider, useToast } from './Toast'

export default function Layout({ children, user, currentPath, title }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)

  useEffect(() => {
    // Theme Reload Logic
    const saved = localStorage.getItem('theme-id') || 'blue'
    const themes = {
      blue:   ['#f0f9ff','#e0f2fe','#bae6fd','#7dd3fc','#38bdf8','#0ea5e9','#0284c7','#0369a1','#075985','#0c4a6e','#082f49'],
      green:  ['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#10b981','#059669','#047857','#065f46','#064e3b','#022c22'],
      purple: ['#f5f3ff','#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95','#2e1065'],
      rose:   ['#fff1f2','#ffe4e6','#fecdd3','#fda4af','#fb7185','#f43f5e','#e11d48','#be123c','#9f1239','#881337','#4c0519'],
      amber:  ['#fffbeb','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#92400e','#78350f','#451a03'],
    }
    const colors = themes[saved]
    if (colors) {
      const root = document.documentElement
      const weights = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
      weights.forEach((w, i) => {
        root.style.setProperty(`--brand-${w}`, colors[i])
      })
    }

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ToastProvider>
      <MobileAwarLayout
        user={user}
        currentPath={currentPath}
        title={title}
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
        isNotifOpen={isNotifOpen}
        setIsNotifOpen={setIsNotifOpen}
      >
        {children}
      </MobileAwarLayout>
    </ToastProvider>
  )
}

function MobileAwarLayout({ children, user, currentPath, title, isSearchOpen, setIsSearchOpen, isNotifOpen, setIsNotifOpen }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-surface overflow-hidden" onClick={() => setIsNotifOpen(false)}>
      <Sidebar
        currentPath={currentPath}
        user={user}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-surface-50 border-b border-slate-700/50 flex items-center px-3 md:px-6 gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(true) }}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
            aria-label="Open menu"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="15" y2="6" /><line x1="3" y1="10" x2="15" y2="10" /><line x1="3" y1="14" x2="15" y2="14" />
            </svg>
          </button>

          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">
              {title || 'DNS Shield'}
            </h1>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsSearchOpen(true); }}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500 hover:text-slate-400 hover:border-slate-600 transition-all group"
            >
              <Search size={14} className="group-hover:text-brand-400" />
              <span className="text-xs">Quick Search...</span>
              <span className="ml-4 text-[10px] font-bold text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 tracking-widest">⌘K</span>
            </button>
          </div>
          
          <div className="ml-auto flex items-center gap-2 md:gap-4 text-xs text-slate-500 relative">
            {/* Mobile search icon */}
            <button
              onClick={(e) => { e.stopPropagation(); setIsSearchOpen(true); }}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
              aria-label="Search"
            >
              <Search size={16} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsNotifOpen(!isNotifOpen); }}
              className={`p-2 rounded-xl border border-slate-700/50 text-slate-500 hover:text-white hover:bg-slate-800/50 transition-all ${isNotifOpen ? 'bg-brand-500/10 text-brand-400 border-brand-500/50' : ''}`}
            >
              <Bell size={18} />
            </button>
            <ConnectionStatusBadge />
            
            <NotificationCentre isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
          </div>
        </header>
        
        {/* Page content */}
        <main className="flex-1 overflow-auto p-3 md:p-6">
          {children}
        </main>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node,
  user: PropTypes.object,
  currentPath: PropTypes.string,
  title: PropTypes.string,
}

MobileAwarLayout.propTypes = {
  children: PropTypes.node,
  user: PropTypes.object,
  currentPath: PropTypes.string,
  title: PropTypes.string,
  isSearchOpen: PropTypes.bool,
  setIsSearchOpen: PropTypes.func,
  isNotifOpen: PropTypes.bool,
  setIsNotifOpen: PropTypes.func,
}

function StatusDot() {
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse-slow" />
      <span>Proxy active</span>
    </div>
  )
}
