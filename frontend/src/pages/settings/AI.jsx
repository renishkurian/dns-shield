import React, { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import { Sparkles, Save, Shield } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function AI({ user: currentUser }) {
  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const d = data.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {})
        setEnabled(d.ai_enabled === 'true')
        setProvider(d.ai_provider || 'openai')
        setApiKey(d.ai_api_key || '')
      })
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    setMsg('')
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify([
          { key: 'ai_enabled', value: enabled ? 'true' : 'false' },
          { key: 'ai_provider', value: provider },
          { key: 'ai_api_key', value: apiKey },
        ])
      })
      setMsg('Settings saved successfully.')
    } finally {
      setSaving(false)
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

        <div className="card space-y-6">
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
                onChange={e => setProvider(e.target.value)}
              >
                <option value="openai">ChatGPT (OpenAI)</option>
                <option value="anthropic">Claude (Anthropic)</option>
                <option value="gemini">Gemini (Google)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
              <input 
                type="password"
                className="input w-full"
                placeholder="sk-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                <Shield size={10} /> Keys are stored securely in the local SQLite database.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-700/50 flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-400">{msg}</span>
            <button 
              onClick={saveSettings} 
              disabled={saving}
              className="btn-primary"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
