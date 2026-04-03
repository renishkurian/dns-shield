import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Search, ToggleLeft, ToggleRight, Save } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const ENGINES = [
  {
    id: 'google',
    name: 'Google',
    description: 'Force SafeSearch on Google searches',
    icon: '🔍',
    strict_note: 'Redirects to forcesafesearch.google.com',
  },
  {
    id: 'bing',
    name: 'Bing',
    description: 'Enable Bing SafeSearch filtering',
    icon: '🔎',
    strict_note: 'Redirects to strict.bing.com',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Restrict YouTube content',
    icon: '▶️',
    strict_note: 'Redirects to restrict.youtube.com',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: 'Enable DuckDuckGo Safe Search',
    icon: '🦆',
    strict_note: 'Redirects to safe.duckduckgo.com',
  },
  {
    id: 'yandex',
    name: 'Yandex',
    description: 'Enable Yandex family filter',
    icon: '🅨',
    strict_note: 'Redirects to familysearch.yandex.ru',
  },
]

export default function SafeSearch({ user, safesearch: initial = [] }) {
  const [settings, setSettings] = useState(() => {
    const map = {}
    for (const e of initial) map[e.engine] = e
    return map
  })
  const [saving, setSaving] = useState('')
  const isAdmin = user?.role === 'admin'

  const toggle = (engine) => {
    setSettings(s => ({
      ...s,
      [engine]: { ...(s[engine] || { engine, level: 'strict' }), enabled: !s[engine]?.enabled }
    }))
  }

  const setLevel = (engine, level) => {
    setSettings(s => ({
      ...s,
      [engine]: { ...(s[engine] || { engine, enabled: false }), level }
    }))
  }

  const apply = async (engine) => {
    setSaving(engine)
    await fetch('/api/safesearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ engine, ...settings[engine] }),
    })
    setSaving('')
  }

  return (
    <Layout user={user} currentPath="/safesearch" title="Safe Search">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Safe Search</h2>
        <p className="text-sm text-slate-500">Force safe search at the DNS level via Unbound local-zones</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENGINES.map(eng => {
          const s = settings[eng.id] || { enabled: false, level: 'strict' }
          return (
            <div key={eng.id} className={`card transition-all duration-200 ${s.enabled ? 'border-brand-500/40 glow-brand' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{eng.icon}</span>
                  <div>
                    <div className="font-semibold text-white text-sm">{eng.name}</div>
                    <div className="text-xs text-slate-500">{eng.description}</div>
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => toggle(eng.id)} className="shrink-0">
                    {s.enabled
                      ? <ToggleRight size={22} className="text-brand-400" />
                      : <ToggleLeft size={22} className="text-slate-600" />}
                  </button>
                )}
              </div>

              {s.enabled && (
                <>
                  <div className="text-xs text-slate-500 bg-surface-100 rounded px-2 py-1 mb-3 font-mono">
                    {eng.strict_note}
                  </div>
                  <div className="flex gap-1 mb-3">
                    {['strict', 'moderate'].map(lvl => (
                      <button key={lvl} disabled={!isAdmin}
                        onClick={() => setLevel(eng.id, lvl)}
                        className={`flex-1 text-xs py-1 rounded-lg capitalize font-medium transition-colors ${
                          s.level === lvl
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-100 text-slate-400 hover:text-white'
                        }`}>
                        {lvl}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {isAdmin && (
                <button onClick={() => apply(eng.id)} disabled={saving === eng.id}
                  className="btn-primary w-full justify-center text-xs">
                  <Save size={12} /> {saving === eng.id ? 'Applying…' : 'Apply'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Layout>
  )
}

SafeSearch.propTypes = { user: PropTypes.object, safesearch: PropTypes.array }
