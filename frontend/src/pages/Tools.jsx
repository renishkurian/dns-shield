import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Search, Shield, CheckCircle, XCircle, List, Zap, AlertTriangle, Plus, Check } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const ACTION_COLORS = {
  blocked: 'text-red-400 bg-red-500/10 border-red-500/20',
  allowed: 'text-green-400 bg-green-500/10 border-green-500/20',
}
const TYPE_ICONS = {
  blocklist: XCircle,
  gravity:   XCircle,
  pattern:   Zap,
  allowlist: CheckCircle,
}

export default function Tools({ user }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actioned, setActioned] = useState({})

  const search = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setResults(null)
    try {
      const res = await fetch(`/api/tools/search?q=${encodeURIComponent(query.trim())}`)
      setResults(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const quickAction = async (domain, type) => {
    const url = type === 'block' ? '/api/blocks/domains' : '/api/blocks/allowlist'
    const body = type === 'block'
      ? { domain, block_type: 'exact', enabled: true }
      : { domain, allow_type: 'exact', enabled: true }
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(body),
    })
    setActioned(prev => ({ ...prev, [domain + type]: true }))
  }

  return (
    <Layout user={user} currentPath="/tools" title="DNS Tools">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-1">Domain Search</h2>
          <p className="text-sm text-slate-500">Check if a domain is blocked, allowed, or in a gravity list — instantly.</p>
        </div>

        {/* Search Box */}
        <form onSubmit={search} className="card mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. doubleclick.net, ads.google.com …"
                className="input pl-9 w-full"
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary px-6" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        {/* Results */}
        {results && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">
                Results for <span className="font-mono text-brand-400">"{results.query}"</span>
              </h3>
              <span className="text-xs text-slate-500">{results.total} matches</span>
            </div>

            {results.total === 0 ? (
              <div className="text-center py-10">
                <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
                <p className="text-green-400 font-semibold">No rules found</p>
                <p className="text-slate-500 text-sm mt-1">This domain is not in any blocklist or allowlist.</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={() => quickAction(results.query, 'block')} className="btn-secondary text-red-400 border-red-500/20 hover:bg-red-500/10">
                    <XCircle size={14} /> Block it
                  </button>
                  <button onClick={() => quickAction(results.query, 'allow')} className="btn-secondary text-green-400 border-green-500/20 hover:bg-green-500/10">
                    <CheckCircle size={14} /> Allow it
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {results.results.map((r, i) => {
                  const Icon = TYPE_ICONS[r.type] || AlertTriangle
                  return (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${ACTION_COLORS[r.action]}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon size={16} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-white truncate">{r.domain}</p>
                          <p className="text-xs opacity-70">{r.source} · {r.match}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${r.action === 'blocked' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                          {r.action}
                        </span>
                        {r.action === 'blocked' && (
                          <button
                            onClick={() => quickAction(r.domain, 'allow')}
                            disabled={actioned[r.domain + 'allow']}
                            className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 disabled:opacity-50"
                          >
                            {actioned[r.domain + 'allow'] ? <><Check size={11} /> Added</> : <><Plus size={11} /> Allow</>}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

Tools.propTypes = { user: PropTypes.object }
