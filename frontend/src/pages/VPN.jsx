import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { 
  Shield, Plus, Trash2, Key, Download, RefreshCw, 
  Settings, CheckCircle, Smartphone, Monitor, Server, 
  Cpu, Lock, Activity, Globe
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function VPN({ user: currentUser, server: initialServer, peers: initialPeers = [] }) {
  const [server, setServer] = useState(initialServer)
  const [peers, setPeers] = useState(initialPeers)
  const [peerForm, setPeerForm] = useState({ name: '', allowed_ips: '10.0.0.X/32' })
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    const res = await fetch('/api/vpn/status')
    if (res.ok) setStatus(await res.json())
  }

  const setupServer = async () => {
    setLoading(true)
    const res = await fetch('/api/vpn/server', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ name: 'wg0', listen_port: 51820, address: '10.0.0.1/24' })
    })
    if (res.ok) setServer(await res.json())
    setLoading(false)
  }

  const addPeer = async () => {
    if (!peerForm.name) return
    setLoading(true)
    const res = await fetch('/api/vpn/peers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(peerForm)
    })
    if (res.ok) {
      setPeers([...peers, await res.json()])
      setPeerForm({ name: '', allowed_ips: '10.0.0.X/32' })
    }
    setLoading(false)
  }

  const deletePeer = async (id) => {
    if (!confirm('Delete this peer?')) return
    const res = await fetch(`/api/vpn/peers/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) setPeers(peers.filter(p => p.id !== id))
  }

  const syncConfig = async () => {
    setSyncing(true)
    await fetch('/api/vpn/sync', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } })
    setSyncing(false)
    fetchStatus()
  }

  const downloadConfig = async (id, name) => {
    const res = await fetch(`/api/vpn/peers/${id}/config`)
    if (res.ok) {
      const data = await res.json()
      const blob = new Blob([data.config], { type: 'text/plain' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.conf`
      a.click()
    }
  }

  return (
    <Layout user={currentUser} currentPath="/vpn" title="Wireguard VPN">
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-brand-400" />
            Wireguard VPN
          </h2>
          <p className="text-sm text-slate-500">Secure remote access with native identity integration</p>
        </div>
        <div className="md:ml-auto flex items-center gap-2">
          <button 
            onClick={syncConfig} 
            disabled={syncing}
            className="btn-ghost text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Applying...' : 'Apply Changes'}
          </button>
        </div>
      </div>

      {!server ? (
        <div className="card text-center py-20 bg-brand-500/5 border-dashed border-brand-500/30">
          <Cpu size={48} className="text-slate-700 mx-auto mb-4" />
          <h3 className="text-white font-bold mb-2 text-lg">Initialize VPN Server</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto mb-8">
            Set up the Wireguard interface (wg0) to enable secure encrypted tunnels for your mobile devices and remote clients.
          </p>
          <button onClick={setupServer} disabled={loading} className="btn-primary px-8">
            {loading ? 'Initializing...' : 'Setup Wireguard Server'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Server Info Card */}
          <div className="card h-fit">
            <div className="flex items-center gap-2 mb-4">
              <Server size={18} className="text-brand-400" />
              <h3 className="font-bold text-white text-sm">Server Configuration</h3>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Public Key</label>
                <div className="text-[11px] font-mono text-slate-300 break-all">{server.public_key}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Port</label>
                  <div className="text-sm font-bold text-white">{server.listen_port}</div>
                </div>
                <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Address</label>
                  <div className="text-sm font-bold text-white">{server.address}</div>
                </div>
              </div>
              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20 flex items-center gap-3">
                <Activity size={16} className="text-emerald-400" />
                <div>
                  <div className="text-[10px] font-black text-emerald-500 uppercase">Status</div>
                  <div className="text-xs font-bold text-emerald-400">wg0 is active</div>
                </div>
              </div>
            </div>

            <div className="mt-8">
               <div className="flex items-center gap-2 mb-4">
                <Plus size={18} className="text-brand-400" />
                <h3 className="font-bold text-white text-sm">Add New Peer</h3>
              </div>
              <div className="space-y-3">
                <input 
                  className="input text-xs" 
                  placeholder="Device Name (e.g. Phone)" 
                  value={peerForm.name}
                  onChange={e => setPeerForm({...peerForm, name: e.target.value})}
                />
                <input 
                  className="input text-xs" 
                  placeholder="Allowed IP (e.g. 10.0.0.5/32)" 
                  value={peerForm.allowed_ips}
                  onChange={e => setPeerForm({...peerForm, allowed_ips: e.target.value})}
                />
                <button onClick={addPeer} disabled={loading || !peerForm.name} className="btn-primary w-full justify-center">
                  {loading ? 'Generating...' : 'Add Device'}
                </button>
              </div>
            </div>
          </div>

          {/* Peers List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-0 overflow-hidden">
               <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/30 border-b border-slate-700/50">
                  <tr className="text-xs font-medium text-slate-400">
                    <th className="px-6 py-4">Client Device</th>
                    <th className="px-6 py-4">Internal IP</th>
                    <th className="px-6 py-4">Last Handshake</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {peers.map(p => {
                    const peerStatus = status[p.public_key];
                    const active = peerStatus && (Date.now() - new Date(peerStatus.latest_handshake * 1000) < 180000); // 3 mins

                    return (
                      <tr key={p.id} className="hover:bg-slate-700/20 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-8 h-8 rounded-lg flex items-center justify-center 
                              ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}
                            `}>
                              {p.name.toLowerCase().includes('phone') ? <Smartphone size={16} /> : <Monitor size={16} />}
                            </div>
                            <div>
                              <div className="font-bold text-white">{p.name}</div>
                              <div className="text-[9px] text-slate-500 font-mono scale-90 -translate-x-1 origin-left truncate w-24">
                                {p.public_key}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-brand-400">{p.allowed_ips.split('/')[0]}</span>
                        </td>
                        <td className="px-6 py-4">
                          {peerStatus ? (
                            <div className="flex flex-col">
                              <span className="text-slate-300 font-medium">
                                {new Date(peerStatus.latest_handshake * 1000).toLocaleString()}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {peerStatus.transfer_rx} / {peerStatus.transfer_tx}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">Never</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => downloadConfig(p.id, p.name)}
                              className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg"
                              title="Download Config"
                            >
                              <Download size={16} />
                            </button>
                            <button 
                               onClick={() => deletePeer(p.id)}
                               className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                               title="Delete Peer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!peers.length && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-600 italic">
                        No VPN peers configured. Add your first device to start.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

             <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex gap-4">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <Lock size={20} className="text-emerald-400" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm mb-1">Why use VPN for DNS?</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Wireguard allows your mobile devices to use DNS Shield security even when you're away from home. 
                  All queries are encrypted and subject to your group-based blocking policies.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

VPN.propTypes = {
  user: PropTypes.object,
  server: PropTypes.object,
  peers: PropTypes.array,
}

