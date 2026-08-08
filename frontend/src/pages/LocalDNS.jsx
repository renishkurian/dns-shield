import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Plus, Trash2, Globe, Link2, Info } from 'lucide-react'
import { useAlert } from '../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function LocalDNS({ user, records: initialRecords = [], cnames: initialCnames = [] }) {
  const { alert, confirm } = useAlert()
  const [records, setRecords] = useState(initialRecords)
  const [cnames, setCnames] = useState(initialCnames)
  const [aForm, setAForm] = useState({ domain: '', ip: '', ttl: 300, comment: '' })
  const [cForm, setCForm] = useState({ domain: '', target: '', ttl: 300, comment: '' })
  const [aErr, setAErr] = useState('')
  const [cErr, setCErr] = useState('')
  const [savingA, setSavingA] = useState(false)
  const [savingC, setSavingC] = useState(false)
  const isAdmin = user?.role === 'admin'

  const addA = async () => {
    setAErr('')
    const payload = {
      domain: aForm.domain.trim().toLowerCase(),
      ip: aForm.ip.trim(),
      ttl: Number(aForm.ttl) || 300,
      comment: aForm.comment.trim(),
      enabled: true,
    }
    if (!payload.domain || !payload.ip) {
      setAErr('Domain and IP are required.')
      return
    }
    setSavingA(true)
    try {
      const res = await fetch('/api/local-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAErr(data.domain?.[0] || data.ip?.[0] || data.detail || JSON.stringify(data))
        return
      }
      setRecords(list => {
        const idx = list.findIndex(r => r.domain === data.domain)
        if (idx >= 0) {
          const next = [...list]
          next[idx] = data
          return next
        }
        return [...list, data].sort((a, b) => a.domain.localeCompare(b.domain))
      })
      setAForm({ domain: '', ip: '', ttl: 300, comment: '' })
    } finally {
      setSavingA(false)
    }
  }

  const removeA = async (id) => {
    if (!(await confirm('Remove this local DNS record?'))) return
    await fetch(`/api/local-dns/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setRecords(list => list.filter(r => r.id !== id))
  }

  const addCname = async () => {
    setCErr('')
    const payload = {
      domain: cForm.domain.trim().toLowerCase(),
      target: cForm.target.trim().toLowerCase(),
      ttl: Number(cForm.ttl) || 300,
      comment: cForm.comment.trim(),
      enabled: true,
    }
    if (!payload.domain || !payload.target) {
      setCErr('Domain and target are required.')
      return
    }
    setSavingC(true)
    try {
      const res = await fetch('/api/local-cname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCErr(data.domain?.[0] || data.target?.[0] || data.detail || JSON.stringify(data))
        return
      }
      setCnames(list => {
        const idx = list.findIndex(r => r.domain === data.domain)
        if (idx >= 0) {
          const next = [...list]
          next[idx] = data
          return next
        }
        return [...list, data].sort((a, b) => a.domain.localeCompare(b.domain))
      })
      setCForm({ domain: '', target: '', ttl: 300, comment: '' })
    } finally {
      setSavingC(false)
    }
  }

  const removeCname = async (id) => {
    if (!(await confirm('Remove this local CNAME record?'))) return
    await fetch(`/api/local-cname/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setCnames(list => list.filter(r => r.id !== id))
  }

  return (
    <Layout user={user} currentPath="/local-dns" title="Local DNS">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe size={20} className="text-brand-400" />
            Local DNS Records
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Map hostnames to IPs and aliases — like Pi-hole local DNS / CNAME.
          </p>
        </div>

        {/* A / AAAA records */}
        <section className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Globe size={16} className="text-brand-400" />
            <h3 className="font-bold text-white text-sm">Local DNS records (A / AAAA)</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/40">
                <tr className="text-slate-400 text-xs font-medium">
                  <th className="text-left px-6 py-3">Domain</th>
                  <th className="text-left px-6 py-3">IP Address</th>
                  <th className="text-left px-6 py-3">TTL</th>
                  <th className="text-left px-6 py-3">Comment</th>
                  {isAdmin && <th className="px-6 py-3 text-right w-16" />}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                    <td className="px-6 py-2.5 font-mono text-xs text-brand-300">{r.domain}</td>
                    <td className="px-6 py-2.5 font-mono text-xs text-white">{r.ip}</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">{r.ttl}s</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">{r.comment || '—'}</td>
                    {isAdmin && (
                      <td className="px-6 py-2.5 text-right">
                        <button onClick={() => removeA(r.id)} className="text-slate-600 hover:text-red-400 p-1" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!records.length && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-6 py-10 text-center text-slate-600 text-sm">
                      No local DNS records defined.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/20">
              {aErr && <p className="text-red-400 text-xs mb-3">{aErr}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div className="lg:col-span-2">
                  <label className="label">Domain</label>
                  <input
                    className="input text-xs font-mono"
                    placeholder="nas.home.arpa"
                    value={aForm.domain}
                    onChange={e => { setAErr(''); setAForm(f => ({ ...f, domain: e.target.value })) }}
                    onKeyDown={e => e.key === 'Enter' && addA()}
                  />
                </div>
                <div>
                  <label className="label">IP Address</label>
                  <input
                    className="input text-xs font-mono"
                    placeholder="192.168.0.50"
                    value={aForm.ip}
                    onChange={e => { setAErr(''); setAForm(f => ({ ...f, ip: e.target.value })) }}
                    onKeyDown={e => e.key === 'Enter' && addA()}
                  />
                </div>
                <div>
                  <label className="label">TTL (sec)</label>
                  <input
                    className="input text-xs"
                    type="number"
                    min={0}
                    max={86400}
                    value={aForm.ttl}
                    onChange={e => setAForm(f => ({ ...f, ttl: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    className="input text-xs flex-1"
                    placeholder="Comment"
                    value={aForm.comment}
                    onChange={e => setAForm(f => ({ ...f, comment: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addA()}
                  />
                  <button onClick={addA} disabled={savingA} className="btn-primary shrink-0">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mt-3">
                Adding or removing records reloads the proxy rules automatically (no restart needed).
              </p>
            </div>
          )}
        </section>

        {/* CNAME records */}
        <section className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Link2 size={16} className="text-purple-400" />
            <h3 className="font-bold text-white text-sm">Local CNAME records</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/40">
                <tr className="text-slate-400 text-xs font-medium">
                  <th className="text-left px-6 py-3">Domain</th>
                  <th className="text-left px-6 py-3">Target Domain</th>
                  <th className="text-left px-6 py-3">TTL</th>
                  <th className="text-left px-6 py-3">Comment</th>
                  {isAdmin && <th className="px-6 py-3 text-right w-16" />}
                </tr>
              </thead>
              <tbody>
                {cnames.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                    <td className="px-6 py-2.5 font-mono text-xs text-purple-300">{r.domain}</td>
                    <td className="px-6 py-2.5 font-mono text-xs text-white">{r.target}</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">{r.ttl}s</td>
                    <td className="px-6 py-2.5 text-xs text-slate-500">{r.comment || '—'}</td>
                    {isAdmin && (
                      <td className="px-6 py-2.5 text-right">
                        <button onClick={() => removeCname(r.id)} className="text-slate-600 hover:text-red-400 p-1" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!cnames.length && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-6 py-10 text-center text-slate-600 text-sm">
                      No local CNAME records defined.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {isAdmin && (
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/20">
              {cErr && <p className="text-red-400 text-xs mb-3">{cErr}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="label">Domain</label>
                  <input
                    className="input text-xs font-mono"
                    placeholder="www.home.arpa"
                    value={cForm.domain}
                    onChange={e => { setCErr(''); setCForm(f => ({ ...f, domain: e.target.value })) }}
                    onKeyDown={e => e.key === 'Enter' && addCname()}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label">Target Domain</label>
                  <input
                    className="input text-xs font-mono"
                    placeholder="nas.home.arpa"
                    value={cForm.target}
                    onChange={e => { setCErr(''); setCForm(f => ({ ...f, target: e.target.value })) }}
                    onKeyDown={e => e.key === 'Enter' && addCname()}
                  />
                </div>
                <div>
                  <label className="label">TTL (sec)</label>
                  <input
                    className="input text-xs"
                    type="number"
                    min={0}
                    max={86400}
                    value={cForm.ttl}
                    onChange={e => setCForm(f => ({ ...f, ttl: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    className="input text-xs flex-1"
                    placeholder="Comment"
                    value={cForm.comment}
                    onChange={e => setCForm(f => ({ ...f, comment: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addCname()}
                  />
                  <button onClick={addCname} disabled={savingC} className="btn-primary shrink-0">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mt-3">
                The target should preferably also have a local A/AAAA record so clients get an address in one lookup.
              </p>
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-brand-500/10 bg-brand-500/5 p-5 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <Info size={18} className="text-brand-400" />
          </div>
          <div className="text-xs text-slate-400 leading-relaxed space-y-2">
            <p className="text-white font-bold text-sm">How it works</p>
            <p>
              Local records are answered by DNS Shield before blocklists or upstream resolvers.
              Use them for LAN hostnames (NAS, printers, Pi) or short aliases.
            </p>
            <p>
              Example: <code className="text-brand-300">balarama.local.arpa → 192.168.0.50</code>, then
              CNAME <code className="text-purple-300">dns.home → balarama.local.arpa</code>.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}

LocalDNS.propTypes = {
  user: PropTypes.object,
  records: PropTypes.array,
  cnames: PropTypes.array,
}
