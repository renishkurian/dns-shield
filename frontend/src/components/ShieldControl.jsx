import React, { useState, useEffect, useRef } from 'react'
import { Shield, ShieldOff, ChevronDown, Clock, Check, X } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? ''
}

const OPTIONS = [
  { label: '10 minutes',   value: 10 },
  { label: '30 minutes',   value: 30 },
  { label: '1 hour',       value: 60 },
  { label: '2 hours',      value: 120 },
  { label: '4 hours',      value: 240 },
  { label: '12 hours',     value: 720 },
  { label: '24 hours',     value: 1440 },
  { label: 'Indefinitely', value: -1 },
]

export default function ShieldControl() {
  const [active, setActive] = useState(true)
  const [remaining, setRemaining] = useState(0) // seconds
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)
  const tickRef = useRef(null)

  // Fetch status ONCE on mount — no polling
  useEffect(() => {
    fetch('/api/system/shield-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setActive(data.active)
        setRemaining(data.remaining_seconds || 0)
      })
      .catch(() => {})
  }, [])

  // Local countdown — only runs when shield is disabled with a timer
  useEffect(() => {
    clearInterval(tickRef.current)
    if (!active && remaining > 0) {
      tickRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(tickRef.current)
            setActive(true) // expired — show as active locally
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(tickRef.current)
  }, [active, remaining])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const disableShield = async (duration) => {
    setLoading(true)
    setOpen(false)
    try {
      const res = await fetch('/api/system/shield-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ active: false, duration }),
      })
      if (res.ok) {
        setActive(false)
        setRemaining(duration > 0 ? duration * 60 : 0)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const enableShield = async () => {
    setLoading(true)
    setOpen(false)
    try {
      const res = await fetch('/api/system/shield-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ active: true, duration: 0 }),
      })
      if (res.ok) {
        setActive(true)
        setRemaining(0)
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const fmt = (sec) => {
    if (sec <= 0) return null
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}h ${m.toString().padStart(2,'0')}m`
    return `${m}:${s.toString().padStart(2, '0')} left`
  }

  return (
    <div ref={panelRef} className="relative px-3 py-2">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200
          ${active
            ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
            : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
          }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {active ? <Shield size={15} className="shrink-0" /> : <ShieldOff size={15} className="shrink-0" />}
          <div className="flex flex-col items-start leading-tight truncate">
            <span className="uppercase tracking-wider text-[10px]">
              {active ? 'Shield Active' : 'Shield Disabled'}
            </span>
            {!active && remaining > 0 && (
              <span className="font-mono text-[10px] opacity-70">{fmt(remaining)}</span>
            )}
            {!active && remaining <= 0 && (
              <span className="text-[10px] opacity-70 italic">indefinite</span>
            )}
          </div>
        </div>
        <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1 py-1.5 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-50">
          {active ? (
            <>
              <div className="px-3 py-1 text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <Clock size={9} /> Disable for…
              </div>
              {OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => disableShield(opt.value)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-2"
                >
                  <X size={11} className="opacity-40" />
                  {opt.label}
                </button>
              ))}
            </>
          ) : (
            <button
              onClick={enableShield}
              className="w-full text-left px-3 py-2 text-xs text-green-400 hover:bg-green-500/10 transition-colors flex items-center gap-2 font-bold"
            >
              <Check size={12} /> Resume Filtering Now
            </button>
          )}
        </div>
      )}
    </div>
  )
}
