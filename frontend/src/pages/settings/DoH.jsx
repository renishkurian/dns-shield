import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { CheckCircle, ChevronRight, Shield, Globe, Terminal, Smartphone, Copy } from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Cloudflare Tunnel domain', icon: Globe },
  { id: 2, label: 'Configure Cloudflare Tunnel', icon: Terminal },
  { id: 3, label: 'Test & Verify', icon: CheckCircle },
  { id: 4, label: 'Android setup', icon: Smartphone },
]

export default function DoHSetup({ user }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('dns.rklab.online')
  const [copied, setCopied] = useState('')

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const CopyBtn = ({ text, id }) => (
    <button onClick={() => copy(text, id)}
      className="ml-2 text-slate-500 hover:text-brand-400 transition-colors">
      {copied === id ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  )

  return (
    <Layout user={user} currentPath="/settings/doh" title="DoH Setup Wizard">
      <div className="max-w-2xl">
        <h2 className="text-xl font-bold text-white mb-2">Private DNS / DoH Setup</h2>
        <p className="text-slate-500 text-sm mb-6">
          Configure DNS-over-HTTPS so your Android/iOS devices use DNS Shield when on mobile data.
        </p>

        {/* Progress */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors ${
                  step === s.id ? 'bg-brand-600/20 text-brand-400' : step > s.id ? 'text-green-400' : 'text-slate-500'
                }`}>
                {step > s.id ? <CheckCircle size={14} /> : <s.icon size={14} />}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-700 shrink-0" />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div className="card">
            <h3 className="font-semibold text-white mb-3">Step 1: Your Cloudflare Tunnel domain</h3>
            <p className="text-slate-500 text-xs mb-4">
              Enter the domain you've configured for Cloudflare Tunnel. This will be used for your DoH endpoint.
            </p>
            <div className="mb-4">
              <label className="label">Your tunnel domain</label>
              <input className="input text-xs" placeholder="dns-shield.yourdomain.com"
                value={domain} onChange={e => setDomain(e.target.value)} />
            </div>
            {domain && (
              <div className="bg-surface-100 rounded-lg p-3 text-xs mb-4">
                <div className="text-slate-400">Your DoH endpoint will be:</div>
                <div className="font-mono text-brand-400 mt-1">https://{domain}/dns-query</div>
              </div>
            )}
            <button onClick={() => setStep(2)} disabled={!domain} className="btn-primary">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h3 className="font-semibold text-white mb-3">Step 2: Cloudflare Tunnel config</h3>
            <p className="text-slate-500 text-xs mb-4">
              Add this to your Cloudflare Tunnel YAML config (<code>config.yml</code>):
            </p>
            <div className="bg-surface-100 rounded-lg p-3 mb-4 relative">
              <CopyBtn id="tunnel-yaml" text={`ingress:\n  - hostname: ${domain || 'your-domain.com'}\n    service: http://localhost:8000\n  - service: http_status:404`} />
              <pre className="text-xs font-mono text-slate-300 whitespace-pre">{`ingress:
  - hostname: ${domain || 'your-domain.com'}
    service: http://localhost:8000
  - service: http_status:404`}</pre>
            </div>
            <p className="text-slate-500 text-xs mb-3">The DoH endpoint <code>/dns-query</code> is handled by Nginx → Django → Unbound.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-ghost">Back</button>
              <button onClick={() => setStep(3)} className="btn-primary">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <h3 className="font-semibold text-white mb-3">Step 3: Test your DoH endpoint</h3>
            <p className="text-slate-500 text-xs mb-4">Run this command to verify DoH is working:</p>
            <div className="bg-surface-100 rounded-lg p-3 mb-4 relative">
              <CopyBtn id="curl-test" text={`curl -s "https://${domain || 'your-domain.com'}/resolve?name=google.com&type=A" | python3 -m json.tool`} />
              <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">
                {`curl -s "https://${domain || 'your-domain.com'}/resolve?name=google.com&type=A"`}
              </pre>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn-ghost">Back</button>
              <button onClick={() => setStep(4)} className="btn-primary">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="card">
            <h3 className="font-semibold text-white mb-3">Step 4: Configure Android Private DNS</h3>
            <div className="space-y-3 text-xs text-slate-400">
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">1</span>
                <span>Open <strong className="text-white">Settings → Network → Private DNS</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">2</span>
                <span>Select <strong className="text-white">"Private DNS provider hostname"</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">3</span>
                <div>
                  Enter your hostname:
                  <div className="bg-surface-100 rounded px-2 py-1 mt-1 font-mono text-brand-400 flex items-center gap-1">
                    {domain || 'your-domain.com'}
                    <CopyBtn id="android-hostname" text={domain || 'your-domain.com'} />
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">4</span>
                <span>Tap <strong className="text-white">Save</strong>. You should see a lock icon and "Private DNS active".</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/25 rounded-lg">
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <CheckCircle size={14} />
                <strong>Setup complete!</strong> DNS Shield will now filter queries from your Android device even on mobile data.
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

DoHSetup.propTypes = { user: PropTypes.object }
