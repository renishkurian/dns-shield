import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Plus, Trash2, Edit2, Wifi } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Clients({ user, clients: initial = [] }) {
  const [clients, setClients] = useState(initial)
  const [form, setForm] = useState({ ip: '', name: '', group: '', comment: '' })
  const [showAdd, setShowAdd] = useState(false)
  const isAdmin = user?.role === 'admin'

  const save = async () => {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const data = await res.json()
      setClients(c => {
        const existing = c.findIndex(x => x.ip === data.ip)
        if (existing >= 0) {
          const updated = [...c]; updated[existing] = data; return updated
        }
        return [data, ...c]
      })
      setShowAdd(false)
      setForm({ ip: '', name: '', group: '', comment: '' })
    }
  }

  return (
    <Layout user={user} currentPath="/clients" title="Clients">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Clients</h2>
          <p className="text-sm text-slate-500">Named client identifiers for the query log</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(s => !s)} className="btn-primary ml-auto">
            <Plus size={14} /> Add Client
          </button>
        )}
      </div>

      {showAdd && (
        <div className="card mb-4 animate-fade-in">
          <h3 className="font-semibold text-white text-sm mb-3">Add / Update Client</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">IP Address</label>
              <input className="input text-xs font-mono" placeholder="192.168.1.42"
                value={form.ip} onChange={e => setForm(f => ({...f, ip: e.target.value}))} />
            </div>
            <div>
              <label className="label">Name</label>
              <input className="input text-xs" placeholder="My Phone"
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="label">Group</label>
              <input className="input text-xs" placeholder="Family"
                value={form.group} onChange={e => setForm(f => ({...f, group: e.target.value}))} />
            </div>
            <div>
              <label className="label">Comment</label>
              <input className="input text-xs" value={form.comment}
                onChange={e => setForm(f => ({...f, comment: e.target.value}))} />
            </div>
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
            <tr className="text-xs font-medium text-slate-400">
              <th className="text-left px-4 py-3">IP Address</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Group</th>
              <th className="text-left px-4 py-3">Comment</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr 
                key={c.id} 
                onClick={() => window.location.href = `/clients/${c.id}`}
                className="border-b border-slate-800/50 hover:bg-slate-700/20 cursor-pointer group transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-500 group-hover:text-brand-400 transition-colors shrink-0">
                      <Wifi size={14} />
                    </div>
                    <div>
                      <div className="font-mono text-xs text-brand-300 font-bold">{c.ip}</div>
                      {c.hostname && <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{c.hostname}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-white text-xs font-semibold">{c.nickname || c.name || '—'}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-tighter">{c.vendor || 'Unknown Device'}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={c.group ? 'badge-blue' : 'text-slate-600 text-[10px]'}>
                    {c.group_name || c.group || 'Default'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[10px] italic">{c.comment}</span>
                    <Link href={`/clients/${c.id}`} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!clients.length && <div className="text-center py-12 text-slate-600">No named clients yet</div>}
      </div>
    </Layout>
  )
}

Clients.propTypes = { user: PropTypes.object, clients: PropTypes.array }
