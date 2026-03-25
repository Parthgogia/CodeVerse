import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id:       string;
  type:     ToastType;
  title:    string;
  message?: string;
  duration: number;
}

interface ToastCtx {
  toast: (opts: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error:   (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info:    (title: string, message?: string) => void;
}

// ── Context ───────────────────────────────────────────────
const ToastContext = createContext<ToastCtx | null>(null);

// ── Toast item ────────────────────────────────────────────
const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error:   <XCircle size={16} />,
  warning: <AlertCircle size={16} />,
  info:    <Info size={16} />,
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string; progress: string }> = {
  success: { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  icon: '#10b981', progress: '#10b981' },
  error:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   icon: '#ef4444', progress: '#ef4444' },
  warning: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  icon: '#f59e0b', progress: '#f59e0b' },
  info:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  icon: '#60a5fa', progress: '#3b82f6' },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const colors = COLORS[toast.type];
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Progress bar
    const step = 100 / (toast.duration / 50);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p <= 0) { clearInterval(intervalRef.current); return 0; }
        return p - step;
      });
    }, 50);

    // Auto remove
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.duration);

    return () => { clearTimeout(timer); clearInterval(intervalRef.current); };
  }, [toast.id, toast.duration, onRemove]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onRemove(toast.id), 300);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-3)',
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        width: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        position: 'relative',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(20px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}
    >
      {/* Icon + content + close */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: colors.icon, flexShrink: 0, marginTop: 1 }}>
          {ICONS[toast.type]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-1)' }}>{toast.title}</div>
          {toast.message && (
            <div style={{ fontSize: 12, color: 'var(--tx-2)', marginTop: 2, lineHeight: 1.5 }}>{toast.message}</div>
          )}
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--tx-3)', display: 'flex', flexShrink: 0,
            padding: 2, borderRadius: 4, transition: 'color 150ms',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 2, width: `${progress}%`,
        background: colors.progress,
        borderRadius: '0 0 0 var(--r-md)',
        transition: 'width 50ms linear',
      }} />
    </div>
  );
}

// ── Container ─────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} onRemove={onRemove} />
        </div>
      ))}
    </div>,
    document.body
  );
}

// ── Provider ──────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { ...opts, id }]); // max 5 visible
  }, []);

  const success = useCallback((title: string, message?: string) =>
    toast({ type: 'success', title, message, duration: 3500 }), [toast]);

  const error = useCallback((title: string, message?: string) =>
    toast({ type: 'error', title, message, duration: 5000 }), [toast]);

  const warning = useCallback((title: string, message?: string) =>
    toast({ type: 'warning', title, message, duration: 4000 }), [toast]);

  const info = useCallback((title: string, message?: string) =>
    toast({ type: 'info', title, message, duration: 3500 }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────
export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
