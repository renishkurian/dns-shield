import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import {
  Sparkles, CalendarRange, Loader2, ExternalLink, Filter, AlertTriangle,
  Ban, Check, ShieldBan, Trash2, History,
} from 'lucide-react'

function formatRangeLabel(fromIso, toIso) {
  const fmt = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return String(iso).slice(0, 10)
    }
  }
  return `${fmt(fromIso)} → ${fmt(toIso)}`
}

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const CATEGORY_STYLES = {
  movies: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  streaming: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25',
  news: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  adult: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  ads: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  shopping: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  social: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  gaming: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  tech: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  cdn: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  mail: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  education: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  finance: 'bg-lime-500/15 text-lime-300 border-lime-500/25',
  search: 'bg-brand-500/15 text-brand-300 border-brand-500/25',
  cloud: 'bg-stone-500/15 text-stone-300 border-stone-500/25',
  iot: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  other: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

function CategoryBadge({ name }) {
  const cls = CATEGORY_STYLES[name] || CATEGORY_STYLES.other
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {name}
    </span>
  )
}

CategoryBadge.propTypes = { name: PropTypes.string }

export default function AIReport({ user }) {
  const [from, setFrom] = useState(daysAgoISO(7))
  const [to, setTo] = useState(todayISO())
  const [clientIp, setClientIp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [filterCat, setFilterCat] = useState('all')
  const [blocked, setBlocked] = useState({}) // domain -> 'ok' | 'busy' | 'err'
  const [blockMsg, setBlockMsg] = useState('')
  const [saved, setSaved] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loadingSaved, setLoadingSaved] = useState(true)

  const refreshSaved = async () => {
    try {
      const res = await fetch('/api/ai/report/cache')
      const data = await res.json().catch(() => [])
      setSaved(Array.isArray(data) ? data : [])
    } catch {
      setSaved([])
    } finally {
      setLoadingSaved(false)
    }
  }

  useEffect(() => {
    refreshSaved()
  }, [])

  const showReport = (data, id = null) => {
    setReport(data)
    setSelectedId(id ?? data?.id ?? null)
    setFilterCat('all')
    setBlocked({})
    setBlockMsg('')
    setError('')
  }

  const loadSaved = async (id) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/report/cache/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to load saved report')
        return
      }
      showReport(data, id)
      if (data.from) setFrom(String(data.from).slice(0, 10))
      if (data.to) setTo(String(data.to).slice(0, 10))
      setClientIp(data.client_ip || '')
    } catch (err) {
      setError(err?.message || 'Failed to load saved report')
    } finally {
      setLoading(false)
    }
  }

  const clearSaved = async (id) => {
    if (!confirm('Remove this saved report from the cache?')) return
    const res = await fetch(`/api/ai/report/cache/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() },
    })
    if (!res.ok && res.status !== 204) {
      alert('Failed to clear report')
      return
    }
    setSaved(list => list.filter(r => r.id !== id))
    if (selectedId === id) {
      setReport(null)
      setSelectedId(null)
    }
  }

  const clearAllSaved = async () => {
    if (!saved.length) return
    if (!confirm(`Clear all ${saved.length} saved AI reports?`)) return
    const res = await fetch('/api/ai/report/cache', {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() },
    })
    if (!res.ok) {
      alert('Failed to clear reports')
      return
    }
    setSaved([])
    setReport(null)
    setSelectedId(null)
  }

  const runReport = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setError('')
    setReport(null)
    setSelectedId(null)
    setFilterCat('all')
    setBlocked({})
    setBlockMsg('')
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          from,
          to,
          ...(clientIp.trim() ? { client_ip: clientIp.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `Report failed (HTTP ${res.status})`)
        if (data.items) showReport(data)
        return
      }
      showReport(data)
      await refreshSaved()
    } catch (err) {
      setError(err?.message || 'Report failed')
    } finally {
      setLoading(false)
    }
  }

  const blockDomain = async (item) => {
    const domain = item?.domain
    if (!domain || blocked[domain] === 'ok' || blocked[domain] === 'busy') return
    setBlocked(prev => ({ ...prev, [domain]: 'busy' }))
    setBlockMsg('')
    try {
      const res = await fetch('/api/blocks/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          domain,
          block_type: 'wildcard',
          layer: 'proxy',
          enabled: true,
          comment: `AI Report: ${item.category || 'other'}${item.site_name ? ` — ${item.site_name}` : ''}`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Already blocked is still success for the user
        const detail = JSON.stringify(data)
        if (res.status === 400 && /unique|already|exists/i.test(detail)) {
          setBlocked(prev => ({ ...prev, [domain]: 'ok' }))
          setBlockMsg(`${domain} is already on the block list.`)
          return
        }
        setBlocked(prev => ({ ...prev, [domain]: 'err' }))
        setBlockMsg(data.domain?.[0] || data.error || `Failed to block ${domain}`)
        return
      }
      setBlocked(prev => ({ ...prev, [domain]: 'ok' }))
      setBlockMsg(`Blocked ${domain} — added to Domain Block Rules.`)
    } catch {
      setBlocked(prev => ({ ...prev, [domain]: 'err' }))
      setBlockMsg(`Failed to block ${domain}`)
    }
  }

  const blockVisible = async () => {
    const pending = filteredItems.filter(i => blocked[i.domain] !== 'ok')
    if (!pending.length) return
    if (!confirm(`Block ${pending.length} domain(s) shown in this list?\n\nThey will be added to Domain Block Rules as wildcard rules.`)) {
      return
    }
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await blockDomain(item)
    }
  }

  const applyPreset = (days) => {
    setFrom(daysAgoISO(days))
    setTo(todayISO())
  }

  const filteredItems = useMemo(() => {
    const items = report?.items || []
    if (filterCat === 'all') return items
    return items.filter(i => i.category === filterCat)
  }, [report, filterCat])

  return (
    <Layout user={user} currentPath="/ai-report" title="AI Report">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
            <Sparkles size={20} className="text-brand-400" />
            AI Report
          </h2>
          <p className="text-sm text-slate-500">
            Pick a date range, then classify unique DNS domains into browsing categories
            (movies, news, adult, ads, shopping, and more).
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 mb-6">
          <form onSubmit={runReport} className="card">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="input"
                  value={from}
                  max={todayISO()}
                  onChange={e => {
                    const next = e.target.value
                    const today = todayISO()
                    const capped = next > today ? today : next
                    setFrom(capped)
                    if (to && capped > to) setTo(capped)
                  }}
                  required
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="input"
                  value={to}
                  min={from || undefined}
                  max={todayISO()}
                  onChange={e => {
                    const next = e.target.value
                    const today = todayISO()
                    let capped = next > today ? today : next
                    if (from && capped < from) capped = from
                    setTo(capped)
                  }}
                  required
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="label">Client IP (optional)</label>
                <input
                  className="input w-full"
                  placeholder="e.g. 192.168.0.121"
                  value={clientIp}
                  onChange={e => setClientIp(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary px-5" disabled={loading || !from || !to}>
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <CalendarRange size={14} />
                    Report
                  </>
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                [1, 'Last 24h'],
                [7, 'Last 7 days'],
                [30, 'Last 30 days'],
              ].map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => applyPreset(days)}
                  className="btn-ghost text-xs px-3 py-1.5"
                >
                  {label}
                </button>
              ))}
            </div>
            {loading && (
              <p className="text-xs text-slate-500 mt-4">
                Collecting unique DNS names and sending them to AI — this can take a minute.
              </p>
            )}
          </form>

          <div className="card p-0 overflow-hidden flex flex-col min-h-[220px]">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History size={14} className="text-brand-400" />
                Saved reports
              </h3>
              {saved.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllSaved}
                  className="text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto max-h-72">
              {loadingSaved ? (
                <div className="p-4 text-xs text-slate-500">Loading…</div>
              ) : !saved.length ? (
                <div className="p-4 text-xs text-slate-600 leading-relaxed">
                  Generated reports are cached here for quick reopen.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800/80">
                  {saved.map(r => (
                    <li key={r.id}>
                      <div
                        className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          selectedId === r.id ? 'bg-brand-500/10' : 'hover:bg-slate-800/40'
                        }`}
                        onClick={() => loadSaved(r.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {formatRangeLabel(r.range_from, r.range_to)}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {r.domains_analyzed} domains
                            {r.client_ip ? ` · ${r.client_ip}` : ''}
                            {' · '}
                            {formatWhen(r.created_at)}
                          </div>
                          {(r.top_categories || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {r.top_categories.slice(0, 3).map(c => (
                                <span key={c.name} className="text-[9px] text-slate-400 uppercase tracking-wider">
                                  {c.name}
                                  {c.count != null ? ` ${c.count}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          title="Clear this report"
                          onClick={(e) => {
                            e.stopPropagation()
                            clearSaved(r.id)
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/5 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="space-y-6 animate-fade-in">
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold text-white">Summary</h3>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">{report.summary}</p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-1">
                  <div>
                    <span className="text-white font-bold">{report.domains_analyzed ?? 0}</span> analyzed
                    {report.domains_found != null && report.domains_found !== report.domains_analyzed && (
                      <span> of {report.domains_found} unique</span>
                    )}
                  </div>
                  {(report.cached || report.id) && (
                    <div className="text-brand-400/90">Saved report #{report.id || selectedId}</div>
                  )}
                  {report.truncated && (
                    <div className="text-amber-400/90">Top domains only (capped for AI)</div>
                  )}
                </div>
              </div>

              {(report.categories || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterCat('all')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      filterCat === 'all'
                        ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                        : 'border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Filter size={12} /> All
                  </button>
                  {report.categories.map(c => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setFilterCat(c.name)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                        filterCat === c.name
                          ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
                          : 'border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <CategoryBadge name={c.name} />
                      <span className="text-slate-500">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {(report.warnings || []).length > 0 && (
                <p className="text-xs text-amber-400/90 mt-3">
                  Partial result: {report.warnings.join('; ')}
                </p>
              )}
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">
                  Classified domains
                  <span className="text-slate-500 font-normal ml-2">{filteredItems.length}</span>
                </h3>
                <button
                  type="button"
                  onClick={blockVisible}
                  disabled={!filteredItems.some(i => blocked[i.domain] !== 'ok')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-red-300 border border-red-500/25 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ShieldBan size={13} />
                  Block visible
                </button>
              </div>
              {blockMsg && (
                <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-300 bg-slate-900/40">
                  {blockMsg}
                  {' '}
                  <a href="/blocks/domains" className="text-brand-400 hover:text-brand-300">Open Domain Block Rules</a>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700 text-slate-400 text-xs">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Site</th>
                      <th className="text-left px-4 py-3 font-medium">Domain</th>
                      <th className="text-left px-4 py-3 font-medium">URL</th>
                      <th className="text-left px-4 py-3 font-medium">Clients</th>
                      <th className="text-left px-4 py-3 font-medium">Category</th>
                      <th className="text-right px-4 py-3 font-medium">Hits</th>
                      <th className="text-right px-4 py-3 font-medium w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const state = blocked[item.domain]
                      const clients = Array.isArray(item.clients) ? item.clients : []
                      const clientTitle = clients
                        .map(c => `${c.name || c.ip}${c.hits != null ? ` (${c.hits})` : ''}`)
                        .join(', ')
                      return (
                        <tr key={item.domain} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                          <td className="px-4 py-3 text-white text-xs font-semibold">
                            {item.site_name || item.domain}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            <a href={`/domains/detail?domain=${encodeURIComponent(item.domain)}`} className="hover:text-brand-300">
                              {item.domain}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <a
                              href={item.url || `https://${item.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300 truncate max-w-[240px]"
                              title={item.url}
                            >
                              {(item.url || `https://${item.domain}`).replace(/^https?:\/\//, '')}
                              <ExternalLink size={11} className="shrink-0 opacity-70" />
                            </a>
                          </td>
                          <td className="px-4 py-3 max-w-[220px]" title={clientTitle || '—'}>
                            {clients.length ? (
                              <div className="flex flex-wrap gap-1">
                                {clients.map(c => (
                                  <span
                                    key={c.ip}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[10px] text-slate-300"
                                    title={`${c.ip} · ${c.hits ?? 0} hits`}
                                  >
                                    <span className="font-semibold text-slate-200 truncate max-w-[100px]">
                                      {c.name && c.name !== c.ip ? c.name : c.ip}
                                    </span>
                                    {c.name && c.name !== c.ip && (
                                      <span className="font-mono text-slate-500 truncate max-w-[90px]">{c.ip}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <CategoryBadge name={item.category || 'other'} />
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-400 font-mono">
                            {item.hits ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {state === 'ok' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                <Check size={12} /> Blocked
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => blockDomain(item)}
                                disabled={state === 'busy'}
                                title={`Block ${item.domain} and add to Domain Block Rules`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-red-300 border border-red-500/25 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                <Ban size={12} />
                                {state === 'busy' ? '…' : state === 'err' ? 'Retry' : 'Block'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!filteredItems.length && (
                  <div className="text-center py-12 text-slate-600 text-sm">No domains in this category</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

AIReport.propTypes = {
  user: PropTypes.object,
}
