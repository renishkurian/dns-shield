import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Backup({ user }) {
  const [restoreStatus, setRestoreStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const exportBackup = () => {
    window.open('/api/system/backup', '_blank')
  }

  const importBackup = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setRestoreStatus(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/system/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: text,
      })
      const data = await res.json()
      setRestoreStatus(res.ok ? 'ok' : 'error')
    } catch (err) {
      setRestoreStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout user={user} currentPath="/settings/backup" title="Backup & Restore">
      <h2 className="text-xl font-bold text-white mb-6">Backup & Restore</h2>

      <div className="max-w-lg space-y-4">
        {/* Export */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Download size={16} className="text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Export Config</h3>
          </div>
          <p className="text-slate-500 text-xs mb-4">
            Download all block rules, patterns, adlists, allowlist, safe search settings, and clients as a single JSON file.
            Query logs and user accounts are excluded.
          </p>
          <button onClick={exportBackup} className="btn-primary">
            <Download size={14} /> Download Backup
          </button>
        </div>

        {/* Import */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={16} className="text-yellow-400" />
            <h3 className="font-semibold text-white text-sm">Restore Config</h3>
          </div>
          <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/25 rounded-lg p-3 mb-4">
            <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              Restoring will merge the backup data with your current config. Existing rules with matching domains will be updated.
            </p>
          </div>
          {restoreStatus === 'ok' && (
            <div className="flex items-center gap-2 text-green-400 text-sm mb-3">
              <CheckCircle size={15} /> Restore complete. Proxy cache reloaded.
            </div>
          )}
          {restoreStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
              <AlertTriangle size={15} /> Restore failed. Check the file format.
            </div>
          )}
          <label className="btn-ghost cursor-pointer">
            <Upload size={14} />
            {loading ? 'Restoring…' : 'Choose backup file…'}
            <input type="file" accept=".json" className="hidden" onChange={importBackup} disabled={loading} />
          </label>
        </div>

        <div className="card">
          <h3 className="font-semibold text-white text-sm mb-2">Backup format</h3>
          <pre className="text-xs font-mono text-slate-500 bg-surface-100 p-3 rounded-lg">{`{
  "version": "1.0",
  "exported_at": "ISO timestamp",
  "blocked_domains": [...],
  "patterns": [...],
  "adlists": [...],
  "allowlist": [...],
  "safesearch": [...],
  "settings": {...},
  "clients": [...]
}`}</pre>
        </div>
      </div>
    </Layout>
  )
}

Backup.propTypes = { user: PropTypes.object }
