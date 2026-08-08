import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Plus, Trash2, ToggleLeft, ToggleRight, Zap } from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function BlocksPatterns({ user, patterns: initial = [] }) {
  const { alert, confirm } = useAlert()
  const [patterns, setPatterns] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [form, setForm] = useState({ name: '', pattern: '', pattern_type: 'keyword', comment: '' })
  const isAdmin = user?.role === 'admin'

  const PATTERN_EXAMPLES = {
    extension: '.js, .gif, .png — blocks domains ending with extension',
    keyword:   'ads, track, metric — blocks domains containing keyword',
    regex:     '^ads?\\d*\\. — blocks ad./ads./ads2. subdomains',
    path_keyword: 'analytics, pixel — blocks URL paths with keyword',
  }

  const save = async () => {
    const res = await fetch('/api/blocks/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const data = await res.json()
      setPatterns(p => [data, ...p])
      setShowAdd(false)
      setForm({ name: '', pattern: '', pattern_type: 'keyword', comment: '' })
    }
  }

  const toggle = async (id, enabled) => {
    await fetch(`/api/blocks/patterns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ enabled: !enabled }),
    })
    setPatterns(p => p.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  }

  const remove = async (id) => {
    if (!(await confirm('Delete pattern?'))) return
    await fetch(`/api/blocks/patterns/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setPatterns(p => p.filter(x => x.id !== id))
  }

  const testPattern = async () => {
    const res = await fetch('/api/blocks/patterns/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain: testInput }),
    })
    setTestResult(await res.json())
  }

  const TYPE_LABELS = {
    extension: 'Extension', keyword: 'Keyword', regex: 'Regex', path_keyword: 'Path',
  }
  const TYPE_COLORS = {
    extension: 'badge-blue', keyword: 'badge-yellow', regex: 'badge-gray', path_keyword: 'badge-green',
  }

  return (
    <Layout user={user} currentPath="/blocks/patterns" title="Block Rules — Patterns">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Pattern Block Rules</h2>
          <p className="text-sm text-slate-500">Block by file extension, keyword, or regex</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary ml-auto">
            <Plus size={14} /> Add Pattern
          </button>
        )}
      </div>

      {/* Live test */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-yellow-400" />
          <span className="text-sm font-semibold text-white">Live Pattern Tester</span>
        </div>
        <div className="flex gap-2">
          <input className="input flex-1 text-xs" placeholder="Type a domain to test…"
            value={testInput} onChange={e => { setTestInput(e.target.value); setTestResult(null) }}
            onKeyDown={e => e.key === 'Enter' && testPattern()} />
          <button onClick={testPattern} className="btn-primary text-xs">Test</button>
        </div>
        {testResult && (
          <div className={`mt-2 text-xs p-2 rounded ${testResult.matched ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
            {testResult.matched
              ? `✓ Matched pattern: "${testResult.name}" (id ${testResult.pattern_id})`
              : '✗ No match — domain would pass through'}
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && isAdmin && (
        <div className="card mb-4 animate-fade-in">
          <h3 className="font-semibold text-white mb-3 text-sm">New Pattern</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Name</label>
              <input className="input text-xs" placeholder="Ad scripts"
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input text-xs" value={form.pattern_type}
                onChange={e => setForm(f => ({...f, pattern_type: e.target.value}))}>
                <option value="extension">File Extension</option>
                <option value="keyword">Keyword</option>
                <option value="regex">Regex</option>
                <option value="path_keyword">Path Keyword</option>
              </select>
            </div>
          </div>
          <div className="mb-2">
            <label className="label">Pattern</label>
            <input className="input text-xs font-mono" placeholder={PATTERN_EXAMPLES[form.pattern_type]}
              value={form.pattern} onChange={e => setForm(f => ({...f, pattern: e.target.value}))} />
            <p className="text-xs text-slate-500 mt-1">{PATTERN_EXAMPLES[form.pattern_type]}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-xs">Save</button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-slate-400 text-xs font-medium">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Pattern</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Hits</th>
              {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {patterns.map(p => (
              <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                <td className="px-4 py-2.5 text-slate-200 text-xs">{p.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-brand-300">{p.pattern}</td>
                <td className="px-4 py-2.5"><span className={TYPE_COLORS[p.pattern_type] || 'badge-gray'}>{TYPE_LABELS[p.pattern_type]}</span></td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{p.hit_count || 0}</td>
                {isAdmin && <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => toggle(p.id, p.enabled)} className="p-1">
                      {p.enabled ? <ToggleRight size={18} className="text-brand-400" /> : <ToggleLeft size={18} className="text-slate-500" />}
                    </button>
                    <button onClick={() => remove(p.id)} className="p-1 text-slate-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!patterns.length && <div className="text-center py-12 text-slate-600">No patterns yet. Add a pattern to block extensions or keywords.</div>}
      </div>
    </Layout>
  )
}

BlocksPatterns.propTypes = { user: PropTypes.object, patterns: PropTypes.array }
