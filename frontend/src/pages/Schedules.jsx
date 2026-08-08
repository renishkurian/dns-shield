import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { useAlert } from '../components/Toast'
import {
  Calendar, Clock, Plus, Trash2, Edit2, 
  CheckCircle, AlertCircle, Save, X, ChevronRight,
  Shield, Globe, Filter, Sparkles
} from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Schedules({ user, schedules: initialArr = [], groups = [] }) {
  const { alert, confirm } = useAlert()
  const [schedules, setSchedules] = useState(initialArr)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '', rule_type: 'domain', target: '', 
    group: groups[0]?.id || '', days: 'Mon,Tue,Wed,Thu,Fri',
    start_time: '09:00:00', end_time: '17:00:00', enabled: true
  })

  const handleSave = async () => {
    const isEdit = !!editingId
    const url = isEdit ? `/api/schedules/${editingId}` : '/api/schedules'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const data = await res.json()
      if (isEdit) {
        setSchedules(prev => prev.map(s => s.id === editingId ? data : s))
      } else {
        setSchedules(prev => [data, ...prev])
      }
      resetForm()
    }
  }

  const handleDelete = async (id) => {
    if (!(await confirm('Delete this schedule?'))) return
    const res = await fetch(`/api/schedules/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) {
      setSchedules(prev => prev.filter(s => s.id !== id))
    }
  }

  const resetForm = () => {
    setForm({
      name: '', rule_type: 'domain', target: '', 
      group: groups[0]?.id || '', days: 'Mon,Tue,Wed,Thu,Fri',
      start_time: '09:00:00', end_time: '17:00:00', enabled: true
    })
    setShowAdd(false)
    setEditingId(null)
  }

  const startEdit = (s) => {
    setForm({ ...s, group: s.group || '' })
    setEditingId(s.id)
    setShowAdd(true)
  }

  const toggleDay = (day) => {
    const currentDays = form.days.split(',').filter(Boolean)
    const newDays = currentDays.includes(day) 
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day]
    setForm({ ...form, days: newDays.join(',') })
  }

  return (
    <Layout user={user} currentPath="/schedules" title="Scheduled Rules">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Calendar className="text-brand-400" />
              Scheduled Blocking
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Automatically enable/disable blocking rules during specific hours.
            </p>
          </div>
          <button 
            onClick={() => setShowAdd(!showAdd)} 
            className={`btn-primary ${showAdd ? 'bg-slate-700 border-slate-600' : ''}`}
          >
            {showAdd ? <X size={16} /> : <Plus size={16} />}
            {showAdd ? 'Cancel' : 'New Schedule'}
          </button>
        </div>

        {showAdd && (
          <div className="card mb-8 border-brand-500/30 bg-brand-500/5 animate-in slide-in-from-top duration-300">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <Sparkles size={14} className="text-brand-400" />
              {editingId ? 'Edit Schedule' : 'Create New Schedule'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <label className="label">Schedule Name</label>
                  <input 
                    className="input w-full" placeholder="e.g. Work Hours Blocking"
                    value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="label">Block Group</label>
                  <select 
                    className="input w-full"
                    value={form.group} onChange={e => setForm({...form, group: e.target.value})}
                  >
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Rule Type</label>
                  <div className="flex gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
                    {['domain', 'pattern', 'app_category'].map(t => (
                      <button
                        key={t}
                        onClick={() => setForm({...form, rule_type: t})}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          form.rule_type === t ? 'bg-brand-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">
                    {form.rule_type === 'domain' ? 'Domain' : form.rule_type === 'pattern' ? 'Pattern Name' : 'App Category'}
                  </label>
                  <input 
                    className="input w-full font-mono text-xs" placeholder="e.g. tiktok.com"
                    value={form.target} onChange={e => setForm({...form, target: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start Time</label>
                    <input 
                      type="time" className="input w-full"
                      value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="label">End Time</label>
                    <input 
                      type="time" className="input w-full"
                      value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Active Days</label>
                  <div className="flex justify-between gap-1">
                    {DAYS.map(d => (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all border ${
                          form.days.includes(d) 
                            ? 'bg-brand-500/20 border-brand-500/50 text-brand-400' 
                            : 'bg-slate-900 border-slate-800 text-slate-500'
                        }`}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button onClick={resetForm} className="btn-ghost text-xs">Discard</button>
              <button onClick={handleSave} className="btn-primary px-8">
                <Save size={14} /> {editingId ? 'Update' : 'Activate'} Schedule
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {schedules.map(s => (
            <div key={s.id} className="card group hover:border-brand-500/50 transition-all">
              <div className="flex items-center gap-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  s.enabled ? 'bg-brand-500/10 text-brand-400' : 'bg-slate-800 text-slate-600'
                }`}>
                  <Clock size={20} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-bold text-white text-sm">{s.name}</h3>
                    {!s.enabled && <span className="bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Paused</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Filter size={12} className="text-brand-500" />
                      {s.rule_type.toUpperCase()}: <span className="text-slate-300 font-mono">{s.target}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Globe size={12} className="text-brand-500" />
                      {s.group_name || 'All Clients'}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-white mb-0.5">
                    {s.start_time.slice(0,5)} — {s.end_time.slice(0,5)}
                  </div>
                  <div className="flex gap-1 justify-end">
                    {s.days.split(',').map(d => (
                      <span key={d} className="text-[9px] text-brand-400 font-bold">{d}</span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-4 pl-4 border-l border-slate-800 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => startEdit(s)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-2 hover:bg-red-500/10 rounded-xl text-slate-500 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {schedules.length === 0 && !showAdd && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/50 flex items-center justify-center text-slate-700 mx-auto mb-4">
                <Calendar size={32} />
              </div>
              <h3 className="text-slate-400 font-medium mb-1">No schedules active</h3>
              <p className="text-xs text-slate-600 mb-6">Create time-based blocking rules for work or family safety.</p>
              <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto">
                <Plus size={14} /> Create your first schedule
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

Schedules.propTypes = {
  user: PropTypes.object,
  schedules: PropTypes.array,
  groups: PropTypes.array
}
