import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import {
  Globe, Save, RefreshCw, CheckCircle, ShieldCheck, ShieldAlert,
  Wifi, Activity, CheckCircle2, XCircle, AlertTriangle, ArrowRight,
  Server, Cpu, Database, Radio
} from 'lucide-react'
import { Link } from '@inertiajs/react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function DNSSettings({ user, settings: initial = {} }) {
  const { alert } = useAlert()
  const [settings, setSettings] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagResult, setDiagResult] = useState(null)
  const isAdmin = user?.role === 'admin'

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/system/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false)
    }
  }

  const loadSettings = async () => {
    if (!initial || Object.keys(initial).length === 0) {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
        }
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    fetchStatus()
    loadSettings()
  }, [])

  const runDiagnostics = async () => {
    setDiagLoading(true)
    setDiagResult(null)
    try {
      const res = await fetch('/api/system/diagnostics', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDiagResult(data)
        fetchStatus()
      }
    } catch (e) {
      setDiagResult({ error: e.message })
    } finally {
      setDiagLoading(false)
    }
  }

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(settings),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const reloadProxy = async () => {
    setReloading(true)
    await fetch('/api/system/reload-proxy', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } })
    setReloading(false)
    fetchStatus()
  }

  const detectUnbound = async () => {
    const res = await fetch('/api/system/unbound/detect')
    const data = await res.json()
    if (data.installed) {
      setSettings(s => ({
        ...s,
        upstream_dns: data.recommendation.host,
        upstream_port: data.recommendation.port
      }))
    } else {
      await alert("Unbound service not found on this system.", 'error')
    }
  }

  const isConnected = status?.is_client_connected
  const isProxyUp = status?.proxy_running

  const fields = [
    { 
      key: 'upstream_dns', 
      label: 'Upstream DNS IP', 
      placeholder: '127.0.0.1', 
      desc: 'Unbound resolver IP (defaults to 127.0.0.1)',
      action: { label: 'Auto-detect', onClick: detectUnbound, icon: Globe }
    },
    { key: 'upstream_port', label: 'Upstream DNS Port', placeholder: '5335', desc: 'Unbound port (defaults to 5335)' },
    { key: 'proxy_host', label: 'Proxy Bind Host', placeholder: '0.0.0.0', desc: 'Interface to bind DNS proxy' },
    { key: 'proxy_port', label: 'Proxy Port', placeholder: '53', desc: 'DNS proxy port (53 is standard UDP/TCP)' },
    { key: 'log_retention_days', label: 'Log Retention (days)', placeholder: '30', desc: 'Auto-delete query logs after N days' },
  ]

  return (
    <Layout user={user} currentPath="/settings/dns" title="DNS Settings">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">DNS Configuration & Diagnostics</h2>
          <p className="text-slate-500 text-xs mt-1">
            Manage upstream DNS resolvers, proxy ports, and verify device protection status.
          </p>
        </div>

        {/* ─── LIVE DEVICE CONNECTION & PROTECTION BANNER ─────────────────────── */}
        <div className={`rounded-2xl border p-5 transition-all shadow-xl ${
          isConnected
            ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30 shadow-emerald-950/20'
            : isProxyUp
            ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/30 shadow-amber-950/20'
            : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border-rose-500/30 shadow-rose-950/20'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className={`p-3 rounded-2xl ${
                isConnected ? 'bg-emerald-500/20 text-emerald-400' : isProxyUp ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {isConnected ? <ShieldCheck size={28} /> : isProxyUp ? <ShieldAlert size={28} /> : <AlertTriangle size={28} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {isConnected ? 'This Device is Connected & Protected' : isProxyUp ? 'This Device is NOT Using DNS Shield' : 'DNS Proxy is Offline'}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : isProxyUp ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}>
                    {isConnected ? 'Active' : 'Unprotected'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isConnected
                    ? `Device IP ${status?.client_ip || 'Your IP'} is routing DNS through ${status?.server_ip || '192.168.0.50'}. Ads and trackers are filtered.`
                    : isProxyUp
                    ? `Device IP ${status?.client_ip || 'Your IP'} is bypassing DNS Shield. Point your device/router DNS to ${status?.server_ip || '192.168.0.50'} or disable DoH.`
                    : 'The DNS Proxy service is not currently responding on UDP Port 53.'}
                </p>
              </div>
            </div>

            <button
              onClick={runDiagnostics}
              disabled={diagLoading}
              className="btn-primary self-start md:self-center shrink-0 text-xs py-2 px-4 shadow-lg"
            >
              <RefreshCw size={14} className={diagLoading ? 'animate-spin' : ''} />
              {diagLoading ? 'Testing DNS...' : 'Run Diagnostics'}
            </button>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <span className="text-slate-500 text-[11px] block">Your Device IP</span>
              <span className="text-white font-mono font-semibold text-sm mt-0.5 block truncate">
                {status?.client_ip || '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <span className="text-slate-500 text-[11px] block">DNS Server IP</span>
              <span className="text-white font-mono font-semibold text-sm mt-0.5 block truncate">
                {status?.server_ip || '192.168.0.50'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <span className="text-slate-500 text-[11px] block">Device Queries (24h)</span>
              <span className="text-brand-400 font-mono font-semibold text-sm mt-0.5 block">
                {status?.client_queries_24h ?? 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
              <span className="text-slate-500 text-[11px] block">Proxy Port 53</span>
              <span className="text-emerald-400 font-semibold text-sm mt-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {isProxyUp ? 'Listening' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Diagnostic Results Box */}
          {diagResult && (
            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Activity size={13} className="text-brand-400" /> Live DNS Probe Results
                </span>
                <span className="text-slate-500 text-[10px]">Roundtrip resolution test</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-medium">1. Local Proxy (Port 53)</span>
                    {diagResult.proxy_test?.success ? (
                      <CheckCircle2 size={15} className="text-emerald-400" />
                    ) : (
                      <XCircle size={15} className="text-rose-400" />
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-slate-300">
                    {diagResult.proxy_test?.success ? `${diagResult.proxy_test.latency_ms} ms (Resolved)` : 'Connection timed out'}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-medium">2. Adblock Interception</span>
                    {diagResult.block_test?.success ? (
                      <CheckCircle2 size={15} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={15} className="text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-slate-300">
                    {diagResult.block_test?.success ? `${diagResult.block_test.domain} (Blocked NXDOMAIN)` : 'Domain not intercepted'}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-medium">3. Upstream Unbound</span>
                    {diagResult.upstream_test?.success ? (
                      <CheckCircle2 size={15} className="text-emerald-400" />
                    ) : (
                      <XCircle size={15} className="text-rose-400" />
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-slate-300">
                    {diagResult.upstream_test?.success ? `${diagResult.upstream_test.latency_ms} ms (${diagResult.upstream_test.host})` : 'Upstream unreachable'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Setup Hint if not connected */}
          {!isConnected && isProxyUp && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-2">
              <span>
                💡 <strong>How to connect this device:</strong> In your router or device Wi-Fi settings, set <strong>Primary DNS</strong> to <code className="bg-amber-950/80 px-1.5 py-0.5 rounded font-mono text-amber-200">{status?.server_ip || '192.168.0.50'}</code> and disable <strong>Secure DNS</strong> in your browser settings.
              </span>
              <Link href="/settings/doh" className="text-amber-400 hover:text-white shrink-0 font-semibold flex items-center gap-1 underline underline-offset-2">
                Setup Guide <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>

        {/* ─── DNS CONFIGURATION FORM ─────────────────────────────────────────── */}
        <div className="card max-w-2xl">
          <h3 className="font-semibold text-white mb-4">Resolver & Service Configuration</h3>
          <div className="space-y-4">
            {fields.map(f => (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">{f.label}</label>
                  {f.action && isAdmin && (
                    <button 
                      onClick={f.action.onClick}
                      className="text-[10px] flex items-center gap-1 font-bold text-brand-400 hover:text-brand-300 transition-colors bg-brand-500/10 px-2 py-0.5 rounded"
                    >
                      <f.action.icon size={10} /> {f.action.label}
                    </button>
                  )}
                </div>
                <input className="input text-xs font-mono" placeholder={f.placeholder}
                  value={settings[f.key] || ''}
                  onChange={e => setSettings(s => ({...s, [f.key]: e.target.value}))}
                  disabled={!isAdmin} />
                <p className="text-xs text-slate-600 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-800">
              <button onClick={save} className="btn-primary">
                <Save size={14} />
                {saved ? 'Saved!' : 'Save Settings'}
              </button>
              <button onClick={reloadProxy} disabled={reloading} className="btn-ghost">
                <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
                {reloading ? 'Reloading…' : 'Reload Proxy'}
              </button>
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 text-green-400 text-sm mt-3 animate-fade-in">
              <CheckCircle size={15} /> Settings saved. Reload proxy to apply.
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

DNSSettings.propTypes = { user: PropTypes.object, settings: PropTypes.object }
