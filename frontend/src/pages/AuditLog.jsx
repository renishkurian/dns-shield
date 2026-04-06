import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { ClipboardList, XCircle, CheckCircle, RefreshCw, AlertTriangle, Plus } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function AuditLog({ user }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioned, setActioned] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tools/audit-log')
      if (res.ok) setEntries(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const act = async (domain, type) => {
    const url = type === 'block' ? '/api/blocks/domains' : '/api/blocks/allowlist'
    const body = type === 'block'
      ? { domain, block_type: 'exact', enabled: true }
      : { domain, allow_type: 'exact', enabled: true }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setActioned(prev => ({ ...prev, [domain]: type }))
    }
  }

  return (
    <Layout user={user} currentPath="/audit" title="Audit Log">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ClipboardList size={20} className="text-yellow-400" />
            Audit Log
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Recently blocked domains with no explicit rule — review and take action.
          </p>
        </div>
        <button onClick={load} className="btn-ghost" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center py-16">
            <RefreshCw size={24} className="animate-spin text-brand-400 mx-auto mb-3" />
            <p className="text-slate-500">Analysing blocked traffic…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
            <p className="text-white font-semibold">All clear!</p>
            <p className="text-slate-500 text-sm mt-1">No unreviewed blocked domains in the last 72 hours.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertTriangle size={15} className="text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-300">
                These domains were blocked but have <strong>no explicit user rule</strong>. Review and allow or block permanently.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
                    <th className="text-left py-3 pr-4">Domain</th>
                    <th className="text-left py-3 pr-4">Source</th>
                    <th className="text-right py-3 pr-4">Hits (72h)</th>
                    <th className="text-right py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {entries.map((entry, i) => {
                    const done = actioned[entry.domain]
                    return (
                      <tr key={i} className={`transition-colors ${done ? 'opacity-40' : 'hover:bg-slate-800/30'}`}>
                        <td className="py-3 pr-4">
                          <span className="font-mono text-slate-200">{entry.domain}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-xs text-slate-500">{entry.source}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="text-slate-400 font-mono">{entry.count}</span>
                        </td>
                        <td className="py-3 text-right">
                          {done ? (
                            <span className={`text-xs font-semibold ${done === 'allow' ? 'text-green-400' : 'text-red-400'}`}>
                              {done === 'allow' ? '✓ Allowed' : '✓ Blocked'}
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => act(entry.domain, 'allow')}
                                className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 px-2 py-1 rounded border border-green-500/20 hover:bg-green-500/10 transition-colors"
                              >
                                <CheckCircle size={12} /> Allow
                              </button>
                              <button
                                onClick={() => act(entry.domain, 'block')}
                                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors"
                              >
                                <XCircle size={12} /> Block
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

AuditLog.propTypes = { user: PropTypes.object }
