import React from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { BookOpen, Terminal, Shield, Network, Zap } from 'lucide-react'

export default function Documentation({ user: currentUser }) {
  return (
    <Layout user={currentUser} currentPath="/docs" title="Documentation">
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen size={32} className="text-brand-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-4">DNS Shield v2.0 Developer Documentation</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            A comprehensive guide to configuring, managing, and extending your identity-aware DNS platform.
          </p>
        </div>

        <div className="space-y-8">
          {/* Section 1: Architecture */}
          <section className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><Zap size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">System Architecture</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                DNS Shield replaces traditional single-threaded DNS engines with a decoupled, high-performance architecture. 
                DNS queries are resolved by an asynchronous Python proxy listening on port 53. The proxy maps incoming IP addresses 
                to users and forwards traffic through a high-speed domain matching engine.
              </p>
              <p>
                All database interactions (saving query logs) are offloaded to a background thread to prevent query lag. 
                The front-end is powered by a modern React 18 SPA via Inertia.js, communicating synchronously with a Django backend 
                and asynchronously via WebSockets for real-time traffic monitoring.
              </p>
            </div>
          </section>

          {/* Section 2: App Firewall Post-Installation */}
          <section className="card border-2 border-brand-500/20 bg-brand-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-lg"><Shield size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">App Firewall Configuration</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p className="font-bold text-white">How the App Firewall Works</p>
              <p>
                Unlike standard domain blocking, the App Firewall works by grouping thousands of associated CDNs, API endpoints, 
                and domains for a single service (e.g. "Social Media" or "Netflix").
              </p>
              
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 my-6">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Step 1: Define Policies</h3>
                <p className="text-xs">
                  Before you can use the App Firewall, you must create at least one <strong>Block Group</strong> (e.g. "Kids Network", "IoT Devices"). 
                  Navigate to <code>Administration &gt; Block Groups</code> in the sidebar.
                </p>
              </div>

              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 my-6">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Step 2: Assign Clients</h3>
                <p className="text-xs">
                  By default, block groups do nothing until clients are assigned to them. 
                  Go to the <code>Network Map</code> to assign individual devices to your group, or map an entire User profile to a group.
                </p>
              </div>

              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 my-6">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Step 3: Creating Custom Apps</h3>
                <p className="text-xs">
                  You can now create custom applications directly on the <strong>App Firewall</strong> page. 
                  Click the dashed <em>"Create Custom App"</em> block, enter a name, and paste a comma-separated list of domains that the application relies on.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Wireguard VPN Setup */}
          <section className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg"><Network size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Wireguard VPN Setup</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                The integrated Wireguard VPN allows remote devices to route their DNS directly through DNS Shield.
              </p>
              <ul className="text-sm text-slate-400 space-y-2 mt-4 ml-6 list-disc">
                <li>The physical server handles the <code>wg0</code> interface via `sudo wg-quick up wg0`.</li>
                <li>Ensure that port <strong>51820 (UDP)</strong> is forwarded on your main router to this machine.</li>
                <li>To add a client, navigate to <code>ADMINISTRATION &gt; VPN</code>, click "Add Peer", and scan the generated QR code with the official Wireguard mobile app.</li>
              </ul>
            </div>
          </section>

          {/* Section 4: CLI Operations */}
          <section className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Terminal size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Command Line Tools</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left font-mono">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-700/50">
                    <th className="py-3 pr-4">Command</th>
                    <th className="py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-400">
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py run_proxy</code></td>
                    <td className="py-4">Starts the raw UDP DNS Proxy on port 53. Must be run with sudo to bind to port 53.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py update_gravity</code></td>
                    <td className="py-4">Manually trigger a download and ingestion of all configured Adlists.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py create_default_settings</code></td>
                    <td className="py-4">Reseeds the database with standard network rules and SafeSearch parameters.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

Documentation.propTypes = {
  user: PropTypes.object,
}
