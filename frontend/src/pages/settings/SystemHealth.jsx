import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { HardDrive, Cpu, MemoryStick, Clock, Database, Server, Thermometer, RefreshCw } from 'lucide-react'

function GaugeBar({ percent, color = 'brand' }) {
  const colors = {
    brand: 'bg-brand-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }
  const barColor = percent > 90 ? colors.red : percent > 70 ? colors.yellow : colors[color] || colors.brand
  return (
    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  )
}
GaugeBar.propTypes = { percent: PropTypes.number, color: PropTypes.string }

function StatBlock({ icon: Icon, label, value, sub, percent, iconColor }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl bg-slate-800 ${iconColor ?? 'text-brand-400'}`}>
          <Icon size={20} />
        </div>
        <span className="text-2xl font-bold text-white">{value}</span>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-2">{label}</p>
      {percent !== undefined && <GaugeBar percent={percent} />}
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}
StatBlock.propTypes = { icon: PropTypes.elementType, label: PropTypes.string, value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), sub: PropTypes.string, percent: PropTypes.number, iconColor: PropTypes.string }

function fmt(uptime) {
  if (!uptime) return '—'
  const { days, hours, minutes } = uptime
  const parts = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

export default function SystemHealth({ user }) {
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/health')
      if (res.ok) setHealth(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <Layout user={user} currentPath="/settings/health" title="System Health">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">System Health</h2>
          <p className="text-sm text-slate-500">Real-time hardware & software metrics</p>
        </div>
        <button onClick={load} className="btn-ghost" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !health && (
        <div className="text-center py-20">
          <RefreshCw size={28} className="animate-spin text-brand-400 mx-auto mb-3" />
          <p className="text-slate-500">Loading system stats…</p>
        </div>
      )}

      {health && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatBlock
              icon={MemoryStick}
              label="Memory Usage"
              value={`${health.memory?.used_mb ?? '—'} MB`}
              sub={`of ${health.memory?.total_mb ?? '—'} MB total`}
              percent={health.memory?.percent}
              iconColor="text-purple-400"
            />
            <StatBlock
              icon={HardDrive}
              label="Disk Usage"
              value={`${health.disk?.used_gb ?? '—'} GB`}
              sub={`of ${health.disk?.total_gb ?? '—'} GB · ${health.disk?.free_gb ?? '—'} GB free`}
              percent={health.disk?.percent}
              iconColor="text-brand-400"
            />
            <StatBlock
              icon={Clock}
              label="System Uptime"
              value={fmt(health.uptime)}
              iconColor="text-green-400"
            />
            <StatBlock
              icon={Thermometer}
              label="CPU Temperature"
              value={health.cpu_temp_c != null ? `${health.cpu_temp_c}°C` : 'N/A'}
              sub={health.cpu_temp_c != null ? (health.cpu_temp_c > 70 ? '⚠ Hot' : 'Normal') : 'Not available'}
              percent={health.cpu_temp_c != null ? Math.min(health.cpu_temp_c * 100 / 85, 100) : undefined}
              iconColor={health.cpu_temp_c > 70 ? 'text-red-400' : 'text-yellow-400'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <Database size={16} className="text-brand-400" /> Database
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Database size</span>
                  <span className="text-white font-mono">{health.db_size_mb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total queries stored</span>
                  <span className="text-white font-mono">{health.total_queries?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <Server size={16} className="text-green-400" /> Memory Detail
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Used</span>
                  <span className="text-red-400 font-mono">{health.memory?.used_mb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Free</span>
                  <span className="text-green-400 font-mono">{health.memory?.free_mb} MB</span>
                </div>
                <GaugeBar percent={health.memory?.percent} />
                <p className="text-xs text-slate-600">{health.memory?.percent}% used</p>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

SystemHealth.propTypes = { user: PropTypes.object }
