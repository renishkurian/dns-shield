import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Plus, Trash2, ToggleLeft, ToggleRight, TestTube2 } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function AddDomainModal({ onClose, onSave, user }) {
  const [form, setForm] = useState({ domain: '', block_type: 'exact', layer: 'proxy', comment: '' })
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    const res = await fetch('/api/blocks/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setErr(JSON.stringify(data)); return }
    onSave(data)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal p-6">
        <h3 className="font-bold text-white mb-4">Add Block Rule</h3>
        {err && <div className="text-red-400 text-xs mb-3">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="label">Domain</label>
            <input className="input" placeholder="ads.example.com (not https://…)"
              value={form.domain} onChange={e => setForm(f => ({...f, domain: e.target.value}))} />
            <p className="text-[11px] text-slate-500 mt-1">
              Bare hostname only. Paste a full URL and the host will be extracted automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.block_type}
                onChange={e => setForm(f => ({...f, block_type: e.target.value}))}>
                <option value="exact">Exact match</option>
                <option value="wildcard">Wildcard (domain + subdomains)</option>
                <option value="regex">Regex (advanced)</option>
              </select>
            </div>
            <div>
              <label className="label">Layer</label>
              <select className="input" value={form.layer}
                onChange={e => setForm(f => ({...f, layer: e.target.value}))}>
                <option value="proxy">DNS Proxy</option>
                <option value="unbound">Unbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Comment (optional)</label>
            <input className="input" placeholder="…"
              value={form.comment} onChange={e => setForm(f => ({...f, comment: e.target.value}))} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={save} className="btn-primary flex-1 justify-center">Save</button>
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancel</button>
        </div>
      </div>
    </div>
  )
}

AddDomainModal.propTypes = { onClose: PropTypes.func, onSave: PropTypes.func, user: PropTypes.object }

export default function BlocksDomains({ user, domains: initialDomains = [] }) {
  const [domains, setDomains] = useState(initialDomains)
  const [showAdd, setShowAdd] = useState(false)
  const [testDomain, setTestDomain] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const isAdmin = user?.role === 'admin'

  const toggle = async (id, enabled) => {
    await fetch(`/api/blocks/domains/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ enabled: !enabled }),
    })
    setDomains(d => d.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b))
  }

  const deleteDomain = async (id) => {
    if (!confirm('Delete this rule?')) return
    await fetch(`/api/blocks/domains/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setDomains(d => d.filter(b => b.id !== id))
  }

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} rules?`)) return
    for (const id of selected) {
      await fetch(`/api/blocks/domains/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    }
    setDomains(d => d.filter(b => !selected.has(b.id)))
    setSelected(new Set())
  }

  const testBlock = async () => {
    const res = await fetch('/api/blocks/domains/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ domain: testDomain }),
    })
    setTestResult(await res.json())
  }

  const filtered = domains.filter(d =>
    !search || d.domain.includes(search) || d.comment?.includes(search)
  )

  const TYPE_COLORS = { exact: 'badge-blue', wildcard: 'badge-yellow', regex: 'badge-gray' }

  return (
    <Layout user={user} currentPath="/blocks/domains" title="Block Rules — Domains">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Domain Block Rules</h2>
          <p className="text-sm text-slate-500">{domains.length} rules · {domains.filter(d=>d.enabled).length} active</p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <input className="input w-48 text-xs py-1.5" placeholder="Search domains…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="btn-danger">
              <Trash2 size={14} /> Delete {selected.size}
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus size={14} /> Add Rule
            </button>
          )}
        </div>
      </div>

      {/* Test tool */}
      {isAdmin && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <TestTube2 size={16} className="text-brand-400" />
            <span className="text-sm font-medium text-white">Test Domain</span>
            <input className="input flex-1 min-w-48 text-xs" placeholder="test.example.com"
              value={testDomain} onChange={e => setTestDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && testBlock()} />
            <button onClick={testBlock} className="btn-primary text-xs">Test</button>
            {testResult && (
              <div className="text-xs">
                <span className={testResult.result?.startsWith('blocked') ? 'text-red-400' : 'text-green-400'}>
                  {testResult.result}
                </span>
                {testResult.rule && <span className="text-slate-500 ml-2">via <code>{testResult.rule}</code></span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-slate-400 text-xs font-medium">
              {isAdmin && <th className="px-4 py-3 w-8">
                <input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(filtered.map(d=>d.id)) : new Set())} />
              </th>}
              <th className="text-left px-4 py-3">Domain</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Layer</th>
              <th className="text-left px-4 py-3">Hits</th>
              <th className="text-left px-4 py-3">Comment</th>
              {isAdmin && <th className="px-4 py-3 w-20 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                {isAdmin && <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(d.id)}
                    onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(d.id) : n.delete(d.id); return n })} />
                </td>}
                <td className="px-4 py-3 font-mono text-xs text-slate-200">{d.domain}</td>
                <td className="px-4 py-3"><span className={TYPE_COLORS[d.block_type] || 'badge-gray'}>{d.block_type}</span></td>
                <td className="px-4 py-3 text-slate-400 text-xs">{d.layer}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{d.hit_count || 0}</td>
                <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-32">{d.comment}</td>
                {isAdmin && <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => toggle(d.id, d.enabled)} className="text-slate-500 hover:text-white p-1">
                      {d.enabled ? <ToggleRight size={18} className="text-brand-400" /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => deleteDomain(d.id)} className="text-slate-500 hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="text-center py-12 text-slate-600">No block rules</div>}
      </div>

      {showAdd && <AddDomainModal onClose={() => setShowAdd(false)} onSave={d => setDomains(prev => [d, ...prev])} user={user} />}
    </Layout>
  )
}

BlocksDomains.propTypes = {
  user: PropTypes.object,
  domains: PropTypes.array,
}
