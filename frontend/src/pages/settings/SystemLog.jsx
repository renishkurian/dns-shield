import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { useAlert } from '../../components/Toast'
import {
  Bell, ShieldAlert, Cpu, Download, Search,
  Clock, Trash2, Database, Wifi, X, Sparkles
} from 'lucide-react'

const EVENT_ICONS = {
  'malware_hit': { icon: ShieldAlert, color: 'text-red-500' },
  'new_device': { icon: Wifi, color: 'text-blue-500' },
  'shield_expire': { icon: Clock, color: 'text-yellow-500' },
  'gravity_fail': { icon: Database, color: 'text-red-400' },
  'system': { icon: Cpu, color: 'text-slate-500' },
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function Meta({ label, value, badge }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
      <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      {badge ? (
        <span className={badge === 'red' ? 'badge-red' : 'badge-green'}>{value}</span>
      ) : (
        <p className="text-slate-200 font-mono truncate" title={value}>{value}</p>
      )}
    </div>
  )
}
Meta.propTypes = { label: PropTypes.string, value: PropTypes.string, badge: PropTypes.string }

function AuditDrawer({ log, onClose }) {
  if (!log) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Close audit drawer"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-lg h-full bg-surface-50 border-l border-slate-800 shadow-2xl flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={18} className="text-purple-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-sm">Full AI Audit</h3>
              <p className="text-[11px] text-slate-500 font-mono truncate">{log.query || '—'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Meta label="Status" value={log.status || 'ok'} badge={log.status === 'error' ? 'red' : 'green'} />
            <Meta label="Feature" value={(log.feature || 'unknown').replace(/_/g, ' ')} />
            <Meta label="Provider" value={log.provider || '—'} />
            <Meta label="Model" value={log.model || '—'} />
            <Meta label="User" value={log.username || 'System'} />
            <Meta label="When" value={log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'} />
            <Meta label="Tokens in" value={String(log.tokens_input || 0)} />
            <Meta label="Tokens out" value={String(log.tokens_output || 0)} />
          </div>

          {log.error_message ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Error</p>
              <pre className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-300 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {log.error_message}
              </pre>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prompt sent</p>
            <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-slate-300 whitespace-pre-wrap break-words max-h-[40vh] overflow-auto leading-relaxed">
              {log.prompt || '—'}
            </pre>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Response received</p>
            <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-slate-200 whitespace-pre-wrap break-words max-h-[40vh] overflow-auto leading-relaxed">
              {log.response || '—'}
            </pre>
          </div>
        </div>
      </aside>
    </div>
  )
}
AuditDrawer.propTypes = { log: PropTypes.object, onClose: PropTypes.func }

export default function SystemLog({ user, events: initialEvents = [] }) {
  const { alert, confirm } = useAlert()
  const [events] = useState(initialEvents)
  const [activeTab, setActiveTab] = useState('system')
  const [aiLogs, setAiLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState(null)

  const fetchAiLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/usage')
      const data = await res.json()
      setAiLogs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch AI logs:', e)
      setAiLogs([])
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    const target = activeTab === 'system' ? 'system events' : 'AI audit logs'
    if (!(await confirm(`Clear all ${target}?`))) return

    if (activeTab === 'ai') {
      await fetch('/api/ai/usage', { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
      setAiLogs([])
      setSelected(null)
    }
  }

  const exportAiCsv = () => {
    window.open('/api/ai/usage/export', '_blank')
  }

  const filteredAiLogs = aiLogs.filter(log => {
    const q = searchTerm.toLowerCase()
    if (!q) return true
    return (
      (log.query || '').toLowerCase().includes(q) ||
      (log.feature || '').toLowerCase().includes(q) ||
      (log.username || '').toLowerCase().includes(q) ||
      (log.prompt || '').toLowerCase().includes(q)
    )
  })

  React.useEffect(() => {
    if (activeTab === 'ai') fetchAiLogs()
  }, [activeTab])

  return (
    <Layout user={user} currentPath="/settings/system-log" title="System Event Log">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="text-brand-400" />
              Intelligence Log
            </h1>
            <p className="text-sm text-slate-500 mt-1">Audit trail of security events, system triggers, and AI usage logs.</p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'ai' && (
              <button onClick={exportAiCsv} className="btn-ghost text-brand-400 border border-brand-500/20 hover:bg-brand-500/5">
                <Download size={16} /> Export CSV
              </button>
            )}
            <button onClick={handleClear} className="btn-ghost text-red-400">
              <Trash2 size={16} /> Clear {activeTab === 'ai' ? 'AI Logs' : 'Log'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                activeTab === 'system' ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              System Events
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                activeTab === 'ai' ? 'bg-purple-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              AI Audits
            </button>
          </div>

          {activeTab === 'ai' && (
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Search AI logs..."
                className="input pl-10 h-9 text-xs w-full"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="card p-0 overflow-hidden">
          {activeTab === 'system' ? (
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                  <th className="text-left px-6 py-4">Timestamp</th>
                  <th className="text-left px-6 py-4">Event Type</th>
                  <th className="text-left px-6 py-4">Message</th>
                  <th className="text-right px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {events.map(ev => {
                  const eventType = ev.event_type || ev.type || 'system'
                  const ts = ev.timestamp || ev.created_at
                  const { icon: Icon, color } = EVENT_ICONS[eventType] || EVENT_ICONS.system
                  return (
                    <tr key={ev.id} className="hover:bg-brand-500/5 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                        {ts ? new Date(ts).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={color} />
                          <span className="text-slate-300 font-bold capitalize">{String(eventType).replace(/_/g, ' ')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-400 max-w-lg truncate" title={ev.message}>{ev.message}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[9px] font-bold uppercase tracking-widest">
                          {ev.severity || 'Handled'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {events.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-20 text-center text-slate-600 italic">
                      No system events recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                  <th className="text-left px-6 py-4">Timestamp</th>
                  <th className="text-left px-6 py-4">User</th>
                  <th className="text-left px-6 py-4">Feature</th>
                  <th className="text-left px-6 py-4">Query</th>
                  <th className="text-right px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredAiLogs.map(log => (
                  <tr
                    key={log.id}
                    className={`hover:bg-purple-500/5 transition-colors group cursor-pointer ${
                      selected?.id === log.id ? 'bg-purple-500/10' : ''
                    }`}
                    onClick={() => setSelected(log)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-medium">
                      {log.username || 'System'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold uppercase">
                        {(log.feature || 'unknown').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono truncate max-w-xs" title={log.query}>
                      {log.query || '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(log)
                        }}
                        className="text-brand-400 hover:underline"
                      >
                        View Full Audit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAiLogs.length === 0 && !loading && (
                  <tr>
                    <td colSpan="5" className="py-20 text-center text-slate-600 italic">
                      {searchTerm ? 'No matching AI logs found.' : 'No AI usage logs found.'}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan="5" className="py-20 text-center text-brand-400 animate-pulse">
                      Loading AI Audit Log…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AuditDrawer log={selected} onClose={() => setSelected(null)} />
    </Layout>
  )
}

SystemLog.propTypes = {
  user: PropTypes.object,
  events: PropTypes.array
}
