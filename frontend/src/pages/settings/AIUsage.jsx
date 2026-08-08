import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { useAlert } from '../../components/Toast'
import {
  Sparkles, Download, Trash2, Search, X, RefreshCw
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function DetailPanel({ log, onClose }) {
  if (!log) return null
  return (
    <div className="card w-full lg:w-[420px] shrink-0 h-fit sticky top-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">AI Call Detail</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
      </div>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <Meta label="Status" value={log.status || 'ok'} badge={log.status === 'error' ? 'red' : 'green'} />
          <Meta label="Feature" value={log.feature} />
          <Meta label="Provider" value={log.provider || '—'} />
          <Meta label="Model" value={log.model || '—'} />
          <Meta label="User" value={log.username || 'System'} />
          <Meta label="Query" value={log.query || '—'} />
          <Meta label="Tokens in" value={String(log.tokens_input || 0)} />
          <Meta label="Tokens out" value={String(log.tokens_output || 0)} />
          <Meta label="Tokens total" value={String(log.tokens_estimate || 0)} />
          <Meta label="When" value={log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'} />
        </div>
        {log.error_message && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Error</p>
            <pre className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300 whitespace-pre-wrap break-words max-h-40 overflow-auto">
              {log.error_message}
            </pre>
          </div>
        )}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prompt sent</p>
          <pre className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-slate-300 whitespace-pre-wrap break-words max-h-56 overflow-auto">
            {log.prompt || '—'}
          </pre>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Response received</p>
          <pre className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-slate-300 whitespace-pre-wrap break-words max-h-56 overflow-auto">
            {log.response || '—'}
          </pre>
        </div>
      </div>
    </div>
  )
}
DetailPanel.propTypes = { log: PropTypes.object, onClose: PropTypes.func }

function Meta({ label, value, badge }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
      <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      {badge ? (
        <span className={badge === 'red' ? 'badge-red' : 'badge-green'}>{value}</span>
      ) : (
        <p className="text-slate-200 font-mono truncate" title={value}>{value}</p>
      )}
    </div>
  )
}
Meta.propTypes = { label: PropTypes.string, value: PropTypes.string, badge: PropTypes.string }

export default function AIUsage({ user, logs: initial = [] }) {
  const { alert, confirm } = useAlert()
  const [logs, setLogs] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)

  const load = async (q = search, st = status) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (st) params.set('status', st)
      const res = await fetch(`/api/ai/usage?${params}`)
      const data = await res.json()
      setLogs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status])

  const clearAll = async () => {
    if (!(await confirm('Clear ALL AI usage logs?'))) return
    await fetch('/api/ai/usage', { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setLogs([])
    setSelected(null)
  }

  return (
    <Layout user={user} currentPath="/settings/ai-usage" title="AI Usage Logs">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-purple-400" size={22} /> AI Usage Logs
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Every AI call — provider, model, tokens, prompt sent, and response received.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => load()} className="btn-ghost text-xs" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => window.open('/api/ai/usage/export', '_blank')} className="btn-ghost text-xs text-brand-400">
            <Download size={14} /> CSV
          </button>
          <button onClick={clearAll} className="btn-ghost text-xs text-red-400">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9 text-xs py-1.5 w-full"
            placeholder="Search query, prompt, model…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-36 text-xs py-1.5" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ok">OK</option>
          <option value="error">Error</option>
        </select>
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-1 card p-0 overflow-hidden min-w-0">
          <div className="overflow-auto max-h-[calc(100vh-240px)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-50 border-b border-slate-700 z-10">
                <tr className="text-slate-400 font-medium">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">Feature</th>
                  <th className="text-left px-4 py-3">Provider / Model</th>
                  <th className="text-left px-4 py-3">Query</th>
                  <th className="text-right px-4 py-3">Tokens</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-800/50 hover:bg-purple-500/5 cursor-pointer ${
                      selected?.id === log.id ? 'bg-purple-500/10' : ''
                    }`}
                    onClick={() => setSelected(selected?.id === log.id ? null : log)}
                  >
                    <td className="px-4 py-2.5 text-slate-500 font-mono whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-bold uppercase">
                        {(log.feature || 'unknown').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-200">{log.provider || '—'}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{log.model || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono truncate max-w-[200px]" title={log.query}>
                      {log.query || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300 font-mono">
                      {(log.tokens_estimate || (log.tokens_input || 0) + (log.tokens_output || 0)).toLocaleString()}
                      <div className="text-[10px] text-slate-600">
                        {log.tokens_input || 0}→{log.tokens_output || 0}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={log.status === 'error' ? 'badge-red' : 'badge-green'}>
                        {log.status || 'ok'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!logs.length && !loading && (
                  <tr>
                    <td colSpan="6" className="py-16 text-center text-slate-600">
                      No AI usage logged yet. Calls appear here after AI features run.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan="6" className="py-16 text-center text-purple-400 animate-pulse">Loading…</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected && <DetailPanel log={selected} onClose={() => setSelected(null)} />}
      </div>
    </Layout>
  )
}

AIUsage.propTypes = {
  user: PropTypes.object,
  logs: PropTypes.array,
}
