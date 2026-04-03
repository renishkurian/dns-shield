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

## ⚙️ Configuration

- **Unbound**: DNS Shield expects an upstream recursive resolver like Unbound running on `127.0.0.1:5335`.
- **Environment**: Customize `.env` for production secrets, allowed hosts, and Redis URL.
- **Sudoers**: The `www-data` user requires specific NOPASSWD permissions for `iptables` and `unbound` management (provided in `sudoers.d/`).

---

## 🤝 Support & License

DNS Shield is open-source and designed for the Raspberry Pi community.
MIT License © 2024.
