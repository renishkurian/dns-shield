import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import {
  EyeOff, Plus, Trash2, CheckCircle, XCircle, Search,
  RefreshCw, AlertCircle, ShieldAlert, Sparkles, Filter,
  Layers, ArrowRight, Check, X, Database
} from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const COMMON_PRESETS = [
  { domain: 'api2.cursor.sh', rule_type: 'wildcard', comment: 'Cursor IDE telemetry & sync' },
  { domain: 'connectivitycheck.gstatic.com', rule_type: 'exact', comment: 'Android/Chrome captive portal probe' },
  { domain: 'in-addr.arpa', rule_type: 'wildcard', comment: 'Reverse DNS PTR lookups' },
  { domain: 'pool.ntp.org', rule_type: 'wildcard', comment: 'Network Time Protocol sync' },
  { domain: 'detectportal.firefox.com', rule_type: 'exact', comment: 'Firefox captive portal check' },
]

export default function LogExclusions({ user, exclusions: initialExclusions = [] }) {
  const { alert, confirm } = useAlert()
  const [exclusions, setExclusions] = useState(initialExclusions)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // New exclusion form state
  const [domain, setDomain] = useState('')
  const [ruleType, setRuleType] = useState('exact')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Live tester state
  const [testDomain, setTestDomain] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  // Purge state
  const [purging, setPurging] = useState(false)

  const isAdmin = user?.role === 'admin'

  const fetchExclusions = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/log-exclusions')
      if (res.ok) {
        const data = await res.json()
        setExclusions(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    if (e) e.preventDefault()
    if (!domain.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/system/log-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          domain: domain.trim(),
          rule_type: ruleType,
          comment: comment.trim(),
          enabled: true,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDomain('')
        setComment('')
        setRuleType('exact')
        await alert('Log exclusion added successfully', 'success')
        fetchExclusions()
      } else {
        const errMsg = Object.values(data).flat().join(' ') || 'Failed to add exclusion'
        await alert(errMsg, 'error')
      }
    } catch (err) {
      await alert(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleApplyPreset = async (preset) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/system/log-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          domain: preset.domain,
          rule_type: preset.rule_type,
          comment: preset.comment,
          enabled: true,
        }),
      })
      if (res.ok) {
        await alert(`Added preset: ${preset.domain}`, 'success')
        fetchExclusions()
      } else {
        const data = await res.json()
        const errMsg = Object.values(data).flat().join(' ') || 'Already exists or error'
        await alert(errMsg, 'warning')
      }
    } catch (err) {
      await alert(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      const res = await fetch(`/api/system/log-exclusions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ enabled: !item.enabled }),
      })
      if (res.ok) {
        setExclusions(prev => prev.map(ex => ex.id === item.id ? { ...ex, enabled: !item.enabled } : ex))
      }
    } catch {
      // ignore
    }
  }

  const handleDelete = async (item) => {
    const ok = await confirm(`Remove log exclusion for "${item.domain}"? Future queries for this domain will be recorded in QueryLog.`)
    if (!ok) return

    try {
      const res = await fetch(`/api/system/log-exclusions/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrf() },
      })
      if (res.ok) {
        setExclusions(prev => prev.filter(ex => ex.id !== item.id))
        await alert('Exclusion deleted', 'success')
      }
    } catch (err) {
      await alert(err.message, 'error')
    }
  }

  const handleTestMatch = async (e) => {
    if (e) e.preventDefault()
    if (!testDomain.trim()) return

    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/system/log-exclusions/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ domain: testDomain.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult(data)
      } else {
        await alert(data.error || 'Test failed', 'error')
      }
    } catch (err) {
      await alert(err.message, 'error')
    } finally {
      setTesting(false)
    }
  }

  const handlePurgeLogs = async () => {
    const ok = await confirm(
      'Purge existing query log entries that match your active exclusion rules? This will permanently delete older noisy logs from the database.'
    )
    if (!ok) return

    setPurging(true)
    try {
      const res = await fetch('/api/system/log-exclusions/purge', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrf() },
      })
      const data = await res.json()
      if (res.ok) {
        await alert(data.message || 'Cleaned up matching logs', 'success')
      } else {
        await alert(data.error || 'Purge failed', 'error')
      }
    } catch (err) {
      await alert(err.message, 'error')
    } finally {
      setPurging(false)
    }
  }

  const filtered = exclusions.filter(item => {
    if (!search) return true
    const s = search.toLowerCase()
    return item.domain.toLowerCase().includes(s) || (item.comment || '').toLowerCase().includes(s)
  })

  return (
    <Layout user={user} currentPath="/settings/log-exclusions" title="Log Exclusions">
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <EyeOff className="text-brand-400" size={24} />
              <h1 className="text-xl font-bold text-white tracking-tight">Query Log Exclusions</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Prevent high-frequency, noisy domains (such as IDE telemetry, local discovery, or heartbeat pings) from being written to QueryLog.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handlePurgeLogs}
                disabled={purging || exclusions.length === 0}
                className="btn-ghost text-xs text-amber-400 hover:text-amber-300 border-amber-500/30"
                title="Delete past QueryLog rows matching active exclusion rules"
              >
                <Database size={14} className={purging ? 'animate-spin' : ''} />
                {purging ? 'Purging...' : 'Purge Matching Past Logs'}
              </button>
            )}
            <button
              onClick={fetchExclusions}
              disabled={loading}
              className="btn-ghost text-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Informational Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950/30 border border-slate-800 text-xs text-slate-300 flex items-start gap-3 shadow-lg">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 shrink-0 mt-0.5">
            <EyeOff size={18} />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">How Query Log Exclusions Work</p>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              DNS Shield continues to <strong>resolve and filter</strong> excluded domains according to your adlists and blocking rules. However, no log entry will be saved in SQLite or streamed into the live feed, keeping your Query Log clean and focused on real user activity.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} className="text-brand-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Quick Presets (Common Noise)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMMON_PRESETS.map((p, idx) => {
              const alreadyAdded = exclusions.some(e => e.domain.toLowerCase() === p.domain.toLowerCase())
              return (
                <button
                  key={idx}
                  onClick={() => !alreadyAdded && handleApplyPreset(p)}
                  disabled={alreadyAdded || submitting}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    alreadyAdded
                      ? 'bg-slate-800/40 text-slate-500 border-slate-800 cursor-default'
                      : 'bg-slate-800/80 hover:bg-brand-500/10 text-slate-300 hover:text-brand-400 border-slate-700/80 hover:border-brand-500/40 cursor-pointer shadow-sm'
                  }`}
                >
                  {alreadyAdded ? <Check size={12} className="text-emerald-400" /> : <Plus size={12} />}
                  <span className="font-mono text-[11px]">{p.domain}</span>
                  <span className="text-[10px] text-slate-500">({p.rule_type})</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Add Exclusion Form & Match Tester Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Form */}
          <div className="card lg:col-span-2">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Plus size={16} className="text-brand-400" /> Add Excluded Domain
            </h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Domain or Pattern</label>
                  <input
                    type="text"
                    className="input font-mono text-xs"
                    placeholder="e.g. api2.cursor.sh or *.local"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Enter the bare domain (e.g. <code>api2.cursor.sh</code>)
                  </p>
                </div>

                <div>
                  <label className="label">Rule Type</label>
                  <select
                    className="input text-xs"
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                  >
                    <option value="exact">Exact Match</option>
                    <option value="wildcard">Wildcard (Subdomains)</option>
                    <option value="regex">Regular Expression</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Note / Reason (Optional)</label>
                <input
                  type="text"
                  className="input text-xs"
                  placeholder="e.g. IDE background telemetry"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting || !domain.trim()}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow"
                >
                  <Plus size={14} />
                  {submitting ? 'Adding...' : 'Add Exclusion'}
                </button>
              </div>
            </form>
          </div>

          {/* Match Tester Card */}
          <div className="card flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Filter size={16} className="text-brand-400" /> Test Exclusion Rule
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                Check if a specific domain would be excluded or recorded in logs.
              </p>

              <form onSubmit={handleTestMatch} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input font-mono text-xs flex-1"
                    placeholder="e.g. api2.cursor.sh"
                    value={testDomain}
                    onChange={(e) => setTestDomain(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={testing || !testDomain.trim()}
                    className="btn-ghost text-xs px-3"
                  >
                    {testing ? <RefreshCw size={13} className="animate-spin" /> : 'Test'}
                  </button>
                </div>
              </form>

              {testResult && (
                <div className={`mt-3 p-3 rounded-xl border text-xs animate-in fade-in ${
                  testResult.is_excluded
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}>
                  <div className="flex items-center gap-2 font-semibold">
                    {testResult.is_excluded ? (
                      <>
                        <EyeOff size={15} className="text-amber-400" />
                        <span>Excluded from QueryLog</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={15} className="text-emerald-400" />
                        <span>Will be logged normally</span>
                      </>
                    )}
                  </div>
                  {testResult.matching_rule && (
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      Matched: {testResult.matching_rule.domain} ({testResult.matching_rule.rule_type})
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
              Total active exclusions: <strong className="text-white">{exclusions.filter(e => e.enabled).length}</strong>
            </div>
          </div>
        </div>

        {/* Exclusions Table */}
        <div className="card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-white">
              Configured Exclusions ({filtered.length})
            </h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
              <input
                type="text"
                className="input text-xs pl-9"
                placeholder="Search exclusions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/40 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Domain / Pattern</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Note / Comment</th>
                  <th className="py-3 px-4 font-semibold">Created</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 px-4 font-mono text-white font-medium">
                      {item.domain}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        item.rule_type === 'exact'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : item.rule_type === 'wildcard'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {item.rule_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggle(item)}
                        className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                          item.enabled
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        {item.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                      {item.comment || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete exclusion"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      {search ? 'No exclusions matching your search' : 'No query log exclusions added yet. Add one above or use a preset!'}
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

LogExclusions.propTypes = {
  user: PropTypes.object,
  exclusions: PropTypes.array,
}
