import React, { useState, useEffect, createContext, useContext } from 'react'
import { X, Bell, ShieldAlert, CheckCircle, Info } from 'lucide-react'

const ToastContext = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = (message, type = 'info') => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => removeToast(id), 5000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-20 right-6 z-[200] flex flex-col gap-3 w-80">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

function Toast({ toast, onRemove }) {
  const icons = {
    info:    { icon: Info,        color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/20' },
    success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    error:   { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    warning: { icon: Bell,        color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  }
  
  const ctx = icons[toast.type] || icons.info
  const Icon = ctx.icon

  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${ctx.bg} ${ctx.border} shadow-2xl animate-slide-in backdrop-blur-md`}>
      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${ctx.bg} ${ctx.color}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 pt-1">
        <p className="text-xs font-medium text-slate-200 leading-relaxed">{toast.message}</p>
      </div>
      <button onClick={onRemove} className="text-slate-500 hover:text-white transition-colors duration-200">
        <X size={14} />
      </button>
    </div>
  )
}
