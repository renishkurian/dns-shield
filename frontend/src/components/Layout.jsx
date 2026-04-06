import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import NotificationCentre from './NotificationCentre'
import { Search, Bell } from 'lucide-react'

export default function Layout({ children, user, currentPath, title }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)

  useEffect(() => {
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
    <div className="flex h-screen bg-surface overflow-hidden" onClick={() => setIsNotifOpen(false)}>
      <Sidebar currentPath={currentPath} user={user} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-surface-50 border-b border-slate-700/50 flex items-center px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold text-white">
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
          
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-500 relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsNotifOpen(!isNotifOpen); }}
              className={`p-2 rounded-xl border border-slate-700/50 text-slate-500 hover:text-white hover:bg-slate-800/50 transition-all ${isNotifOpen ? 'bg-brand-500/10 text-brand-400 border-brand-500/50' : ''}`}
            >
              <Bell size={18} />
            </button>
            <StatusDot />
            
            <NotificationCentre isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
          </div>
        </header>
        
        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
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

function StatusDot() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse-slow" />
      <span>Proxy active</span>
    </div>
  )
}
