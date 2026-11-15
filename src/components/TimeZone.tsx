import { useMemo, useState } from 'react'
import { Button, Input, Modal, cx } from './ui'
import { detectTz, tzAbbr, tzLabel, tzOptions } from '../lib/tz'

export const TZ_MAP_URL = 'https://zoneguessr.vergara.one'

export function TimeZonePopup({
  open, onClose, onPick, organizerTz, organizerName, current,
}: {
  open: boolean
  onClose: () => void
  onPick: (tz: string) => void
  organizerTz?: string
  organizerName?: string
  current?: string
}) {
  const auto = detectTz()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return tzOptions().filter((o) => o.search.includes(s)).slice(0, 40)
  }, [q])

  const Row = ({ tz, title, sub }: { tz: string; title: string; sub: string }) => (
    <button
      onClick={() => onPick(tz)}
      className={cx(
        'w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition',
        current === tz ? 'border-brand-600 bg-brand-50' : 'border-ink/10 hover:border-brand-400',
      )}
    >
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink/60">{sub}</span>
      </span>
      <span className="text-sm font-bold text-brand-700">{tzAbbr(tz)}</span>
    </button>
  )

  return (
    <Modal open={open} onClose={onClose} title="Which time zone are you in?">
      <div className="space-y-2">
        <Row tz={auto} title="Detected" sub={tzLabel(auto)} />
        {organizerTz && organizerTz !== auto && (
          <Row tz={organizerTz} title={`${organizerName || 'Organizer'}’s time zone`} sub={tzLabel(organizerTz)} />
        )}
      </div>
      <div className="mt-4">
        <Input placeholder="Search a city or zone" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.length > 0 && (
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-ink/10 divide-y divide-ink/5">
            {list.map((o) => (
              <button key={o.tz} onClick={() => onPick(o.tz)} className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm cursor-pointer">
                {o.label}
              </button>
            ))}
          </div>
        )}
        {q && list.length === 0 && <p className="text-sm text-ink/55 mt-2">No match.</p>}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <a href={TZ_MAP_URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 hover:underline">
          Time zone map
        </a>
        {current && <Button variant="ghost" size="sm" onClick={onClose}>Keep {tzAbbr(current)}</Button>}
      </div>
    </Modal>
  )
}

/** "Showing times in [CST]" plus the teammates' time zone dropdown. */
export function TzBar({
  viewTz, myTz, onOpenPicker, members, onView,
}: {
  viewTz: string
  myTz: string
  onOpenPicker: () => void
  members?: { name: string; tz: string | null }[]
  onView?: (tz: string, name: string | null) => void
}) {
  const viewingOther = viewTz !== myTz
  const who = members?.find((m) => m.tz === viewTz && viewingOther)
  const others = (members || []).filter((m) => m.tz)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={onOpenPicker}
        className="rounded-lg border-2 border-ink/20 bg-white px-2.5 py-1 font-bold hover:border-brand-500 cursor-pointer"
        title={tzLabel(viewTz)}
      >
        {tzAbbr(viewTz)} ▾
      </button>
      {viewingOther && (
        <span className="text-ink/60">
          {who?.name && <>{who.name} · </>}
          <button className="text-brand-700 font-semibold hover:underline cursor-pointer" onClick={() => onView?.(myTz, null)}>Back to mine</button>
        </span>
      )}
      {onView && others.length > 0 && (
        <select
          className="rounded-lg border-2 border-ink/20 bg-white px-2 py-1 cursor-pointer"
          value=""
          onChange={(e) => {
            const m = others.find((o) => o.name === e.target.value)
            if (m?.tz) onView(m.tz, m.name)
          }}
          aria-label="View in a teammate's time zone"
        >
          <option value="">Others’ zones</option>
          {others.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({tzAbbr(m.tz!)})
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
