import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
}

export function Button({ variant = 'primary', size = 'md', block, className, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5',
        size === 'lg' && 'px-6 py-3.5 text-lg',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
        variant === 'soft' && 'bg-brand-200 text-brand-800 border-2 border-brand-600 hover:bg-brand-300',
        variant === 'secondary' && 'bg-white text-brand-700 border-2 border-brand-600 hover:bg-brand-50',
        variant === 'ghost' && 'text-brand-700 hover:bg-brand-100',
        variant === 'danger' && 'bg-white text-red-700 border-2 border-red-300 hover:bg-red-50',
        block && 'w-full',
        className,
      )}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bg-white rounded-2xl border border-black/5 shadow-sm p-5 sm:p-6', className)}>{children}</div>
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink/55 mt-1">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-xl border-2 border-ink/15 bg-white px-3.5 py-2.5 outline-none focus:border-brand-500 placeholder:text-ink/35',
        props.className,
      )}
    />
  )
}

export function Checkbox({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-brand-600 cursor-pointer" />
      <span>
        <span className="font-medium">{label}</span>
        {sub && <span className="block text-sm text-ink/55">{sub}</span>}
      </span>
    </label>
  )
}

const pillStyles: Record<string, string> = {
  green: 'bg-go-100 text-go-800',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-ink/5 text-ink/60',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800',
}
export function Pill({ tone = 'gray', children }: { tone?: keyof typeof pillStyles; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', pillStyles[tone])}>
      {children}
    </span>
  )
}

export function Callout({ children, tone = 'dashed' }: { children: ReactNode; tone?: 'dashed' | 'info' | 'warn' }) {
  return (
    <div
      className={cx(
        'rounded-xl px-4 py-3 text-sm',
        tone === 'dashed' && 'border-2 border-dashed border-ink/25 text-ink/75',
        tone === 'info' && 'bg-brand-50 border border-brand-200 text-brand-900',
        tone === 'warn' && 'bg-amber-50 border border-amber-200 text-amber-900',
      )}
    >
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('animate-in bg-white w-full rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-ink/5 text-xl cursor-pointer" aria-label="Close">×</button>
        </div>
        <div className="p-5 pt-3">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-5 rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin', className)} />
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-4 rounded-full border-2 border-ink/80 bg-white overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div
        className="h-full bg-brand-300 transition-all duration-700"
        style={{ width: `${pct}%`, backgroundImage: 'repeating-linear-gradient(-60deg, transparent 0 8px, rgba(3,103,225,.55) 8px 10px)' }}
      />
    </div>
  )
}

// ---- toasts (also used as the on-screen "notification lands here") --------

type Toast = { id: number; title: string; body?: string }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { ...t, id }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 6000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-3 inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className="animate-in pointer-events-auto w-full max-w-sm rounded-2xl bg-white/95 backdrop-blur shadow-lg border border-black/5 px-4 py-3">
            <div className="min-w-0">
              <div className="font-semibold text-sm">{t.title}</div>
              {t.body && <div className="text-sm text-ink/70 break-words">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
