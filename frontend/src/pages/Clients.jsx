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
              <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Wifi size={12} className="text-slate-500" />
                    <span className="font-mono text-xs text-brand-300">{c.ip}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-200 text-xs">{c.name || '—'}</td>
                <td className="px-4 py-2.5"><span className={c.group ? 'badge-blue' : ''}>{c.group || '—'}</span></td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{c.comment}</td>
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
