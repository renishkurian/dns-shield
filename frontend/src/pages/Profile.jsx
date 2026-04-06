import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import Layout from '../components/Layout'
import { Key, Save, Eye, EyeOff, AlertCircle, CheckCircle, Copy, RefreshCw, Trash2, Code } from 'lucide-react'

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}

export default function Profile({ user }) {
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState(null)
  const [msg, setMsg] = useState('')
  const [token, setToken] = useState(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/auth/token').then(r => r.json()).then(d => setToken(d.token)).catch(() => {})
  }, [])

  const changePassword = async (e) => {
    e.preventDefault()
    if (passwords.newPass !== passwords.confirm) { setStatus('error'); setMsg('New passwords do not match'); return }
    if (passwords.newPass.length < 8) { setStatus('error'); setMsg('Password must be at least 8 characters'); return }
    const res = await fetch(`/api/users/${user?.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ password: passwords.newPass }),
    })
    if (res.ok) { setStatus('ok'); setMsg('Password updated successfully'); setPasswords({ current: '', newPass: '', confirm: '' }) }
    else { setStatus('error'); setMsg('Failed to update password') }
  }

  const generateToken = async () => {
    setTokenLoading(true)
    const res = await fetch('/api/auth/token', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } })
    const d = await res.json()
    setToken(d.token)
    setTokenLoading(false)
  }

  const revokeToken = async () => {
    await fetch('/api/auth/token', { method: 'DELETE', headers: { 'X-CSRFToken': getCsrf() } })
    setToken(null)
  }

  const copyToken = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Layout user={user} currentPath="/profile" title="Profile">
      <div className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6">My Profile</h2>

        <div className="card mb-4">
          <h3 className="font-semibold text-white text-sm mb-3">Account Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Username</span><span className="text-slate-200">{user?.username}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-200">{user?.email || '—'}</span></div>
            <div className="flex justify-between">
              <span className="text-slate-500">Role</span>
              <span className={`capitalize ${user?.role === 'admin' ? 'text-brand-400' : 'text-slate-400'}`}>{user?.role}</span>
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4"><Key size={16} className="text-brand-400" /><h3 className="font-semibold text-white text-sm">Change Password</h3></div>
          {status && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${status === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {status === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}{msg}
            </div>
          )}
          <form onSubmit={changePassword} className="space-y-3">
            <div className="relative">
              <label className="label">New Password</label>
              <input className="input pr-10 text-xs" type={showPass ? 'text' : 'password'} value={passwords.newPass} onChange={e => setPasswords(p => ({...p, newPass: e.target.value}))} required />
              <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 bottom-2.5 text-slate-500">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input className="input text-xs" type={showPass ? 'text' : 'password'} value={passwords.confirm} onChange={e => setPasswords(p => ({...p, confirm: e.target.value}))} required />
            </div>
            <button type="submit" className="btn-primary w-full justify-center"><Save size={14} /> Update Password</button>
          </form>
        </div>

        {/* API Token */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1"><Code size={16} className="text-purple-400" /><h3 className="font-semibold text-white text-sm">API Token</h3></div>
          <p className="text-xs text-slate-500 mb-4">Use this token to authenticate external requests (e.g. Grafana, scripts, Home Assistant).</p>
          {token ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
                <code className="text-xs font-mono text-purple-300 flex-1 truncate">{token}</code>
                <button onClick={copyToken} className="text-slate-400 hover:text-white transition-colors shrink-0">
                  {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={generateToken} disabled={tokenLoading} className="btn-ghost text-xs flex-1 justify-center">
                  <RefreshCw size={12} className={tokenLoading ? 'animate-spin' : ''} /> Regenerate
                </button>
                <button onClick={revokeToken} className="btn-ghost text-xs text-red-400 flex-1 justify-center">
                  <Trash2 size={12} /> Revoke
                </button>
              </div>
            </div>
          ) : (
            <button onClick={generateToken} disabled={tokenLoading} className="btn-primary w-full justify-center">
              <Key size={14} /> {tokenLoading ? 'Generating…' : 'Generate API Token'}
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}

Profile.propTypes = { user: PropTypes.object }
