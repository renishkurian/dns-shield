import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { 
  ShieldAlert, Plus, Trash2, RefreshCw, 
  ExternalLink, CheckCircle, AlertTriangle, 
  Info, Globe, Lock, ShieldCheck, Zap
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const PRESET_FEEDS = [
  { name: 'OISD Big', url: 'https://big.oisd.nl/', desc: 'High-quality, low false-positive blocking' },
  { name: 'PhishTank', url: 'https://data.phishtank.com/data/online-valid.json', desc: 'Real-time phishing site tracking' },
  { name: 'URLHaus', url: 'https://urlhaus.abuse.ch/downloads/hostfile/', desc: 'Malware distribution site feed' },
  { name: 'Steven Black Unified', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts', desc: 'General ads + trackers + malware' },
]

export default function ThreatFeeds({ user, feeds: initialFeeds = [] }) {
  const [feeds, setFeeds] = useState(initialFeeds)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', url: '' })
  const [loading, setLoading] = useState(false)

  const handleAdd = async (preset) => {
    const feed = preset || form
    setLoading(true)
    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({
        ...feed,
        comment: '[THREAT_FEED] Managed security feed',
        enabled: true
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setFeeds(prev => [data, ...prev])
      setShowAdd(false)
      setForm({ name: '', url: '' })
    }
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this threat feed?')) return
    const res = await fetch(`/api/lists/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) {
      setFeeds(prev => prev.filter(f => f.id !== id))
    }
  }

  return (
    <Layout user={user} currentPath="/settings/threat-feeds" title="Threat Intelligence">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <ShieldAlert className="text-brand-400" />
              Threat Intelligence Feeds
            </h1>
            <p className="text-sm text-slate-500 mt-1">High-confidence malware and phishing blocklists updated in real-time.</p>
          </div>
          <button 
            onClick={() => setShowAdd(!showAdd)} 
            className="btn-primary"
          >
            <Plus size={16} /> Add Intelligence Feed
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main List */}
          <div className="lg:col-span-2 space-y-4">
            {feeds.map(feed => (
              <div key={feed.id} className="card group hover:border-brand-500/30 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-brand-400 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">{feed.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]">{feed.url}</span>
                        <a href={feed.url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-white">
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          <Globe size={10} /> {feed.domain_count?.toLocaleString() || 0} Indicators
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          <Clock size={10} /> Updated {feed.last_updated ? new Date(feed.last_updated).toLocaleDateString() : 'Never'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold uppercase tracking-widest border border-green-500/20">
                      <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                      Active
                    </span>
                    <button 
                      onClick={() => handleDelete(feed.id)}
                      className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {feeds.length === 0 && (
              <div className="card py-16 text-center border-dashed">
                <div className="w-16 h-16 rounded-3xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-4">
                  <Lock size={32} />
                </div>
                <h3 className="text-slate-400 font-medium">No active intelligence feeds</h3>
                <p className="text-xs text-slate-600 mb-6">Strengthen your security by adding a malware blocklist.</p>
                <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto">
                  Get Started
                </button>
              </div>
            )}
          </div>

          {/* Presets Sidebar */}
          <div className="space-y-6">
            <div className="card border-brand-500/20 bg-brand-500/5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Zap size={14} className="text-brand-400" />
                Security Presets
              </h3>
              <div className="space-y-3">
                {PRESET_FEEDS.map(preset => (
                  <button
                    key={preset.name}
                    disabled={loading || feeds.some(f => f.url === preset.url)}
                    onClick={() => handleAdd(preset)}
                    className="w-full text-left p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-brand-500/50 transition-all group disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors">{preset.name}</span>
                      <Plus size={12} className="text-slate-600 group-hover:text-brand-400" />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">{preset.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="card bg-slate-900/20 border-slate-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Info size={14} className="text-slate-400" />
                Intelligence Tracking
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Managed threat feeds are prioritized by the DNS Shield AI heuristic engine. 
                Hits against these specific feeds will trigger **Malware Blocked** high-priority alerts.
              </p>
            </div>
          </div>
        </div>

        {/* Add Modal/Overlay */}
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="card w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Add Custom Intelligence Feed</h2>
                <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="label">Feed Name</label>
                  <input 
                    className="input w-full" placeholder="e.g. Personal Threat List"
                    value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="label">Blocklist URL (Indicators of Compromise)</label>
                  <input 
                    className="input w-full font-mono text-xs" placeholder="https://..."
                    value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
                <button onClick={() => handleAdd()} disabled={!form.name || !form.url || loading} className="btn-primary px-8">
                  {loading ? 'Adding...' : 'Integrate Feed'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function X(props) {
  return <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
}

ThreatFeeds.propTypes = {
  user: PropTypes.object,
  feeds: PropTypes.array
}
