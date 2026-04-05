import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { 
  Network, Search, RefreshCw, Monitor, Smartphone, 
  Watch, Laptop, Tablet, Wifi, Info, Tag, User
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const getDeviceIcon = (vendor = "", hostname = "") => {
  const v = vendor.toLowerCase();
  const h = hostname.toLowerCase();
  if (v.includes('apple') || h.includes('iphone') || h.includes('ipad')) return h.includes('ipad') ? Tablet : Smartphone;
  if (v.includes('samsung') || v.includes('google')) return Smartphone;
  if (h.includes('watch')) return Watch;
  if (h.includes('laptop') || h.includes('macbook')) return Laptop;
  return Monitor;
}

export default function NetworkMap({ user: currentUser, clients: initialClients = [] }) {
  const [clients, setClients] = useState(initialClients)
  const [scanning, setScanning] = useState(false)

  const runScan = async () => {
    setScanning(true)
    const res = await fetch('/api/network/scan', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) {
      setTimeout(() => {
        setScanning(false)
        // Refresh page to get new clients
        window.location.reload()
      }, 5000)
    } else {
      setScanning(false)
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
          <p className="text-sm text-slate-500">Discover and identify devices on your local network</p>
        </div>
        <button 
          onClick={runScan} 
          disabled={scanning}
          className="md:ml-auto btn-primary shrink-0"
        >
          <Search size={14} className={scanning ? 'animate-pulse' : ''} />
          {scanning ? 'Scanning Subnet...' : 'Run Discovery Scan'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {clients.map(c => {
          const Icon = getDeviceIcon(c.vendor, c.hostname)
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

              <h3 className="text-sm font-bold text-white truncate mb-1">
                {c.hostname || c.comment || "Unknown Device"}
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <Wifi size={10} className="text-slate-600" />
                  {c.ip}
                </div>
                {c.mac && (
                   <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                    <Tag size={10} className="text-slate-700" />
                    {c.mac}
                  </div>
                )}
                {c.vendor && (
                  <div className="text-[10px] text-slate-500 italic mt-2 truncate">
                    {c.vendor}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                   <User size={10} />
                   <span>{c.group_name || 'Global'}</span>
                </div>
                <button className="text-[10px] font-bold text-brand-400 hover:text-brand-300 uppercase tracking-wider">
                  Manage
                </button>
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
            <h4 className="text-white font-bold text-sm mb-2">Automated Topology Discovery</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <p className="text-xs text-slate-400 leading-relaxed">
                DNS Shield uses ARP and Ping scanning to identify every device on your network. 
                Identifying devices by hostname and MAC address allows you to apply group rules to hardware, 
                complementing our identity-based user filtering.
              </p>
              <ul className="text-[11px] text-slate-500 space-y-2">
                <li className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-brand-500" />
                   Fingerprint device types and operating systems
                </li>
                 <li className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-brand-500" />
                   Map hardware vendors to MAC address ranges
                </li>
                 <li className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-brand-500" />
                   Monitor connectivity status in real-time
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

