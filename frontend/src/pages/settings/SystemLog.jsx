import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { 
  Bell, ShieldAlert, Cpu, Download, 
  Clock, Filter, Trash2, CheckCircle, 
  AlertCircle, Info, Database, Wifi
} from 'lucide-react'

const EVENT_ICONS = {
  'malware_hit': { icon: ShieldAlert, color: 'text-red-500' },
  'new_device': { icon: Wifi, color: 'text-blue-500' },
  'shield_expire': { icon: Clock, color: 'text-yellow-500' },
  'gravity_fail': { icon: Database, color: 'text-red-400' },
  'system': { icon: Cpu, color: 'text-slate-500' },
}

export default function SystemLog({ user, events: initialEvents = [] }) {
  const [events, setEvents] = useState(initialEvents)
  const [activeTab, setActiveTab] = useState('system')
  const [aiLogs, setAiLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchAiLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/usage')
      const data = await res.json()
      setAiLogs(data)
    } catch (e) {
      console.error('Failed to fetch AI logs:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    const target = activeTab === 'system' ? 'system events' : 'AI audit logs'
    if (!confirm(`Clear all ${target}?`)) return
    
    if (activeTab === 'ai') {
      await fetch('/api/ai/usage', { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
      setAiLogs([])
    } else {
      setEvents([])
    }
  }

  const exportAiCsv = () => {
    window.open('/api/ai/usage/export', '_blank')
  }

  const filteredAiLogs = aiLogs.filter(log => 
    log.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.feature.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase()))
  )

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

        {/* Tab Switcher & Search */}
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
                  const { icon: Icon, color } = EVENT_ICONS[ev.event_type] || EVENT_ICONS.system
                  return (
                    <tr key={ev.id} className="hover:bg-brand-500/5 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                        {new Date(ev.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={color} />
                          <span className="text-slate-300 font-bold capitalize">{ev.event_type.replace('_', ' ')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-slate-400 max-w-lg truncate" title={ev.message}>{ev.message}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[9px] font-bold uppercase tracking-widest">
                          Handled
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
                  <tr key={log.id} className="hover:bg-purple-500/5 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-medium">
                      {log.username || 'System'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold uppercase">
                        {log.feature.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono truncate max-w-xs" title={log.query}>
                      {log.query}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => alert(`PROMPT:\n${log.prompt}\n\nRESPONSE:\n${log.response}`)}
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
    </Layout>
  )
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

SystemLog.propTypes = {
  user: PropTypes.object,
  events: PropTypes.array
}
