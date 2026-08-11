import React, { useState, useEffect } from 'react'
import { Bell, ShieldAlert, Wifi, Database, Clock, X, Check } from 'lucide-react'

const EVENT_ICONS = {
  'malware_hit': { icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10' },
  'new_device': { icon: Wifi, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'gravity_fail': { icon: Database, color: 'text-red-400', bg: 'bg-red-400/10' },
  'shield_expire': { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
}

export default function NotificationCentre({ isOpen, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/notifications')
      const data = await res.json().catch(() => [])
      setEvents(Array.isArray(data) ? data.slice(0, 10) : [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) fetchEvents()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Mobile: full-screen overlay + bottom sheet */}
      <div
        className="fixed inset-0 z-[100] flex items-end sm:hidden"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative w-full bg-slate-900 border-t border-slate-800 rounded-t-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Bell size={14} className="text-brand-400" />
              Intelligence Center
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && (
              <div className="p-8 text-center text-slate-600 animate-pulse text-[10px] font-bold uppercase tracking-widest">
                Scanning events...
              </div>
            )}
            {events.map(ev => {
              const cfg = EVENT_ICONS[ev.event_type] || { icon: Bell, color: 'text-slate-500', bg: 'bg-slate-800' }
              const Icon = cfg.icon
              return (
                <div key={ev.id} className="p-4 border-b border-slate-800/50 hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className="flex gap-3">
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{ev.event_type.replace('_', ' ')}</span>
                        <span className="text-[9px] text-slate-600">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug break-words">{ev.message}</p>
                    </div>
                  </div>
                </div>
              )
            })}
            {events.length === 0 && !loading && (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-3">
                  <Check size={24} />
                </div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">System nominal</p>
              </div>
            )}
          </div>
          <a
            href="/settings/system-log"
            className="block px-4 py-2 bg-slate-950 text-center text-[10px] font-bold text-brand-400 hover:text-white uppercase tracking-widest border-t border-slate-800"
            onClick={onClose}
          >
            View All History
          </a>
        </div>
      </div>

      {/* Desktop: dropdown positioned relative to bell button */}
      <div 
        className="hidden sm:block absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Bell size={14} className="text-brand-400" />
            Intelligence Center
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && (
            <div className="p-8 text-center text-slate-600 animate-pulse text-[10px] font-bold uppercase tracking-widest">
              Scanning events...
            </div>
          )}

          {events.map(ev => {
            const cfg = EVENT_ICONS[ev.event_type] || { icon: Bell, color: 'text-slate-500', bg: 'bg-slate-800' }
            const Icon = cfg.icon
            return (
              <div key={ev.id} className="p-4 border-b border-slate-800/50 hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="flex gap-3">
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${cfg.bg} ${cfg.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{ev.event_type.replace('_', ' ')}</span>
                      <span className="text-[9px] text-slate-600">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug break-words">{ev.message}</p>
                  </div>
                </div>
              </div>
            )
          })}

          {events.length === 0 && !loading && (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-3">
                <Check size={24} />
              </div>
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">System nominal</p>
            </div>
          )}
        </div>

        <a 
          href="/settings/system-log" 
          className="block px-4 py-2 bg-slate-950 text-center text-[10px] font-bold text-brand-400 hover:text-white uppercase tracking-widest border-t border-slate-800"
          onClick={onClose}
        >
          View All History
        </a>
      </div>
    </>
  )
}
