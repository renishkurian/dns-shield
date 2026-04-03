import React from 'react'
import PropTypes from 'prop-types'
import Sidebar from './Sidebar'

export default function Layout({ children, user, currentPath, title }) {
  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar currentPath={currentPath} user={user} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 bg-surface-50 border-b border-slate-700/50 flex items-center px-6">
          <h1 className="text-sm font-semibold text-white">
            {title || 'DNS Shield'}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <StatusDot />
          </div>
        </header>
        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node,
  user: PropTypes.object,
  currentPath: PropTypes.string,
  title: PropTypes.string,
}

function StatusDot() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse-slow" />
      <span>Proxy active</span>
    </div>
  )
}
