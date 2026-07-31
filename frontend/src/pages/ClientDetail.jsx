import React, { useEffect, useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { Link, usePage } from '@inertiajs/react'
import Layout from '../components/Layout'
import { 
  Wifi, Shield, Activity, Clock, ArrowLeft, Globe, 
  ExternalLink, CheckCircle, AlertCircle, Search,
  Calendar, Monitor, Smartphone, Laptop, Tv, HardDrive, HelpCircle
} from 'lucide-react'
import DoughnutChart from '../components/DoughnutChart'

// --- Reusable Stat Card (modified from Dashboard) ---
function StatCard({ label, value, sub, icon: Icon, color = 'brand' }) {
  const colors = {
    brand:   'from-brand-500/20 to-brand-600/10 border-brand-500/30 text-brand-400',
    red:     'from-red-500/20 to-red-600/10 border-red-500/30 text-red-400',
    green:   'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400',
    yellow:  'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-400',
  }
  return (
    <div className={`p-4 rounded-2xl border bg-gradient-to-br ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl font-bold text-white">{value ?? '—'}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        {Icon && <Icon size={18} className="opacity-80" />}
      </div>
    </div>
  )
}

// --- Device Icon lookup ---
const getDeviceIcon = (type) => {
  switch(type) {
    case 'phone': return Smartphone
    case 'laptop': return Laptop
    case 'tv': return Tv
    case 'iot': return HardDrive
    case 'router': return Globe
    default: return Wifi
  }
}

// --- Client Chart (Hourly) ---
function ClientHourlyChart({ data }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data?.length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const max = Math.max(...data.map(d => d.allowed + d.blocked), 1)
    const barW = (W - 32) / Math.max(data.length, 24)
    const chartH = H - 20

    ctx.clearRect(0, 0, W, H)

    data.forEach((hour, i) => {
      const x = 16 + i * barW
      const total = hour.allowed + hour.blocked
      if (total === 0) return
      
      const totalH = (total / max) * chartH
      const blockedH = (hour.blocked / max) * chartH
      const allowedH = totalH - blockedH

      // Allowed (blue)
      ctx.fillStyle = 'rgba(14, 165, 233, 0.4)'
      ctx.beginPath()
      ctx.roundRect(x + 1, chartH - totalH + blockedH, Math.max(barW - 2, 2), allowedH, [2])
      ctx.fill()

      // Blocked (red)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)'
      ctx.beginPath()
      ctx.roundRect(x + 1, chartH - blockedH, Math.max(barW - 2, 2), blockedH, [2])
      ctx.fill()
    })
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

export default function ClientDetail({ user, total, blocked, top_domains = [], visited_domains = [], hourly, client, error }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [domainSearch, setDomainSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [activeTab, setActiveTab] = useState('visited')

  useEffect(() => {
    if (!client?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`/api/clients/${client.id}/history`)
      .then(r => r.json())
      .then(d => {
        setHistory(Array.isArray(d) ? d : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [client?.id])

  if (error || !client) {
    return (
      <Layout user={user} currentPath="/clients" title="Client Not Found">
        <div className="max-w-md mx-auto mt-20 text-center">
          <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Monitor size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Client Not Found</h2>
          <p className="text-slate-500 mb-6">{error || "The client you are looking for does not exist or has been removed."}</p>
          <a href="/clients" className="btn-primary inline-flex">Back to Clients</a>
        </div>
      </Layout>
    )
  }

  const blockPercent = total > 0 ? ((blocked / total) * 100).toFixed(1) : 0
  const DeviceIcon = getDeviceIcon(client.device_type)

  const chartData = (top_domains || []).map((d, i) => ({
    label: d.domain,
    count: d.count,
    color: `hsl(${200 + i * 30}, 70%, 50%)`
  }))

  const filteredVisited = (visited_domains || []).filter(d =>
    !domainSearch || d.domain.toLowerCase().includes(domainSearch.toLowerCase())
  )

  const filteredHistory = history.filter(q =>
    !historySearch || q.domain?.toLowerCase().includes(historySearch.toLowerCase())
  )

  const formatLastSeen = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <Layout user={user} currentPath="/clients" title={`Client: ${client.name || client.ip}`}>
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb / Back */}
        <div className="mb-6">
          <Link href="/clients" className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-medium">
            <ArrowLeft size={16} />
            Back to Clients
          </Link>
        </div>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row gap-6 mb-8 items-start">
          {/* Device Profile Card */}
          <div className="card flex-1 w-full md:w-auto">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center text-brand-400 shrink-0">
                <DeviceIcon size={32} />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white mb-1 uppercase tracking-tight">
                  {client.nickname || client.name || client.hostname || 'Anonymous Device'}
                </h1>
                <div className="flex flex-wrap gap-3 items-center text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-lg">
                    <Globe size={12} className="text-brand-500" /> {client.ip}
                  </span>
                  {client.mac && (
                    <span className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-lg">
                      <HardDrive size={12} /> {client.mac}
                    </span>
                  )}
                  {client.group && (
                    <span className="badge-blue">{client.group_name || 'Group Member'}</span>
                  )}
                </div>
              </div>
              <div className="hidden sm:block">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  client.last_seen ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${client.last_seen ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                  {client.last_seen ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Queries" value={total} sub="Last 24h" icon={Clock} />
              <StatCard label="Blocked" value={blocked} sub={`${blockPercent}% of traffic`} color="red" icon={Shield} />
              <StatCard label="Vendor" value={client.vendor || 'Unknown'} sub={client.os_hint} color="yellow" icon={Monitor} />
              <div className="p-4 rounded-2xl border bg-slate-800/20 border-slate-700/50">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Hourly Activity</p>
                <div className="h-10">
                  <ClientHourlyChart data={hourly} />
                </div>
              </div>
            </div>
          </div>

          {/* Top Domains Doughnut */}
          <div className="card w-full md:w-80 shrink-0">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Globe size={16} className="text-brand-400" />
              Top Domains
            </h3>
            {(top_domains || []).length > 0 ? (
              <DoughnutChart data={chartData} size={160} thickness={20} />
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-600 text-xs text-center px-4">
                No domain data available for this client yet.
              </div>
            )}
          </div>
        </div>

        {/* Visited Domains / Recent Activity */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('visited')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === 'visited' ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Visited Domains
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === 'history' ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Recent Activity
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                placeholder={activeTab === 'visited' ? 'Search domains…' : 'Search history…'}
                className="bg-slate-900/50 border border-slate-700/50 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500/50 transition-colors w-48 md:w-64"
                value={activeTab === 'visited' ? domainSearch : historySearch}
                onChange={e => activeTab === 'visited'
                  ? setDomainSearch(e.target.value)
                  : setHistorySearch(e.target.value)}
              />
            </div>
          </div>

          {activeTab === 'visited' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-700/30">
                      <th className="px-6 py-3">Domain</th>
                      <th className="px-6 py-3 text-right">Visits</th>
                      <th className="px-6 py-3 text-right">Blocked</th>
                      <th className="px-6 py-3 text-right">Last Visited</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {filteredVisited.length > 0 ? (
                      filteredVisited.map((d) => (
                        <tr key={d.domain} className="border-b border-slate-800/30 hover:bg-white/[0.02] group transition-colors">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/domains/detail?domain=${encodeURIComponent(d.domain)}`}
                                className="text-white hover:text-brand-400 font-medium transition-colors truncate max-w-xs md:max-w-md block font-mono"
                              >
                                {d.domain}
                              </Link>
                              <a
                                href={`http://${d.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white"
                              >
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right text-slate-300 font-mono tabular-nums">
                            {d.count?.toLocaleString()}
                          </td>
                          <td className="px-6 py-3 text-right font-mono tabular-nums">
                            {d.blocked > 0 ? (
                              <span className="text-red-400">{d.blocked.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-600">0</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right text-slate-400 font-mono whitespace-nowrap">
                            {formatLastSeen(d.last_seen)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-slate-600 italic">
                          {domainSearch ? 'No matching domains.' : 'No visited domains in the last 24 hours.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(visited_domains || []).length > 0 && (
                <div className="p-4 bg-slate-900/10 border-t border-slate-700/30 text-center text-[10px] text-slate-500 uppercase tracking-widest">
                  {filteredVisited.length} of {(visited_domains || []).length} domains · last 24h
                </div>
              )}
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-700/30">
                      <th className="px-6 py-3">Time</th>
                      <th className="px-6 py-3">Domain</th>
                      <th className="px-6 py-3 text-center">Status</th>
                      <th className="px-6 py-3">Answer</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {loading ? (
                      Array(5).fill(0).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan="4" className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-full" /></td>
                        </tr>
                      ))
                    ) : filteredHistory.length > 0 ? (
                      filteredHistory.map((q) => (
                        <tr key={q.id} className="border-b border-slate-800/30 hover:bg-white/[0.02] group transition-colors">
                          <td className="px-6 py-3 text-slate-500 font-mono whitespace-nowrap">
                            {new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/domains/detail?domain=${q.domain}`}
                                className="text-white hover:text-brand-400 font-medium transition-colors truncate max-w-xs md:max-w-md block"
                              >
                                {q.domain}
                              </Link>
                              <a href={`http://${q.domain}`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white">
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-center">
                              {q.status.startsWith('blocked') ? (
                                <span className="badge-red flex items-center gap-1">
                                  <AlertCircle size={10} /> {q.status.split('_').pop().toUpperCase()}
                                </span>
                              ) : (
                                <span className="badge-green flex items-center gap-1">
                                  <CheckCircle size={10} /> ALLOWED
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-slate-400 truncate max-w-[150px]">
                            {q.resolved_by || q.matched_rule || q.resolved_ip || '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-slate-600 italic">
                          {historySearch ? 'No matching history.' : 'No query history found for this client.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {history.length > 0 && (
                <div className="p-4 bg-slate-900/10 border-t border-slate-700/30 text-center">
                  <Link href={`/queries?client=${client.ip}`} className="text-brand-400 hover:text-brand-300 text-xs font-bold uppercase tracking-widest">
                    View All Activity Log
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

ClientDetail.propTypes = {
  user: PropTypes.object,
  total: PropTypes.number,
  blocked: PropTypes.number,
  top_domains: PropTypes.array,
  visited_domains: PropTypes.array,
  hourly: PropTypes.array,
  client: PropTypes.object,
  error: PropTypes.string,
}
