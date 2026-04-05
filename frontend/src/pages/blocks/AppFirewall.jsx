import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Shield, Lock, Unlock, Facebook, Youtube, Play, Globe, Monitor, Smartphone, Plus, Trash2, X, Wand2 } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const ICONS = {
  facebook: Facebook,
  youtube: Youtube,
  streaming: Play,
  social: Shield,
  gaming: Monitor,
  mobile: Smartphone,
}

export default function AppFirewall({ 
  user: currentUser, 
  categories = [], 
  controls = [], 
  groups = [] 
}) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id || null)
  const [ctrls, setCtrls] = useState(controls)
  const [cats, setCats] = useState(categories)
  const [loading, setLoading] = useState(null)
  
  // Custom form state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomains, setNewDomains] = useState('')
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)

  const autoFill = async () => {
    if (!newName) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/ai/generate-app?name=${encodeURIComponent(newName)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.domains) {
          setNewDomains(data.domains.join(', '))
        }
      }
    } finally {
      setGenerating(false)
    }
  }

  const createApp = async () => {
    if (!newName || !newDomains) return
    setCreating(true)
    try {
      const res = await fetch('/api/blocks/apps/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ name: newName, domains: newDomains, icon: 'Globe' })
      })
      if (res.ok) {
        const data = await res.json()
        setCats([...cats, data])
        setShowCreate(false)
        setNewName('')
        setNewDomains('')
      }
    } finally {
      setCreating(false)
    }
  }

  const deleteApp = async (e, id) => {
    e.stopPropagation() // Prevent toggling
    if (!confirm('Permanently delete this custom app category?')) return
    
    setLoading(id)
    try {
      const res = await fetch(`/api/blocks/apps/categories/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRFToken': getCsrf() }
      })
      if (res.ok) {
        setCats(cats.filter(c => c.id !== id))
      }
    } finally {
      if (loading === id) setLoading(null)
    }
  }

  const toggle = async (categoryId, currentStatus) => {
    if (!activeGroupId) return
    setLoading(categoryId)
    try {
      const res = await fetch('/api/blocks/apps/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({
          category: categoryId,
          group: activeGroupId,
          enabled: !currentStatus
        })
      })
      if (res.ok) {
        const saved = await res.json()
        setCtrls(prev => {
          const filtered = prev.filter(c => !(c.category === categoryId && c.group === activeGroupId))
          return [...filtered, saved]
        })
      }
    } finally {
      setLoading(null)
    }
  }

  const getStatus = (categoryId) => {
    const ctrl = ctrls.find(c => c.category === categoryId && c.group === activeGroupId)
    return ctrl ? ctrl.enabled : false
  }

  return (
    <Layout user={currentUser} currentPath="/blocks/apps" title="App Firewall">
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">App Firewall</h2>
          <p className="text-sm text-slate-500 text-pretty">Toggle entire services and categories on or off</p>
        </div>

        <div className="md:ml-auto flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Policy Group:</label>
          <select 
            className="input text-xs w-48 font-bold text-brand-400 bg-brand-500/5 border-brand-500/20"
            value={activeGroupId || ''}
            onChange={e => setActiveGroupId(parseInt(e.target.value))}
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!groups.length ? (
        <div className="card text-center py-20">
          <Shield size={48} className="text-slate-700 mx-auto mb-4" />
          <h3 className="text-slate-400 font-bold mb-2">No Groups Defined</h3>
          <p className="text-slate-600 text-sm max-w-xs mx-auto">
            You must create at least one <span className="text-brand-400">Block Group</span> to use the App Firewall.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Create Custom App Card */}
          {showCreate ? (
            <div className="card border-2 border-brand-500/30 bg-brand-500/5 relative">
              <button 
                onClick={() => setShowCreate(false)}
                className="absolute top-2 right-2 p-1 text-slate-500 hover:text-white"
              >
                <X size={16} />
              </button>
              <h3 className="text-sm font-bold text-white mb-4">Create Custom App</h3>
              <div className="space-y-3">
                <div className="relative">
                  <input 
                    className="input text-xs w-full pr-8" 
                    placeholder="App Name (e.g. Spotify)"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                  <button 
                    onClick={autoFill}
                    disabled={generating || !newName}
                    title="Auto-fill domains with Smart AI"
                    className="absolute right-2 top-2 p-1 text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
                  >
                    <Wand2 size={14} className={generating ? 'animate-pulse' : ''} />
                  </button>
                </div>
                <div>
                  <textarea 
                    className="input text-[10px] w-full h-16 resize-none font-mono" 
                    placeholder="Domains (comma separated)&#10;e.g. mywebsite.com, cdn.mywebsite.com"
                    value={newDomains}
                    onChange={e => setNewDomains(e.target.value)}
                  />
                </div>
                <button 
                  onClick={createApp} 
                  disabled={creating || !newName || !newDomains}
                  className="btn-primary w-full justify-center text-xs py-1.5"
                >
                  {creating ? 'Saving...' : 'Save App'}
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => setShowCreate(true)}
              className="card border-2 border-dashed border-slate-700/50 flex flex-col items-center justify-center text-slate-500 hover:border-brand-500/50 hover:text-brand-400 cursor-pointer transition-colors min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                <Plus size={20} />
              </div>
              <span className="text-sm font-bold">Create Custom App</span>
            </div>
          )}

          {cats.map(cat => {
            const enabled = getStatus(cat.id)
            const Icon = ICONS[cat.icon?.toLowerCase()] || Globe
            
            return (
              <div 
                key={cat.id} 
                className={`
                  card group cursor-pointer border-2 transition-all duration-300
                  ${enabled ? 'border-red-500/20 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}
                  ${loading === cat.id ? 'opacity-50 pointer-events-none scale-95' : 'hover:scale-[1.02]'}
                `}
                onClick={() => toggle(cat.id, enabled)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
                    ${enabled ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}
                  `}>
                    <Icon size={24} />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => deleteApp(e, cat.id)}
                      className="p-1 rounded bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors z-10"
                      title="Delete Custom App"
                    >
                      <Trash2 size={12} />
                    </button>
                    <div className={`
                      px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter
                      ${enabled ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}
                    `}>
                      {enabled ? <><Lock size={8} className="inline mr-1" /> BLOCKED</> : <><Unlock size={8} className="inline mr-1" /> ALLOWED</>}
                    </div>
                  </div>
                </div>
                
                <h3 className="text-sm font-bold text-white mb-1">{cat.name}</h3>
                <p className="text-[10px] text-slate-500 leading-tight h-8 overflow-hidden">
                  {cat.domains.split(',').slice(0, 3).join(', ')}...
                </p>
                
                <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Toggle Switch</span>
                  <div className={`
                    w-8 h-4 rounded-full relative transition-colors duration-300
                    ${enabled ? 'bg-red-500/50' : 'bg-emerald-500/50'}
                  `}>
                    <div className={`
                      absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300
                      ${enabled ? 'left-4.5' : 'left-0.5'}
                    `} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Categories Tip */}
      <div className="mt-12 max-w-2xl">
        <h4 className="text-white font-bold text-sm mb-4">About App Firewall</h4>
        <div className="space-y-3">
          {[
            { q: "How does it work?", a: "The App Firewall maps entire services to thousands of known domains and CDN patterns. Blocking 'Social Media' will automatically block Facebook, Instagram, Twitter, etc." },
            { q: "Is it immediate?", a: "Yes. Changes are synchronized with the DNS proxy engine instantly, though client-side DNS caching may cause a slight delay." },
            { q: "Can I add custom apps?", a: "Currently, categories are managed via the database. We plan to add a UI for custom category creation in v2.1." }
          ].map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="text-brand-500 font-bold text-xs shrink-0 mt-0.5">Q.</div>
              <div>
                <p className="text-slate-200 font-bold text-xs mb-1">{item.q}</p>
                <p className="text-slate-500 text-[11px] leading-relaxed">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}

AppFirewall.propTypes = {
  user: PropTypes.object,
  categories: PropTypes.array,
  controls: PropTypes.array,
  groups: PropTypes.array,
}

