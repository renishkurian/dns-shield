import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { ShieldCheck, Trash2, Search, RefreshCw } from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function scoreClass(score) {
  if (score >= 70) return 'text-emerald-400'
  if (score <= 30) return 'text-red-400'
  return 'text-amber-400'
}

function labelBadge(label) {
  if (label === 'safe') return 'badge-green'
  if (label === 'malicious') return 'badge-red'
  if (label === 'tracking') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase'
  return 'badge-gray'
}

export default function TrustedDNS({ user }) {
  const { alert, confirm } = useAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [label, setLabel] = useState('')
  const [highOnly, setHighOnly] = useState(false)

  const load = async (q = search, lb = label, high = highOnly) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (lb) params.set('label', lb)
      if (high) params.set('high_only', '1')
      const res = await fetch(`/api/ai/trusted-dns?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setRows([])
    }
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, label, highOnly])

  const removeOne = async (id, domain) => {
    if (!(await confirm(`Remove trust score for ${domain}?`))) return
    const res = await fetch(`/api/ai/trusted-dns/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() },
    })
    if (res.ok) setRows(prev => prev.filter(r => r.id !== id))
  }

  const clearAll = async () => {
    if (!(await confirm('Clear ALL AI trust scores? Next intelligence runs will re-evaluate every domain.'))) return
    const res = await fetch('/api/ai/trusted-dns', {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() },
    })
    if (res.ok) setRows([])
  }

  return (
    <Layout user={user} currentPath="/settings/trusted-dns" title="Trusted DNS">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="text-emerald-400" size={22} /> Trusted DNS (AI)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Domains scored by AI intelligence. High trust (≥70) is skipped on later scans.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => load()} className="btn-ghost text-xs" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={clearAll} className="btn-ghost text-xs text-red-400" disabled={!rows.length}>
              <Trash2 size={14} /> Clear all
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9 text-xs py-1.5 w-full"
              placeholder="Search domain, reason, source…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-40 text-xs py-1.5" value={label} onChange={e => setLabel(e.target.value)}>
            <option value="">All labels</option>
            <option value="safe">Safe</option>
            <option value="tracking">Tracking</option>
            <option value="malicious">Malicious</option>
            <option value="unknown">Unknown</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer px-2">
            <input
              type="checkbox"
              checked={highOnly}
              onChange={e => setHighOnly(e.target.checked)}
            />
            High trust only (≥70)
          </label>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-240px)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-800 z-10">
                <tr className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                  <th className="text-left px-5 py-3">DNS</th>
                  <th className="text-left px-5 py-3">Trust Score</th>
                  <th className="text-left px-5 py-3">Label</th>
                  <th className="text-left px-5 py-3">Source</th>
                  <th className="text-left px-5 py-3">Updated</th>
                  <th className="text-right px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-emerald-500/5 transition-colors">
                    <td className="px-5 py-3">
                      <a
                        href={`/domains/detail?domain=${encodeURIComponent(row.domain)}`}
                        className="font-mono text-slate-200 hover:text-brand-400"
                        title={row.reason || row.domain}
                      >
                        {row.domain}
                      </a>
                      {row.reason ? (
                        <p className="text-[10px] text-slate-600 truncate max-w-xs mt-0.5" title={row.reason}>
                          {row.reason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-bold font-mono text-sm ${scoreClass(row.trust_score)}`}>
                        {row.trust_score}
                      </span>
                      <span className="text-slate-600"> / 100</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={labelBadge(row.label)}>{row.label || 'unknown'}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-mono">
                      {(row.source || '—').replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeOne(row.id, row.domain)}
                        className="text-slate-500 hover:text-red-400 p-1.5"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan="6" className="py-20 text-center text-slate-600 italic">
                      {search || label || highOnly
                        ? 'No matching trusted DNS entries.'
                        : 'No AI trust scores yet. They appear after Ask AI / threat insight / auto intelligence runs.'}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan="6" className="py-20 text-center text-emerald-400 animate-pulse">
                      Loading trusted DNS…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}

TrustedDNS.propTypes = {
  user: PropTypes.object,
}
