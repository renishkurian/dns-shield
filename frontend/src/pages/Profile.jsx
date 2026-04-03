import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Key, Save, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Profile({ user }) {
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState(null) // null | 'ok' | 'error'
  const [msg, setMsg] = useState('')

  const changePassword = async (e) => {
    e.preventDefault()
    if (passwords.newPass !== passwords.confirm) {
      setStatus('error')
      setMsg('New passwords do not match')
      return
    }
    if (passwords.newPass.length < 8) {
      setStatus('error')
      setMsg('Password must be at least 8 characters')
      return
    }
    const res = await fetch(`/api/users/${user?.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ password: passwords.newPass }),
    })
    if (res.ok) {
      setStatus('ok')
      setMsg('Password updated successfully')
      setPasswords({ current: '', newPass: '', confirm: '' })
    } else {
      setStatus('error')
      setMsg('Failed to update password')
    }
  }

  return (
    <Layout user={user} currentPath="/profile" title="Profile">
      <div className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6">My Profile</h2>

        {/* Info card */}
        <div className="card mb-4">
          <h3 className="font-semibold text-white text-sm mb-3">Account Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Username</span>
              <span className="text-slate-200">{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Email</span>
              <span className="text-slate-200">{user?.email || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Role</span>
              <span className={`capitalize ${user?.role === 'admin' ? 'text-brand-400' : 'text-slate-400'}`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Key size={16} className="text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Change Password</h3>
          </div>

          {status && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
              status === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {status === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              {msg}
            </div>
          )}

          <form onSubmit={changePassword} className="space-y-3">
            <div className="relative">
              <label className="label">New Password</label>
              <input className="input pr-10 text-xs"
                type={showPass ? 'text' : 'password'}
                value={passwords.newPass}
                onChange={e => setPasswords(p => ({...p, newPass: e.target.value}))}
                required />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 bottom-2.5 text-slate-500">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input className="input text-xs"
                type={showPass ? 'text' : 'password'}
                value={passwords.confirm}
                onChange={e => setPasswords(p => ({...p, confirm: e.target.value}))}
                required />
            </div>
            <button type="submit" className="btn-primary w-full justify-center">
              <Save size={14} /> Update Password
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}

Profile.propTypes = { user: PropTypes.object }
