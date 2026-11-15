import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from './ui'
import { update } from '../lib/storage'

// Floating "presenter" controls to fast-forward the scenario during a demo.
// Toggle with the Demo button or Shift+D.
export function DemoPanel() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  const m = loc.pathname.match(/^\/e\/([^/]+)/)
  const eventId = m?.[1] || 'demo'

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === 'd' && !(e.target as HTMLElement).closest('input,textarea')) setOpen((o) => !o)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const run = async (action: string) => {
    try {
      const r = await api.post<{ message: string }>(`/api/demo/${eventId}/${action}`)
      toast({ title: r.message })
      window.dispatchEvent(new Event('ms:refresh'))
    } catch (e: any) {
      toast({ title: e.message })
    }
  }

  const actions: [string, string][] = [
    ['next-response', 'Next person connects calendar'],
    ['near-deadline', 'Deadline is tomorrow (auto reminders)'],
    ['deadline', 'Deadline passes (auto-pick time)'],
    ['cancel', 'Someone can’t make it'],
    ['meeting-soon', 'Meeting is tomorrow (reminders)'],
  ]

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="animate-in w-72 rounded-2xl bg-ink text-white shadow-2xl p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <b>Demo controls</b>
            <span className="text-white/50 text-xs">{eventId === 'demo' ? 'CS 330 demo' : `meeting ${eventId}`}</span>
          </div>
          {actions.map(([a, label]) => (
            <button key={a} onClick={() => run(a)} className="w-full text-left rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 cursor-pointer">{label}</button>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={() => { update((s) => { s.organizer.demo = 'demo' }); nav('/e/demo/manage?k=demo') }} className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-2 cursor-pointer">Organizer view</button>
            <button onClick={() => nav('/e/demo')} className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-2 cursor-pointer">Invite view</button>
          </div>
          <button onClick={() => { if (confirm('Reset the CS 330 demo meeting?')) { update((s) => { delete s.me.demo; delete s.tz.demo }); run('reset') } }} className="w-full rounded-lg border border-white/20 hover:bg-white/10 px-3 py-2 cursor-pointer">Reset demo meeting</button>
          <p className="text-white/40 text-xs">Shift+D toggles this panel.</p>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="h-10 px-4 rounded-full bg-ink text-white text-sm font-semibold shadow-lg hover:scale-105 transition cursor-pointer" aria-label="Demo controls" title="Demo controls (Shift+D)">
        Demo
      </button>
    </div>
  )
}
