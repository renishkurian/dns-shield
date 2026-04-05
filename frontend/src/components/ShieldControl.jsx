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
  const [status, setStatus] = useState({ active: true, remaining_seconds: 0 })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/shield-status')
      if (!res.ok) return
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      console.error('Shield status fetch error:', e)
    }
  }

  // Poll every 5 seconds for status; also tick down the countdown locally
  useEffect(() => {
    fetchStatus()
    const pollInterval = setInterval(fetchStatus, 5000)
    return () => clearInterval(pollInterval)
  }, [])

  // Local countdown tick
  useEffect(() => {
    if (status.active || status.remaining_seconds <= 0) return
    const tick = setInterval(() => {
      setStatus(prev => {
        const next = prev.remaining_seconds - 1
        if (next <= 0) {
          // Expired — re-poll immediately
          fetchStatus()
          return { ...prev, remaining_seconds: 0 }
        }
        return { ...prev, remaining_seconds: next }
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [status.active, status.remaining_seconds])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const disableShield = async (duration) => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/shield-toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrf(),
        },
        body: JSON.stringify({ active: false, duration }),
      })
      if (res.ok) await fetchStatus()
      setOpen(false)
    } catch (e) {
      console.error('Shield toggle error:', e)
    }
    setLoading(false)
  }

  const enableShield = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/shield-toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrf(),
        },
        body: JSON.stringify({ active: true, duration: 0 }),
      })
      if (res.ok) await fetchStatus()
      setOpen(false)
    } catch (e) {
      console.error('Shield enable error:', e)
    }
    setLoading(false)
  }

  const formatTime = (sec) => {
    if (sec <= 0) return '—'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}h ${m.toString().padStart(2,'0')}m`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isActive = status.active

  return (
    <div ref={panelRef} className="relative px-3 py-2">
      {/* Main toggle chip */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200
          ${isActive
            ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
            : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 animate-pulse'
          }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isActive
            ? <Shield size={15} className="shrink-0" />
            : <ShieldOff size={15} className="shrink-0" />
          }
          <div className="flex flex-col items-start leading-tight truncate">
            <span className="uppercase tracking-wider text-[10px]">
              {isActive ? 'Shield Active' : 'Shield Disabled'}
            </span>
            {!isActive && status.remaining_seconds > 0 && (
              <span className="font-mono text-[10px] opacity-70">
                {formatTime(status.remaining_seconds)} left
              </span>
            )}
            {!isActive && status.remaining_seconds <= 0 && (
              <span className="text-[10px] opacity-70 italic">Indefinite</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-3 right-3 mt-1 py-1.5 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-50">
          {isActive ? (
            <>
              <div className="px-3 py-1 text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                <Clock size={9} /> Disable for…
              </div>
              {OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => disableShield(opt.value)}
                  disabled={loading}
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
              disabled={loading}
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
