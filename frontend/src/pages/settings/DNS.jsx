import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Globe, Save, RefreshCw, CheckCircle } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function DNSSettings({ user, settings: initial = {} }) {
  const [settings, setSettings] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [reloading, setReloading] = useState(false)
  const isAdmin = user?.role === 'admin'

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(settings),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const reloadProxy = async () => {
    setReloading(true)
    await fetch('/api/system/reload-proxy', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } })
    setReloading(false)
  }

  const fields = [
    { key: 'upstream_dns', label: 'Upstream DNS IP', placeholder: '127.0.0.1', desc: 'Unbound resolver IP' },
    { key: 'upstream_port', label: 'Upstream DNS Port', placeholder: '5335', desc: 'Unbound port' },
    { key: 'proxy_host', label: 'Proxy Bind Host', placeholder: '0.0.0.0', desc: 'Interface to bind DNS proxy' },
    { key: 'proxy_port', label: 'Proxy Port', placeholder: '53', desc: 'DNS proxy port (53 is standard)' },
    { key: 'log_retention_days', label: 'Log Retention (days)', placeholder: '30', desc: 'Auto-delete query logs after N days' },
  ]

  return (
    <Layout user={user} currentPath="/settings/dns" title="DNS Settings">
      <div className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6">DNS Configuration</h2>

        <div className="card mb-4">
          <div className="space-y-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input text-xs font-mono" placeholder={f.placeholder}
                  value={settings[f.key] || ''}
                  onChange={e => setSettings(s => ({...s, [f.key]: e.target.value}))}
                  disabled={!isAdmin} />
                <p className="text-xs text-slate-600 mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-3">
            <button onClick={save} className="btn-primary">
              <Save size={14} />
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
            <button onClick={reloadProxy} disabled={reloading} className="btn-ghost">
              <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
              {reloading ? 'Reloading…' : 'Reload Proxy'}
            </button>
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm mt-3 animate-fade-in">
            <CheckCircle size={15} /> Settings saved. Reload proxy to apply.
          </div>
        )}
      </div>
    </Layout>
  )
}

DNSSettings.propTypes = { user: PropTypes.object, settings: PropTypes.object }
