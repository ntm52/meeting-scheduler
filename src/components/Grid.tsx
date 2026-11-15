import { Fragment, useMemo, useRef, useState } from 'react'
import { parseISO, format } from 'date-fns'
import { buildSlots, layoutForTz, AVAILABLE, IF_NEEDED } from '../../shared/schedule.js'
import type { Availability, MeetingEvent } from '../lib/types'
import { minLabel } from '../lib/tz'
import { cx } from './ui'

type Common = {
  event: MeetingEvent
  viewTz: string
  highlight?: Set<number>
}

type PaintProps = Common & {
  mode: 'paint'
  value: Availability
  onChange: (a: Availability) => void
  brush: number // AVAILABLE | IF_NEEDED | 0
}

type HeatProps = Common & {
  mode: 'heat'
  counts: { avail: string[]; maybe: string[] }[]
  total: number
  onHover?: (slotIndex: number | null) => void
  selected?: number | null
}

export type GridProps = PaintProps | HeatProps

const ROW_H = 22

export function Grid(props: GridProps) {
  const { event, viewTz, highlight } = props
  const slots = useMemo(() => buildSlots(event), [event.dates, event.startMin, event.endMin, event.tz])
  const recurring = !!event.recurring
  const layout = useMemo(() => {
    const l = layoutForTz(slots, viewTz)
    // a recurring meeting shows a generic week, so order Mon→Sun
    if (recurring) l.cols.sort((a, b) => ((parseISO(a).getDay() + 6) % 7) - ((parseISO(b).getDay() + 6) % 7))
    return l
  }, [slots, viewTz, recurring])

  // drag-to-paint (rectangle selection, like a spreadsheet)
  const [drag, setDrag] = useState<null | { c0: number; r0: number; c1: number; r1: number; level: number }>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const inRect = (c: number, r: number) =>
    drag && c >= Math.min(drag.c0, drag.c1) && c <= Math.max(drag.c0, drag.c1) && r >= Math.min(drag.r0, drag.r1) && r <= Math.max(drag.r0, drag.r1)

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const c = el?.dataset?.c, r = el?.dataset?.r
    return c != null && r != null ? { c: +c, r: +r } : null
  }

  // Listeners are attached the moment a press starts (not in an effect), so
  // even a very quick drag or tap is never missed.
  type Drag = { c0: number; r0: number; c1: number; r1: number; level: number }
  const dragRef = useRef<Drag | null>(null)
  const latest = useRef({ props, layout })
  latest.current = { props, layout }

  const startDrag = (d: Drag) => {
    dragRef.current = d
    setDrag(d)
    const move = (e: PointerEvent) => {
      const hit = cellAt(e.clientX, e.clientY)
      if (hit && dragRef.current && (hit.c !== dragRef.current.c1 || hit.r !== dragRef.current.r1)) {
        dragRef.current = { ...dragRef.current, c1: hit.c, r1: hit.r }
        setDrag(dragRef.current)
      }
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const hit = e.type === 'pointerup' ? cellAt(e.clientX, e.clientY) : null
      const dr = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!dr) return
      if (hit) { dr.c1 = hit.c; dr.r1 = hit.r }
      const { props: p, layout: lay } = latest.current
      if (p.mode !== 'paint') return
      const next = { ...p.value }
      for (let c = Math.min(dr.c0, dr.c1); c <= Math.max(dr.c0, dr.c1); c++) {
        for (let r = Math.min(dr.r0, dr.r1); r <= Math.max(dr.r0, dr.r1); r++) {
          const i = lay.cell.get(`${lay.cols[c]}|${lay.rows[r]}`)
          if (i == null) continue
          if (dr.level) next[i] = dr.level
          else delete next[i]
        }
      }
      p.onChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const colHead = (d: string) => {
    const dt = parseISO(d)
    return recurring ? { top: format(dt, 'EEE'), sub: '' } : { top: format(dt, 'EEE'), sub: format(dt, 'MMM d') }
  }

  const heatColor = (i: number) => {
    const p = props as HeatProps
    const { avail, maybe } = p.counts[i] || { avail: [], maybe: [] }
    if (!p.total) return '#ffffff'
    const a = avail.length / p.total
    const m = maybe.length / p.total
    if (a === 0 && m === 0) return '#ffffff'
    if (a === 0) return `rgba(233, 201, 74, ${0.25 + 0.5 * m})`
    // green scale; full group = darkest
    const alpha = 0.08 + 0.92 * a * a
    return `rgba(4, 176, 120, ${alpha})`
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div
        ref={gridRef}
        className="no-select inline-grid min-w-full"
        style={{ gridTemplateColumns: `3.5rem repeat(${layout.cols.length}, minmax(2.75rem, 1fr))` }}
      >
        {/* header row */}
        <div />
        {layout.cols.map((d) => {
          const h = colHead(d)
          return (
            <div key={d} className="text-center pb-2 px-0.5">
              <div className="text-xs font-bold uppercase tracking-wide text-ink/80">{h.top}</div>
              <div className="text-[11px] text-ink/50">{h.sub}</div>
            </div>
          )
        })}

        {layout.rows.map((min, r) => renderRow(r, min))}
      </div>
    </div>
  )

  function renderRow(r: number, min: number) {
    const onHour = min % 60 === 0
    return (
      <Fragment key={min}>
        <div className="relative text-[11px] text-ink/55 pr-2 text-right" style={{ height: ROW_H }}>
          {onHour && <span className="absolute right-2 -top-2">{minLabel(min)}</span>}
        </div>
        {layout.cols.map((d, c) => {
          const i = layout.cell.get(`${d}|${min}`)
          const borderTop = onHour ? 'border-t-ink/25' : 'border-t-ink/10 border-dashed'
          if (i == null) {
            return (
              <div
                key={d}
                title="Outside the meeting’s hours in this time zone"
                className={cx('border-t border-x border-x-white/0', borderTop)}
                style={{ height: ROW_H, background: 'repeating-linear-gradient(45deg,#eef2f7 0 4px,#e3e9f1 4px 8px)' }}
              />
            )
          }
          const hl = highlight?.has(i)
          if (props.mode === 'paint') {
            const preview = inRect(c, r) ? drag!.level : undefined
            const v = preview !== undefined ? preview : props.value[i] || 0
            return (
              <div
                key={d}
                data-c={c}
                data-r={r}
                role="button"
                aria-label={`${d} ${minLabel(min)}: ${v === AVAILABLE ? 'available' : v === IF_NEEDED ? 'if needed' : 'busy'}`}
                onPointerDown={(e) => {
                  e.preventDefault()
                  const cur = props.value[i] || 0
                  const level = cur === props.brush ? 0 : props.brush
                  startDrag({ c0: c, r0: r, c1: c, r1: r, level })
                }}
                className={cx('border-t border-l border-r-0 border-l-white cursor-pointer transition-colors', borderTop,
                  v === AVAILABLE && 'bg-go-500',
                  v === IF_NEEDED && 'bg-maybe-400',
                  !v && 'bg-white hover:bg-brand-50')}
                style={{ height: ROW_H, touchAction: 'none' }}
              />
            )
          }
          const sel = props.selected === i
          return (
            <div
              key={d}
              data-c={c}
              data-r={r}
              onPointerEnter={() => props.onHover?.(i)}
              onClick={() => props.onHover?.(i)}
              className={cx('border-t border-l border-l-white cursor-pointer', borderTop, sel && 'ring-2 ring-ink ring-inset', hl && !sel && 'ring-2 ring-inset ring-amber-500')}
              style={{ height: ROW_H, background: heatColor(i) }}
            />
          )
        })}
      </Fragment>
    )
  }
}

export function GridLegend({ mode }: { mode: 'paint' | 'heat' }) {
  if (mode === 'paint')
    return (
      <div className="flex flex-wrap gap-4 text-xs text-ink/70">
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-go-500" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-maybe-400" /> If needed</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded border border-ink/20 bg-white" /> Can’t</span>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink/70">
      <span>Fewer</span>
      <span className="flex h-3.5 w-28 rounded overflow-hidden border border-ink/10" style={{ background: 'linear-gradient(90deg,#fff, rgba(4,176,120,.4), rgba(4,176,120,1))' }} />
      <span>Everyone free</span>
      <span className="flex items-center gap-1.5 ml-2"><span className="size-3.5 rounded" style={{ background: 'rgba(233,201,74,.6)' }} /> Only “if needed”</span>
    </div>
  )
}
