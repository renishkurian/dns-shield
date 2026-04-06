import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { 
  Bell, Mail, Slack, Send, Globe, Plus, Trash2, 
  CheckCircle, AlertCircle, Save, X, Info, ShieldAlert, Wifi, Database
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const EVENT_TYPES = [
  { id: 'malware_hit', label: 'Threat Blocked', icon: ShieldAlert, desc: 'AI heuristic or threat feed match' },
  { id: 'new_device', label: 'New Device', icon: Wifi, desc: 'Network scanner found a new IP' },
  { id: 'shield_expire', label: 'Shield Expiry', icon: Bell, desc: 'Temporary disable period finished' },
  { id: 'gravity_fail', label: 'Gravity Error', icon: Database, desc: 'Adlist update fetch failed' },
]

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, placeholder: 'you@example.com' },
  { id: 'slack', label: 'Slack Webhook', icon: Slack, placeholder: 'https://hooks.slack.com/services/...' },
  { id: 'telegram', label: 'Telegram Chat ID', icon: Send, placeholder: '123456789' },
  { id: 'webhook', label: 'Generic Webhook', icon: Globe, placeholder: 'https://api.myapp.com/alerts' },
]

export default function Alerts({ user, configs: initialArr = [] }) {
  const [configs, setConfigs] = useState(initialArr)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    event_type: 'malware_hit', channel: 'email', destination: '', enabled: true
  })

  const handleSave = async () => {
    const res = await fetch('/api/alerts/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const data = await res.json()
      setConfigs(prev => [data, ...prev])
      setShowAdd(false)
      setForm({ event_type: 'malware_hit', channel: 'email', destination: '', enabled: true })
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this alert config?')) return
    const res = await fetch(`/api/alerts/configs/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) {
      setConfigs(prev => prev.filter(c => c.id !== id))
    }
  }

  return (
    <Layout user={user} currentPath="/settings/alerts" title="Alert Settings">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bell className="text-brand-400" />
              Notifications & Alerts
            </h1>
            <p className="text-sm text-slate-500 mt-1">Get notified of security threats and system events via external channels.</p>
          </div>
          <button 
            onClick={() => setShowAdd(!showAdd)} 
            className={`btn-primary ${showAdd ? 'bg-slate-700 border-slate-600' : ''}`}
          >
            {showAdd ? <X size={16} /> : <Plus size={16} />}
            {showAdd ? 'Cancel' : 'Add Notification'}
          </button>
        </div>

        {showAdd && (
          <div className="card mb-8 border-brand-500/30 bg-brand-500/5 animate-in slide-in-from-top duration-300">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6">Create Alert Bridge</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
              <div>
                <label className="label mb-3">1. Select Event Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {EVENT_TYPES.map(ev => {
                    const Icon = ev.icon
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setForm({...form, event_type: ev.id})}
                        className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                          form.event_type === ev.id 
                            ? 'bg-brand-500/10 border-brand-500/50 text-white' 
                            : 'bg-slate-900/50 border-slate-700/50 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${form.event_type === ev.id ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800'}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{ev.label}</p>
                          <p className="text-[10px] opacity-70 mt-0.5">{ev.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="label mb-3">2. Choose Channel</label>
                <div className="flex flex-wrap gap-2 mb-6">
                  {CHANNELS.map(ch => {
                    const Icon = ch.icon
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setForm({...form, channel: ch.id})}
                        className={`flex-1 min-w-[120px] flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                          form.channel === ch.id 
                            ? 'bg-brand-500/10 border-brand-500/50 text-white' 
                            : 'bg-slate-900/50 border-slate-700/50 text-slate-500 hover:border-slate-600'
                        }`}
                      >
                        <Icon size={18} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{ch.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800">
                  <label className="label mb-2">Destination / URL</label>
                  <input 
                    className="input w-full font-mono text-xs" 
                    placeholder={CHANNELS.find(c => c.id === form.channel)?.placeholder}
                    value={form.destination} onChange={e => setForm({...form, destination: e.target.value})}
                  />
                  {form.channel === 'telegram' && (
                    <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1.5">
                      <Info size={12} />
                      Requires bot token configured in backend settings.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-6 border-t border-slate-800">
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Discard</button>
              <button onClick={handleSave} className="btn-primary px-8">
                <Save size={14} /> Enable Alert
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map(c => {
            const ev = EVENT_TYPES.find(x => x.id === c.event_type) || { label: 'System', icon: Bell }
            const ch = CHANNELS.find(x => x.id === c.channel) || { label: 'Bridge', icon: Globe }
            const EvIcon = ev.icon
            const ChIcon = ch.icon

            return (
              <div key={c.id} className="card group hover:border-brand-500/30 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-brand-400 transition-colors">
                        <EvIcon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm">{ev.label}</h3>
                        <p className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{c.destination}</p>
                      </div>
                    </div>
                    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                      c.enabled ? 'bg-brand-500/10 text-brand-400' : 'bg-slate-800 text-slate-600'
                    }`}>
                      <ChIcon size={16} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${c.enabled ? 'text-green-500' : 'text-slate-600'}`}>
                    ● {c.enabled ? 'Active' : 'Paused'}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {configs.length === 0 && !showAdd && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-4">
              <ShieldAlert size={32} />
            </div>
            <h3 className="text-slate-400 font-medium mb-1">No alerts configured</h3>
            <p className="text-xs text-slate-600 mb-6">Stay informed about threats even when you're away.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto">
              <Plus size={14} /> Bridge an Alert
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

Alerts.propTypes = {
  user: PropTypes.object,
  configs: PropTypes.array
}
