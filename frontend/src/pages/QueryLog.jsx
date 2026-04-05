import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Pause, Play, Download, Filter, X, ChevronRight, Shield, CheckCircle, Sparkles } from 'lucide-react'

const STATUS_LABELS = {
  allowed:         { label: 'Allowed',        cls: 'badge-green' },
  blocked_pattern: { label: 'Pattern',        cls: 'badge-red' },
  blocked_domain:  { label: 'Domain',         cls: 'badge-red' },
  blocked_list:    { label: 'List',           cls: 'badge-yellow' },
  nxdomain:        { label: 'NXDOMAIN',       cls: 'badge-gray' },
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function QuickActionPanel({ domain, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [askingAi, setAskingAi] = useState(false)

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
      if (res.ok) {
        setAiExplanation(data.explanation)
      } else {
        setAiExplanation(`Error: ${data.error}`)
      }
    } finally {
      setAskingAi(false)
    }
  }

  return (
    <div className="card animate-slide-in w-80 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">Domain Inspector</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <p className="font-mono text-xs text-brand-400 break-all mb-4">{domain}</p>
      {result ? (
        <div className="mb-4 p-3 bg-surface-100 rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className={STATUS_LABELS[result.result]?.cls || 'text-slate-300'}>
              {result.result}
            </span>
          </div>
          {result.rule && (
            <div className="flex justify-between">
              <span className="text-slate-500">Rule</span>
              <span className="text-slate-300 font-mono">{result.rule}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 text-xs text-slate-500">Checking…</div>
      )}
      <div className="flex gap-2">
        <button onClick={blockDomain} disabled={loading} className="btn-danger flex-1 justify-center text-xs">
          <Shield size={12} /> Block
        </button>
        <button onClick={allowDomain} disabled={loading} className="btn-success flex-1 justify-center text-xs py-1.5">
          <CheckCircle size={12} /> Allow
        </button>
      </div>

      <div className="mt-4 border-t border-slate-700/50 pt-4">
        {!aiExplanation ? (
          <button 
            onClick={askAi} 
            disabled={askingAi} 
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
          >
            <Sparkles size={14} className={askingAi ? 'animate-pulse' : ''} />
            {askingAi ? 'Analyzing...' : 'Ask AI'}
          </button>
        ) : (
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs leading-relaxed text-slate-300">
            <div className="flex items-center gap-2 font-bold text-purple-400 mb-2">
              <Sparkles size={12} /> AI Analysis
            </div>
            {aiExplanation}
          </div>
        )}
      </div>
    </div>
  )
}

QuickActionPanel.propTypes = { domain: PropTypes.string, onClose: PropTypes.func }

export default function QueryLog({ user, initialQueries = [] }) {
  const [entries, setEntries] = useState(initialQueries)
  const [paused, setPaused] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState(null)
  const [filters, setFilters] = useState({ status: '', client: '', domain: '' })
  const wsRef = useRef(null)
  const pausedRef = useRef(false)

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
                  <th className="text-left px-4 py-3">Rule</th>
                  <th className="text-right px-4 py-3">ms</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const s = STATUS_LABELS[e.status] || { label: e.status, cls: 'badge-gray' }
                  const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'
                  return (
                    <tr key={i} className="table-row-hover border-b border-slate-800/50"
                        onClick={() => setSelectedDomain(e.domain === selectedDomain ? null : e.domain)}>
                      <td className="px-4 py-2 text-slate-500 font-mono whitespace-nowrap">{ts}</td>
                      <td className="px-4 py-2 font-mono text-slate-200 max-w-xs truncate">{e.domain}</td>
                      <td className="px-4 py-2 text-slate-500">{e.query_type}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{e.client_ip}</td>
                      <td className="px-4 py-2"><span className={s.cls}>{s.label}</span></td>
                      <td className="px-4 py-2 text-slate-500 font-mono max-w-[120px] truncate">{e.matched_rule}</td>
                      <td className="px-4 py-2 text-right text-slate-500">
                        {e.response_time_ms != null ? e.response_time_ms.toFixed(1) : '—'}
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
        {selectedDomain && (
          <QuickActionPanel domain={selectedDomain} onClose={() => setSelectedDomain(null)} />
        )}
      </div>
    </Layout>
  )
}

QueryLog.propTypes = {
  user: PropTypes.object,
  initialQueries: PropTypes.array,
}
