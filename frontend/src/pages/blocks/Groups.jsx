import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { Plus, Trash2, Folder, Users, Shield, Hash } from 'lucide-react'
import { useAlert } from '../../components/Toast'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Groups({ user: currentUser, groups: initialGroups = [] }) {
  const { alert, confirm } = useAlert()
  const [groups, setGroups] = useState(initialGroups)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const addGroup = async () => {
    if (!newGroupName) return
    setLoading(true)
    try {
      const res = await fetch('/api/blocks/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ name: newGroupName, description: newGroupDesc })
      })
      if (res.ok) {
        const data = await res.json()
        setGroups([...groups, data])
        setNewGroupName('')
        setNewGroupDesc('')
      }
    } finally {
      setLoading(false)
    }
  }

  const deleteGroup = async (id) => {
    if (!(await confirm('Delete this group? Rules associated with it will lose their group assignment.'))) return
    const res = await fetch(`/api/blocks/groups/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRFToken': getCsrf() }
    })
    if (res.ok) {
      setGroups(groups.filter(g => g.id !== id))
    }
  }

  return (
    <Layout user={currentUser} currentPath="/blocks/groups" title="Block Groups">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Block Groups</h2>
          <p className="text-sm text-slate-500">Manage identity-based blocking policies</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Group Card */}
        <div className="card h-fit sticky top-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-brand-500/10 rounded-lg flex items-center justify-center">
              <Plus size={16} className="text-brand-400" />
            </div>
            <h3 className="font-bold text-white text-sm">Create New Group</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Group Name</label>
              <input 
                className="input text-xs" 
                placeholder="e.g. Kids, Servers, Guest"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea 
                className="input text-xs h-20 resize-none" 
                placeholder="Optional purpose for this group..."
                value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
              />
            </div>
            <button 
              onClick={addGroup} 
              disabled={loading || !newGroupName}
              className="btn-primary w-full justify-center"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>

        {/* Groups List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/30 border-b border-slate-700/50">
                <tr className="text-xs font-medium text-slate-400">
                  <th className="px-6 py-4">Group</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {groups.map(g => (
                  <tr key={g.id} className="hover:bg-slate-700/20 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-brand-400 transition-colors">
                          <Folder size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-white">{g.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-wider flex items-center gap-1">
                            <Hash size={8} /> ID: {g.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-400 line-clamp-2 max-w-xs">{g.description || 'No description provided.'}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => deleteGroup(g.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!groups.length && (
                  <tr>
                    <td colSpan="3" className="px-6 py-12 text-center text-slate-600 italic">
                      No custom groups created yet. All rules are currently global.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Info Card */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex gap-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
              <Shield size={20} className="text-blue-400" />
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-1">Identity-Based Filtering</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                By creating groups, you can apply different blocking rules to different users or devices. 
                Go to <span className="text-brand-400 font-medium">Administration {"&gt;"} Users</span> or 
                <span className="text-brand-400 font-medium">Network {"&gt;"} Clients</span> to assign them to a group.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

Groups.propTypes = {
  user: PropTypes.object,
  groups: PropTypes.array,
}
