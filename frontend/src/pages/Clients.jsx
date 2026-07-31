import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Plus, Wifi, ExternalLink, Ban, ShieldOff } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Clients({ user, clients: initial = [] }) {
  const [clients, setClients] = useState(initial)
  const [form, setForm] = useState({ ip: '', name: '', group: '', comment: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [actingId, setActingId] = useState(null)
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

  const toggleBlock = async (e, client) => {
    e.preventDefault()
    e.stopPropagation()
    const next = !client.is_blocked
    const label = client.nickname || client.name || client.hostname || client.ip
    if (next && !confirm(`Block all DNS for ${label}?\n\nEvery DNS query from ${client.ip} will be refused until you unblock.`)) {
      return
    }
    setActingId(client.id)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ is_blocked: next }),
      })
      if (res.ok) {
        const data = await res.json()
        setClients(list => list.map(c => (c.id === client.id ? { ...c, ...data } : c)))
      } else {
        alert('Failed to update client block status.')
      }
    } catch {
      alert('Failed to update client block status.')
    } finally {
      setActingId(null)
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
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Comment</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr
                key={c.id}
                onClick={() => { window.location.href = `/clients/${c.id}` }}
                className={`border-b border-slate-800/50 hover:bg-slate-700/20 cursor-pointer group transition-colors ${
                  c.is_blocked ? 'bg-red-500/[0.04]' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      c.is_blocked
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-slate-800/50 text-slate-500 group-hover:text-brand-400'
                    }`}>
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
                  {c.is_blocked ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                      <Ban size={10} /> Blocked
                    </span>
                  ) : (
                    <span className="text-slate-600 text-[10px] uppercase tracking-wider">Allowed</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-500 text-[10px] italic">{c.comment}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={actingId === c.id}
                        onClick={(e) => toggleBlock(e, c)}
                        title={c.is_blocked ? 'Unblock all DNS for this client' : 'Block all DNS for this client'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                          c.is_blocked
                            ? 'text-green-400 hover:bg-green-500/10 border border-green-500/20'
                            : 'text-red-400 hover:bg-red-500/10 border border-red-500/20'
                        }`}
                      >
                        {c.is_blocked ? <ShieldOff size={12} /> : <Ban size={12} />}
                        {actingId === c.id ? '…' : c.is_blocked ? 'Unblock' : 'Block'}
                      </button>
                    )}
                    <a
                      href={`/clients/${c.id}`}
                      className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                      title="Open client detail"
                    >
                      <ExternalLink size={12} />
                    </a>
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
