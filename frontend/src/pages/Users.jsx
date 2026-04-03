import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Plus, Trash2, Edit2, UserX, Key, Shield, Eye } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

function UserModal({ user: editUser, onClose, onSave }) {
  const [form, setForm] = useState({
    username: editUser?.username || '',
    email: editUser?.email || '',
    first_name: editUser?.first_name || '',
    last_name: editUser?.last_name || '',
    role: editUser?.role || 'viewer',
    password: '',
    is_active: editUser?.is_active ?? true,
  })
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    const payload = { ...form }
    if (!payload.password) delete payload.password
    const url = editUser ? `/api/users/${editUser.id}` : '/api/users'
    const method = editUser ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { setErr(JSON.stringify(data)); return }
    onSave(data, !!editUser)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal p-6">
        <h3 className="font-bold text-white mb-4">{editUser ? 'Edit User' : 'Add User'}</h3>
        {err && <div className="text-red-400 text-xs mb-3">{err}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name</label>
              <input className="input text-xs" value={form.first_name}
                onChange={e => setForm(f => ({...f, first_name: e.target.value}))} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input text-xs" value={form.last_name}
                onChange={e => setForm(f => ({...f, last_name: e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input text-xs" value={form.username}
              onChange={e => setForm(f => ({...f, username: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input text-xs" type="email" value={form.email}
              onChange={e => setForm(f => ({...f, email: e.target.value}))} />
          </div>
          <div>
            <label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input className="input text-xs font-mono" type="password" value={form.password}
              placeholder={editUser ? '••••••••' : 'Required'}
              onChange={e => setForm(f => ({...f, password: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="input text-xs" value={form.role}
                onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} />
                Active account
              </label>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={save} className="btn-primary flex-1 justify-center">
            {editUser ? 'Save Changes' : 'Create User'}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancel</button>
        </div>
      </div>
    </div>
  )
}

UserModal.propTypes = {
  user: PropTypes.object, onClose: PropTypes.func, onSave: PropTypes.func,
}

export default function Users({ user: currentUser, users: initial = [] }) {
  const [users, setUsers] = useState(initial)
  const [editUser, setEditUser] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const handleSave = (saved, isEdit) => {
    if (isEdit) {
      setUsers(u => u.map(x => x.id === saved.id ? saved : x))
    } else {
      setUsers(u => [saved, ...u])
    }
  }

  const deleteUser = async (id) => {
    if (!confirm('Delete user permanently?')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setUsers(u => u.filter(x => x.id !== id))
  }

  const forceLogout = async (id) => {
    await fetch(`/api/users/${id}/force-logout`, {
      method: 'POST', headers: { 'X-CSRFToken': getCsrf() },
    })
  }

  return (
    <Layout user={currentUser} currentPath="/users" title="User Management">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Users</h2>
          <p className="text-sm text-slate-500">{users.length} accounts</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary ml-auto">
          <Plus size={14} /> Add User
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700">
            <tr className="text-xs font-medium text-slate-400">
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Last Login</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-200 text-xs">
                    {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username}
                  </div>
                  <div className="text-slate-500 text-xs">{u.email || u.username}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={u.role === 'admin' ? 'badge-blue' : 'badge-gray'}>
                    {u.role === 'admin' ? <><Shield size={10} /> Admin</> : <><Eye size={10} /> Viewer</>}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <span className={u.is_active ? 'badge-green' : 'badge-red'}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditUser(u)} className="p-1.5 text-slate-500 hover:text-white" title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => forceLogout(u.id)} className="p-1.5 text-slate-500 hover:text-yellow-400" title="Force logout">
                      <UserX size={13} />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button onClick={() => deleteUser(u.id)} className="p-1.5 text-slate-500 hover:text-red-400" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <div className="text-center py-12 text-slate-600">No users found</div>}
      </div>

      {(showAdd || editUser) && (
        <UserModal
          user={editUser}
          onClose={() => { setShowAdd(false); setEditUser(null) }}
          onSave={handleSave}
        />
      )}
    </Layout>
  )
}

Users.propTypes = { user: PropTypes.object, users: PropTypes.array }
