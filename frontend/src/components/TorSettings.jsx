import React, { useEffect, useState } from 'react'
import { Copy, CheckCircle, RefreshCw, Globe } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function TorSettings() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/network/tor/status')
      if (!res.ok) throw new Error('Failed to fetch Tor status')
      setStatus(await res.json())
    } catch (e) {
      setError(e.message || 'Failed to fetch Tor status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const copyCmd = () => {
    if (!status?.install_command) return
    navigator.clipboard.writeText(status.install_command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggle = async (enabled) => {
    setToggling(true)
    setError('')
    try {
      const res = await fetch('/api/network/tor/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ enabled }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.output || data.error || 'Toggle failed')
      }
      if (data.status) setStatus(data.status)
      else await fetchStatus()
    } catch (e) {
      setError(e.message || 'Toggle failed')
    } finally {
      setToggling(false)
    }
  }

  if (loading && !status) {
    return (
      <div className="card mb-6">
        <p className="text-slate-500 text-sm">Checking Tor…</p>
      </div>
    )
  }

  if (!status?.installed) {
    return (
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Tor DNS</h3>
          </div>
          <button onClick={fetchStatus} disabled={loading} className="btn-ghost text-xs">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Recheck
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-3">Tor is not installed</p>
        <p className="text-slate-500 text-xs mb-2">
          Install Tor on this host, then recheck. Per-client &quot;Route via Tor&quot; needs the service running.
        </p>
        <div className="flex items-center gap-2 bg-surface-100 px-3 py-2 rounded-lg">
          <code className="text-xs font-mono text-slate-300 flex-1 break-all">
            {status?.install_command || 'sudo apt-get install -y tor'}
          </code>
          <button
            type="button"
            onClick={copyCmd}
            title="Copy install command"
            className="text-slate-500 hover:text-brand-400 transition-colors shrink-0"
          >
            {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    )
  }

  const on = !!status.enabled

  return (
    <div className="card mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Globe size={16} className="text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Tor DNS</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              status.running
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
            }`}>
              {status.running ? 'Running' : 'Stopped'}
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              {status.enabled ? 'Enabled at boot' : 'Not enabled at boot'}
            </span>
          </div>
          <p className="text-slate-500 text-xs">
            Starts the system Tor service with DNSPort on 127.0.0.1:9053. Clients with &quot;Route via Tor&quot; resolve through it.
          </p>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>
        <div className="relative shrink-0">
          <input
            type="checkbox"
            checked={on}
            disabled={toggling}
            onChange={e => toggle(e.target.checked)}
            className="peer sr-only"
            id="toggle-tor"
          />
          <label
            htmlFor="toggle-tor"
            className={`block w-12 h-6 rounded-full cursor-pointer transition-colors ${
              on ? 'bg-brand-500' : 'bg-slate-700'
            } ${toggling ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
              on ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </label>
        </div>
      </div>
    </div>
  )
}
