import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Plus, Trash2 } from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Allowlist({ user, allowlist: initial = [] }) {
  const { alert, confirm } = useAlert()
  const [items, setItems] = useState(initial)
  const [form, setForm] = useState({ domain: '', allow_type: 'exact', comment: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [err, setErr] = useState('')
  const isAdmin = user?.role === 'admin'

  const save = async () => {
    setErr('')
    const payload = { ...form, domain: form.domain.trim().toLowerCase() }
    if (!payload.domain) { setErr('Domain is required.'); return }
    const res = await fetch('/api/blocks/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data.domain?.[0] || data.allow_type?.[0] || data.detail || JSON.stringify(data)
      setErr(msg)
      return
    }
    setItems(i => [data, ...i])
    setShowAdd(false)
    setForm({ domain: '', allow_type: 'exact', comment: '' })
  }

  const remove = async (id) => {
    if (!(await confirm('Remove from allowlist?'))) return
    await fetch(`/api/blocks/allowlist/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setItems(i => i.filter(x => x.id !== id))
  }

  const filtered = items.filter(i => !search || i.domain.includes(search))

  return (
    <Layout user={user} currentPath="/blocks/allowlist" title="Allowlist">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Allowlist</h2>
          <p className="text-sm text-slate-500">Domains that always pass through regardless of block rules</p>
        </div>
        <div className="ml-auto flex gap-2">
          <input className="input w-48 text-xs py-1.5" placeholder="Search…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {isAdmin && <button onClick={() => setShowAdd(s => !s)} className="btn-primary"><Plus size={14} /> Add</button>}
        </div>
      </div>

      {showAdd && isAdmin && (
        <div className="card mb-4 animate-fade-in">
          <h3 className="font-semibold text-white text-sm mb-3">Add to Allowlist</h3>
          {err && <div className="text-red-400 text-xs mb-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Domain</label>
              <input className="input text-xs" placeholder="good.example.com"
                value={form.domain} onChange={e => { setErr(''); setForm(f => ({...f, domain: e.target.value})) }} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input text-xs" value={form.allow_type}
                onChange={e => setForm(f => ({...f, allow_type: e.target.value}))}>
                <option value="exact">Exact</option>
                <option value="wildcard">Wildcard</option>
                <option value="regex">Regex</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Comment</label>
            <input className="input text-xs" value={form.comment}
              onChange={e => setForm(f => ({...f, comment: e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-xs">Save</button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-slate-400 text-xs font-medium">
              <th className="text-left px-4 py-3">Domain</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Comment</th>
              {isAdmin && <th className="px-4 py-3 text-right w-16">Del</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                <td className="px-4 py-2.5 font-mono text-xs text-green-400">{item.domain}</td>
                <td className="px-4 py-2.5"><span className="badge-green">{item.allow_type}</span></td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{item.comment}</td>
                {isAdmin && <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(item.id)} className="text-slate-600 hover:text-red-400 p-1">
                    <Trash2 size={13} />
                  </button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="text-center py-12 text-slate-600">No allowlist entries</div>}
      </div>
    </Layout>
  )
}

Allowlist.propTypes = { user: PropTypes.object, allowlist: PropTypes.array }
