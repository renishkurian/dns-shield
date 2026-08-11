# DNS Shield — Production-Grade DNS Protection

DNS Shield is a modern, high-performance DNS management platform designed for Raspberry Pi (Debian Bookworm), serving as a powerful, feature-rich replacement for Pi-hole. It combines a custom Python DNS proxy engine with a sleek React 18 + Django 5 administrative interface.

---

## 🚀 Key Features

- **Custom DNS Proxy**: High-performance, thread-safe resolver built with `dnslib`, achieving <2ms lookup latency.
- **Real-time Query Log**: WebSocket-driven live feed for monitoring network traffic as it happens.
- **Advanced Blocking**: Support for exact, wildcard, and regex (Python `re`) blocking rules.
- **Gravity Update Engine**: Automated adlist management with support for multiple formats (hosts, ABP, plain).
- **SafeSearch Integration**: Force SafeSearch for Google, Bing, YouTube, DuckDuckGo, and Yandex at the DNS level.
- **Network Management**: Integrated `iptables` management to prevent DNS bypass (blocks DoT/DoH from clients).
- **Private DNS (DoH) Wizard**: Built-in guide for setting up DNS-over-HTTPS via Cloudflare Tunnel for secure mobile browsing.
- **Role-Based Access**: Multi-user support with Admin and Viewer roles.
- **Modern Dashboard**: Responsive, dark-mode-first UI with Canvas-rendered traffic analytics.
- **Smart AI Integration**: Optional LLM-powered client profiling, threat insight, domain explain, app-domain generation, and browsing classification reports (see below).

---

## 🤖 AI Integrations

Configure under **Settings → AI Integrations** (`/settings/ai`). AI is optional — leave it disabled if you only want classic DNS blocking.

### Providers

| Provider | Auth | Typical model |
| :--- | :--- | :--- |
| **ChatGPT (OpenAI)** | API key | `gpt-4o-mini` |
| **Claude (Anthropic API)** | API key | `claude-3-haiku-20240307` |
| **Gemini (Google)** | API key | `gemini-1.5-flash` |
| **OpenRouter** | API key | `openai/gpt-4o-mini` |
| **Claude Browser Wrapper** | `sessionKey` cookie + Organization ID from [claude.ai](https://claude.ai) (not Anthropic API keys) | `claude-sonnet-5` |

API keys (when used) are stored in the local SQLite `SystemSetting` table. Usage is logged under **AI Usage Logs**.

### Claude Browser accounts

When the provider is **Claude Browser Wrapper**:

1. Add one or more accounts (name, session key, organization UUID).
2. Mark one as **Default** — it is tried first.
3. Use **Test connection** to verify login (session + org). This only checks authentication; chat can still fail later if Claude.ai is overloaded or rate-limited.
4. On failure (expired session, bad org, rate limit), the next configured account is used automatically.

Session handling follows the same `curl_cffi` browser-completion flow as related MarketMind tooling: create conversation → streamed `/completion`, with retries on HTTP 429/529 and per-account cooldowns so quotas are not burned in a tight loop.

### Auto Intelligence schedule

On the same settings page:

- Enable scheduled runs and pick a frequency (1h → weekly).
- Optionally enable **Auto device quarantine** — when on, compromised hosts are blocked and moved to the Quarantine group; when off, AI only logs a recommendation.
- **Save schedule**, or **Run now** for an immediate pass.
- High-trust domains are skipped automatically during profiling.
- Requires Smart AI to be enabled.

### AI Report (`/ai-report`)

Classifies unique DNS domains from a date range into content categories (movies, streaming, news, adult, ads, shopping, social, tech, cdn, finance, search, etc.).

- **Category lookup table**: after Claude (or another provider) classifies a domain, the result is stored in `DomainCategory`. Later reports reuse the cache and **only send unknown domains** to the model — fewer tokens and fewer rate limits.
- UI shows **Category cache: N domains** with **Clear category table** to wipe the lookup and force re-classification.
- Saved report snapshots can be reopened or cleared from the sidebar.
- The Clients column lists visitor IPs/names as a comma-separated line (hover for details).

### What AI is used for

| Feature | Purpose |
| :--- | :--- |
| Auto Intelligence / client profiler | Profile recent traffic and suggest block heuristics |
| AI threat insight | Summarize recent blocked domains |
| Domain explain | Explain a single domain |
| App generator | Suggest domains/CDNs for an app name |
| AI Report | Batch content-category classification for browsing reports |

### Operational notes

- DNS Shield still blocks at the **hostname** layer only. Path-level blocks (e.g. a single `.js` file on an allowed site) are not possible via DNS — use a browser filter or an HTTPS-inspecting proxy for that.
- Claude Browser rate limits are enforced by Claude.ai. If all accounts report “Rate limited”, wait for the window to clear and avoid spamming **Generate**. Prefer the category cache so repeat reports stay cheap.
- Restart the Django/ASGI process after pulling AI-related backend changes.

---

## 🛠 Tech Stack

| Component | Technology |
| :--- | :--- |
| **DNS Engine** | Python 3.11, `dnslib`, Threading, SocketPool |
| **Backend** | Django 5.x, REST Framework, Channels (WebSockets) |
| **Frontend** | React 18, Inertia.js style loading, Vite, TailwindCSS |
| **Database** | SQLite 3 (WAL mode), Redis (Channel Layer) |
| **Server** | Daphne (ASGI), Nginx, Supervisor |

---

## 📦 Installation

To install DNS Shield on a fresh Debian Bookworm system (e.g., Raspberry Pi 4/5):

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/dns-shield.git
   cd dns-shield
   ```

2. **Run the installer**:
   ```bash
   sudo ./install.sh
   ```

3. **Access the dashboard**:
   - URL: `http://<your-pi-ip>`
   - Default Login: `admin` / `changeme123`

---

---

## ⚙️ Configuration

- **Unbound**: DNS Shield expects an upstream recursive resolver like Unbound running on `127.0.0.1:5335`.
- **Environment**: Customize `.env` for production secrets, allowed hosts, and Redis URL.
- **Sudoers**: The `www-data` user requires specific NOPASSWD permissions for `iptables`, `unbound`, WireGuard, and Tor management (provided in `sudoers.d/dns-shield`; installed by `install.sh`).
- **Tor** (optional): The installer packages Tor but leaves the service disabled. Enable it from **Settings → Network**; per-client routing uses DNSPort `127.0.0.1:9053`. On an existing install:
  ```bash
  sudo apt-get install -y tor
  sudo systemctl disable --now tor   # until enabled from the UI
  sudo cp sudoers.d/dns-shield /etc/sudoers.d/dns-shield
  sudo chmod 440 /etc/sudoers.d/dns-shield
  sudo visudo -cf /etc/sudoers.d/dns-shield
  ```

---

## 🧪 Diagnostics & Development

DNS Shield includes built-in tools for testing and maintaining high-performance DNS features:

- **Seed Database**: Generate realistic, technical test data for the Query Log.
  ```bash
  python3 manage.py seed_data --queries 100
  ```
- **Clear Logs**: Instantly wipe all query logs for a fresh start.
  ```bash
  python3 manage.py seed_data --clear
  ```
- **Test Mode**: While the shield is disabled (via the UI), all filtering logic is bypassed to help troubleshoot upstream connectivity.

---

## 🤝 Support & License

DNS Shield is open-source and designed for the Raspberry Pi community.
MIT License © 2024.
