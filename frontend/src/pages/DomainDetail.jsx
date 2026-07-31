import React from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { 
  Globe, Shield, Clock, Users, ArrowLeft, 
  CheckCircle, AlertCircle, ExternalLink, Activity
} from 'lucide-react'

// --- Simple Line Chart (SVG) ---
function MiniLineChart({ data, width = 600, height = 120 }) {
  if (!data?.length) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-600 italic">
        No traffic history yet
      </div>
    )
  }
  const max = Math.max(...data.map(d => d.count || 0), 1)
  const denom = Math.max(data.length - 1, 1)
  const points = data.map((d, i) => {
    const x = (i / denom) * width
    const y = height - ((d.count || 0) / max) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(14 165 233 / 0.3)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d={`M 0,${height} L ${points} L ${width},${height} Z`}
        fill="url(#lineGrad)"
      />
      <polyline
        fill="none"
        stroke="rgb(14 165 233)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

export default function DomainDetail({
  user,
  domain = '',
  total_hits_30d = 0,
  status_split = [],
  top_clients = [],
  history = [],
  is_blocked = false,
  trust = null,
}) {
  const handleBack = () => window.history.back()
  const hits = total_hits_30d || 0
  const trustScore = trust?.trust_score
  const trustLabel = trust?.label

  return (
    <Layout user={user} currentPath="/queries" title={`Domain: ${domain || 'Unknown'}`}>
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm font-medium mb-6"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="card mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 ${
                is_blocked ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
              }`}>
                <Globe size={32} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">{domain || 'Unknown domain'}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`badge-${is_blocked ? 'red' : 'green'} flex items-center gap-1`}>
                    {is_blocked ? <Shield size={12} /> : <CheckCircle size={12} />}
                    {is_blocked ? 'Currently Blocked' : 'Currently Allowed'}
                  </span>
                  {trust && (
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      trustScore >= 70
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : trustScore <= 30
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      Trust {trustScore}/100 · {trustLabel || 'unknown'}
                    </span>
                  )}
                  {domain && (
                    <a href={`http://${domain}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest">
                      Open Site <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-8 px-6 py-2 bg-slate-900/50 border border-slate-700/30 rounded-2xl">
              <div className="text-center">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Hits (30d)</p>
                <p className="text-xl font-bold text-white">{hits.toLocaleString()}</p>
              </div>
              <div className="w-px bg-slate-800" />
              <div className="text-center">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Unique Clients</p>
                <p className="text-xl font-bold text-white">{top_clients.length}</p>
              </div>
              {trust && (
                <>
                  <div className="w-px bg-slate-800" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Trust Score</p>
                    <p className="text-xl font-bold text-white">{trustScore}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          {trust?.reason && (
            <p className="mt-4 text-xs text-slate-500 border-t border-slate-800 pt-4 leading-relaxed">
              {trust.reason}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 card">
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
              <Clock size={16} className="text-brand-400" />
              Traffic History (Last 30 Days)
            </h3>
            <div className="h-32 mb-4 bg-slate-900/20 rounded-xl p-4 border border-slate-800/50">
              <MiniLineChart data={history} />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2">
              <span>30 Days Ago</span>
              <span>Today</span>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
              <Users size={16} className="text-brand-400" />
              Top Clients
            </h3>
            <div className="space-y-4">
              {top_clients.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 text-[10px] font-bold">
                       {i + 1}
                     </div>
                     <span className="text-xs text-slate-300 font-mono">{c.client_ip}</span>
                   </div>
                   <span className="text-xs text-slate-500 font-bold">{c.count} hits</span>
                </div>
              ))}
              {top_clients.length === 0 && <p className="text-xs text-slate-600 italic">No client data.</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
             <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
               <Activity size={16} className="text-brand-400" />
               Status Breakdown
             </h3>
             <div className="space-y-3">
               {status_split.map((s, i) => (
                 <div key={i} className="text-xs">
                   <div className="flex justify-between mb-1.5">
                     <span className="text-slate-400 font-medium uppercase tracking-wider">{s.status.replace('_', ' ')}</span>
                     <span className="text-white font-bold">{s.count}</span>
                   </div>
                   <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                     <div 
                       className={`h-full rounded-full ${s.status === 'allowed' ? 'bg-green-500' : 'bg-red-500'}`}
                       style={{ width: `${hits ? (s.count / hits * 100) : 0}%` }}
                     />
                   </div>
                 </div>
               ))}
               {status_split.length === 0 && <p className="text-xs text-slate-600 italic">No query data.</p>}
             </div>
          </div>

          <div className="card bg-brand-500/5 border-brand-500/20">
             <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
               <Shield size={16} className="text-brand-400" />
               Security Context
             </h3>
             <p className="text-xs text-slate-500 leading-relaxed mb-6">
               This domain has been evaluated by the local DNS Shield policy. 
               {is_blocked 
                 ? " It is currently restricted based on active blocklists or pattern matching rules."
                 : " It is currently permitting traffic as it does not match any negative security filters."}
             </p>
             <div className="flex flex-col gap-2">
               <button className="btn-primary justify-center">
                 {is_blocked ? 'Whitelist Domain' : 'Block Domain'}
               </button>
             </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

DomainDetail.propTypes = {
  user: PropTypes.object,
  domain: PropTypes.string,
  total_hits_30d: PropTypes.number,
  status_split: PropTypes.array,
  top_clients: PropTypes.array,
  history: PropTypes.array,
  is_blocked: PropTypes.bool,
  trust: PropTypes.object,
}
