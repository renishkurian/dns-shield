import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Layout from '../../components/Layout'
import { CheckCircle, ChevronRight, Shield, Globe, Terminal, Smartphone, Copy, Lock, Info } from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Get TLS cert', icon: Lock },
  { id: 2, label: 'Configure cert', icon: Terminal },
  { id: 3, label: 'Open port 853', icon: Shield },
  { id: 4, label: 'Android setup', icon: Smartphone },
  { id: 5, label: 'DoH (bonus)', icon: Globe },
]

export default function DoHSetup({ user }) {
  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('shield.rklab.online')
  const [copied, setCopied] = useState('')

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const CopyBtn = ({ text, id }) => (
    <button onClick={() => copy(text, id)}
      className="ml-2 text-slate-500 hover:text-brand-400 transition-colors shrink-0">
      {copied === id ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  )

  const Code = ({ children, id }) => (
    <div className="bg-surface-100 rounded-lg p-3 mb-3 relative flex items-start gap-2">
      <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all flex-1">{children}</pre>
      {id && <CopyBtn text={children} id={id} />}
    </div>
  )

  return (
    <Layout user={user} currentPath="/settings/doh" title="Private DNS Setup">
      <div className="max-w-2xl">
        <h2 className="text-xl font-bold text-white mb-1">Android Private DNS Setup</h2>
        <p className="text-slate-500 text-sm mb-2">
          Android Private DNS uses <strong className="text-white">DNS-over-TLS (DoT) on port 853</strong> — not HTTPS.
          Cloudflare Tunnel only handles HTTP traffic so it can't carry DoT. You need port 853 open directly on your server.
        </p>
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 mb-6 text-xs text-amber-300">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>Your Cloudflare Tunnel is great for the dashboard and DoH — just not for Android Private DNS which requires raw TCP/TLS on port 853.</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-0 mb-8 flex-wrap">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button onClick={() => setStep(s.id)}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors ${step === s.id ? 'bg-brand-600/20 text-brand-400' : step > s.id ? 'text-green-400' : 'text-slate-500'
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
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Step 1: Get a TLS certificate for port 853</h3>
            <p className="text-slate-400 text-xs">
              You need a real TLS cert for <code className="text-brand-400">{domain}</code> on your server.
              Two options:
            </p>

            <div className="border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-white">Option A — Let's Encrypt (recommended)</div>
              <p className="text-slate-400 text-xs">Run on your server. Requires port 80 or 443 open, or use DNS challenge.</p>
              <Code id="certbot-cmd">{`# Install certbot with Cloudflare DNS plugin
apt install certbot python3-certbot-dns-cloudflare

# Create Cloudflare API token file
mkdir -p /etc/cloudflare
echo "dns_cloudflare_api_token = YOUR_CF_API_TOKEN" > /etc/cloudflare/token.ini
chmod 600 /etc/cloudflare/token.ini

# Issue cert (no ports needed — DNS challenge)
certbot certonly \\
  --dns-cloudflare \\
  --dns-cloudflare-credentials /etc/cloudflare/token.ini \\
  -d ${domain}`}</Code>
              <p className="text-slate-500 text-xs">Cert lands at <code>/etc/letsencrypt/live/{domain}/</code> — DNS Shield finds it automatically.</p>
            </div>

            <div className="border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-white">Option B — Cloudflare Origin Certificate</div>
              <p className="text-slate-400 text-xs">Free 15-year cert from Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate. Download as PEM then:</p>
              <Code id="cf-origin-cmd">{`mkdir -p /etc/ssl/dns-shield
# Paste the cert Cloudflare gave you:
nano /etc/ssl/dns-shield/fullchain.pem
nano /etc/ssl/dns-shield/privkey.pem
chmod 600 /etc/ssl/dns-shield/privkey.pem`}</Code>
              <p className="text-slate-500 text-xs">Note: Origin certs are only trusted by Cloudflare. Android will reject them. Use Option A for DoT.</p>
            </div>

            <button onClick={() => setStep(2)} className="btn-primary">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Step 2: Tell DNS Shield where the cert is</h3>
            <p className="text-slate-400 text-xs">
              If you used Let's Encrypt, DNS Shield finds the cert automatically. If you used a custom path, set it via the API:
            </p>
            <Code id="settings-api">{`curl -s -X PATCH http://localhost:8888/api/settings \\
  -H "Content-Type: application/json" \\
  -d '{
    "dot_cert_path": "/etc/letsencrypt/live/${domain}/fullchain.pem",
    "dot_key_path":  "/etc/letsencrypt/live/${domain}/privkey.pem"
  }'`}</Code>
            <p className="text-slate-400 text-xs">Then restart the proxy process to pick up the cert:</p>
            <Code id="restart-cmd">{`supervisorctl restart dns-shield-proxy`}</Code>
            <p className="text-slate-400 text-xs">Check the proxy log to confirm DoT started:</p>
            <Code id="check-log">{`tail -f /opt/dns-shield/logs/proxy.log | grep -i dot`}</Code>
            <p className="text-slate-500 text-xs">You should see: <code className="text-green-400">DoT listener on 0.0.0.0:853 (TLS)</code></p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-ghost">Back</button>
              <button onClick={() => setStep(3)} className="btn-primary">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Step 3: Open port 853 on your router</h3>
            <p className="text-slate-400 text-xs">
              Port 853 TCP must be forwarded from your router to this server. Also open it in iptables:
            </p>
            <Code id="iptables-cmd">{`# Allow inbound DoT
iptables -A INPUT -p tcp --dport 853 -j ACCEPT

# Save so it survives reboot
netfilter-persistent save`}</Code>
            <p className="text-slate-400 text-xs">Then forward port 853 TCP in your router's port forwarding settings to this server's LAN IP.</p>

            <p className="text-slate-400 text-xs">Test it from outside your network:</p>
            <Code id="kdig-test">{`# Install kdig: apt install knot-dnsutils
kdig -d @${domain} +tls google.com A`}</Code>
            <p className="text-slate-500 text-xs">You should see a valid A record response. If it hangs, port 853 isn't forwarded yet.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn-ghost">Back</button>
              <button onClick={() => setStep(4)} className="btn-primary">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Step 4: Configure Android Private DNS</h3>
            <div className="space-y-3 text-xs text-slate-400">
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">1</span>
                <span>Go to <strong className="text-white">Settings → Network & internet → Private DNS</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">2</span>
                <span>Select <strong className="text-white">"Private DNS provider hostname"</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">3</span>
                <div className="flex-1">
                  Enter your hostname (just the domain, no <code>https://</code> or path):
                  <div className="bg-surface-100 rounded px-2 py-1 mt-1 font-mono text-brand-400 flex items-center gap-1">
                    {domain}
                    <CopyBtn id="android-hostname" text={domain} />
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="badge-blue shrink-0">4</span>
                <span>Tap <strong className="text-white">Save</strong>. Android will probe port 853. You'll see <strong className="text-white">"Private DNS active"</strong> when it connects.</span>
              </div>
            </div>
            <div className="p-3 bg-green-500/10 border border-green-500/25 rounded-lg text-xs text-green-400 flex items-center gap-2">
              <CheckCircle size={14} />
              All DNS from your Android (including mobile data) will now go through DNS Shield.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="btn-ghost">Back</button>
              <button onClick={() => setStep(5)} className="btn-primary">DoH bonus <ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="card space-y-4">
            <h3 className="font-semibold text-white">Bonus: DoH via Cloudflare Tunnel</h3>
            <p className="text-slate-400 text-xs">
              Your existing tunnel at <code className="text-brand-400">https://{domain}/dns-query</code> works for DoH-capable apps (Firefox, Chrome, curl). It won't work for Android Private DNS but is useful for desktop and custom DNS clients.
            </p>
            <p className="text-slate-400 text-xs">Test it:</p>
            <Code id="doh-test">{`curl -s "https://${domain}/resolve?name=google.com&type=A" | python3 -m json.tool`}</Code>
            <p className="text-slate-400 text-xs">Configure in Firefox (<code>about:preferences#privacy</code> → DNS over HTTPS → Custom):</p>
            <div className="bg-surface-100 rounded px-2 py-1 font-mono text-brand-400 text-xs flex items-center gap-1">
              {`https://${domain}/dns-query`}
              <CopyBtn id="doh-url" text={`https://${domain}/dns-query`} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(4)} className="btn-ghost">Back</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

DoHSetup.propTypes = { user: PropTypes.object }
