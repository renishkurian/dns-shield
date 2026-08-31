import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { useAlert } from '../components/Toast'
import {
  Play, Pause, Download, Shield, Activity, 
  CheckCircle, Search, Trash, 
  Lock, Unlock, Database, ArrowRight,
  X, Sparkles, ChevronLeft, ChevronRight, EyeOff,
  Layers, Zap, Radio, ShieldAlert, SlidersHorizontal
} from 'lucide-react'

const STATUS_LABELS = {
  allowed:         { label: 'Allowed',           cls: 'badge-green' },
  blocked_pattern: { label: 'Blocked (Pattern)', cls: 'badge-red' },
  blocked_domain:  { label: 'Blocked (Domain)',  cls: 'badge-red' },
  blocked_list:    { label: 'Blocked (List)',    cls: 'badge-red' },
  blocked_ai:      { label: 'Blocked (AI)',      cls: 'badge-red' },
  blocked_client:  { label: 'Blocked (Client)',  cls: 'badge-red' },
  nxdomain:        { label: 'NXDOMAIN',          cls: 'badge-gray' },
}

const BLOCKED_STATUSES = new Set([
  'blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client',
])

const RESOLUTION_ICONS = {
  'Cache': Database,
  'Blocked (Gravity)': Shield,
  'Blocked (Domain)': Shield,
  'Blocked (Pattern)': Shield,
  'Blocked (AI)': Sparkles,
  'Blocked (Client)': Shield,
  'Blocked (CNAME Uncloaking)': Layers,
  'Blocked (Canary)': Lock,
  'Blocked (Adblock)': Zap,
  'Blocked (DNS Rebinding)': ShieldAlert,
  'Blocked (Rate Limit)': Activity,
  'ECH Guard': Radio,
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function QueryInspector({ entry, onClose }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiTrust, setAiTrust] = useState(null)
  const [askingAi, setAskingAi] = useState(false)

  const { domain } = entry

  useEffect(() => {
    setResult(null)
    setAiExplanation(null)
    setAiTrust(null)
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

  const excludeFromLogs = async () => {
    setLoading(true)
    await fetch('/api/system/log-exclusions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, rule_type: 'exact', comment: 'Excluded from Query Inspector', enabled: true }),
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
        setAiTrust(data.trust || null)
      } else {
        setAiExplanation(`Error: ${data.error}`)
        setAiTrust(null)
      }
    } finally {
      setAskingAi(false)
    }
  }

  return (
    <div className="card animate-slide-in w-full md:w-80 shrink-0 h-fit sticky top-20">
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
            <span className="text-slate-300">{entry.response_time_ms?.toFixed(2)} ms</span>
          </div>
          {entry.resolved_ip && (
            <div className="flex justify-between border-t border-slate-700/50 pt-1 mt-1">
              <span className="text-slate-500">Answer</span>
              <span className="text-slate-300 font-mono truncate ml-4" title={entry.resolved_ip}>{entry.resolved_ip}</span>
            </div>
          )}
          {result && (
            <div className="flex justify-between border-t border-slate-700/50 pt-1 mt-1">
              <span className="text-slate-500">Live match</span>
              <span className="text-slate-300">{result.result}{result.rule ? ` (${result.rule})` : ''}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={blockDomain} disabled={loading} className="btn-danger flex-1 justify-center text-xs py-1.5">
              <Shield size={12} /> Block
            </button>
            <button onClick={allowDomain} disabled={loading} className="btn-success flex-1 justify-center text-xs py-1.5">
              <CheckCircle size={12} /> Allow
            </button>
          </div>
          <button 
            onClick={excludeFromLogs} 
            disabled={loading} 
            className="btn-ghost justify-center text-xs py-1.5 border border-slate-700/50 hover:border-amber-500/50 hover:bg-amber-500/5 text-amber-400"
            title="Exclude this domain from being recorded in future QueryLogs"
          >
            <EyeOff size={12} /> Exclude from QueryLog
          </button>
          <a 
            href={`/domains/detail?domain=${domain}`}
            className="btn-ghost justify-center text-xs py-1.5 border border-slate-700/50 hover:border-brand-500/50 hover:bg-brand-500/5 text-brand-400"
          >
            <Activity size={12} /> View Full Analytics
          </a>
        </div>

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
              <div className="flex items-center justify-between gap-2 font-bold text-purple-400 mb-2">
                <span className="flex items-center gap-2"><Sparkles size={12} /> AI Insight</span>
                {aiTrust && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Trust {aiTrust.trust_score}/100 · {aiTrust.label}
                  </span>
                )}
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

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || ''
  } catch {
    return ''
  }
}

export default function QueryLog({ user, initialQueries = [] }) {
  const { alert, confirm } = useAlert()
  const initialClient = getQueryParam('client')
  const initialDomain = getQueryParam('domain')
  const initialStatus = getQueryParam('status')
  const initialModule = getQueryParam('module')
  const [entries, setEntries] = useState(initialQueries)
  const [paused, setPaused] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [filters, setFilters] = useState({
    status: initialStatus,
    module: initialModule,
    client: initialClient,
    domain: initialDomain,
  })
  const [draft, setDraft] = useState({ client: initialClient, domain: initialDomain })
  const [acting, setActing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(initialQueries.length)
  const [totalPages, setTotalPages] = useState(1)
  const wsRef = useRef(null)
  const pausedRef = useRef(false)
  const filtersRef = useRef(filters)
  const pageRef = useRef(1)

  const quickBlock = async (domain) => {
    setActing({ domain, type: 'block' })
    const res = await fetch('/api/blocks/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, block_type: 'exact', layer: 'proxy', enabled: true }),
    })
    setActing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      await alert(data.domain ? data.domain[0] : 'Failed to block domain.', 'error')
    }
  }

  const quickAllow = async (domain) => {
    setActing({ domain, type: 'allow' })
    const res = await fetch('/api/blocks/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain, allow_type: 'exact', enabled: true }),
    })
    setActing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      await alert(data.domain ? data.domain[0] : 'Failed to allow domain.', 'error')
    }
  }

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { filtersRef.current = filters }, [filters])
  useEffect(() => { pageRef.current = page }, [page])

  const loadPage = async (nextPage = 1, nextFilters = filters) => {
    const params = new URLSearchParams()
    if (nextFilters.status) params.set('status', nextFilters.status)
    if (nextFilters.module) params.set('module', nextFilters.module)
    if (nextFilters.client) params.set('client', nextFilters.client)
    if (nextFilters.domain) params.set('domain', nextFilters.domain)
    params.set('page', String(nextPage))
    params.set('page_size', String(pageSize))
    setLoading(true)
    try {
      const res = await fetch(`/api/queries?${params.toString()}`)
      const data = await res.json()
      if (Array.isArray(data?.results)) {
        setEntries(data.results)
        setTotal(data.count || 0)
        setTotalPages(data.total_pages || 1)
        setPage(data.page || nextPage)
      } else if (Array.isArray(data)) {
        setEntries(data)
        setTotal(data.length)
        setTotalPages(1)
        setPage(1)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Debounce text filters → backend
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => {
        if (f.domain === draft.domain && f.client === draft.client) return f
        return { ...f, domain: draft.domain.trim(), client: draft.client.trim() }
      })
    }, 350)
    return () => clearTimeout(t)
  }, [draft.domain, draft.client])

  // Filters change → fetch from API
  useEffect(() => {
    loadPage(1, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.module, filters.client, filters.domain])

  useEffect(() => {
    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocol}://${location.host}/ws/queries`)
      wsRef.current = ws
      ws.onmessage = (event) => {
        if (pausedRef.current) return
        if (pageRef.current !== 1) return
        const data = JSON.parse(event.data)
        const f = filtersRef.current
        if (f.status === 'blocked') {
          if (!BLOCKED_STATUSES.has(data.status) && !data.status?.startsWith('blocked')) return
        } else if (f.status && data.status !== f.status) {
          return
        }
        if (f.module) {
          // Live WS filtering for module
          const rb = data.resolved_by || ''
          const mr = data.matched_rule || ''
          if (f.module === 'cname' && !rb.includes('CNAME') && !mr.startsWith('CNAME')) return
          if (f.module === 'canary' && !rb.includes('Canary') && !mr.startsWith('Canary')) return
          if (f.module === 'dga' && data.status !== 'blocked_ai' && !rb.includes('AI')) return
          if (f.module === 'adblock' && !rb.includes('Adblock') && !mr.startsWith('Adblock:')) return
          if (f.module === 'rebinding' && !rb.includes('DNS Rebinding') && !mr.includes('DNS Rebinding')) return
          if ((f.module === 'ech' || f.module === 'https_ech') && !rb.includes('ECH Guard')) return
          if (f.module === 'rate_limit' && !rb.includes('Rate Limit') && !mr.includes('Rate Limit')) return
        }
        if (f.client && !data.client_ip?.includes(f.client)) return
        if (f.domain && !data.domain?.includes(f.domain)) return
        setEntries(prev => [data, ...prev].slice(0, pageSize))
        setTotal(t => t + 1)
      }
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()
    return () => wsRef.current?.close()
  }, [pageSize])

  const goToPage = (p) => {
    const next = Math.min(Math.max(p, 1), totalPages)
    loadPage(next, filters)
  }

  const applySearch = () => {
    setFilters(f => ({
      ...f,
      domain: draft.domain.trim(),
      client: draft.client.trim(),
    }))
  }

  const clearLogs = async () => {
    if (!(await confirm('Permanently clear ALL query logs?'))) return
    setActing({ domain: 'Clearing...', type: 'clear' })
    const res = await fetch('/api/system/clear-queries', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    setActing(null)
    if (res.ok) {
      setEntries([])
      setTotal(0)
      setTotalPages(1)
      setPage(1)
    }
  }

  return (
    <Layout user={user} currentPath="/queries" title="Query Log">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-white">Query Log</h2>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <input
            className="input w-36 text-xs py-1.5"
            placeholder="Filter domain…"
            value={draft.domain}
            onChange={e => setDraft(d => ({ ...d, domain: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
          <input
            className="input w-28 text-xs py-1.5"
            placeholder="Client IP…"
            value={draft.client}
            onChange={e => setDraft(d => ({ ...d, client: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
          <select
            className="input w-36 text-xs py-1.5"
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="blocked">All blocked</option>
            {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button className="btn-ghost text-xs" disabled={loading} onClick={applySearch}>
            <Search size={14} /> {loading ? 'Searching…' : 'Search'}
          </button>
          <button onClick={() => setPaused(p => !p)} className={paused ? 'btn-success' : 'btn-ghost'}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Resume' : 'Pause'}
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

          <button onClick={clearLogs} className="btn-ghost text-red-400">
            <Trash size={14} /> Clear
          </button>
          <button onClick={() => window.open('/api/queries/export', '_blank')} className="btn-ghost">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* ─── MODULE QUICK-FILTER CHIPS ─────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none text-xs">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
          <SlidersHorizontal size={12} /> Modules:
        </span>
        {[
          { key: '', label: 'All Modules' },
          { key: 'cname', label: 'CNAME Uncloaked', icon: Layers, activeCls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
          { key: 'canary', label: 'DoH Canary', icon: Lock, activeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
          { key: 'dga', label: 'DGA / AI', icon: Sparkles, activeCls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
          { key: 'adblock', label: 'Adblock Engine', icon: Zap, activeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
          { key: 'rebinding', label: 'DNS Rebinding', icon: ShieldAlert, activeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
          { key: 'ech', label: 'ECH Guard', icon: Radio, activeCls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
          { key: 'rate_limit', label: 'Rate Limit', icon: Activity, activeCls: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
        ].map(chip => {
          const Icon = chip.icon
          const isSelected = (filters.module || '') === chip.key
          return (
            <button
              key={chip.key}
              onClick={() => setFilters(f => ({ ...f, module: chip.key }))}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 ${
                isSelected
                  ? chip.activeCls || 'bg-brand-500/20 text-brand-300 border-brand-500/40 font-semibold'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {Icon && <Icon size={12} />}
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Main content + inspector */}
      <div className="flex gap-4">
        <div
          className="flex-1 card overflow-hidden p-0 flex flex-col"
          style={{ maxHeight: 'calc(100vh - 180px)' }}
        >
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="sticky top-0 bg-surface-50 border-b border-slate-700 z-10">
                <tr className="text-slate-400 font-medium">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">Domain</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Client</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Answered By / Rule</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">ms</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const s = STATUS_LABELS[e.status] || { label: e.status, cls: 'badge-gray' }
                  const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'
                  return (
                    <tr
                      key={e.id || `${e.timestamp}-${e.domain}-${e.query_type}`}
                      className="table-row-hover border-b border-slate-800/50"
                      onClick={() => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}
                    >
                      <td className="px-4 py-2 text-slate-500 font-mono whitespace-nowrap">{ts}</td>
                      <td className="px-4 py-2 font-mono text-slate-200 max-w-[120px] md:max-w-xs truncate">
                        <span className="inline-flex items-center gap-1.5">
                          {e.dnssec_status === 'SECURE' && <Lock size={12} className="text-green-500" />}
                          {e.dnssec_status === 'INSECURE' && <Unlock size={12} className="text-yellow-500" />}
                          {e.domain}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500 hidden sm:table-cell">{e.query_type}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono hidden sm:table-cell">{e.client_ip}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={s.cls}>{s.label}</span>
                          {e.resolved_by === 'Cache' && <Database size={12} className="text-brand-400" />}
                        </span>
                      </td>
                      <td className="px-4 py-2 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-slate-500 italic">
                          {(() => {
                            const Icon = RESOLUTION_ICONS[e.resolved_by] || ArrowRight
                            const text = e.status?.startsWith('blocked') ? (e.matched_rule || 'Blocklist') : (e.resolved_by || '—')
                            return (
                              <>
                                <Icon size={12} className="shrink-0" />
                                <span className="truncate max-w-[150px]" title={text}>{text}</span>
                              </>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500 hidden md:table-cell">
                        {e.response_time_ms != null ? e.response_time_ms.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(ev) => { ev.stopPropagation(); quickBlock(e.domain) }}
                            className="p-1 hover:text-red-400 text-slate-600"
                            title="Quick Block"
                          >
                            <Shield size={14} className={acting?.domain === e.domain && acting?.type === 'block' ? 'animate-spin' : ''} />
                          </button>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); quickAllow(e.domain) }}
                            className="p-1 hover:text-green-400 text-slate-600"
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
            {!entries.length && (
              <div className="text-center py-12 text-slate-600">
                {loading
                  ? 'Loading…'
                  : paused
                    ? 'Feed paused. Resume to see new queries.'
                    : filters.status || filters.client || filters.domain
                      ? 'No queries match these filters.'
                      : 'Waiting for DNS queries…'}
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-700 bg-surface-50">
            <p className="text-[11px] text-slate-400">
              {loading ? 'Loading…' : (
                <>
                  <span className="text-white font-medium">{total.toLocaleString()}</span> total
                  {total > 0 && <> · page <span className="text-white font-medium">{page}</span> of {totalPages}</>}
                  {(filters.domain || filters.client || filters.status) && (
                    <span className="text-brand-400"> · filtered</span>
                  )}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-40"
                disabled={loading || page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                className="btn-ghost text-xs py-1.5 px-3 disabled:opacity-40"
                disabled={loading || page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop side inspector */}
        {selectedEntry && (
          <div className="hidden md:block">
            <QueryInspector
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile inspector overlay */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden" onClick={() => setSelectedEntry(null)}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            className="relative z-10 w-full max-h-[80vh] overflow-y-auto rounded-t-2xl"
            onClick={e => e.stopPropagation()}
          >
            <QueryInspector
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}

QueryLog.propTypes = {
  user: PropTypes.object,
  initialQueries: PropTypes.array,
}
