import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { slotCounts, buildSlots, respondedParticipants, type Suggestion } from '../../shared/schedule.js'
import { Button, Callout, Card, Checkbox, Modal, Pill, Progress, Spinner, cx, useToast } from '../components/ui'
import { Grid, GridLegend } from '../components/Grid'
import { TimeZonePopup, TzBar } from '../components/TimeZone'
import { useEvent } from '../lib/useEvent'
import { api } from '../lib/api'
import { getStore, update } from '../lib/storage'
import { detectTz, fmt, tzAbbr } from '../lib/tz'
import { downloadIcs } from '../lib/ics'
import type { MeetingEvent, Participant } from '../lib/types'

function statusOf(p: Participant, ev: MeetingEvent) {
  const has = Object.keys(p.availability || {}).length > 0
  if (ev.status === 'confirmed' && p.cantMakeIt) return { tone: 'red' as const, label: 'Can’t make it' }
  if (has && p.flagged) return { tone: 'amber' as const, label: 'Free all week?' }
  if (has && p.status === 'updated') return { tone: 'green' as const, label: 'Updated' }
  if (has) return { tone: 'green' as const, label: 'Responded' }
  return { tone: 'amber' as const, label: 'Waiting' }
}

export default function Manage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const k = sp.get('k') || getStore().organizer[id!] || ''
  const { data, error, reload } = useEvent(id, k)
  const toast = useToast()
  const myTz = getStore().tz[id!] || detectTz()
  const [viewTz, setViewTz] = useState(myTz)
  const [tzOpen, setTzOpen] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [remindOpen, setRemindOpen] = useState(false)
  const [picked, setPicked] = useState<Suggestion | null>(null)

  const ev = data?.event
  const counts = useMemo(() => (ev ? slotCounts(ev) : []), [ev])
  const slots = useMemo(() => (ev ? buildSlots(ev) : []), [ev])

  if (k && id && !getStore().organizer[id]) update((s) => { s.organizer[id] = k })

  if (error) return <p className="text-center text-red-700">{error}</p>
  if (!data || !ev) return <div className="grid place-items-center py-20"><Spinner /></div>
  if (!data.isOrganizer)
    return (
      <Card className="max-w-md mx-auto text-center space-y-3">
        <p>This is the organizer’s dashboard for <b>{ev.name}</b>.</p>
        <Link to={`/e/${id}`}><Button>Add my availability instead</Button></Link>
      </Card>
    )

  const total = ev.participants.length
  const responded = respondedParticipants(ev)
  const waiting = ev.participants.filter((p) => !Object.keys(p.availability).length)
  const me = ev.participants.find((p) => p.isOrganizer)
  const link = `${location.origin}/e/${id}`
  const suggestions = data.suggestions
  const highlight = new Set<number>()
  const focus = picked || (ev.status === 'review' ? ev.proposed : null) || suggestions[0]
  if (focus) {
    const step = ev.slotMinutes * 60000
    for (const s of slots) if (s.t >= focus.start && s.t + step <= focus.end) highlight.add(s.i)
  }

  const approve = async (s: { start: number; end: number }) => {
    await api.post(`/api/events/${id}/approve`, { k, start: s.start, end: s.end })
    toast({ title: 'Meeting set', body: 'Everyone was notified.' })
    setPicked(null)
    reload()
  }
  const reopen = async () => {
    await api.post(`/api/events/${id}/reopen`, { k })
    reload()
  }

  const hovered = hover != null ? counts[hover] : null
  const hoveredNames = new Set([...(hovered?.avail || []), ...(hovered?.maybe || [])])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{ev.name}</h1>
          {ev.org && <p className="text-ink/60 text-sm mt-1">{ev.org}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/e/${id}/share?k=${k}`}><Button variant="secondary" size="sm">Invite people</Button></Link>
          <Link to={`/e/${id}`}><Button variant="ghost" size="sm">{me && Object.keys(me.availability).length ? 'Edit my times' : 'Add my times'}</Button></Link>
          <Link to="/outbox"><Button variant="ghost" size="sm">Outbox</Button></Link>
        </div>
      </div>

      {/* ---- top status card ---- */}
      {ev.status === 'collecting' && (
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Responses</h2>
          <Progress value={responded.length} max={total} />
          <div className="flex justify-between text-sm text-ink/65">
            <span><b className="text-ink">{responded.length} of {total}</b></span>
            <span>Due <b className="text-ink">{fmt(ev.deadline, viewTz, 'EEE h:mm a')}</b></span>
          </div>
        </Card>
      )}

      {ev.status === 'review' && ev.proposed && (
        <Card className="space-y-4 border-2 !border-brand-600">
          <h2 className="text-xl font-bold">Suggested time</h2>
          <MeetingCard ev={ev} start={ev.proposed.start} end={ev.proposed.end} tz={viewTz} count={ev.proposed.can.length + ev.proposed.ifNeeded.length} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => approve(ev.proposed!)}>Approve & notify everyone</Button>
            <Button variant="ghost" onClick={reopen}>Keep collecting</Button>
          </div>
        </Card>
      )}

      {ev.status === 'review' && !ev.proposed && (
        <Callout tone="warn">The deadline passed with no responses. <button className="font-semibold underline cursor-pointer" onClick={reopen}>Extend the deadline</button></Callout>
      )}

      {ev.status === 'confirmed' && ev.confirmed && (
        <ConfirmedCard ev={ev} tz={viewTz} attending={data.attending} onReopen={reopen} inviteHref={`/e/${id}/share?k=${k}`} />
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ---- heatmap ---- */}
        <Card className="space-y-4 order-2 lg:order-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-lg">Group availability</h2>
            <GridLegend mode="heat" />
          </div>
          <TzBar
            viewTz={viewTz}
            myTz={myTz}
            onOpenPicker={() => setTzOpen(true)}
            members={ev.participants.filter((p) => p.tz && p.tz !== myTz).map((p) => ({ name: p.name, tz: p.tz }))}
            onView={(tz) => setViewTz(tz)}
          />
          <Grid mode="heat" event={ev} viewTz={viewTz} counts={counts} total={responded.length} onHover={setHover} selected={hover} highlight={highlight} />
          <div className="min-h-[4.5rem] rounded-xl bg-paper border border-ink/5 px-4 py-3 text-sm">
            {hover == null ? (
              <span className="text-ink/55">Tap a time to see who’s free.</span>
            ) : (
              <>
                <div className="font-bold mb-1">{fmt(slots[hover].t, viewTz, 'EEEE h:mm a')} {tzAbbr(viewTz)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {responded.map((p) => {
                    const st = hovered!.avail.includes(p.name) ? 'free' : hovered!.maybe.includes(p.name) ? 'maybe' : 'busy'
                    return (
                      <span key={p.id} className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        st === 'free' && 'bg-go-500 text-white', st === 'maybe' && 'bg-maybe-200 text-amber-900', st === 'busy' && 'bg-ink/5 text-ink/40 line-through')}>
                        {p.name}
                      </span>
                    )
                  })}
                  {waiting.map((p) => <span key={p.id} className="rounded-full px-2.5 py-0.5 text-xs border border-dashed border-ink/25 text-ink/45">{p.name}?</span>)}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* ---- right column: tracker + suggestions ---- */}
        <div className="space-y-5 order-1 lg:order-2">
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">People</h2>
              <Button size="sm" variant="secondary" onClick={() => setRemindOpen(true)} disabled={!waiting.length && !ev.participants.some((p) => p.flagged)}>Remind</Button>
            </div>
            <ul className="divide-y divide-ink/10 border-t border-ink/10">
              {ev.participants.map((p) => {
                const st = statusOf(p, ev)
                const dim = hover != null && Object.keys(p.availability).length > 0 && !hoveredNames.has(p.name)
                return (
                  <li key={p.id} className={cx('px-5 py-3 flex items-center justify-between gap-2 transition-opacity', dim && 'opacity-40')}>
                    <span className="font-semibold truncate">{p.isOrganizer ? `${p.name} (you)` : p.name}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </li>
                )
              })}
            </ul>
          </Card>

          {ev.status !== 'confirmed' && (
            <Card className="space-y-3">
              <h2 className="font-bold text-lg">Best times</h2>
              {!suggestions.length && <p className="text-sm text-ink/55">None yet.</p>}
              {suggestions.map((s, i) => {
                const n = s.can.length + s.ifNeeded.length
                const on = focus && focus.start === s.start
                return (
                  <div key={s.start} className={cx('rounded-xl border-2 p-3 cursor-pointer transition', on ? 'border-brand-600 bg-brand-50' : 'border-ink/10 hover:border-brand-300')} onClick={() => setPicked(s)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{fmt(s.start, viewTz, 'EEE')} · {fmt(s.start, viewTz, 'h:mm')}–{fmt(s.end, viewTz, 'h:mm a')}</span>
                      <span className={cx('text-xs font-bold', n === responded.length ? 'text-go-700' : 'text-amber-700')}>{n} of {total}</span>
                    </div>
                    {s.cannot.length > 0 && <div className="text-xs text-ink/60 mt-1">Can’t: {s.cannot.join(', ')}</div>}
                    {on && <Button size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); approve(s) }}>Approve this time</Button>}
                  </div>
                )
              })}
            </Card>
          )}
        </div>
      </div>

      <RemindModal open={remindOpen} onClose={() => setRemindOpen(false)} ev={ev} k={k} link={link} />
      <TimeZonePopup open={tzOpen} onClose={() => setTzOpen(false)} current={myTz} organizerTz={ev.tz} organizerName="Meeting"
        onPick={(t) => { update((s) => { s.tz[id!] = t }); setViewTz(t); setTzOpen(false) }} />
    </div>
  )
}

function MeetingCard({ ev, start, end, tz, count, faded }: { ev: MeetingEvent; start: number; end: number; tz: string; count: number; faded?: boolean }) {
  const total = ev.participants.length
  return (
    <div className={cx('rounded-2xl border-2 border-brand-700 p-5', faded ? 'bg-white' : 'bg-brand-200')}>
      <div className="font-bold text-lg">{ev.name}</div>
      <div className="text-2xl font-extrabold tracking-tight mt-1">
        {fmt(start, tz, 'EEE, MMM d')} · {fmt(start, tz, 'h:mm')}–{fmt(end, tz, 'h:mm a')} {tzAbbr(tz, start)}
      </div>
      {ev.recurring && <div className="text-sm mt-1">Repeats {ev.recurring.freq}</div>}
      <div className={cx('font-semibold mt-1', count >= total ? 'text-go-800' : 'text-amber-800')}>{count} of {total} can attend</div>
    </div>
  )
}

function ConfirmedCard({ ev, tz, attending, onReopen, inviteHref }: { ev: MeetingEvent; tz: string; attending: number; onReopen: () => void; inviteHref: string }) {
  const c = ev.confirmed!
  const dropped = ev.participants.filter((p) => p.cantMakeIt)
  return (
    <Card className="space-y-4">
      {dropped.length === 0 ? (
        <div className="text-center">
          <div className="animate-pop mx-auto size-16 rounded-full border-[5px] border-brand-700 grid place-items-center text-brand-700 text-3xl font-black">✓</div>
          <h2 className="text-2xl font-extrabold mt-2">Meeting set</h2>
        </div>
      ) : (
        <h2 className="text-xl font-bold">{dropped.map((d) => d.name).join(' & ')} can’t make it…</h2>
      )}
      <MeetingCard ev={ev} start={c.start} end={c.end} tz={tz} count={attending} faded={dropped.length > 0} />
      {dropped.length > 0 && (
        <Callout>Minimum is {ev.minAttendees}. {attending} can still come.</Callout>
      )}
      <p className="text-sm text-ink/65">Everyone was notified.</p>
      <div className="flex flex-wrap gap-2">
        <Link to={inviteHref}><Button>Invite more people</Button></Link>
        <Button variant="soft" onClick={() => downloadIcs(ev, c.start, c.end)}>Download invite (.ics)</Button>
        <Button variant="ghost" onClick={onReopen}>Pick a different time</Button>
      </div>
    </Card>
  )
}

function RemindModal({ open, onClose, ev, k, link }: { open: boolean; onClose: () => void; ev: MeetingEvent; k: string; link: string }) {
  const toast = useToast()
  const targets = ev.participants.filter((p) => !p.isOrganizer && (!Object.keys(p.availability).length || p.flagged))
  const [sel, setSel] = useState<Set<string> | null>(null)
  const all = sel ?? new Set(targets.map((t) => t.id))
  const send = async () => {
    const r = await api.post<{ sent: number }>(`/api/events/${ev.id}/remind`, { k, participantIds: [...all], link: `${link}` })
    toast({ title: `Reminder sent to ${r.sent}` })
    setSel(null)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Remind people">
      <div className="space-y-1">
        {targets.map((p) => (
          <Checkbox key={p.id} checked={all.has(p.id)}
            onChange={(v) => setSel(() => { const n = new Set(all); v ? n.add(p.id) : n.delete(p.id); return n })}
            label={p.name}
            sub={p.flagged ? 'Confirm “free all week”' : p.contact || 'No contact'} />
        ))}
        {!targets.length && <p className="text-sm text-ink/55">Everyone has responded.</p>}
      </div>
      <Button block className="mt-4" onClick={send} disabled={!all.size}>Send {all.size ? `to ${all.size}` : ''}</Button>
    </Modal>
  )
}
