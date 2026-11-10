import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { slotCounts, buildSlots, respondedParticipants, type Suggestion } from '../../shared/schedule.js'
import { Button, Callout, Card, Checkbox, Modal, Pill, Progress, RoleBadge, Spinner, cx, useToast } from '../components/ui'
import { Grid, GridLegend } from '../components/Grid'
import { TimeZonePopup, TzBar } from '../components/TimeZone'
import { useEvent } from '../lib/useEvent'
import { api } from '../lib/api'
import { getStore, update } from '../lib/storage'
import { detectTz, fmt, relTime, tzAbbr } from '../lib/tz'
import { downloadIcs } from '../lib/ics'
import type { MeetingEvent, Participant } from '../lib/types'

const methodLabel: Record<string, string> = { google: 'Google Calendar', icloud: 'iCloud Calendar', ics: 'Calendar file', text: 'Typed it', manual: 'Painted grid' }

function statusOf(p: Participant, ev: MeetingEvent) {
  const has = Object.keys(p.availability || {}).length > 0
  if (ev.status === 'confirmed' && p.cantMakeIt) return { tone: 'red' as const, label: 'Can’t make it', sub: 'Cancelled after the time was set' }
  if (has && p.flagged) return { tone: 'amber' as const, label: 'Check?', sub: 'Said free all week. Asked to confirm.' }
  if (has && p.status === 'updated') return { tone: 'green' as const, label: 'Updated', sub: `${methodLabel[p.method || 'manual'] || 'Responded'} · changed ${p.updatedAt ? relTime(p.updatedAt) : ''}` }
  if (has) return { tone: 'green' as const, label: p.method === 'google' || p.method === 'icloud' ? 'Connected' : 'Responded', sub: methodLabel[p.method || 'manual'] }
  if (p.autoReminded) return { tone: 'amber' as const, label: 'No response', sub: 'Reminder sent automatically' }
  return { tone: 'amber' as const, label: 'Waiting', sub: p.contact || p.hasContact ? 'Invited' : 'Hasn’t opened the link yet' }
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
    toast({ icon: '✅', title: 'Meeting set', body: 'Everyone was notified and it was added to their calendars.' })
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
          <RoleBadge role="Organizer" name={ev.organizer.name} />
          <h1 className="text-3xl font-extrabold">{ev.name}</h1>
          <p className="text-ink/60 text-sm mt-1">
            {ev.org && <>{ev.org} · </>}
            {ev.recurring ? `Repeats ${ev.recurring.freq}` : `${ev.dates.length} possible days`} · {ev.durationMinutes} min
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/e/${id}/share?k=${k}`}><Button variant="secondary" size="sm">Share link</Button></Link>
          <Link to={`/e/${id}`}><Button variant="ghost" size="sm">{me && Object.keys(me.availability).length ? 'Edit my times' : 'Add my times'}</Button></Link>
        </div>
      </div>

      {/* ---- top status card ---- */}
      {ev.status === 'collecting' && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Finding a time…</h2>
            <Pill tone="amber" dot>Collecting</Pill>
          </div>
          <Progress value={responded.length} max={total} />
          <div className="flex justify-between text-sm text-ink/65">
            <span><b className="text-ink">{responded.length} of {total}</b> calendars in</span>
            <span>Deadline: <b className="text-ink">{fmt(ev.deadline, viewTz, 'EEE h:mm a')}</b> ({relTime(ev.deadline)})</span>
          </div>
          <Callout>We’ll pick the best time automatically at the deadline and ask you to approve it. Or approve a suggestion below whenever you’re ready.</Callout>
        </Card>
      )}

      {ev.status === 'review' && ev.proposed && (
        <Card className="space-y-4 border-2 !border-brand-600">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">✨ We found a time</h2>
            <Pill tone="blue" dot>Needs your OK</Pill>
          </div>
          <MeetingCard ev={ev} start={ev.proposed.start} end={ev.proposed.end} tz={viewTz} count={ev.proposed.can.length + ev.proposed.ifNeeded.length} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => approve(ev.proposed!)}>Approve & notify everyone</Button>
            <Button variant="ghost" onClick={reopen}>Keep collecting</Button>
          </div>
        </Card>
      )}

      {ev.status === 'review' && !ev.proposed && (
        <Callout tone="warn">The deadline passed but nobody has shared availability yet. <button className="font-semibold underline cursor-pointer" onClick={reopen}>Extend the deadline</button></Callout>
      )}

      {ev.status === 'confirmed' && ev.confirmed && (
        <ConfirmedCard ev={ev} tz={viewTz} attending={data.attending} onReopen={reopen} />
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
              <span className="text-ink/55">Hover or tap a time to see who’s free. Outlined cells are the suggested time.</span>
            ) : (
              <>
                <div className="font-bold mb-1">{fmt(slots[hover].t, viewTz, 'EEEE h:mm a')} {tzAbbr(viewTz)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {responded.map((p) => {
                    const st = hovered!.avail.includes(p.name) ? 'free' : hovered!.maybe.includes(p.name) ? 'maybe' : 'busy'
                    return (
                      <span key={p.id} className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        st === 'free' && 'bg-brand-600 text-white', st === 'maybe' && 'bg-maybe-200 text-amber-900', st === 'busy' && 'bg-ink/5 text-ink/40 line-through')}>
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
              <h2 className="font-bold text-lg">Responses</h2>
              <Button size="sm" variant="secondary" onClick={() => setRemindOpen(true)} disabled={!waiting.length && !ev.participants.some((p) => p.flagged)}>🔔 Remind</Button>
            </div>
            <ul className="divide-y divide-ink/10 border-t border-ink/10">
              {ev.participants.map((p) => {
                const st = statusOf(p, ev)
                const dim = hover != null && Object.keys(p.availability).length > 0 && !hoveredNames.has(p.name)
                return (
                  <li key={p.id} className={cx('px-5 py-3 transition-opacity', dim && 'opacity-40')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{p.isOrganizer ? `${p.name} (you, organizer)` : p.name}</span>
                      <Pill tone={st.tone} dot>{st.label}</Pill>
                    </div>
                    <div className="flex justify-between gap-2 text-xs text-ink/55 mt-0.5">
                      <span className="truncate">{st.sub}</span>
                      {p.tz && <span className="shrink-0">{tzAbbr(p.tz)}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="px-5 py-3 bg-paper text-xs text-ink/55 border-t border-ink/10">All times show in your time zone ({tzAbbr(viewTz)}). Everyone else sees their own.</div>
          </Card>

          {ev.status !== 'confirmed' && (
            <Card className="space-y-3">
              <h2 className="font-bold text-lg">Best times</h2>
              {!suggestions.length && <p className="text-sm text-ink/55">Suggestions appear once people respond.</p>}
              {suggestions.map((s, i) => {
                const n = s.can.length + s.ifNeeded.length
                const on = focus && focus.start === s.start
                return (
                  <div key={s.start} className={cx('rounded-xl border-2 p-3 cursor-pointer transition', on ? 'border-brand-600 bg-brand-50' : 'border-ink/10 hover:border-brand-300')} onClick={() => setPicked(s)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{i === 0 && '⭐ '}{fmt(s.start, viewTz, 'EEE')} · {fmt(s.start, viewTz, 'h:mm')}–{fmt(s.end, viewTz, 'h:mm a')}</span>
                      <span className={cx('text-xs font-bold', n === responded.length ? 'text-brand-700' : 'text-amber-700')}>{n} of {total}</span>
                    </div>
                    <div className="text-xs text-ink/60 mt-1">
                      {s.ifNeeded.length > 0 && <>If needed: {s.ifNeeded.join(', ')}. </>}
                      {s.cannot.length > 0 && <>Can’t: {s.cannot.join(', ')}. </>}
                      {waiting.length > 0 && <>No answer yet: {waiting.map((w) => w.name).join(', ')}.</>}
                      {!s.ifNeeded.length && !s.cannot.length && !waiting.length && 'Everyone can make it.'}
                    </div>
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
      <div className={cx('font-semibold mt-1', count >= total ? 'text-brand-800' : 'text-amber-800')}>{count} of {total} can attend</div>
    </div>
  )
}

function ConfirmedCard({ ev, tz, attending, onReopen }: { ev: MeetingEvent; tz: string; attending: number; onReopen: () => void }) {
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
        <Callout>This time stays unless fewer than {ev.minAttendees} people can come. Right now {attending} can.</Callout>
      )}
      <ul className="text-sm space-y-1.5">
        <li>📅 Added to everyone’s calendar</li>
        <li>🔔 Reminders 24 hrs and 1 hr before (for people who turned them on)</li>
        <li>📨 Everyone was notified by text or email. <Link to="/outbox" className="text-brand-700 font-semibold hover:underline">See messages</Link></li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="soft" onClick={() => downloadIcs(ev, c.start, c.end)}>Download calendar invite (.ics)</Button>
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
    toast({ icon: '📨', title: `Reminder sent to ${r.sent}`, body: 'They got a text or email with the link.' })
    setSel(null)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Remind people">
      <p className="text-sm text-ink/60 mb-3">We’ll text or email them the link. No need to dig it up yourself.</p>
      <div className="space-y-1">
        {targets.map((p) => (
          <Checkbox key={p.id} checked={all.has(p.id)}
            onChange={(v) => setSel(() => { const n = new Set(all); v ? n.add(p.id) : n.delete(p.id); return n })}
            label={p.name}
            sub={p.flagged ? 'Asked to double-check “free all week”' : p.contact ? `${p.contact.includes('@') ? 'Email' : 'Text'} · ${p.contact}` : 'No contact on file (in-app only)'} />
        ))}
        {!targets.length && <p className="text-sm text-ink/55">Everyone has responded. 🎉</p>}
      </div>
      <Button block className="mt-4" onClick={send} disabled={!all.size}>Send {all.size ? `to ${all.size}` : ''}</Button>
    </Modal>
  )
}
