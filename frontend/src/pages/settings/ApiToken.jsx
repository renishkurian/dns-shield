import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Code, Key, Copy, RefreshCw, Trash2, CheckCircle, AlertCircle, Info } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function ApiToken({ user }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok'|'error', text }

  useEffect(() => {
    fetch('/api/auth/token')
      .then(r => r.json())
      .then(d => { setToken(d.token); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const generate = async () => {
    setGenerating(true)
    setMsg(null)
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrf() },
      })
      const d = await res.json()
      setToken(d.token)
      setMsg({ type: 'ok', text: 'New token generated. Copy it now — it will not be shown again.' })
    } catch { setMsg({ type: 'error', text: 'Failed to generate token.' }) }
    setGenerating(false)
  }

  const revoke = async () => {
    if (!confirm('Revoke your API token? Any integrations using it will stop working immediately.')) return
    await fetch('/api/auth/token', { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setToken(null)
    setMsg({ type: 'ok', text: 'Token revoked successfully.' })
  }

  const copy = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Layout user={user} currentPath="/settings/api-token" title="API Token">
      <div className="max-w-xl">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Code size={20} className="text-purple-400" /> API Token
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Authenticate external tools with a personal API token.
          </p>
        </div>

        {/* Info panel */}
        <div className="flex gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-6">
          <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 space-y-1">
            <p>Use this token to authenticate API requests from:</p>
            <ul className="list-disc ml-4 space-y-0.5 text-slate-500">
              <li>Grafana dashboards</li>
              <li>Home Assistant integrations</li>
              <li>Custom scripts &amp; automation</li>
            </ul>
            <p className="mt-2">
              Pass it as a header: <code className="text-purple-300 bg-slate-800 px-1 py-0.5 rounded text-[11px]">Authorization: Token YOUR_TOKEN</code>
            </p>
          </div>
        </div>

        {/* Alert */}
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {msg.type === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            {msg.text}
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <RefreshCw size={15} className="animate-spin" /> Loading…
            </div>
          ) : token ? (
            <>
              <p className="text-xs text-slate-500 mb-3 font-medium">Your current token</p>
              {/* Token display */}
              <div className="flex items-center gap-2 p-3 bg-slate-900 border border-slate-700/50 rounded-xl mb-4">
                <Key size={14} className="text-purple-400 shrink-0" />
                <code className="text-xs font-mono text-purple-300 flex-1 truncate">{token}</code>
                <button
                  onClick={copy}
                  title="Copy token"
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  {copied
                    ? <CheckCircle size={14} className="text-green-400" />
                    : <Copy size={14} />}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={generate}
                  disabled={generating}
                  className="btn-ghost flex-1 justify-center text-sm"
                >
                  <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                  Regenerate Token
                </button>
                <button
                  onClick={revoke}
                  className="btn-ghost flex-1 justify-center text-sm text-red-400 hover:bg-red-500/10 border-red-500/20"
                >
                  <Trash2 size={13} /> Revoke Token
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-4">No API token generated yet.</p>
              <button
                onClick={generate}
                disabled={generating}
                className="btn-primary w-full justify-center"
              >
                <Key size={14} />
                {generating ? 'Generating…' : 'Generate API Token'}
              </button>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}

ApiToken.propTypes = { user: PropTypes.object }
