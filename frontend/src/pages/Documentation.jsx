import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import {
  BookOpen, Terminal, Shield, Network, Zap, Sparkles, Users, Search,
  Database, Globe, Wand2, Cpu, Wrench, ClipboardList, Activity, Key,
  BarChart2, Lock, Eye, HardDrive, Filter, CheckCircle, List, ShieldOff,
  Clock, Bell, ShieldAlert, Wifi
} from 'lucide-react'

function Section({ icon: Icon, title, color = 'brand', badge, children }) {
  const cls = {
    brand:  'bg-brand-500/10 text-brand-400 border-brand-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    green:  'bg-green-500/10 text-green-400 border-green-500/20',
    blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    red:    'bg-red-500/10 text-red-400 border-red-500/20',
    slate:  'bg-slate-800 text-slate-400 border-slate-700/50',
  }
  return (
    <section className={`card border ${cls[color]}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className={`p-2 rounded-lg ${cls[color]}`}><Icon size={20} /></div>
        <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
        {badge && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300">{badge}</span>}
      </div>
      <div className="text-sm text-slate-400 space-y-3 leading-relaxed">{children}</div>
    </section>
  )
}
Section.propTypes = { icon: PropTypes.elementType, title: PropTypes.string, color: PropTypes.string, badge: PropTypes.string, children: PropTypes.node }

function FeatureGrid({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
      {items.map((item, i) => (
        <div key={i} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            {item.icon && <item.icon size={13} className="text-brand-400 shrink-0" />}
            <span className="text-xs font-bold text-white">{item.title}</span>
          </div>
          <p className="text-xs text-slate-500">{item.desc}</p>
        </div>
      ))}
    </div>
  )
}
FeatureGrid.propTypes = { items: PropTypes.array }

function ApiRow({ method, path, desc }) {
  const colors = { GET: 'bg-green-500/20 text-green-300', POST: 'bg-blue-500/20 text-blue-300', DELETE: 'bg-red-500/20 text-red-300', PATCH: 'bg-yellow-500/20 text-yellow-300' }
  return (
    <tr className="border-b border-slate-800/50">
      <td className="py-2.5 pr-3 align-top"><span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${colors[method]}`}>{method}</span></td>
      <td className="py-2.5 pr-4 align-top"><code className="text-xs text-slate-300 whitespace-nowrap">{path}</code></td>
      <td className="py-2.5 text-xs text-slate-500">{desc}</td>
    </tr>
  )
}
ApiRow.propTypes = { method: PropTypes.string, path: PropTypes.string, desc: PropTypes.string }

function CliRow({ cmd, desc, color }) {
  return (
    <tr>
      <td className="py-3 pr-6 align-top"><code className="text-xs text-slate-300 whitespace-nowrap">{cmd}</code></td>
      <td className={`py-3 text-xs ${color ?? 'text-slate-400'}`}>{desc}</td>
    </tr>
  )
}
CliRow.propTypes = { cmd: PropTypes.string, desc: PropTypes.node, color: PropTypes.string }

export default function Documentation({ user: currentUser }) {
  const [tab, setTab] = useState('features')

  return (
    <Layout user={currentUser} currentPath="/docs" title="Documentation">
      <div className="max-w-4xl mx-auto pb-20">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen size={32} className="text-brand-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-3">DNS Shield v2.0 Platform Guide</h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm">
            Complete documentation — every feature, API endpoint, and CLI command.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 mb-8">
          {[
            { id: 'features', label: 'Feature Guide' },
            { id: 'api',      label: 'API Reference' },
            { id: 'cli',      label: 'CLI Commands' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${tab === t.id ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── FEATURES ─── */}
        {tab === 'features' && (
          <div className="space-y-6">
            <Section icon={BarChart2} title="Dashboard & Analytics" color="brand" badge="Pi-hole parity">
              <p>Real-time network overview with premium SVG analytics refreshed via WebSocket push.</p>
              <FeatureGrid items={[
                { icon: BarChart2, title: 'Summary Stats', desc: 'Queries today, blocked count, block rate %, gravity list size — live from DB.' },
                { icon: BarChart2, title: 'Hourly Traffic Chart', desc: 'Line chart of allowed vs. blocked queries for the last 24 hours.' },
                { icon: BarChart2, title: 'Query Types Chart', desc: 'Doughnut chart: A, AAAA, HTTPS, TXT distribution.' },
                { icon: BarChart2, title: 'Upstream Servers Chart', desc: 'Per-resolver breakdown: Cache, Cloudflare, Google, Blocked.' },
                { icon: List, title: 'Top Domains', desc: 'Top 10 blocked and top 10 allowed domains (24h).' },
                { icon: Users, title: 'Top Clients', desc: 'Most active devices with name labels.' },
              ]} />
            </Section>

            <Section icon={List} title="Query Log" color="blue" badge="Live WebSocket">
              <p>Real-time, searchable DNS traffic log with per-query technical metadata.</p>
              <FeatureGrid items={[
                { icon: Eye, title: 'Live Feed', desc: 'Queries stream via WebSocket — no page refresh.' },
                { icon: Filter, title: 'Advanced Filters', desc: 'Filter by status, client IP, domain, and time range.' },
                { icon: Eye, title: 'Query Inspector', desc: 'Side panel with TTL, latency, DNSSEC status, and resolution path.' },
                { icon: CheckCircle, title: '"Answered By" Field', desc: 'Every query shows its source: Cache, upstream IP, or Blocked (by which rule).' },
                { icon: Lock, title: 'DNSSEC Status', desc: 'SECURE / INSECURE per query, exposing DNS chain-of-trust integrity.' },
                { icon: Shield, title: 'Quick Block/Allow', desc: 'One-click block or allow directly from the log row.' },
              ]} />
              <p>Export all logs to CSV: <code className="text-xs">GET /api/queries/export</code></p>
            </Section>

            <Section icon={Shield} title="Multi-Layer Blocking Engine" color="red">
              <p>Five independent blocking layers evaluated in priority order on every DNS query.</p>
              <FeatureGrid items={[
                { icon: Shield, title: 'Exact Domain Block', desc: 'Block specific FQDNs. Wildcard option blocks all subdomains.' },
                { icon: Zap, title: 'Regex Patterns', desc: 'Full Python re engine: match by extension, keyword, URL path, or custom regex.' },
                { icon: CheckCircle, title: 'Allowlist', desc: 'Bypass all rules for trusted domains. Supports exact, wildcard, and regex.' },
                { icon: Database, title: 'Gravity / Adlists', desc: 'Remote blocklists (hosts, ABP, plain text). Shows domain count, last sync, and errors.' },
                { icon: Sparkles, title: 'AI Threat Detection', desc: 'LLM-based DGA and behavioural threat engine. Catches threats that lists cannot.' },
                { icon: Search, title: 'SafeSearch Enforcement', desc: 'Force SafeSearch via CNAME on Google, Bing, YouTube, DuckDuckGo, Yandex.' },
              ]} />
            </Section>

            <Section icon={ShieldOff} title="Timed Shield Control" color="yellow">
              <p>Temporarily pause all DNS filtering — identical to Pi-hole&apos;s disable button.</p>
              <ul className="list-disc ml-5 space-y-1 mt-2">
                <li>Sidebar widget visible to Admin users only.</li>
                <li>Intervals: <strong>10m, 30m, 1h, 2h, 4h, 12h, 24h</strong>, or Indefinitely.</li>
                <li>Live countdown timer in the sidebar; one-click resume.</li>
                <li>Query Log shows <code className="text-xs">(Shield Off)</code> in resolved-by while disabled.</li>
                <li>State persisted in DB — survives server restarts.</li>
              </ul>
            </Section>

            <Section icon={Wrench} title="Tools (Pi-hole parity)" color="yellow" badge="New in v2.1">
              <FeatureGrid items={[
                { icon: Search, title: 'Domain Search', desc: 'Instantly search any domain across all rules: blocklists, gravity, patterns, allowlist. Shows which rule matched with one-click override. Navigate: Tools → Domain Search.' },
                { icon: ClipboardList, title: 'Audit Log', desc: 'Shows blocked domains (72h) with no explicit user rule. Review and allow/block permanently. Navigate: Tools → Audit Log.' },
                { icon: Activity, title: 'System Health', desc: 'Memory usage gauge, disk gauge, CPU temperature (Raspberry Pi), uptime, DB size. Navigate: Tools → System Health.' },
              ]} />
            </Section>

            <Section icon={Clock} title="Scheduled Blocking" color="purple" badge="New in v2.1">
              <p>Automate your security posture by enabling or disabling rules based on the time of day and day of week.</p>
              <ul className="list-disc ml-5 space-y-1 mt-2">
                <li>Create schedules for domains, patterns, or app categories.</li>
                <li>Visual day/time selector with 1-minute precision.</li>
                <li>Powered by an asynchronous <code className="text-xs">APScheduler</code> background worker.</li>
                <li>Perfect for "Work Hours" focus or "Bedtime" safety for specific client groups.</li>
              </ul>
              <p className="mt-2 text-xs italic text-slate-500">Navigate: Blocking → Schedules</p>
            </Section>

            <Section icon={Bell} title="Alerts & Notifications" color="red" badge="New in v2.1">
              <p>Get notified instantly when security events or system issues occur.</p>
              <FeatureGrid items={[
                { icon: ShieldAlert, title: 'Malware Hits', desc: 'Alert when a device on your network attempts to contact a known-malicious domain.' },
                { icon: Wifi, title: 'New Devices', desc: 'Immediate notification when an unknown MAC address joins the network.' },
                { icon: Database, title: 'Gravity Failures', desc: 'Alerts if a scheduled blocklist update fails or a remote list is unreachable.' },
                { icon: Bell, title: 'Multi-Channel', desc: 'Supports Email (SMTP), Slack Webhooks, Telegram Bots, and Custom Webhooks.' },
              ]} />
              <p className="mt-2 text-[10px] text-slate-500 uppercase font-bold">Configure: Settings → Alerts</p>
            </Section>

            <Section icon={Search} title="Global Command Palette" color="brand" badge="New in v2.1">
              <p>Lightning-fast navigation and data discovery via <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white text-[10px]">Ctrl+K</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white text-[10px]">⌘K</kbd>.</p>
              <ul className="list-disc ml-5 space-y-1 mt-2">
                <li><strong>Fuzzy Search:</strong> Instantly find clients by IP or name, domains in the log, or any system page.</li>
                <li><strong>Keyboard First:</strong> Navigate results with arrow keys and Enter, without leaving the keyboard.</li>
                <li><strong>Contextual Actions:</strong> Quick links to recent pages and common tools.</li>
              </ul>
            </Section>

            <Section icon={Activity} title="Notification Centre" color="blue" badge="New in v2.1">
              <p>A real-time "Intelligence Drawer" accessible via the bell icon in the top bar.</p>
              <ul className="list-disc ml-5 space-y-1 mt-2">
                <li>Live stream of security events and system triggers.</li>
                <li>Persistent history of the last 10 critical events.</li>
                <li>Direct links to the <strong>Intelligence Log</strong> for deep-dive investigation.</li>
              </ul>
            </Section>

            <Section icon={BarChart2} title="Historical Stats API" color="brand" badge="New in v2.1">
              <p>Query per-day traffic trends for up to 30 days.</p>
              <p><code className="text-xs">GET /api/stats/history?days=7</code> — returns <code className="text-xs">day, total, blocked</code> per day, ready to drive custom Grafana dashboards.</p>
            </Section>

            <Section icon={Key} title="API Token" color="slate" badge="New in v2.1">
              <p>Per-user 64-character hex tokens for external integrations (Grafana, Home Assistant, scripts).</p>
              <ul className="list-disc ml-5 space-y-1 mt-2">
                <li>Generate, copy, regenerate, or revoke from <code className="text-xs">Profile → API Token</code>.</li>
                <li>Revoking immediately invalidates the old token.</li>
              </ul>
            </Section>

            <Section icon={Sparkles} title="AI Features" color="purple" badge="Exclusive">
              <FeatureGrid items={[
                { icon: Cpu, title: 'Behavioural Profiling', desc: 'Background worker analyses per-client DNS history. Quarantines compromised hosts automatically.' },
                { icon: Wand2, title: 'AI App Generation', desc: 'App Firewall → type an app name → click ✦. AI researches CDN domains and builds the blocklist.' },
                { icon: Eye, title: 'On-Demand Analysis', desc: 'Query Log → click domain → "Ask AI" for plain-English threat analysis.' },
                { icon: Shield, title: 'DGA Detection', desc: 'Identifies algorithmically-generated domains used by botnets — Pi-hole cannot do this.' },
              ]} />
              <p className="mt-3">Configure at <code className="text-xs">Settings → AI Integrations</code>. Supports Gemini, Claude, OpenAI.</p>
            </Section>

            <Section icon={Users} title="Block Groups & Identity Filtering" color="blue">
              <ul className="list-disc ml-5 space-y-1">
                <li>Create groups (e.g. "Kids", "IoT", "Work") in <code className="text-xs">Administration → Block Groups</code>.</li>
                <li>Assign any rule (domain, pattern, adlist, allowlist, app category) to a specific group.</li>
                <li>Map client IPs to groups via Network Map or Clients page.</li>
                <li>Queries resolved in real-time against the correct group policy per client IP.</li>
              </ul>
            </Section>

            <Section icon={Network} title="Network, VPN & DNS" color="green">
              <FeatureGrid items={[
                { icon: Network, title: 'Network Map', desc: 'ARP scan discovers devices. Assign groups visually. Identify vendor and hostname.' },
                { icon: Shield, title: 'WireGuard VPN', desc: 'Full peer management, config downloads, QR codes. Remote devices use your DNS Shield.' },
                { icon: Globe, title: 'DoH Setup Wizard', desc: 'Step-by-step DNS-over-HTTPS via Cloudflare Tunnel for secure mobile DNS.' },
                { icon: Globe, title: 'Unbound Integration', desc: 'Auto-detect Unbound. Zero queries to public providers. Config: Settings → DNS Config.' },
                { icon: HardDrive, title: 'Backup / Teleporter', desc: 'Export full config JSON. Re-import on a new device. Config: Settings → Backup.' },
              ]} />
            </Section>
          </div>
        )}

        {/* ─── API ─── */}
        {tab === 'api' && (
          <div className="space-y-5">
            {[
              { title: 'Authentication', rows: [
                ['POST',  '/api/auth/login',   'Login. Body: { username, password }. Returns session cookie.'],
                ['POST',  '/api/auth/logout',  'Destroy session.'],
                ['GET',   '/api/auth/me',      'Current user info (id, username, role).'],
                ['GET',   '/api/auth/token',   'Get your API token (null if not generated).'],
                ['POST',  '/api/auth/token',   'Generate a new API token. Old one invalidated.'],
                ['DELETE','/api/auth/token',   'Revoke your API token.'],
              ]},
              { title: 'Statistics', rows: [
                ['GET', '/api/stats/summary',              'Queries today, blocked, block%, avg latency, gravity count.'],
                ['GET', '/api/stats/hourly',               'Per-hour allowed+blocked counts for last 24h.'],
                ['GET', '/api/stats/history?days=7',       'Per-day totals. Max 30 days.'],
                ['GET', '/api/stats/top-domains',          'Top 10 blocked domains (24h).'],
                ['GET', '/api/stats/top-allowed-domains',  'Top 10 allowed domains (24h).'],
                ['GET', '/api/stats/top-clients',          'Top 5 active clients with name labels (24h).'],
                ['GET', '/api/stats/query-types',          'DNS query type distribution (A, AAAA, TXT…).'],
                ['GET', '/api/stats/upstream-servers',     'Per-resolver query counts.'],
              ]},
              { title: 'Query Log', rows: [
                ['GET', '/api/queries',          'Paginated log. Params: status, client, domain, from, to, page.'],
                ['GET', '/api/queries/export',   'Download all queries as CSV.'],
              ]},
              { title: 'Blocking Rules', rows: [
                ['GET',    '/api/blocks/domains',          'List blocked domains.'],
                ['POST',   '/api/blocks/domains',          'Add domain. Body: { domain, block_type, enabled }.'],
                ['PATCH',  '/api/blocks/domains/:id',      'Update domain.'],
                ['DELETE', '/api/blocks/domains/:id',      'Remove domain.'],
                ['GET',    '/api/blocks/domains/test',     'Check domain. Param: ?domain=x.'],
                ['GET',    '/api/blocks/patterns',         'List patterns.'],
                ['POST',   '/api/blocks/patterns',         'Create pattern. Body: { name, pattern, pattern_type }.'],
                ['PATCH',  '/api/blocks/patterns/:id',     'Update pattern.'],
                ['DELETE', '/api/blocks/patterns/:id',     'Remove pattern.'],
                ['GET',    '/api/blocks/allowlist',        'List allowlist entries.'],
                ['POST',   '/api/blocks/allowlist',        'Add to allowlist. Body: { domain, allow_type }.'],
                ['DELETE', '/api/blocks/allowlist/:id',    'Remove from allowlist.'],
                ['GET',    '/api/lists',                   'List adlists with domain_count, last_updated, last_error.'],
                ['POST',   '/api/lists',                   'Add adlist. Body: { url, name }.'],
                ['PATCH',  '/api/lists/:id',               'Update adlist.'],
                ['DELETE', '/api/lists/:id',               'Remove adlist.'],
                ['POST',   '/api/lists/gravity',           'Trigger gravity update (WebSocket /ws/gravity).'],
                ['GET',    '/api/safesearch',              'Get SafeSearch config.'],
                ['POST',   '/api/safesearch',              'Update SafeSearch settings.'],
              ]},
              { title: 'Tools', rows: [
                ['GET', '/api/tools/search?q=example.com', 'Search domain across all rules. Returns matches by type, source, action.'],
                ['GET', '/api/tools/audit-log',            'Blocked domains (72h) with no explicit user rule.'],
              ]},
              { title: 'System', rows: [
                ['GET',  '/api/system/status',          'Service status: DNS proxy, Unbound, Redis.'],
                ['GET',  '/api/system/health',          'Memory, disk, uptime, CPU temp, DB size.'],
                ['POST', '/api/system/reload-proxy',    'Reload DNS rules cache.'],
                ['GET',  '/api/system/shield-status',   'Current shield state: { active, remaining_seconds }.'],
                ['POST', '/api/system/shield-toggle',   'Toggle shield. Body: { active, duration } (minutes).'],
                ['GET',  '/api/system/unbound/detect',  'Auto-detect local Unbound.'],
                ['GET',  '/api/system/backup',          'Download full config backup (JSON).'],
                ['POST', '/api/system/seed-data',       'Seed test queries. Body: { count }.'],
                ['POST', '/api/system/clear-queries',   'Delete all query logs.'],
              ]},
              { title: 'Clients & Groups', rows: [
                ['GET',    '/api/clients',                 'List all clients.'],
                ['POST',   '/api/clients',                 'Register client. Body: { ip, name }.'],
                ['PATCH',  '/api/clients/:id',             'Update client.'],
                ['DELETE', '/api/clients/:id',             'Remove client.'],
                ['GET',    '/api/blocks/groups',           'List block groups.'],
                ['POST',   '/api/blocks/groups',           'Create group. Body: { name, description }.'],
                ['PATCH',  '/api/blocks/groups/:id',       'Update group.'],
                ['DELETE', '/api/blocks/groups/:id',       'Delete group.'],
              ]},
              { title: 'VPN & Network', rows: [
                ['GET',  '/api/vpn/server',         'WireGuard server config.'],
                ['POST', '/api/vpn/server',         'Update server config.'],
                ['GET',  '/api/vpn/peers',          'List VPN peers.'],
                ['POST', '/api/vpn/peers',          'Create peer. Body: { name }.'],
                ['GET',  '/api/vpn/peers/:id/config','Download peer .conf file.'],
                ['DELETE','/api/vpn/peers/:id',     'Delete peer.'],
                ['POST', '/api/vpn/sync',           'Sync WireGuard config to disk.'],
                ['GET',  '/api/vpn/status',         'WireGuard interface status.'],
                ['GET',  '/api/network/scan',       'ARP scan. Returns device list with vendor, IP, hostname.'],
              ]},
              { title: 'Users', rows: [
                ['GET',    '/api/users',       'List users (Admin only).'],
                ['POST',   '/api/users',       'Create user. Body: { username, password, role }.'],
                ['PATCH',  '/api/users/:id',   'Update user (including password).'],
                ['DELETE', '/api/users/:id',   'Delete user.'],
              ]},
            ].map(group => (
              <section key={group.title} className="card">
                <h3 className="font-bold text-white text-sm mb-4">{group.title}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {group.rows.map(([m, p, d]) => <ApiRow key={p} method={m} path={p} desc={d} />)}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ─── CLI ─── */}
        {tab === 'cli' && (
          <section className="card border-slate-700/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-800 text-slate-400 rounded-lg"><Terminal size={20} /></div>
              <h2 className="text-lg font-bold text-white">Management Commands</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-700/50">
                    <th className="py-3 pr-6">Command</th>
                    <th className="py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  <CliRow cmd="python manage.py run_proxy" desc="Start the DNS proxy on port 53. Run with sudo in production." />
                  <CliRow cmd="python manage.py update_gravity" desc="Download and ingest all configured adlists." />
                  <CliRow cmd="python manage.py run_ai_worker" desc="Start the AI Behavioural Profiling and threat detection engine." color="text-purple-400" />
                  <CliRow cmd="python manage.py create_default_settings" desc="Initialise default system settings (run once after install)." />
                  <CliRow cmd="python manage.py seed_data --queries 100" desc="Populate DB with 100 realistic test queries (varied types, statuses, sources)." color="text-brand-400" />
                  <CliRow cmd="python manage.py seed_data --clear" desc="Permanently delete ALL query log entries. Use for a clean test state." color="text-red-400" />
                  <CliRow cmd="python manage.py seed_data --clear --queries 50" desc="Combined: wipe then immediately seed 50 entries." color="text-yellow-400" />
                  <CliRow cmd="python manage.py migrate" desc="Apply DB migrations after version upgrades." />
                  <CliRow cmd="python manage.py createsuperuser" desc="Create a new admin user via CLI." />
                  <CliRow cmd="python manage.py collectstatic" desc="Collect static files for Nginx production serving." />
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}

Documentation.propTypes = {
  user: PropTypes.object,
}
