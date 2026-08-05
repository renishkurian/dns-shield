import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Sparkles, Save, Shield, Plus, Pencil, Trash2, Star, X, Clock, Play } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const PROVIDERS = [
  { value: 'openai', label: 'ChatGPT (OpenAI)', needsKey: true, modelHint: 'gpt-4o-mini' },
  { value: 'anthropic', label: 'Claude (Anthropic API)', needsKey: true, modelHint: 'claude-3-haiku-20240307' },
  { value: 'gemini', label: 'Gemini (Google)', needsKey: true, modelHint: 'gemini-1.5-flash' },
  { value: 'openrouter', label: 'OpenRouter', needsKey: true, modelHint: 'openai/gpt-4o-mini' },
  { value: 'claude_browser', label: 'Claude Browser Wrapper', needsKey: false, modelHint: 'claude-sonnet-5' },
]

const AUTO_INTERVALS = [
  { value: '1', label: 'Every hour', short: '1h' },
  { value: '2', label: 'Every 2 hours', short: '2h' },
  { value: '4', label: 'Every 4 hours', short: '4h' },
  { value: '6', label: 'Every 6 hours', short: '6h' },
  { value: '12', label: 'Every 12 hours', short: '12h' },
  { value: '24', label: 'Daily', short: '1d' },
  { value: '168', label: 'Weekly', short: '1w' },
]

function nextRunLabel(lastRunIso, intervalHours) {
  const hours = Number(intervalHours) || 24
  if (!lastRunIso) return 'Next run: on next scheduler tick (within ~1 min after enable/save)'
  const last = new Date(lastRunIso)
  if (Number.isNaN(last.getTime())) return null
  const next = new Date(last.getTime() + hours * 3600 * 1000)
  return `Next run: ${next.toLocaleString()}`
}

export default function AI({ user: currentUser }) {
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoInterval, setAutoInterval] = useState('24')
  const [lastRun, setLastRun] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [accounts, setAccounts] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | account
  const [form, setForm] = useState({ name: '', session_key: '', org_id: '', is_default: false })
  const [accountErr, setAccountErr] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [testingId, setTestingId] = useState(null)
  const [testResults, setTestResults] = useState({}) // id -> { ok, message }

  const meta = PROVIDERS.find(p => p.value === provider) || PROVIDERS[0]

  const loadAccounts = () => {
    fetch('/api/ai/claude-accounts')
      .then(r => r.json())
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]))
  }

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setEnabled(data.ai_enabled === 'true')
        setProvider(data.ai_provider || 'openai')
        setApiKey(data.ai_api_key || '')
        setModel(data.ai_model || '')
        setAutoEnabled(data.ai_auto_enabled === 'true')
        setAutoInterval(data.ai_auto_interval_hours || '24')
        setLastRun(data.ai_auto_last_run || '')
      })
    loadAccounts()
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          ai_enabled: enabled ? 'true' : 'false',
          ai_provider: provider,
          ai_api_key: apiKey,
          ai_model: model || meta.modelHint,
          ai_auto_enabled: autoEnabled ? 'true' : 'false',
          ai_auto_interval_hours: autoInterval,
        }),
      })
      if (!res.ok) {
        setErr('Failed to save settings.')
      } else {
        setMsg('Settings saved successfully.')
      }
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch('/api/ai/run-profiler', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrf() },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error || 'Failed to start profiler.')
        return
      }
      setLastRun(data.last_run || new Date().toISOString())
      setMsg(data.message || 'Auto intelligence run started.')
    } finally {
      setRunning(false)
    }
  }

  const startNew = () => {
    setEditing('new')
    setForm({ name: '', session_key: '', org_id: '', is_default: accounts.length === 0 })
    setAccountErr('')
  }

  const startEdit = (a) => {
    setEditing(a)
    setForm({
      name: a.name || '',
      session_key: '',
      org_id: a.org_id || '',
      is_default: !!a.is_default,
    })
    setAccountErr('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setAccountErr('')
  }

  const saveAccount = async () => {
    setAccountSaving(true)
    setAccountErr('')
    try {
      const isNew = editing === 'new'
      const url = isNew ? '/api/ai/claude-accounts' : `/api/ai/claude-accounts/${editing.id}`
      const method = isNew ? 'POST' : 'PATCH'
      const body = { ...form }
      if (!isNew && !body.session_key.trim()) {
        // keep existing key on server
        delete body.session_key
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAccountErr(data.error || 'Failed to save account.')
        return
      }
      setEditing(null)
      loadAccounts()
    } finally {
      setAccountSaving(false)
    }
  }

  const removeAccount = async (id) => {
    if (!confirm('Delete this Claude browser account?')) return
    await fetch(`/api/ai/claude-accounts/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() },
    })
    setTestResults(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    loadAccounts()
  }

  const setDefault = async (a) => {
    await fetch(`/api/ai/claude-accounts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({
        name: a.name,
        org_id: a.org_id,
        is_default: true,
      }),
    })
    loadAccounts()
  }

  const testConnection = async (a) => {
    setTestingId(a.id)
    setTestResults(prev => ({ ...prev, [a.id]: null }))
    try {
      const res = await fetch(`/api/ai/claude-accounts/${a.id}/test`, {
        method: 'POST',
        headers: { 'X-CSRFToken': getCsrf() },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setTestResults(prev => ({
          ...prev,
          [a.id]: { ok: false, message: data.error || 'Connection failed.' },
        }))
        return
      }
      setTestResults(prev => ({
        ...prev,
        [a.id]: { ok: true, message: data.message || 'Connection OK' },
      }))
    } catch {
      setTestResults(prev => ({
        ...prev,
        [a.id]: { ok: false, message: 'Network error while testing.' },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <Layout user={currentUser} currentPath="/settings/ai" title="AI Configuration">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Smart AI Integration</h2>
            <p className="text-sm text-slate-500">Configure language models to dynamically profile clients and generate blocklists.</p>
          </div>
        </div>

        <div className="card space-y-6 mb-6">
          <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl">
            <div>
              <h3 className="font-bold text-white">Enable Smart AI</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Allows DNS Shield to securely send anonymous domain queries and profile heuristics to an external LLM.
              </p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="peer sr-only"
                id="toggle-ai"
              />
              <label htmlFor="toggle-ai" className={`
                block w-12 h-6 rounded-full cursor-pointer transition-colors
                ${enabled ? 'bg-purple-500' : 'bg-slate-700'}
              `}>
                <div className={`
                  absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform
                  ${enabled ? 'translate-x-6' : 'translate-x-0'}
                `} />
              </label>
            </div>
          </div>

          <div className={`space-y-4 transition-all duration-300 ${!enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">AI Provider</label>
              <select
                className="input w-full md:w-1/2"
                value={provider}
                onChange={e => {
                  const next = e.target.value
                  setProvider(next)
                  const hint = PROVIDERS.find(p => p.value === next)?.modelHint || ''
                  if (!model) setModel(hint)
                }}
              >
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {meta.needsKey && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {provider === 'openrouter' ? 'OpenRouter API Key' : 'API Key'}
                </label>
                <input
                  type="password"
                  className="input w-full"
                  placeholder={provider === 'openrouter' ? 'sk-or-...' : 'sk-...'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                  <Shield size={10} /> Keys are stored securely in the local SQLite database.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Model</label>
              <input
                className="input w-full md:w-1/2"
                placeholder={meta.modelHint}
                value={model}
                onChange={e => setModel(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 mt-2">
                {provider === 'openrouter' && 'Example: openai/gpt-4o-mini, anthropic/claude-3.5-sonnet'}
                {provider === 'claude_browser' && 'claude.ai web model slug, e.g. claude-sonnet-5'}
                {provider === 'openai' && 'Default: gpt-4o-mini'}
                {provider === 'anthropic' && 'Default: claude-3-haiku-20240307'}
                {provider === 'gemini' && 'Default: gemini-1.5-flash'}
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-700/50 flex items-center justify-between">
            <span className={`text-sm font-bold ${err ? 'text-red-400' : 'text-emerald-400'}`}>{err || msg}</span>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="btn-primary"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        <div className={`card space-y-5 mb-6 transition-all ${!enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white">Auto Intelligence Schedule</h3>
              <p className="text-xs text-slate-500 mt-1">
                How often DNS Shield profiles recent traffic (AUTO INTELLIGENCE in AI Usage Logs).
                High-trust domains are skipped automatically.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl">
            <div>
              <h4 className="font-semibold text-white text-sm">Enable scheduled runs</h4>
              <p className="text-xs text-slate-400 mt-0.5">Requires Smart AI to be enabled above.</p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={e => setAutoEnabled(e.target.checked)}
                className="peer sr-only"
                id="toggle-ai-auto"
              />
              <label htmlFor="toggle-ai-auto" className={`
                block w-12 h-6 rounded-full cursor-pointer transition-colors
                ${autoEnabled ? 'bg-brand-500' : 'bg-slate-700'}
              `}>
                <div className={`
                  absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform
                  ${autoEnabled ? 'translate-x-6' : 'translate-x-0'}
                `} />
              </label>
            </div>
          </div>

          <div className={!autoEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Run frequency
            </label>
            <div className="flex flex-wrap gap-2">
              {AUTO_INTERVALS.map(opt => {
                const active = String(autoInterval) === String(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAutoInterval(opt.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                        : 'bg-slate-900/40 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                    title={opt.label}
                  >
                    <span className="block">{opt.short}</span>
                    <span className="block text-[10px] font-normal opacity-80 mt-0.5">{opt.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-slate-500">
              {lastRun && <p>Last run: {new Date(lastRun).toLocaleString()}</p>}
              {autoEnabled && <p>{nextRunLabel(lastRun, autoInterval)}</p>}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 max-w-md">
              Click <strong className="text-slate-400 font-semibold">Save schedule</strong> after changing frequency.
              Use Run now for an immediate pass.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runNow}
                disabled={running || !enabled}
                className="btn-ghost text-xs"
              >
                <Play size={14} /> {running ? 'Running…' : 'Run now'}
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="btn-primary text-xs"
              >
                <Save size={14} /> {saving ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </div>
        </div>

        {provider === 'claude_browser' && enabled && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm">Claude Browser Accounts</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Session cookie + organization ID from claude.ai (not Anthropic API keys).
                  Default is tried first; if it fails (expired session, rate limit, bad org),
                  the next account is used automatically.
                </p>
              </div>
              {!editing && (
                <button onClick={startNew} className="btn-ghost text-xs">
                  <Plus size={14} /> Add Account
                </button>
              )}
            </div>

            <div className="space-y-2">
              {accounts.map(a => {
                const result = testResults[a.id]
                const isTesting = testingId === a.id
                return (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{a.name}</span>
                          {a.is_default && (
                            <span className="badge-green text-[10px]">Default</span>
                          )}
                          {result?.ok === true && (
                            <span className="badge-green text-[10px]">OK</span>
                          )}
                          {result?.ok === false && (
                            <span className="badge-red text-[10px]">Failed</span>
                          )}
                          {!result && (
                            <span className="badge-green text-[10px]">Active</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                          {a.session_key_masked || '•••'} · org {a.org_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => testConnection(a)}
                          disabled={isTesting}
                          className="text-[11px] font-medium text-brand-400 hover:text-brand-300 disabled:opacity-50 disabled:cursor-wait underline-offset-2 hover:underline"
                        >
                          {isTesting ? 'Testing…' : 'Test connection'}
                        </button>
                        {!a.is_default && (
                          <button
                            onClick={() => setDefault(a)}
                            className="p-1.5 text-slate-500 hover:text-yellow-400"
                            title="Set as default"
                          >
                            <Star size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(a)}
                          className="p-1.5 text-slate-500 hover:text-white"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removeAccount(a.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {result?.message && (
                      <p className={`text-[11px] mt-2 ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.message}
                      </p>
                    )}
                  </div>
                )
              })}
              {!accounts.length && !editing && (
                <p className="text-xs text-slate-600 py-4 text-center">
                  No accounts yet. Add a Claude.ai session to use the browser wrapper.
                </p>
              )}
            </div>

            {editing && (
              <div className="p-4 rounded-xl border border-brand-500/30 bg-brand-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">
                    {editing === 'new' ? 'Add Account' : 'Edit Account'}
                  </h4>
                  <button onClick={cancelEdit} className="text-slate-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                {accountErr && (
                  <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {accountErr}
                  </div>
                )}
                <div>
                  <label className="label">Account Name</label>
                  <input
                    className="input text-xs"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="brave"
                  />
                </div>
                <div>
                  <label className="label">Session Key</label>
                  <input
                    className="input text-xs font-mono"
                    type="password"
                    value={form.session_key}
                    onChange={e => setForm(f => ({ ...f, session_key: e.target.value }))}
                    placeholder={editing === 'new' ? 'sk-ant-sid02-…' : 'Leave blank to keep current key'}
                  />
                </div>
                <div>
                  <label className="label">Organization ID</label>
                  <input
                    className="input text-xs font-mono"
                    value={form.org_id}
                    onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                  />
                  Set as Default Account
                </label>
                <button
                  onClick={saveAccount}
                  disabled={accountSaving}
                  className="btn-primary text-xs w-full justify-center"
                >
                  <Save size={14} /> {accountSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

AI.propTypes = { user: PropTypes.object }
