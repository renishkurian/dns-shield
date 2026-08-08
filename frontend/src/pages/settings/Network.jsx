import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import TorSettings from '../../components/TorSettings'
import { Terminal, Network, Shield, Save, AlertTriangle, CheckCircle } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const RULES = [
  {
    id: 'redirect_dns',
    label: 'Redirect all DNS to proxy',
    description: 'Force all LAN DNS queries through DNS Shield proxy (port 53)',
    cmd: 'iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-port 53',
    icon: Network,
    danger: false,
  },
  {
    id: 'block_dot',
    label: 'Block DNS-over-TLS (port 853)',
    description: 'Prevent clients from bypassing the proxy via encrypted DNS-over-TLS',
    cmd: 'iptables -A FORWARD -p tcp --dport 853 -j DROP',
    icon: Shield,
    danger: true,
  },
  {
    id: 'block_doh_google',
    label: 'Block DoH — Google (8.8.8.8)',
    description: 'Block HTTP/443 to Google DNS to prevent DNS-over-HTTPS bypass',
    cmd: 'iptables -A OUTPUT -d 8.8.8.8 -p tcp --dport 443 -j DROP',
    icon: Shield,
    danger: true,
  },
]

export default function NetworkSettings({ user }) {
  const [results, setResults] = useState({})
  const [active, setActive] = useState({})
  const [iptablesOutput, setIptablesOutput] = useState('')
  const [loadingRules, setLoadingRules] = useState(false)
  const isAdmin = user?.role === 'admin'

  const fetchRules = async ({ showDump = true } = {}) => {
    if (showDump) setLoadingRules(true)
    try {
      const res = await fetch('/api/network/iptables')
      const data = await res.json()
      if (data.active && typeof data.active === 'object') {
        setActive(data.active)
      }
      if (showDump) {
        const text = (data.rules || data.error || '').trim()
        setIptablesOutput(text || 'No iptables output.')
      }
    } catch (e) {
      if (showDump) setIptablesOutput(e.message || 'Failed to fetch rules')
    } finally {
      if (showDump) setLoadingRules(false)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchRules({ showDump: false })
  }, [isAdmin])

  const mutateRule = async (ruleId, action) => {
    const endpoint = action === 'remove' ? '/api/network/iptables/remove' : '/api/network/iptables/apply'
    setResults(r => ({ ...r, [ruleId]: { loading: true, action } }))
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ rule: ruleId }),
      })
      const data = await res.json().catch(() => ({}))
      const ok = res.ok && !!data.ok
      const detail = (data.output || data.error || '').trim()
      if (data.active && typeof data.active === 'object') {
        setActive(data.active)
      } else if (ok) {
        setActive(a => ({ ...a, [ruleId]: action !== 'remove' }))
      }
      setResults(r => ({
        ...r,
        [ruleId]: {
          ok,
          msg: ok
            ? (detail || (action === 'remove' ? 'Rule removed.' : 'Rule applied successfully.'))
            : (detail || `Failed to ${action} rule (HTTP ${res.status}).`),
        },
      }))
    } catch (e) {
      setResults(r => ({
        ...r,
        [ruleId]: { ok: false, msg: e.message || `Network error while trying to ${action} rule.` },
      }))
    }
  }

  const saveRules = async () => {
    setResults(r => ({ ...r, _save: { loading: true } }))
    try {
      const res = await fetch('/api/network/iptables/save', {
        method: 'POST', headers: { 'X-CSRFToken': getCsrf() },
      })
      const data = await res.json().catch(() => ({}))
      const ok = res.ok && !!data.ok
      const detail = (data.output || data.error || '').trim()
      setResults(r => ({
        ...r,
        _save: {
          ok,
          msg: ok
            ? (detail || 'Rules saved.')
            : (detail || 'Failed to save rules.'),
        },
      }))
    } catch (e) {
      setResults(r => ({
        ...r,
        _save: { ok: false, msg: e.message || 'Network error while saving.' },
      }))
    }
  }

  return (
    <Layout user={user} currentPath="/settings/network" title="Network Settings">
      <h2 className="text-xl font-bold text-white mb-6">Network / iptables</h2>

      {isAdmin && <TorSettings />}

      {/* Rule cards */}
      <div className="space-y-3 mb-6">
        {RULES.map(rule => {
          const rs = results[rule.id]
          const isActive = !!active[rule.id]
          return (
            <div key={rule.id} className={`card ${rule.danger ? 'border-yellow-500/20' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <rule.icon size={16} className={rule.danger ? 'text-yellow-400' : 'text-brand-400'} />
                    <span className="font-semibold text-white text-sm">{rule.label}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                        <CheckCircle size={10} /> Active
                      </span>
                    )}
                    {rule.danger && (
                      <span className="badge-yellow text-xs"><AlertTriangle size={10} /> Caution</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mb-2">{rule.description}</p>
                  <code className="text-xs font-mono text-slate-400 bg-surface-100 px-2 py-1 rounded block">
                    {rule.cmd}
                  </code>
                  {rs?.msg && (
                    <p className={`text-xs mt-2 flex items-center gap-1.5 ${rs.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {rs.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                      {rs.msg}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => mutateRule(rule.id, 'apply')}
                      disabled={rs?.loading}
                      className="btn-primary text-xs"
                    >
                      {rs?.loading && rs?.action === 'apply'
                        ? 'Applying…'
                        : isActive ? 'Re-apply' : 'Apply'}
                    </button>
                    {isActive && (
                      <button
                        onClick={() => mutateRule(rule.id, 'remove')}
                        disabled={rs?.loading}
                        className="btn-ghost text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20"
                      >
                        {rs?.loading && rs?.action === 'remove' ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-4">
        <button onClick={() => fetchRules({ showDump: true })} disabled={loadingRules} className="btn-ghost text-xs">
          <Terminal size={14} /> {loadingRules ? 'Loading…' : 'Show current rules'}
        </button>
        {isAdmin && (
          <button onClick={saveRules} disabled={results._save?.loading} className="btn-primary text-xs">
            <Save size={14} /> {results._save?.loading ? 'Saving…' : 'Save persistent'}
          </button>
        )}
        {results._save?.msg && (
          <span className={`text-xs self-center flex items-center gap-1 ${results._save.ok ? 'text-green-400' : 'text-red-400'}`}>
            {results._save.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {results._save.msg}
          </span>
        )}
      </div>

      {/* iptables output */}
      {iptablesOutput && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">Current iptables rules</h3>
          <pre className="text-xs font-mono text-slate-400 bg-surface-100 p-3 rounded-lg overflow-auto max-h-80 whitespace-pre-wrap">
            {iptablesOutput}
          </pre>
        </div>
      )}
    </Layout>
  )
}

NetworkSettings.propTypes = { user: PropTypes.object }
