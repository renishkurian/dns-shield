import React from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { BookOpen, Terminal, Shield, Network, Zap, Sparkles, Users, Search, Database, Globe, Wand2, Cpu } from 'lucide-react'

export default function Documentation({ user: currentUser }) {
  return (
    <Layout user={currentUser} currentPath="/docs" title="Documentation">
      <div className="max-w-4xl mx-auto pb-20">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen size={32} className="text-brand-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-4">DNS Shield v2.0 Platform Guide</h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-pretty">
            A comprehensive guide to the identity-aware, AI-driven security features of DNS Shield. 
            Everything you need to configure, manage, and extend your network protection.
          </p>
        </div>

        <div className="space-y-10">
          {/* Section: Core Identity Filtering */}
          <section className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><Users size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Identity-Based Filtering (Block Groups)</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                The core of DNS Shield v2.0 is <strong>Block Groups</strong>. Instead of one global policy, you can now define 
                granular security profiles for different types of users or devices.
              </p>
              <ul className="text-sm text-slate-400 space-y-2 mt-4 ml-6 list-disc">
                <li><strong>Creation</strong>: Define groups in <code>Administration &gt; Block Groups</code> (e.g. "Kids", "IoT", "Strict").</li>
                <li><strong>Assignment</strong>: Assign devices to groups via the <code>Network Map</code> or by mapping entire User accounts.</li>
                <li><strong>Enforcement</strong>: When a DNS query arrives, the proxy identifies the client IP/User and matches it against the dedicated group database in real-time.</li>
              </ul>
            </div>
          </section>

          {/* Section: Smart AI Integrations */}
          <section className="card border-2 border-purple-500/20 bg-purple-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg"><Sparkles size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight text-purple-300">Smart AI Features</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                DNS Shield integrates with LLMs (Gemini, Claude, ChatGPT) to provide autonomous protection and human-readable insights.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                  <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Wand2 size={14} /> AI App Generation</h3>
                  <p className="text-xs">Type an app name (e.g. "Steam") in the App Firewall and click the wand. The AI researches and generates the required domain list automatically.</p>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                  <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Cpu size={14} /> Behavioral Profiling</h3>
                  <p className="text-xs">The background worker groups client history and asks the AI to identify compromised behavior. Infected hosts are quarantined automatically.</p>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Configuration</h4>
                  <p className="text-[11px]">Enable and provide your provider API Key in <code>Settings &gt; AI Integrations</code>.</p>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">On-Demand Analysis</h4>
                  <p className="text-[11px]">Click any domain in the <strong>Query Log</strong> and select <em>"Ask AI"</em> for an instant technical breakdown.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section: App Firewall */}
          <section className="card border-2 border-brand-500/20 bg-brand-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-lg"><Shield size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">App Firewall Categories</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                Block entire service ecosystems with one click. We map obscure CDN addresses (e.g., <code>nflxvideo.net</code>) 
                to friendly categories like <strong>Netflix</strong>.
              </p>
              <p>
                Toggle categories globally or per-group. Use the <strong>AI Auto-Fill</strong> feature to define custom apps for your organization instantly.
              </p>
            </div>
          </section>

          {/* Section: Network & VPN */}
          <section className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><Network size={20} /></div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Network Map</h2>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  Visualizes all connected devices via local network scanning. Identify hardware vendors, OS types, 
                  and link devices directly to security policies.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg"><Shield size={20} /></div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Wireguard VPN</h2>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  Maintain protection while traveling. Generate Wireguard peers, get instant QR codes, 
                  and route remote DNS queries through your local AI Shields.
                </p>
              </div>
            </div>
          </section>

          {/* Section: Unbound & DNS */}
          <section className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Globe size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Recursive Resolving (Unbound)</h2>
            </div>
            <div className="prose prose-invert prose-slate max-w-none prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-400">
              <p>
                For maximum privacy, DNS Shield can use a local <strong>Unbound</strong> recursive resolver.
              </p>
              <ul className="text-sm text-slate-400 space-y-2 mt-4 ml-6 list-disc">
                <li><strong>Auto-Detection</strong>: Navigate to <code>Settings &gt; DNS Config</code> and click "Auto-detect". The system will find your local Unbound service automatically.</li>
                <li><strong>Local-only</strong>: By using Unbound, strictly zero DNS queries are sent to public providers (like Google or Cloudflare).</li>
              </ul>
            </div>
          </section>

          {/* Section: Traditional Controls */}
          <section className="card">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="space-y-3">
                 <h3 className="font-bold text-white flex items-center gap-2"><Database size={16} /> Gravity Lists</h3>
                 <p className="text-xs text-slate-500">Subscribe to massive community-maintained blocklists for ads and telemetry tracking.</p>
               </div>
               <div className="space-y-3">
                 <h3 className="font-bold text-white flex items-center gap-2"><Search size={16} /> SafeSearch</h3>
                 <p className="text-xs text-slate-500">Force strict filtering for children on Google, Bing, DuckDuckGo, and YouTube via CNAME redirection.</p>
               </div>
               <div className="space-y-3">
                 <h3 className="font-bold text-white flex items-center gap-2"><Zap size={16} /> Patterns</h3>
                 <p className="text-xs text-slate-500">Use standard Wildcards or advanced Regex to block or allow domains based on naming conventions.</p>
               </div>
             </div>
          </section>

          {/* Section: CLI Operations */}
          <section className="card border-slate-700/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-800 text-slate-400 rounded-lg"><Terminal size={20} /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Maintenance Commands</h2>
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
                    <td className="py-4">Starts the AI DNS Proxy. Must be run with sudo to bind to port 53.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py update_gravity</code></td>
                    <td className="py-4">Download and ingest all configured blocklists.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py run_ai_worker</code></td>
                    <td className="py-4 text-purple-400">Starts the AI Behavioral Profiling and Quarantining engine.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py seed_data --queries 100</code></td>
                    <td className="py-4 text-brand-400">Seeds the database with <strong>N</strong> realistic test queries for diagnostic purposes. Includes varied DNS types, DNSSEC statuses, cache hits, and blocked origins.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py seed_data --clear</code></td>
                    <td className="py-4 text-red-400">Permanently deletes <strong>all</strong> query log entries. Use to reset the database to a clean state during testing.</td>
                  </tr>
                  <tr>
                    <td className="py-4 pr-4"><code>python manage.py seed_data --clear --queries 50</code></td>
                    <td className="py-4 text-yellow-400">Combines clear and seed in one step: wipes all existing logs and immediately seeds 50 fresh test entries.</td>
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
