import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { 
  Play, Pause, Download, Shield, Activity, 
  CheckCircle, XCircle, Search, Trash, 
  Lock, Unlock, Database, ArrowRight,
  Loader2, RefreshCw, X, Sparkles
} from 'lucide-react'

const STATUS_LABELS = {
  allowed:         { label: 'Allowed',        cls: 'badge-green' },
  blocked_pattern: { label: 'Pattern',        cls: 'badge-red' },
  blocked_domain:  { label: 'Domain',         cls: 'badge-red' },
  blocked_ai:      { label: 'Blocked (AI)',   cls: 'badge-red' },
  nxdomain:        { label: 'NXDOMAIN',       cls: 'badge-gray' },
}

const RESOLUTION_ICONS = {
  'Cache': Database,
  'Blocked (Gravity)': Shield,
  'Blocked (Domain)': Shield,
  'Blocked (Pattern)': Shield,
  'Blocked (AI)': Sparkles,
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function QueryInspector({ entry, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [askingAi, setAskingAi] = useState(false)

  const { domain } = entry

  useEffect(() => {
    setResult(null)
    setAiExplanation(null)
    if (!domain) return
    fetch('/api/blocks/domains/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain }),
    })
      .then(r => r.json())
      .then(setResult)
  }, [domain])

  const blockDomain = async () => {
    setLoading(true)
    await fetch('/api/blocks/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, block_type: 'exact', layer: 'proxy', enabled: true }),
    })
    setLoading(false)
    onClose()
  }

  const allowDomain = async () => {
    setLoading(true)
    await fetch('/api/blocks/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, allow_type: 'exact', enabled: true }),
    })
    setLoading(false)
    onClose()
  }

  const askAi = async () => {
    setAskingAi(true)
    try {
      const res = await fetch(`/api/ai/explain?domain=${encodeURIComponent(domain)}`)
      const data = await res.json()
      if (res.ok) setAiExplanation(data.explanation)
      else setAiExplanation(`Error: ${data.error}`)
    } finally {
      setAskingAi(false)
    }
  }

  return (
    <div className="card animate-slide-in w-80 shrink-0 h-fit sticky top-20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">Query Inspector</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="mb-4">
        <p className="font-mono text-xs text-brand-400 break-all">{domain}</p>
        <p className="text-[10px] text-slate-600 mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
      </div>

      <div className="space-y-4">
        {/* Technical metadata */}
        <div className="bg-surface-100 rounded-lg p-3 space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className={STATUS_LABELS[entry.status]?.cls || 'badge-gray'}>{entry.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Resolved By</span>
            <span className="text-slate-300 font-medium flex items-center gap-1">
               {entry.resolved_by === 'Cache' ? <Database size={10} /> : <ArrowRight size={10} />}
               {entry.resolved_by || '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">DNSSEC</span>
            <span className={`font-bold flex items-center gap-1 ${entry.dnssec_status === 'SECURE' ? 'text-green-500' : 'text-slate-400'}`}>
               {entry.dnssec_status === 'SECURE' ? <Lock size={10} /> : <Unlock size={10} />}
               {entry.dnssec_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">TTL</span>
            <span className="text-slate-300">{entry.ttl}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Response Time</span>
            <span className="text-slate-300">{entry.response_time_ms.toFixed(2)} ms</span>
          </div>
          {entry.resolved_ip && (
            <div className="flex justify-between border-t border-slate-700/50 pt-1 mt-1">
              <span className="text-slate-500">Answer</span>
              <span className="text-slate-300 font-mono truncate ml-4" title={entry.resolved_ip}>{entry.resolved_ip}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={blockDomain} disabled={loading} className="btn-danger flex-1 justify-center text-xs py-1.5">
              <Shield size={12} /> Block
            </button>
            <button onClick={allowDomain} disabled={loading} className="btn-success flex-1 justify-center text-xs py-1.5">
              <CheckCircle size={12} /> Allow
            </button>
          </div>
          <a 
            href={`/domains/detail?domain=${domain}`}
            className="btn-ghost justify-center text-xs py-1.5 border border-slate-700/50 hover:border-brand-500/50 hover:bg-brand-500/5 text-brand-400"
          >
            <Activity size={12} /> View Full Analytics
          </a>
        </div>

        {/* AI Analysis section */}
        <div className="pt-2">
          {!aiExplanation ? (
            <button 
              onClick={askAi} 
              disabled={askingAi} 
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={14} className={askingAi ? 'animate-pulse' : ''} />
              {askingAi ? 'Analyzing...' : 'Ask AI Analysis'}
            </button>
          ) : (
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs leading-relaxed text-slate-300">
              <div className="flex items-center gap-2 font-bold text-purple-400 mb-2">
                <Sparkles size={12} /> AI Insight
              </div>
              {aiExplanation}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
QueryInspector.propTypes = { entry: PropTypes.object, onClose: PropTypes.func }

export default function QueryLog({ user, initialQueries = [] }) {
  const [entries, setEntries] = useState(initialQueries)
  const [paused, setPaused] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [filters, setFilters] = useState({ status: '', client: '', domain: '' })
  const [acting, setActing] = useState(null) // { domain, type }
  const wsRef = useRef(null)
  const pausedRef = useRef(false)

  const quickBlock = async (domain) => {
    setActing({ domain, type: 'block' })
    await fetch('/api/blocks/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, block_type: 'exact', layer: 'proxy', enabled: true }),
    })
    setActing(null)
  }

  const quickAllow = async (domain) => {
    setActing({ domain, type: 'allow' })
    await fetch('/api/blocks/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, allow_type: 'exact', enabled: true }),
    })
    setActing(null)
  }

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${location.host}/ws/queries`)
      wsRef.current = ws
      ws.onmessage = (event) => {
        if (pausedRef.current) return
        const data = JSON.parse(event.data)
        setEntries(prev => [data, ...prev].slice(0, 1000))
      }
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  const filtered = entries.filter(e => {
    if (filters.status && e.status !== filters.status) return false
    if (filters.client && !e.client_ip?.includes(filters.client)) return false
    if (filters.domain && !e.domain?.includes(filters.domain)) return false
    return true
  })

  const seedData = async () => {
    if (!confirm('Seed 50 test queries?')) return
    setActing({ domain: 'Seeding...', type: 'seed' })
    const res = await fetch('/api/system/seed-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ count: 50 })
    })
    setActing(null)
    if (res.ok) window.location.reload()
  }

  const clearLogs = async () => {
    if (!confirm('Permanently clear ALL query logs?')) return
    setActing({ domain: 'Clearing...', type: 'clear' })
    const res = await fetch('/api/system/clear-queries', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    setActing(null)
    if (res.ok) setEntries([])
  }

  const exportCsv = () => {
    window.open('/api/queries/export', '_blank')
  }

  return (
    <Layout user={user} currentPath="/queries" title="Query Log">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="text-xl font-bold text-white">Query Log</h2>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <input className="input w-40 text-xs py-1.5" placeholder="Filter domain…"
            value={filters.domain} onChange={e => setFilters(f => ({...f, domain: e.target.value}))} />
          <input className="input w-32 text-xs py-1.5" placeholder="Client IP…"
            value={filters.client} onChange={e => setFilters(f => ({...f, client: e.target.value}))} />
          <select className="input w-36 text-xs py-1.5" value={filters.status}
            onChange={e => setFilters(f => ({...f, status: e.target.value}))}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, {label}]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button onClick={() => setPaused(p => !p)} className={paused ? 'btn-success' : 'btn-ghost'}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          
          <div className="h-4 w-px bg-slate-700 mx-2" />

          <button onClick={seedData} className="btn-ghost text-brand-400">
            <Activity size={14} /> Seed
          </button>
          <button onClick={clearLogs} className="btn-ghost text-red-400">
            <Trash size={14} /> Clear
          </button>

          <button onClick={exportCsv} className="btn-ghost">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 card overflow-hidden p-0">
          <div className="overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-50 border-b border-slate-700">
                <tr className="text-slate-400 font-medium">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">Domain</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Client</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Answered By / Rule</th>
                  <th className="text-right px-4 py-3">ms</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const s = STATUS_LABELS[e.status] || { label: e.status, cls: 'badge-gray' }
                  const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'
                  return (
                    <tr key={i} className="table-row-hover border-b border-slate-800/50"
                        onClick={() => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}>
                      <td className="px-4 py-2 text-slate-500 font-mono whitespace-nowrap">{ts}</td>
                      <td className="px-4 py-2 font-mono text-slate-200 max-w-xs truncate flex items-center gap-1.5">
                        {e.dnssec_status === 'SECURE' && <Lock size={12} className="text-green-500" title="DNSSEC: Secure" />}
                        {e.dnssec_status === 'INSECURE' && <Unlock size={12} className="text-yellow-500" title="DNSSEC: Insecure (not validated)" />}
                        {e.domain}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{e.query_type}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{e.client_ip}</td>
                      <td className="px-4 py-2 flex items-center gap-1.5">
                        <span className={s.cls}>{s.label}</span>
                        {e.resolved_by === 'Cache' && <Database size={12} className="text-brand-400" title="Served from Cache" />}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 text-slate-500 italic">
                          {(() => {
                            const Icon = RESOLUTION_ICONS[e.resolved_by] || ArrowRight
                            const text = e.status.startsWith('blocked') ? (e.matched_rule || 'Blocklist') : (e.resolved_by || '—')
                            return (
                              <>
                                <Icon size={12} className="shrink-0" />
                                <span className="truncate max-w-[150px]" title={text}>{text}</span>
                              </>
                            )
                          })()}
                        </div>
                      </td>
                                            <td className="px-4 py-2 text-right text-slate-500">
                        {e.response_time_ms != null ? e.response_time_ms.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={(ev) => { ev.stopPropagation(); quickBlock(e.domain); }}
                            className="p-1 hover:text-red-400 text-slate-600 transition-colors"
                            title="Quick Block"
                          >
                            <Shield size={14} className={acting?.domain === e.domain && acting?.type === 'block' ? 'animate-spin' : ''} />
                          </button>
                          <button 
                            onClick={(ev) => { ev.stopPropagation(); quickAllow(e.domain); }}
                            className="p-1 hover:text-green-400 text-slate-600 transition-colors"
                            title="Quick Allow"
                          >
                            <CheckCircle size={14} className={acting?.domain === e.domain && acting?.type === 'allow' ? 'animate-spin' : ''} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="text-center py-12 text-slate-600">
                {paused ? 'Feed paused. Resume to see new queries.' : 'Waiting for DNS queries…'}
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        {selectedEntry && (
          <QueryInspector 
            entry={selectedEntry} 
            onClose={() => setSelectedEntry(null)} 
          />
        )}
      </div>
    </Layout>
  )
}

QueryLog.propTypes = {
  user: PropTypes.object,
  initialQueries: PropTypes.array,
}
