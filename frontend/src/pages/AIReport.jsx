import React, { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import {
  Sparkles, CalendarRange, Loader2, ExternalLink, Filter, AlertTriangle,
} from 'lucide-react'

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

  const runReport = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setError('')
    setReport(null)
    setFilterCat('all')
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
        if (data.items) setReport(data)
        return
      }
      setReport(data)
    } catch (err) {
      setError(err?.message || 'Report failed')
    } finally {
      setLoading(false)
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

        <form onSubmit={runReport} className="card mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">From</label>
              <input
                type="date"
                className="input"
                value={from}
                onChange={e => setFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date"
                className="input"
                value={to}
                onChange={e => setTo(e.target.value)}
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
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Classified domains
                  <span className="text-slate-500 font-normal ml-2">{filteredItems.length}</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700 text-slate-400 text-xs">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Site</th>
                      <th className="text-left px-4 py-3 font-medium">Domain</th>
                      <th className="text-left px-4 py-3 font-medium">URL</th>
                      <th className="text-left px-4 py-3 font-medium">Category</th>
                      <th className="text-right px-4 py-3 font-medium">Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
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
                        <td className="px-4 py-3">
                          <CategoryBadge name={item.category || 'other'} />
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-400 font-mono">
                          {item.hits ?? 0}
                        </td>
                      </tr>
                    ))}
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
