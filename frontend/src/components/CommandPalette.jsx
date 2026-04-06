import React, { useState, useEffect, useRef } from 'react'
import { Search, Globe, Wifi, Settings, Shield, HardDrive, Filter, Activity, Clock, Box, X, Command } from 'lucide-react'

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setQuery('')
      setResults([])
    }
  }, [isOpen])

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/system/global-search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data)
        setActiveIndex(0)
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(prev => (prev - 1 + results.length) % results.length)
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault()
        window.location.href = results[activeIndex].href
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, results, activeIndex, onClose])

  if (!isOpen) return null

  const getIcon = (type) => {
    switch(type) {
      case 'client': return Wifi
      case 'domain': return Shield
      case 'pattern': return Filter
      case 'app': return Box
      default: return Globe
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      
      <div 
        className="relative w-full max-w-2xl bg-[#0f172a] rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-4 border-b border-slate-800">
          <Search size={20} className="text-slate-400 mr-3" />
          <input
            ref={inputRef}
            placeholder="Search clients, domains, patterns, apps..."
            className="flex-1 bg-transparent border-none text-white focus:outline-none text-base placeholder-slate-500"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest border border-slate-700/50">
            Esc
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query && (
            <div className="p-4">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Recent Pages</h3>
              <div className="grid grid-cols-2 gap-1">
                <QuickLink icon={Activity} label="Dashboard" href="/" />
                <QuickLink icon={Clock} label="Query Log" href="/queries" />
                <QuickLink icon={Settings} label="DNS Config" href="/settings/dns" />
                <QuickLink icon={Bell} label="Alerts" href="/settings/alerts" />
              </div>
            </div>
          )}

          {loading && (
            <div className="p-12 text-center text-slate-500 animate-pulse text-sm">
              Searching data store...
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((res, i) => {
                const Icon = getIcon(res.type)
                return (
                  <div
                    key={res.type + res.id}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                      activeIndex === i ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'hover:bg-white/5 text-slate-400'
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => window.location.href = res.href}
                  >
                    <div className={`p-2 rounded-lg ${activeIndex === i ? 'bg-white/20' : 'bg-slate-800 text-slate-500'}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${activeIndex === i ? 'text-white' : 'text-white'}`}>{res.label}</p>
                      <p className={`text-[10px] truncate opacity-70 ${activeIndex === i ? 'text-white/80' : 'text-slate-500'}`}>{res.sub}</p>
                    </div>
                    {activeIndex === i && <ChevronRight size={14} className="text-white/80" />}
                  </div>
                )
              })}
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-4">
                <Box size={24} />
              </div>
              <p className="text-sm text-slate-500">No results found for "{query}"</p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-900/50 border-t border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="p-1 bg-slate-800 rounded border border-slate-700 shadow-sm text-slate-300">↑↓</span> Navigate</span>
            <span className="flex items-center gap-1"><span className="p-1 bg-slate-800 rounded border border-slate-700 shadow-sm text-slate-300">Enter</span> Select</span>
          </div>
          <div className="flex items-center gap-1">
            <Command size={10} /> + K to trigger
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickLink({ icon: Icon, label, href }) {
  return (
    <a 
      href={href}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 group transition-all"
    >
      <div className="p-2 rounded-lg bg-slate-800 text-slate-500 group-hover:text-brand-400 group-hover:bg-brand-500/10 transition-all">
        <Icon size={14} />
      </div>
      <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase tracking-wider">{label}</span>
      <ChevronRight size={12} className="ml-auto opacity-0 group-hover:opacity-100 transition-all text-slate-600" />
    </a>
  )
}

function ChevronRight(props) {
  return <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
}
