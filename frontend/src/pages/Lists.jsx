import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Terminal, X } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function GravityModal({ onClose, onComplete }) {
  const [lines, setLines] = useState([])
  const [done, setDone] = useState(false)
  const bottomRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws/gravity`)
    wsRef.current = ws
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setLines(l => [...l, data])
      if (data.level === 'success' && data.message?.includes('complete')) {
        setDone(true)
        if (onComplete) {
           // Refetch all lists to get new counts and the new uniqueCount
           fetch('/api/lists').then(res => res.json()).then(data => onComplete(data))
        }
      }
    }
    // Trigger update
    fetch('/api/lists/gravity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    })
    return () => ws.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const COLORS = { error: 'text-red-400', success: 'text-green-400', warning: 'text-yellow-400', info: 'text-slate-400' }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal p-6 max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={18} className="text-brand-400" />
          <h3 className="font-bold text-white">Gravity Update</h3>
          {done && <span className="badge-green ml-auto">Complete</span>}
          <button onClick={onClose} className="text-slate-500 hover:text-white ml-auto">
            <X size={16} />
          </button>
        </div>
        <div className="bg-surface-100 rounded-lg p-4 font-mono text-xs h-80 overflow-auto border border-slate-700">
          {lines.map((line, i) => (
            <div key={i} className={`${COLORS[line.level] || 'text-slate-400'} leading-relaxed`}>
              <span className="text-slate-600">[{new Date(line.timestamp).toLocaleTimeString()}]</span>{' '}
              {line.message}
            </div>
          ))}
          {!lines.length && <div className="text-slate-600">Connecting to gravity update stream…</div>}
          <div ref={bottomRef} />
        </div>
        {done && (
          <button onClick={onClose} className="btn-primary mt-4 w-full justify-center">
            Close
          </button>
        )}
      </div>
    </div>
  )
}

GravityModal.propTypes = { onClose: PropTypes.func }

export default function Lists({ user, lists: initial = [], uniqueCount: initialUnique = 0 }) {
  const [lists, setLists] = useState(initial)
  const [uniqueCount, setUniqueCount] = useState(initialUnique)
  const [showGravity, setShowGravity] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ url: '', name: '', comment: '' })
  const [err, setErr] = useState('')
  const isAdmin = user?.role === 'admin'

  const toggle = async (id, enabled) => {
    await fetch(`/api/lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ enabled: !enabled }),
    })
    setLists(l => l.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  }

  const remove = async (id) => {
    if (!confirm('Delete adlist?')) return
    await fetch(`/api/lists/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setLists(l => l.filter(x => x.id !== id))
  }

  const formatErrors = (data) => {
    if (!data || typeof data !== 'object') return 'Failed to add adlist.'
    if (typeof data.detail === 'string') return data.detail
    if (typeof data.error === 'string') return data.error
    const parts = Object.entries(data).flatMap(([field, msgs]) => {
      const list = Array.isArray(msgs) ? msgs : [msgs]
      return list.map(m => (field === 'non_field_errors' ? m : `${field}: ${m}`))
    })
    return parts.join(' ') || 'Failed to add adlist.'
  }

  const save = async () => {
    setErr('')
    if (!form.url.trim() || !form.name.trim()) {
      setErr('URL and list name are required.')
      return
    }
    const res = await fetch('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(formatErrors(data))
      return
    }
    const item = data.lists || data
    setLists(l => [item, ...l])
    setShowAdd(false)
    setForm({ url: '', name: '', comment: '' })
    setErr('')
  }

  // No longer needed: const total = lists.reduce((s, l) => s + (l.domain_count || 0), 0)

  return (
    <Layout user={user} currentPath="/lists" title="Adlists">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Adlists</h2>
          <p className="text-sm text-slate-500">{lists.length} lists · {uniqueCount.toLocaleString()} unique domains</p>
        </div>
        <div className="ml-auto flex gap-2">
          {isAdmin && <button onClick={() => setShowGravity(true)} className="btn-primary">
            <RefreshCw size={14} /> Update Gravity
          </button>}
          {isAdmin && <button onClick={() => setShowAdd(s => !s)} className="btn-ghost">
            <Plus size={14} /> Add List
          </button>}
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4 animate-fade-in">
          <h3 className="font-semibold text-white text-sm mb-3">Add Adlist</h3>
          {err && <div className="text-red-400 text-xs mb-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}
          <div className="space-y-2">
            <input className="input text-xs" placeholder="https://raw.githubusercontent.com/…/domains.txt"
              value={form.url} onChange={e => { setErr(''); setForm(f => ({...f, url: e.target.value})) }} />
            <input className="input text-xs" placeholder="List name"
              value={form.name} onChange={e => { setErr(''); setForm(f => ({...f, name: e.target.value})) }} />
            <input className="input text-xs" placeholder="Comment (optional)"
              value={form.comment} onChange={e => setForm(f => ({...f, comment: e.target.value}))} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={save} className="btn-primary text-xs">Add</button>
            <button onClick={() => { setShowAdd(false); setErr('') }} className="btn-ghost text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-slate-400 text-xs font-medium">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Domains</th>
              <th className="text-left px-4 py-3">Last Updated</th>
              <th className="text-left px-4 py-3">Status</th>
              {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {lists.map(list => (
              <tr key={list.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                <td className="px-4 py-3">
                  <div className="text-slate-200 text-xs font-medium">{list.name}</div>
                  <div className="text-slate-600 text-xs truncate max-w-xs">{list.url}</div>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {list.domain_count ? list.domain_count.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {list.last_updated ? new Date(list.last_updated).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {list.last_error
                    ? <span className="badge-red text-xs" title={list.last_error}>Error</span>
                    : list.last_updated
                      ? <span className="badge-green text-xs">OK</span>
                      : <span className="badge-gray text-xs">Pending</span>
                  }
                </td>
                {isAdmin && <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => toggle(list.id, list.enabled)} className="p-1">
                      {list.enabled ? <ToggleRight size={18} className="text-brand-400" /> : <ToggleLeft size={18} className="text-slate-500" />}
                    </button>
                    <button onClick={() => remove(list.id)} className="p-1 text-slate-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!lists.length && <div className="text-center py-12 text-slate-600">No adlists configured. Add a blocklist URL to get started.</div>}
      </div>

      {showGravity && <GravityModal 
        onClose={() => setShowGravity(false)} 
        onComplete={(data) => {
          setLists(data.lists)
          if (data.uniqueCount !== undefined) setUniqueCount(data.uniqueCount)
        }}
      />}
    </Layout>
  )
}

Lists.propTypes = { user: PropTypes.object, lists: PropTypes.array }
