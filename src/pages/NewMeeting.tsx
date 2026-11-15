import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, addMonths, endOfMonth, format, getDay, isBefore, startOfDay, startOfMonth } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { Button, Card, Checkbox, Field, Input, cx, useToast } from '../components/ui'
import { TimeZonePopup } from '../components/TimeZone'
import { api } from '../lib/api'
import { detectTz, minLabel, tzLabel } from '../lib/tz'
import { update, getStore } from '../lib/storage'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // index 0 = Monday
const TIMES = Array.from({ length: 48 }, (_, k) => k * 30)

type Invitee = { name: string; contact: string }

function MonthPicker({ selected, onToggle }: { selected: Set<string>; onToggle: (d: string) => void }) {
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const today = startOfDay(new Date())
  const first = startOfMonth(month)
  const lead = (getDay(first) + 6) % 7
  const days: (Date | null)[] = [...Array(lead).fill(null)]
  for (let d = first; d <= endOfMonth(month); d = addDays(d, 1)) days.push(d)
  return (
    <div className="rounded-2xl border-2 border-ink/10 p-3 max-w-sm">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="size-8 rounded-lg hover:bg-ink/5 cursor-pointer disabled:opacity-30" disabled={month <= startOfMonth(today)} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
        <span className="font-bold">{format(month, 'MMMM yyyy')}</span>
        <button type="button" className="size-8 rounded-lg hover:bg-ink/5 cursor-pointer" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-ink/50 mb-1">
        {DAYS.map((d) => <span key={d}>{d[0]}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, k) => {
          if (!d) return <span key={k} />
          const key = format(d, 'yyyy-MM-dd')
          const past = isBefore(d, today)
          const on = selected.has(key)
          return (
            <button
              type="button"
              key={key}
              disabled={past}
              onClick={() => onToggle(key)}
              className={cx('aspect-square rounded-lg text-sm font-medium cursor-pointer transition disabled:opacity-25 disabled:cursor-default',
                on ? 'bg-brand-600 text-white' : 'hover:bg-brand-100')}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function NewMeeting() {
  const nav = useNavigate()
  const toast = useToast()
  const saved = getStore().session
  const [orgName, setOrgName] = useState('')
  const [orgContact, setOrgContact] = useState(saved?.contact || '')
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [invitees, setInvitees] = useState<Invitee[]>([])
  const [invName, setInvName] = useState('')
  const [invContact, setInvContact] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [freq, setFreq] = useState('weekly')
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4]))
  const [dates, setDates] = useState<Set<string>>(() => {
    const s = new Set<string>()
    let d = addDays(new Date(), 1)
    while (s.size < 5) { if (getDay(d) % 6 !== 0) s.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1) }
    return s
  })
  const [startMin, setStartMin] = useState(9 * 60)
  const [endMin, setEndMin] = useState(18 * 60)
  const [duration, setDuration] = useState(60)
  const [tz, setTz] = useState(detectTz())
  const [tzOpen, setTzOpen] = useState(false)
  const [deadline, setDeadline] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd'T'17:00"))
  const [minAttendees, setMinAttendees] = useState(3)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const addInvitee = () => {
    const n = invName.trim()
    if (!n) return
    setInvitees((x) => [...x, { name: n, contact: invContact.trim() }])
    setInvName('')
    setInvContact('')
  }

  const finalDates = useMemo(() => {
    if (!recurring) return [...dates].sort()
    // a reference week: the next occurrence of each chosen weekday
    const days = freq === 'daily' ? new Set([0, 1, 2, 3, 4, 5, 6]) : weekdays
    const out: string[] = []
    for (let k = 1; k <= 7; k++) {
      const d = addDays(new Date(), k)
      if (days.has((getDay(d) + 6) % 7)) out.push(format(d, 'yyyy-MM-dd'))
    }
    return out.sort()
  }, [recurring, dates, weekdays, freq])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!name.trim()) return setErr('Give the meeting a name.')
    if (!finalDates.length) return setErr('Pick at least one day.')
    if (endMin <= startMin) return setErr('The latest time has to be after the earliest time.')
    if (invName.trim()) addInvitee()
    setBusy(true)
    try {
      const all = invName.trim() ? [...invitees, { name: invName.trim(), contact: invContact.trim() }] : invitees
      const res = await api.post<{ event: { id: string }; manageKey: string; organizer: { id: string; key: string } }>('/api/events', {
        name, org, organizerName: orgName || 'Organizer', organizerContact: orgContact,
        tz, dates: finalDates, startMin, endMin, durationMinutes: duration,
        deadline: fromZonedTime(deadline, tz).getTime(),
        minAttendees: Math.min(minAttendees, all.length + 1),
        recurring: recurring ? { freq, days: [...weekdays].sort() } : null,
        invitees: all,
      })
      update((s) => {
        s.organizer[res.event.id] = res.manageKey
        s.me[res.event.id] = { id: res.organizer.id, key: res.organizer.key, name: orgName || 'Organizer' }
        s.tz[res.event.id] = tz
      })
      toast({ title: 'Meeting created' })
      nav(`/e/${res.event.id}/share?k=${res.manageKey}`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-3xl font-extrabold">New meeting</h1>

      <Card className="space-y-4">
        <Field label="Meeting name">
          <Input autoFocus placeholder="CS 330 Group Meeting" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Organization (optional)">
          <Input placeholder="Group 1, Jazz Ensemble, ACM" value={org} onChange={(e) => setOrg(e.target.value)} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Your name">
            <Input placeholder="Adam" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </Field>
          <Field label="Your email or phone">
            <Input placeholder="you@school.edu" value={orgContact} onChange={(e) => setOrgContact(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Invite</h2>
        {invitees.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {invitees.map((p, k) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand-600 px-3 py-1 text-sm font-semibold text-brand-800">
                {p.name}
                {p.contact && <span className="font-normal text-ink/50">· {p.contact}</span>}
                <button type="button" className="ml-1 text-ink/40 hover:text-ink cursor-pointer" onClick={() => setInvitees(invitees.filter((_, j) => j !== k))} aria-label={`Remove ${p.name}`}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Name" value={invName} onChange={(e) => setInvName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvitee())} />
          <Input placeholder="Phone or email (optional)" value={invContact} onChange={(e) => setInvContact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInvitee())} />
          <Button type="button" variant="secondary" onClick={addInvitee}>Add</Button>
        </div>
        <p className="text-xs text-ink/50">You’ll also get a link to share.</p>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Possible dates and time window</h2>
        <Checkbox checked={recurring} onChange={setRecurring} label="Repeats" />
        {recurring ? (
          <div className="space-y-3 pl-8">
            <Field label="Frequency">
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className="rounded-xl border-2 border-ink/15 bg-white px-3 py-2 cursor-pointer">
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="biweekly">Every other week</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            {freq !== 'daily' && (
              <div>
                <span className="block text-sm font-semibold mb-1.5">Possible days</span>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d, k) => (
                    <button type="button" key={d}
                      onClick={() => setWeekdays((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })}
                      className={cx('w-12 py-2 rounded-xl border-2 text-sm font-semibold cursor-pointer', weekdays.has(k) ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink/15 hover:border-brand-400')}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <MonthPicker selected={dates} onToggle={(d) => setDates((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n })} />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Earliest start">
            <select value={startMin} onChange={(e) => setStartMin(+e.target.value)} className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 cursor-pointer">
              {TIMES.map((t) => <option key={t} value={t}>{minLabel(t)}</option>)}
            </select>
          </Field>
          <Field label="Latest end">
            <select value={endMin} onChange={(e) => setEndMin(+e.target.value)} className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 cursor-pointer">
              {[...TIMES.slice(1), 1440].map((t) => <option key={t} value={t}>{t === 1440 ? 'midnight' : minLabel(t)}</option>)}
            </select>
          </Field>
          <Field label="Meeting length">
            <select value={duration} onChange={(e) => setDuration(+e.target.value)} className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 cursor-pointer">
              {[30, 60, 90, 120].map((t) => <option key={t} value={t}>{t < 60 ? `${t} min` : `${t / 60} hr${t > 60 ? 's' : ''}`}</option>)}
            </select>
          </Field>
        </div>
        <div className="text-sm">
          Time zone: <b>{tzLabel(tz)}</b>{' '}
          <button type="button" className="text-brand-700 font-semibold hover:underline cursor-pointer" onClick={() => setTzOpen(true)}>Change</button>
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">Response deadline</h2>
        <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="sm:!w-72" />
        <p className="text-xs text-ink/50">Reminders go out 24 hours before. The best time is picked at the deadline for you to approve.</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">Minimum attendance</h2>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={50} value={minAttendees} onChange={(e) => setMinAttendees(+e.target.value)} className="!w-24" />
          <span className="text-sm text-ink/60">people</span>
        </div>
        <p className="text-xs text-ink/50">If cancellations drop below this, a new time is found.</p>
      </Card>

      {err && <p className="text-red-700 font-medium" role="alert">{err}</p>}
      <Button type="submit" size="lg" block variant="soft" disabled={busy}>{busy ? 'Creating…' : 'Schedule it'}</Button>

      <TimeZonePopup open={tzOpen} onClose={() => setTzOpen(false)} current={tz} onPick={(t) => { setTz(t); setTzOpen(false) }} />
    </form>
  )
}
