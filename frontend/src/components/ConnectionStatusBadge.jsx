import React, { useState, useEffect, useRef } from 'react'
import { ShieldCheck, ShieldAlert, Wifi, Globe, Activity, RefreshCw, ChevronRight, CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react'
import { Link } from '@inertiajs/react'

export default function ConnectionStatusBadge() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagResult, setDiagResult] = useState(null)
  const popoverRef = useRef(null)

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
      setLoading(false)
    }
  }

  const runDiagnostic = async () => {
    setDiagLoading(true)
    setDiagResult(null)
    try {
      const res = await fetch('/api/system/diagnostics', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDiagResult(data)
      }
    } catch (e) {
      setDiagResult({ error: e.message })
    } finally {
      setDiagLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (loading && !status) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" />
        <span>Checking DNS...</span>
      </div>
    )
  }

  const isConnected = status?.is_client_connected
  const isProxyUp = status?.proxy_running

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
          isConnected
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm shadow-emerald-950/40'
            : isProxyUp
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 shadow-sm shadow-amber-950/40 animate-pulse'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20 shadow-sm shadow-rose-950/40'
        }`}
        title="Click for Connection & Protection Diagnostics"
      >
        <div className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-emerald-400 animate-pulse-slow' : isProxyUp ? 'bg-amber-400 animate-ping' : 'bg-rose-500'
        }`} />
        <span className="hidden md:inline font-mono text-[11px] text-slate-400">
          {status?.client_ip || 'Device'}
        </span>
        <span className="font-semibold text-[11px]">
          {isConnected ? 'Protected' : 'Not Protected'}
        </span>
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-4 text-xs animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-brand-400" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Connection Status
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Main Status Hero */}
          <div className={`my-3 p-3 rounded-xl border ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-start gap-2.5">
              {isConnected ? (
                <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold text-xs text-white">
                  {isConnected
                    ? 'This device is protected by DNS Shield'
                    : 'This device is NOT routing DNS to DNS Shield'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {isConnected
                    ? `Active connection detected from IP ${status?.client_ip}. Queries from this device are being filtered.`
                    : `Your device (${status?.client_ip}) is sending queries elsewhere. Set your DNS to ${status?.server_ip || '192.168.0.50'} or disable DoH.`}
                </p>
              </div>
            </div>
          </div>

          {/* Diagnostics Grid */}
          <div className="space-y-2 py-1 text-[11px]">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Wifi size={13} className="text-slate-500" /> Your Device IP
              </span>
              <span className="font-mono text-white font-medium">{status?.client_ip || '127.0.0.1'}</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Globe size={13} className="text-slate-500" /> DNS Shield IP
              </span>
              <span className="font-mono text-white font-medium">{status?.server_ip || '192.168.0.50'} : 53</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
              <span className="text-slate-400">Queries from this device (24h)</span>
              <span className="font-mono text-white font-medium">{status?.client_queries_24h ?? 0}</span>
            </div>

            {status?.last_query_domain && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                <span className="text-slate-400">Last seen query</span>
                <span className="font-mono text-brand-300 truncate max-w-[150px]" title={status?.last_query_domain}>
                  {status?.last_query_domain}
                </span>
              </div>
            )}
          </div>

          {/* Interactive Live Diagnostic */}
          {diagResult && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-slate-400 font-semibold border-b border-slate-800 pb-1">
                <span>Diagnostic Test Results</span>
                <span className="text-slate-500 text-[10px]">Live probe</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Proxy Port 53:</span>
                {diagResult.proxy_test?.success ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> {diagResult.proxy_test.latency_ms} ms ({diagResult.proxy_test.rcode})
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1">
                    <XCircle size={12} /> Failed
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span>Ad Block Interception:</span>
                {diagResult.block_test?.success ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Blocked ({diagResult.block_test.domain})
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} /> Unblocked
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span>Upstream Unbound:</span>
                {diagResult.upstream_test?.success ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> {diagResult.upstream_test.latency_ms} ms
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1">
                    <XCircle size={12} /> Failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              onClick={runDiagnostic}
              disabled={diagLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 font-medium transition-colors border border-brand-500/30 text-[11px]"
            >
              <RefreshCw size={12} className={diagLoading ? 'animate-spin' : ''} />
              {diagLoading ? 'Testing...' : 'Test Connection'}
            </button>

            <Link
              href="/settings/dns"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] transition-colors"
            >
              DNS Settings <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
