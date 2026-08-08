import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Download, Upload, AlertTriangle, CheckCircle, Database } from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const COUNT_LABELS = {
  block_groups: 'Block groups',
  blocked_domains: 'Blocked domains',
  patterns: 'Patterns',
  adlists: 'Adlists',
  allowed_domains: 'Allowlist',
  app_categories: 'App categories',
  app_controls: 'App controls',
  clients: 'Clients',
  safesearch: 'SafeSearch',
  system_settings: 'Settings',
  vpn_servers: 'VPN servers',
  vpn_peers: 'VPN peers',
  scheduled_rules: 'Schedules',
  alert_configs: 'Alerts',
  local_dns_records: 'Local DNS',
  local_cname_records: 'Local CNAMEs',
}

function CountTable({ title, counts, tone }) {
  const rows = Object.entries(counts || {}).filter(([, n]) => n > 0)
  if (!rows.length) return null
  const color = tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-slate-400'
  return (
    <div>
      <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${color}`}>{title}</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {rows.map(([k, n]) => (
          <div key={k} className="flex justify-between gap-2 text-slate-400">
            <span>{COUNT_LABELS[k] || k}</span>
            <span className="font-mono text-white">{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

CountTable.propTypes = {
  title: PropTypes.string,
  counts: PropTypes.object,
  tone: PropTypes.string,
}

export default function Backup({ user }) {
  const { confirm } = useAlert()
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [mode, setMode] = useState('merge')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const exportBackup = () => {
    const q = includeSecrets ? '?include_secrets=true' : ''
    window.open(`/api/backup/export${q}`, '_blank')
  }

  const runImport = async () => {
    if (!file) {
      setError('Choose a backup JSON file first.')
      return
    }
    if (mode === 'replace') {
      const ok = await confirm(
        'Replace mode will wipe existing block groups, clients, rules, schedules, VPN config, alerts, and local DNS, then load the backup.\n\nQuery logs and AI history are NOT touched.\n\nContinue?',
        { danger: true, confirmLabel: 'Replace config', title: 'Replace all config?' },
      )
      if (!ok) return
    }

    setLoading(true)
    setError('')
    setResult(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('mode', mode)
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrf() },
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error || `Import failed (HTTP ${res.status}).`)
        return
      }
      setResult(data)
    } catch (e) {
      setError(e.message || 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout user={user} currentPath="/settings/backup" title="Backup & Restore">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Database size={18} className="text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Teleporter</h2>
            <p className="text-slate-500 text-xs">
              Export filtering config to JSON, or restore it on this Pi or a fresh install.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Export */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Download size={16} className="text-brand-400" />
              <h3 className="font-semibold text-white text-sm">Export</h3>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Downloads block groups, domains, patterns, adlists, allowlist, app firewall, clients,
              SafeSearch, settings, schedules, alerts, local DNS, and VPN public config.
              Query logs, AI caches, and gravity domains are excluded.
            </p>

            <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={e => setIncludeSecrets(e.target.checked)}
                className="mt-0.5 accent-brand-500"
              />
              <span className="text-xs text-slate-300">
                Include VPN private keys
              </span>
            </label>
            {includeSecrets && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg p-3 mb-4">
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">
                  This file will contain your VPN private keys. Store it securely and never share it.
                </p>
              </div>
            )}

            <button type="button" onClick={exportBackup} className="btn-primary">
              <Download size={14} /> Download Backup
            </button>
          </div>

          {/* Import */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Upload size={16} className="text-yellow-400" />
              <h3 className="font-semibold text-white text-sm">Import</h3>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Restore from a Teleporter JSON file. Gravity lists rebuild on the next adlist update —
              they are not stored in the backup.
            </p>

            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Mode</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="backup-mode"
                    checked={mode === 'merge'}
                    onChange={() => setMode('merge')}
                    className="mt-1 accent-brand-500"
                  />
                  <span>
                    <span className="text-sm text-white font-medium">Merge</span>
                    <span className="block text-xs text-slate-500">
                      Upsert by natural key (domain, IP, group name…). Safe to run twice — no duplicates.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="backup-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                    className="mt-1 accent-brand-500"
                  />
                  <span>
                    <span className="text-sm text-white font-medium">Replace</span>
                    <span className="block text-xs text-slate-500">
                      Wipe in-scope config tables, then load the file. Logs and query history stay intact.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {mode === 'replace' && (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/25 rounded-lg p-3 mb-4">
                <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">
                  Replace overwrites block groups, clients, and rules. You will be asked to confirm before import.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-3">
              <label className="btn-ghost cursor-pointer text-xs">
                <Upload size={14} />
                {file ? file.name : 'Choose .json file…'}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => {
                    setFile(e.target.files?.[0] || null)
                    setResult(null)
                    setError('')
                  }}
                  disabled={loading}
                />
              </label>
              <button
                type="button"
                onClick={runImport}
                disabled={loading || !file}
                className={`text-xs ${mode === 'replace' ? 'btn-primary bg-red-600 hover:bg-red-500 border-red-500' : 'btn-primary'}`}
              >
                {loading ? 'Importing…' : mode === 'replace' ? 'Import (Replace)' : 'Import (Merge)'}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-xs mb-3">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {result?.ok && (
              <div className="space-y-3 mt-2 border-t border-slate-700/50 pt-4">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle size={15} />
                  Import complete ({result.mode})
                </div>
                {result.proxy_note && (
                  <p className="text-xs text-slate-500 leading-relaxed">{result.proxy_note}</p>
                )}
                <div className="grid sm:grid-cols-3 gap-4">
                  <CountTable title="Created" counts={result.summary?.created} tone="green" />
                  <CountTable title="Updated" counts={result.summary?.updated} tone="amber" />
                  <CountTable title="Skipped" counts={result.summary?.skipped} />
                </div>
                {(result.summary?.errors || []).length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1.5">
                      Errors ({result.summary.errors.length})
                    </h4>
                    <ul className="text-xs text-red-300/90 space-y-1 max-h-40 overflow-auto">
                      {result.summary.errors.map((err, i) => (
                        <li key={i} className="font-mono">{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-white text-sm mb-2">What is included</h3>
            <pre className="text-xs font-mono text-slate-500 bg-surface-100 p-3 rounded-lg overflow-auto">{`{
  "dns_shield_backup_version": 1,
  "exported_at": "ISO timestamp",
  "data": {
    "block_groups": [...],
    "blocked_domains": [...],
    "patterns": [...],
    "adlists": [...],
    "allowed_domains": [...],
    "app_categories": [...],
    "app_controls": [...],
    "clients": [...],
    "safesearch": [...],
    "system_settings": [...],
    "vpn_servers": [...],
    "vpn_peers": [...],
    "scheduled_rules": [...],
    "alert_configs": [...],
    "local_dns_records": [...],
    "local_cname_records": [...]
  }
}`}</pre>
          </div>
        </div>
      </div>
    </Layout>
  )
}

Backup.propTypes = { user: PropTypes.object }
