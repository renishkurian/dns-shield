import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Activity, Shield, Clock, Percent, TrendingUp, PieChart } from 'lucide-react'
import DoughnutChart from '../components/DoughnutChart'
import { Link } from '@inertiajs/react'

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'brand' }) {
  const colors = {
    brand:   'from-brand-500/20 to-brand-600/10 border-brand-500/30 text-brand-400',
    red:     'from-red-500/20 to-red-600/10 border-red-500/30 text-red-400',
    green:   'from-green-500/20 to-green-600/10 border-green-500/30 text-green-400',
    yellow:  'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-400',
  }
  return (
    <div className={`stat-card bg-gradient-to-br ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        {Icon && <Icon size={20} className={colors[color].split(' ').at(-1)} />}
      </div>
    </div>
  )
}

StatCard.propTypes = {
  label: PropTypes.string, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  sub: PropTypes.string, icon: PropTypes.elementType, color: PropTypes.string,
}

// ─── Hourly bar chart (Canvas API) ───────────────────────────────────────────
function HourlyChart({ data }) {
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
    const barW = (W - 32) / 24
    const chartH = H - 30

    ctx.clearRect(0, 0, W, H)

    data.forEach((hour, i) => {
      const x = 16 + i * barW
      const total = hour.allowed + hour.blocked
      const totalH = (total / max) * chartH

      // Stacked: allowed (blue) + blocked (red)
      const blockedH = (hour.blocked / max) * chartH
      const allowedH = totalH - blockedH

      // Allowed bar
      ctx.fillStyle = 'rgba(14, 165, 233, 0.6)'
      ctx.beginPath()
      ctx.roundRect(x + 1, chartH - totalH + blockedH, barW - 2, allowedH, [2])
      ctx.fill()

      // Blocked bar
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)'
      ctx.beginPath()
      ctx.roundRect(x + 1, chartH - blockedH, barW - 2, blockedH, [2])
      ctx.fill()

      // label every 4 hours or all for small datasets
      if (i % 4 === 0 || data.length < 12) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(hour.label || `${hour.hour}:00`, x + barW / 2, H - 6)
      }
    })

    // Legend
    ctx.fillStyle = 'rgba(14, 165, 233, 0.8)'
    ctx.fillRect(W - 120, 6, 10, 10)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px Inter'
    ctx.textAlign = 'left'
    ctx.fillText('Allowed', W - 106, 15)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'
    ctx.fillRect(W - 55, 6, 10, 10)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Blocked', W - 41, 15)
  }, [data])

  return (
    <div className="relative w-full" style={{ height: 160 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}

HourlyChart.propTypes = { data: PropTypes.array }

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    allowed:        'badge-green',
    blocked_pattern:'badge-red',
    blocked_domain: 'badge-red',
    blocked_list:   'badge-yellow',
    blocked_ai:     'badge-red',
    blocked_client: 'badge-red',
    nxdomain:       'badge-gray',
  }
  const labels = {
    allowed:        'Allowed',
    blocked_pattern:'Pattern',
    blocked_domain: 'Domain',
    blocked_list:   'List',
    blocked_ai:     'AI',
    blocked_client: 'Client',
    nxdomain:       'NXDOMAIN',
  }
  return <span className={map[status] || 'badge-gray'}>{labels[status] || status}</span>
}

StatusBadge.propTypes = { status: PropTypes.string }

// ─── Live mini feed ───────────────────────────────────────────────────────────
function LiveFeed({ entries }) {
  return (
    <div className="space-y-1 font-mono text-xs">
      {entries.slice(0, 10).map((e, i) => (
        <div key={i} className={`flex items-center gap-2 py-1 border-b border-slate-800 ${
          e.status?.startsWith('blocked') ? 'text-red-400' : 'text-green-400'
        }`}>
          <span className="text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
          <span className="truncate flex-1 text-slate-300">{e.domain}</span>
          <span className="shrink-0 text-slate-500">{e.client_ip}</span>
          <StatusBadge status={e.status} />
        </div>
      ))}
      {!entries.length && (
        <div className="text-slate-600 text-center py-4">Waiting for queries…</div>
      )}
    </div>
  )
}

LiveFeed.propTypes = { entries: PropTypes.array }

// ─── System status ────────────────────────────────────────────────────────────
function SystemStatus({ status }) {
  const items = [
    { label: 'DNS Proxy', ok: status?.proxy_running },
    { label: 'Unbound',   ok: status?.unbound },
    { label: 'Redis',     ok: status?.redis },
  ]
  return (
    <div className="flex gap-4 flex-wrap">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={item.ok ? 'text-slate-400' : 'text-red-400'}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

SystemStatus.propTypes = { status: PropTypes.object }

// ─── Frequency table (Pi-hole style) ───────────────────────────────────────────
function FrequencyTable({ title, data, color = 'blue' }) {
  const maxCount = data?.length > 0 ? Math.max(...data.map(d => d.count)) : 1
  const fillColors = {
    green: 'bg-green-500/40',
    red: 'bg-red-500/40',
    blue: 'bg-brand-500/40',
  }

  return (
    <div className="card h-full">
      <h3 className="font-semibold text-white text-sm mb-4">{title}</h3>
      <div className="space-y-3">
        {(data || []).map((d, i) => {
          const percent = (d.count / maxCount) * 100
          const row = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-300 font-mono truncate mr-2 group-hover:text-brand-400 transition-colors" title={d.domain}>{d.domain}</span>
                <span className="text-slate-500 font-medium shrink-0">{d.count?.toLocaleString()} hits</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                  className={`h-full ${fillColors[color]} rounded-full transition-all duration-500 ease-out`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </>
          )
          return d.href ? (
            <Link key={i} href={d.href} className="text-xs group block cursor-pointer">
              {row}
            </Link>
          ) : (
            <div key={i} className="text-xs group">
              {row}
            </div>
          )
        })}
        {!data?.length && <p className="text-slate-600 text-xs italic">No domains recorded yet</p>}
      </div>
    </div>
  )
}

function AIInsightCard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchInsight = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats/ai-insight')
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsight()
  }, [])

  if (loading) return (
    <div className="card h-full flex flex-col justify-center items-center py-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-transparent animate-pulse" />
        <Activity size={32} className="text-brand-500/20 animate-bounce mb-4" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI analyzing threats...</p>
    </div>
  )

  const score = data?.risk_score || 0
  const scoreColor = score > 70 ? 'text-red-400' : score > 30 ? 'text-yellow-400' : 'text-emerald-400'

  return (
    <div className="card h-full bg-gradient-to-br from-slate-900 to-slate-950 border-brand-500/20 relative group overflow-hidden">
      <div className="absolute -right-12 -top-12 w-40 h-40 bg-brand-500/5 rounded-full blur-3xl group-hover:bg-brand-500/10 transition-all duration-700" />
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-brand-500/10 rounded-xl">
             <Shield size={16} className="text-brand-400" />
          </div>
          <h3 className="font-bold text-white text-sm">AI Security Guard</h3>
        </div>
        <div className={`text-xl font-black ${scoreColor} tracking-tighter`}>
          {score}<span className="text-[10px] text-slate-500 ml-0.5">/100</span>
        </div>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed italic mb-6">
        "{data?.insight || 'No significant threats detected in the last analysis cycle.'}"
      </p>

      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Detected Vectors</p>
        <div className="flex flex-wrap gap-2">
          {(data?.top_categories || ['Safe']).map(cat => (
            <span key={cat} className="px-2 py-1 bg-brand-500/10 border border-brand-500/20 rounded-lg text-[10px] font-bold text-brand-400 uppercase tracking-tight">
              {cat}
            </span>
          ))}
        </div>
      </div>

      <button 
        onClick={fetchInsight}
        className="mt-6 w-full py-2 bg-brand-500/5 hover:bg-brand-500/10 border border-brand-500/10 text-[10px] font-bold text-brand-400 uppercase tracking-widest rounded-xl transition-all"
      >
        Refresh Analysis
      </button>
    </div>
  )
}

FrequencyTable.propTypes = { title: PropTypes.string, data: PropTypes.array, color: PropTypes.string }

// ─── Dashboard page ───────────────────────────────────────────────────────────
export default function Dashboard({ user, summary: initialSummary, hourly: initialHourly, topDomains: initialTop, topAllowedDomains: initialTopAllowed, topClients: initialTopClients, systemStatus }) {
  const [liveEntries, setLiveEntries] = useState([])
  const [queryTypes, setQueryTypes] = useState([])
  const [upstreamStats, setUpstreamStats] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  
  // Phase 26 State
  const [range, setRange] = useState('24h')
  const [stats, setStats] = useState({
    summary: initialSummary,
    hourly: initialHourly,
    topDomains: initialTop,
    topAllowedDomains: initialTopAllowed,
    topClients: initialTopClients
  })

  const fetchStats = async (selectedRange = range) => {
    try {
      const r = selectedRange
      const [sRes, hRes, tdRes, tadRes, tcRes, qtRes, usRes] = await Promise.all([
        fetch(`/api/stats/summary?range=${r}`),
        fetch(`/api/stats/hourly?range=${r}`),
        fetch(`/api/stats/top-domains?range=${r}`),
        fetch(`/api/stats/top-allowed-domains?range=${r}`),
        fetch(`/api/stats/top-clients?range=${r}`),
        fetch(`/api/stats/query-types?range=${r}`),
        fetch(`/api/stats/upstream-servers?range=${r}`)
      ])

      const [sData, hData, tdData, tadData, tcData, qtData, usData] = await Promise.all([
        sRes.json(), hRes.json(), tdRes.json(), tadRes.json(), tcRes.json(), qtRes.json(), usRes.json()
      ])

      setStats({
        summary: sData,
        hourly: hData,
        topDomains: tdData,
        topAllowedDomains: tadData,
        topClients: tcData
      })

      setQueryTypes(qtData.map(d => ({ label: d.query_type, count: d.count })))
      setUpstreamStats(usData.map(d => {
        let color = null 
        if (d.label === 'Blocked') color = '#ef4444' 
        else if (d.label === 'Cache') color = '#06b6d4' 
        return { label: d.label, count: d.count, color }
      }))
    } catch (e) {
      console.error('Failed to fetch analytics:', e)
    }
  }

  useEffect(() => {
    fetchStats(range)
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws/queries`)
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => setWsConnected(false)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setLiveEntries(prev => [data, ...prev].slice(0, 50))
    }
    return () => ws.close()
  }, [range])

  return (
    <Layout user={user} currentPath="/" title="Dashboard">
      {/* System status bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Network Overview</h2>
          <div className="flex items-center gap-2 mt-1">
            <SystemStatus status={systemStatus} />
          </div>
        </div>
        
        <div className="flex items-center gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl">
          {['24h', '7d', '30d', 'all'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                range === r ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={`Queries (${range})`}
          value={stats.summary?.queries?.toLocaleString() ?? '0'}
          icon={Activity}
          color="brand"
        />
        <StatCard
          label={`Blocked (${range})`}
          value={stats.summary?.blocked?.toLocaleString() ?? '0'}
          sub={`${stats.summary?.block_percent ?? 0}% blocked`}
          icon={Shield}
          color="red"
        />
        <StatCard
          label="Avg Latency"
          value={`${stats.summary?.avg_latency_ms ?? 0}ms`}
          icon={TrendingUp}
          color="yellow"
        />
        <StatCard
          label="Total Gravity"
          value={stats.summary?.total_gravity?.toLocaleString() ?? '0'}
          sub="Domains in lists"
          icon={Percent}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 card flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Clock size={16} className="text-brand-400" />
              Traffic Frequency
            </h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Range: {range}</span>
          </div>
          <div className="flex-1 min-h-[160px]">
            <HourlyChart data={stats.hourly} />
          </div>
        </div>
        <div className="lg:col-span-1">
          <AIInsightCard />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-bold text-white text-sm mb-6 flex items-center gap-2">
            <PieChart size={16} className="text-brand-400" />
            Query Types
          </h3>
          <DoughnutChart data={queryTypes} size={150} thickness={20} />
        </div>

        <div className="card">
          <h3 className="font-bold text-white text-sm mb-6 flex items-center gap-2">
            <PieChart size={16} className="text-purple-400" />
            Upstream Servers
          </h3>
          <DoughnutChart data={upstreamStats} size={150} thickness={20} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <FrequencyTable title="Top Blocked Domains" data={stats.topDomains} color="red" />
        <FrequencyTable title="Top Allowed Domains" data={stats.topAllowedDomains} color="blue" />
        <FrequencyTable
          title="Top Clients"
          data={(stats.topClients || []).map(c => ({
            domain: c.name || c.client_ip,
            count: c.count,
            href: `/queries?client=${encodeURIComponent(c.client_ip)}`,
          }))}
          color="green"
        />
      </div>

      {/* Live feed */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
          <h3 className="font-semibold text-white text-sm">
            Live Query Feed
            {!wsConnected && <span className="text-xs text-slate-500 ml-2">(reconnecting…)</span>}
          </h3>
        </div>
        <LiveFeed entries={liveEntries} />
      </div>
    </Layout>
  )
}

Dashboard.propTypes = {
  user: PropTypes.object,
  summary: PropTypes.object,
  hourly: PropTypes.array,
  topDomains: PropTypes.array,
  topAllowedDomains: PropTypes.array,
  topClients: PropTypes.array,
  systemStatus: PropTypes.object,
}
