import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Activity, Shield, Clock, Percent, TrendingUp } from 'lucide-react'
import { usePage } from '@inertiajs/react'

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

      // Hour label every 4 hours
      if (i % 4 === 0) {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.8)'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${String(hour.hour).padStart(2, '0')}:00`, x + barW / 2, H - 6)
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
    nxdomain:       'badge-gray',
  }
  const labels = {
    allowed:        'Allowed',
    blocked_pattern:'Pattern',
    blocked_domain: 'Domain',
    blocked_list:   'List',
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

// ─── Dashboard page ───────────────────────────────────────────────────────────
export default function Dashboard({ user, summary, hourly, topDomains, topClients, systemStatus }) {
  const [liveEntries, setLiveEntries] = useState([])
  const [wsConnected, setWsConnected] = useState(false)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws/queries`)
    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => {
      setWsConnected(false)
      setTimeout(() => {/* reconnect handled by component remount */}, 3000)
    }
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setLiveEntries(prev => [data, ...prev].slice(0, 50))
    }
    return () => ws.close()
  }, [])

  return (
    <Layout user={user} currentPath="/" title="Dashboard">
      {/* System status bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Overview</h2>
          <p className="text-sm text-slate-500">Today's traffic at a glance</p>
        </div>
        <SystemStatus status={systemStatus} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Queries Today"
          value={summary?.queries_today?.toLocaleString() ?? '0'}
          icon={Activity}
          color="brand"
        />
        <StatCard
          label="Blocked Today"
          value={summary?.blocked_today?.toLocaleString() ?? '0'}
          icon={Shield}
          color="red"
        />
        <StatCard
          label="Block Rate Today"
          value={`${summary?.block_percent ?? 0}%`}
          icon={Percent}
          color="yellow"
        />
        <StatCard
          label="Domains on Adlists"
          value={summary?.total_gravity?.toLocaleString() ?? '0'}
          icon={Shield}
          color="green"
        />
      </div>

      {/* Charts + tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Hourly chart */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Queries — last 24 hours</h3>
          </div>
          <HourlyChart data={hourly || []} />
        </div>

        {/* Top clients */}
        <div className="card">
          <h3 className="font-semibold text-white text-sm mb-4">Top Clients</h3>
          <div className="space-y-2">
            {(topClients || []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-300 truncate">{c.name || c.client_ip}</div>
                  {c.name && <div className="text-xs text-slate-600">{c.client_ip}</div>}
                </div>
                <span className="shrink-0 text-xs text-slate-500">{c.count?.toLocaleString()}</span>
              </div>
            ))}
            {!topClients?.length && <p className="text-slate-600 text-xs">No data yet</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top blocked domains */}
        <div className="card">
          <h3 className="font-semibold text-white text-sm mb-4">Top Blocked Domains (24h)</h3>
          <div className="space-y-1.5">
            {(topDomains || []).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 w-4 text-right shrink-0">{i + 1}</span>
                <span className="flex-1 text-slate-300 font-mono text-xs truncate">{d.domain}</span>
                <span className="badge-red shrink-0">{d.count}</span>
              </div>
            ))}
            {!topDomains?.length && <p className="text-slate-600 text-xs">No blocked domains yet</p>}
          </div>
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
      </div>
    </Layout>
  )
}

Dashboard.propTypes = {
  user: PropTypes.object,
  summary: PropTypes.object,
  hourly: PropTypes.array,
  topDomains: PropTypes.array,
  topClients: PropTypes.array,
  systemStatus: PropTypes.object,
}
