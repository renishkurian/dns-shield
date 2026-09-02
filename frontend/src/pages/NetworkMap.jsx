import React, { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { 
  Network, Search, Monitor, Smartphone, 
  Watch, Laptop, Tablet, Wifi, Info, Tag, User,
  HardDrive, Tv, Globe, Clock, Server, Cpu
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const getDeviceIcon = (deviceType = '', vendor = '', hostname = '') => {
  const t = (deviceType || '').toLowerCase()
  const v = (vendor || '').toLowerCase()
  const h = (hostname || '').toLowerCase()
  if (t === 'phone' || v.includes('apple') || h.includes('iphone') || h.includes('android')) {
    return h.includes('ipad') ? Tablet : Smartphone
  }
  if (t === 'tv' || h.includes('tv') || v.includes('roku')) return Tv
  if (t === 'router') return Globe
  if (t === 'iot' || h.includes('raspberry') || h.includes('printer')) return HardDrive
  if (t === 'laptop' || h.includes('laptop') || h.includes('macbook')) return Laptop
  if (h.includes('watch')) return Watch
  return Monitor
}

function formatLastSeen(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  const ago = (Date.now() - d.getTime()) / 1000
  if (ago < 60) return 'Just now'
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NetworkMap({ user: currentUser, clients: initialClients = [] }) {
  const [clients, setClients] = useState(() => (Array.isArray(initialClients) ? initialClients : []))
  const [scanning, setScanning] = useState(false)
  const [scanPhase, setScanPhase] = useState('')
  const [scanStats, setScanStats] = useState({ found: 0, enriched: 0 })
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const refreshClients = async () => {
    try {
      const res = await fetch('/api/clients')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setClients(data)
      }
    } catch {
      // ignore
    }
  }

  const pollScan = () => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/network/scan')
        const status = await res.json()
        setScanPhase(status.phase || '')
        setScanStats({ found: status.found || 0, enriched: status.enriched || 0 })
        if (status.phase === 'fingerprint' || status.phase === 'hostnames' || status.phase === 'done') {
          await refreshClients()
        }
        if (!status.running) {
          stopPolling()
          setScanning(false)
          setScanPhase(status.error ? 'error' : 'done')
          await refreshClients()
        }
      } catch {
        stopPolling()
        setScanning(false)
      }
    }, 2000)
  }

  useEffect(() => () => stopPolling(), [])

  const runScan = async () => {
    setScanning(true)
    setScanPhase('starting')
    setScanStats({ found: 0, enriched: 0 })
    const res = await fetch('/api/network/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf(),
      },
      body: JSON.stringify({ deep: true }),
    })
    if (res.ok) {
      pollScan()
    } else {
      setScanning(false)
      setScanPhase('error')
    }
  }

  return (
    <Layout user={currentUser} currentPath="/network/map" title="Network Map">
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Network size={20} className="text-brand-400" />
            Network Topology
          </h2>
          <p className="text-sm text-slate-500">
            Discover devices with nmap + router DHCP / mDNS / NetBIOS hostname lookup
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="md:ml-auto btn-primary shrink-0"
        >
          <Search size={14} className={scanning ? 'animate-pulse' : ''} />
          {scanning ? 'Scanning…' : 'Run Discovery Scan'}
        </button>
      </div>

      {scanning && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-brand-500/20 bg-brand-500/5 text-xs text-slate-300 flex flex-wrap items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-brand-400">
            {scanPhase === 'fingerprint' ? 'Fingerprinting hosts' :
             scanPhase === 'hostnames' ? 'Resolving device names' :
             scanPhase === 'discovery' ? 'Discovering hosts' : 'Starting scan'}
          </span>
          <span className="text-slate-500">
            {scanStats.found ? `${scanStats.found} found` : 'probing subnet…'}
            {scanStats.enriched ? ` · ${scanStats.enriched} enriched` : ''}
          </span>
          <span className="text-slate-600 ml-auto">Deep scan can take 1–2 minutes</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(clients || []).map(c => {
          const Icon = getDeviceIcon(c.device_type, c.vendor, c.hostname)
          const title = c.nickname || c.name || c.hostname || c.vendor || 'Unknown Device'
          return (
            <div key={c.id} className="card group hover:border-brand-500/30 transition-all hover:scale-[1.02] duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-brand-400 transition-colors">
                  <Icon size={24} />
                </div>
                {c.is_active ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter">Online</span>
                  </div>
                ) : (
                  <div className="px-2 py-1 bg-slate-800 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-tighter">
                    Offline
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-white truncate mb-0.5" title={title}>
                {title}
              </h3>
              {c.hostname && (c.nickname || c.name) && c.hostname !== title && (
                <p className="text-[10px] text-slate-500 font-mono truncate mb-2">{c.hostname}</p>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <Wifi size={10} className="text-slate-600 shrink-0" />
                  {c.ip}
                </div>
                {c.mac && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                    <Tag size={10} className="text-slate-700 shrink-0" />
                    {c.mac}
                  </div>
                )}
                {c.vendor && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                    <Cpu size={10} className="text-slate-700 shrink-0" />
                    {c.vendor}
                  </div>
                )}
                {c.os_hint && (
                  <div className="flex items-center gap-1.5 text-[10px] text-brand-300/80 truncate" title={c.os_hint}>
                    <Monitor size={10} className="text-brand-500/60 shrink-0" />
                    {c.os_hint}
                  </div>
                )}
                {c.open_ports && (
                  <div className="flex items-start gap-1.5 text-[10px] text-slate-500" title={c.open_ports}>
                    <Server size={10} className="text-slate-700 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 font-mono leading-relaxed">{c.open_ports}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <Clock size={10} className="shrink-0" />
                  Seen {formatLastSeen(c.last_seen)}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex items-center gap-1 text-[10px] text-slate-500 truncate">
                    <User size={10} />
                    {c.group_name || 'Global'}
                  </span>
                  {c.device_type && c.device_type !== 'other' && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {c.device_type}
                    </span>
                  )}
                </div>
                <a
                  href={`/clients/${c.id}`}
                  className="text-[10px] font-bold text-brand-400 hover:text-brand-300 uppercase tracking-wider shrink-0"
                >
                  Manage
                </a>
              </div>
            </div>
          )
        })}

        {!clients.length && (
          <div className="col-span-full card py-20 text-center">
            <Search size={48} className="text-slate-800 mx-auto mb-4" />
            <h3 className="text-slate-500 font-bold">No Devices Found</h3>
            <p className="text-slate-600 text-sm">Run a discovery scan to populate your network map.</p>
          </div>
        )}
      </div>

      <div className="mt-12 bg-brand-500/5 border border-brand-500/10 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-brand-500/10 rounded-2xl flex items-center justify-center shrink-0">
            <Info size={24} className="text-brand-400" />
          </div>
          <div>
            <h4 className="text-white font-bold text-sm mb-2">nmap-powered discovery</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <p className="text-xs text-slate-400 leading-relaxed">
                Discovery uses <code className="text-brand-300">nmap -sn -PR -R</code> (ARP + reverse DNS),
                then fingerprints each live host with a fast port scan and OS detection
                (<code className="text-brand-300">-F -O --osscan-guess</code>).
              </p>
              <ul className="text-[11px] text-slate-500 space-y-2">
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-500" />
                  Hostname, MAC, and vendor from ARP/OUI
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-500" />
                  OS guess and open service ports
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-brand-500" />
                  Device type inferred from fingerprint
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

NetworkMap.propTypes = {
  user: PropTypes.object,
  clients: PropTypes.array,
}
