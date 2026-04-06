import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { router } from '@inertiajs/react'
import {
  LayoutDashboard, List, Shield, Filter, CheckCircle, Globe,
  Users, Settings, Search, Network, Download, LogOut,
  ChevronLeft, ChevronRight, Wifi, User, Database, Menu, BookOpen, Sparkles,
  Wrench, ClipboardList, Activity, Key
} from 'lucide-react'
import ShieldControl from './ShieldControl'

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Query Log', href: '/queries', icon: List },
      { label: 'Network Map', href: '/network/map', icon: Network },
    ]
  },
  {
    label: 'Blocking',
    items: [
      { label: 'Domains', href: '/blocks/domains', icon: Shield },
      { label: 'Patterns', href: '/blocks/patterns', icon: Filter },
      { label: 'Allowlist', href: '/blocks/allowlist', icon: CheckCircle },
      { label: 'Adlists', href: '/lists', icon: Database },
      { label: 'App Firewall', href: '/blocks/apps', icon: Shield },
    ]
  },
  {
    label: 'Network',
    items: [
      { label: 'Clients', href: '/clients', icon: Wifi },
      { label: 'Safe Search', href: '/safesearch', icon: Search },
    ]
  },
  {
    label: 'Settings',
    items: [
      { label: 'DNS Config', href: '/settings/dns', icon: Globe },
      { label: 'Network', href: '/settings/network', icon: Network },
      { label: 'DoH Setup', href: '/settings/doh', icon: Shield },
      { label: 'Backup', href: '/settings/backup', icon: Download },
      { label: 'AI Integrations', href: '/settings/ai', icon: Sparkles },
      { label: 'API Token', href: '/settings/api-token', icon: Key },
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Domain Search', href: '/tools', icon: Wrench },
      { label: 'Audit Log', href: '/audit', icon: ClipboardList },
      { label: 'System Health', href: '/settings/health', icon: Activity },
    ]
  },
  {
    label: 'Help',
    items: [
      { label: 'Documentation', href: '/docs', icon: BookOpen },
    ]
  },
]

const adminGroup = {
  label: 'Administration',
  items: [
    { label: 'Users', href: '/users', icon: Users },
    { label: 'Block Groups', href: '/blocks/groups', icon: User },
    { label: 'VPN (Wireguard)', href: '/vpn', icon: Shield },
  ]
}

function NavItem({ item, currentPath, collapsed }) {
  const active = currentPath === item.href || (item.href !== '/' && currentPath?.startsWith(item.href))
  return (
    <button
      onClick={() => router.visit(item.href)}
      className={`${active ? 'nav-item-active' : 'nav-item'} w-full ${collapsed ? 'justify-center px-2' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={18} className="shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </button>
  )
}

NavItem.propTypes = {
  item: PropTypes.shape({ label: PropTypes.string, href: PropTypes.string, icon: PropTypes.elementType }).isRequired,
  currentPath: PropTypes.string,
  collapsed: PropTypes.bool,
}

export default function Sidebar({ currentPath, user }) {
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'X-CSRFToken': getCsrf(),
        'Content-Type': 'application/json',
      }
    })
    router.visit('/login')
  }

  // Combine groups based on user role
  const groupsToRender = [...navGroups]
  if (user?.role === 'admin') {
    // Insert Administration right after Overview
    groupsToRender.splice(1, 0, adminGroup)
  }

  return (
    <aside className={`
      flex flex-col h-screen bg-surface-50 border-r border-slate-700/50 
      transition-all duration-300 shrink-0
      ${collapsed ? 'w-16' : 'w-64'}
    `}>
      {/* Logo */}
      <div className="p-4 border-b border-slate-700/50">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Shield size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold text-white text-sm leading-tight">DNS Shield</div>
              <div className="text-xs text-slate-500">v2.0</div>
            </div>
          )}
          <button
            className="ml-auto text-slate-500 hover:text-white transition-colors"
            onClick={() => setCollapsed(c => !c)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {/* Shield Control (Admin only) */}
      {!collapsed && (user?.role === 'admin') && <ShieldControl />}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-4">
        {groupsToRender.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <div className="px-3 mb-1 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem key={item.href} item={item} currentPath={currentPath} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="p-2 border-t border-slate-700/50 space-y-0.5">
        <button
          onClick={() => router.visit('/profile')}
          className={`nav-item w-full ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <div className="w-6 h-6 bg-brand-600/30 rounded-full flex items-center justify-center shrink-0">
            <User size={12} className="text-brand-400" />
          </div>
          {!collapsed && (
            <div className="flex-1 text-left">
              <div className="text-xs text-white leading-tight">{user?.username || 'User'}</div>
              <div className="text-xs text-slate-500 capitalize">{user?.role || 'viewer'}</div>
            </div>
          )}
        </button>
        <button
          onClick={handleLogout}
          className={`nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 ${collapsed ? 'justify-center px-2' : ''}`}
          title="Logout"
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}

Sidebar.propTypes = {
  currentPath: PropTypes.string,
  user: PropTypes.shape({ username: PropTypes.string, role: PropTypes.string }),
}

function getCsrf() {
  return document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || ''
}
