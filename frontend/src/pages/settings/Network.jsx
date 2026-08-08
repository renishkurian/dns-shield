import React, { useState } from 'react'
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
  const [iptablesOutput, setIptablesOutput] = useState('')
  const isAdmin = user?.role === 'admin'

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/network/iptables')
      const data = await res.json()
      setIptablesOutput(data.rules || data.error || 'No output')
    } catch (e) {
      setIptablesOutput(e.message || 'Failed to fetch rules')
    }
  }

  const apply = async (ruleId) => {
    setResults(r => ({ ...r, [ruleId]: { loading: true } }))
    try {
      const res = await fetch('/api/network/iptables/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ rule: ruleId }),
      })
      const data = await res.json().catch(() => ({}))
      const ok = res.ok && !!data.ok
      const detail = (data.output || data.error || '').trim()
      setResults(r => ({
        ...r,
        [ruleId]: {
          ok,
          msg: ok
            ? (detail || 'Rule applied successfully.')
            : (detail || `Failed to apply rule (HTTP ${res.status}).`),
        },
      }))
    } catch (e) {
      setResults(r => ({
        ...r,
        [ruleId]: { ok: false, msg: e.message || 'Network error while applying rule.' },
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
          return (
            <div key={rule.id} className={`card ${rule.danger ? 'border-yellow-500/20' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <rule.icon size={16} className={rule.danger ? 'text-yellow-400' : 'text-brand-400'} />
                    <span className="font-semibold text-white text-sm">{rule.label}</span>
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
                  <button onClick={() => apply(rule.id)} disabled={rs?.loading}
                    className="btn-primary shrink-0 text-xs">
                    {rs?.loading ? 'Applying…' : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-4">
        <button onClick={fetchRules} className="btn-ghost text-xs">
          <Terminal size={14} /> Show current rules
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
