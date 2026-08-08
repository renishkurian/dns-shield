import React, { useState, useEffect, useCallback, createContext, useContext } from 'react'
import PropTypes from 'prop-types'
import { X, Bell, ShieldAlert, CheckCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext(null)

let _alertApi = null

/** Imperative helpers for non-hook call sites (same as useAlert). */
export function appAlert(message, type = 'info') {
  if (_alertApi) return _alertApi.alert(message, type)
  window.alert(String(message))
  return Promise.resolve()
}

export function appConfirm(message, options = {}) {
  if (_alertApi) return _alertApi.confirm(message, options)
  return Promise.resolve(window.confirm(String(message)))
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null) // { mode, message, type, title, confirmLabel, cancelLabel, danger, resolve }

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2, 11)
    setToasts(prev => [...prev, { id, message: String(message), type }])
    setTimeout(() => removeToast(id), 5000)
  }, [removeToast])

  const alert = useCallback((message, type = 'info') => {
    return new Promise((resolve) => {
      setDialog({
        mode: 'alert',
        message: String(message || ''),
        type,
        title: type === 'error' ? 'Error' : type === 'success' ? 'Success' : type === 'warning' ? 'Notice' : 'Message',
        confirmLabel: 'OK',
        resolve: () => resolve(),
      })
    })
  }, [])

  const confirm = useCallback((message, options = {}) => {
    const text = String(message || '')
    const danger = options.danger ?? /delete|remove|clear|revoke|permanently|wipe|block/i.test(text)
    return new Promise((resolve) => {
      setDialog({
        mode: 'confirm',
        message: text,
        type: danger ? 'warning' : 'info',
        title: options.title || (danger ? 'Please confirm' : 'Confirm'),
        confirmLabel: options.confirmLabel || (danger ? 'Confirm' : 'OK'),
        cancelLabel: options.cancelLabel || 'Cancel',
        danger,
        resolve,
      })
    })
  }, [])

  const closeDialog = useCallback((result) => {
    setDialog(current => {
      if (current?.resolve) {
        if (current.mode === 'confirm') current.resolve(Boolean(result))
        else current.resolve()
      }
      return null
    })
  }, [])

  useEffect(() => {
    _alertApi = { alert, confirm, addToast }
    return () => {
      if (_alertApi?.alert === alert) _alertApi = null
    }
  }, [alert, confirm, addToast])

  // Escape closes confirm as cancel / alert as OK
  useEffect(() => {
    if (!dialog) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDialog(dialog.mode === 'confirm' ? false : true)
      }
      if (e.key === 'Enter' && dialog.mode === 'alert') {
        e.preventDefault()
        closeDialog(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, closeDialog])

  return (
    <ToastContext.Provider value={{ addToast, alert, confirm }}>
      {children}
      <div className="fixed top-20 right-6 z-[200] flex flex-col gap-3 w-80 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onRemove={() => removeToast(toast.id)} />
          </div>
        ))}
      </div>
      {dialog && (
        <AlertDialog
          dialog={dialog}
          onConfirm={() => closeDialog(true)}
          onCancel={() => closeDialog(false)}
        />
      )}
    </ToastContext.Provider>
  )
}

ToastProvider.propTypes = { children: PropTypes.node }

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      addToast: (msg, type) => appAlert(msg, type),
      alert: appAlert,
      confirm: appConfirm,
    }
  }
  return ctx
}

/** Alias with clearer name for alert/confirm usage. */
export function useAlert() {
  return useToast()
}

function ToastItem({ toast, onRemove }) {
  const icons = {
    info: { icon: Info, color: 'text-brand-400', bg: 'bg-brand-500/10', border: 'border-brand-500/20' },
    success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    error: { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    warning: { icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  }

  const ctx = icons[toast.type] || icons.info
  const Icon = ctx.icon

  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${ctx.bg} ${ctx.border} shadow-2xl animate-slide-in backdrop-blur-md`}>
      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${ctx.bg} ${ctx.color}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 pt-1">
        <p className="text-xs font-medium text-slate-200 leading-relaxed whitespace-pre-wrap">{toast.message}</p>
      </div>
      <button type="button" onClick={onRemove} className="text-slate-500 hover:text-white transition-colors duration-200">
        <X size={14} />
      </button>
    </div>
  )
}

ToastItem.propTypes = {
  toast: PropTypes.object.isRequired,
  onRemove: PropTypes.func.isRequired,
}

function AlertDialog({ dialog, onConfirm, onCancel }) {
  const icons = {
    info: { icon: Info, color: 'text-brand-400', ring: 'bg-brand-500/15' },
    success: { icon: CheckCircle, color: 'text-emerald-400', ring: 'bg-emerald-500/15' },
    error: { icon: ShieldAlert, color: 'text-red-400', ring: 'bg-red-500/15' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', ring: 'bg-amber-500/15' },
  }
  const style = icons[dialog.type] || icons.info
  const Icon = style.icon
  const isConfirm = dialog.mode === 'confirm'

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="presentation"
      onClick={() => (isConfirm ? onCancel() : onConfirm())}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dns-alert-title"
        aria-describedby="dns-alert-desc"
        className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 flex gap-4">
          <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center ${style.ring} ${style.color}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="dns-alert-title" className="text-sm font-bold text-white tracking-tight">
              {dialog.title}
            </h3>
            <p id="dns-alert-desc" className="text-sm text-slate-400 mt-2 leading-relaxed whitespace-pre-wrap">
              {dialog.message}
            </p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          {isConfirm && (
            <button type="button" onClick={onCancel} className="btn-ghost text-xs px-4">
              {dialog.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={
              dialog.danger
                ? 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white transition-colors'
                : 'btn-primary text-xs px-4'
            }
          >
            {dialog.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

AlertDialog.propTypes = {
  dialog: PropTypes.object.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}
