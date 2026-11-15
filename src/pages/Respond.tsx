import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { buildSlots, layoutForTz, fakeCalendarAvailability, looksSuspicious, AVAILABLE, IF_NEEDED } from '../../shared/schedule.js'
import { APP_NAME } from '../../shared/config.js'
import { Button, Callout, Card, Checkbox, Field, Input, Modal, Spinner, cx, useToast } from '../components/ui'
import { Grid } from '../components/Grid'
import { TimeZonePopup, TzBar } from '../components/TimeZone'
import { useEvent } from '../lib/useEvent'
import { api } from '../lib/api'
import { getStore, update } from '../lib/storage'
import { detectTz, fmt, tzAbbr } from '../lib/tz'
import { parseFreeText } from '../lib/freetext'
import { availabilityFromIcs, downloadIcs } from '../lib/ics'
import type { Availability, MeetingEvent } from '../lib/types'
import { format, parseISO } from 'date-fns'

type Step = 'invite' | 'identify' | 'code' | 'method' | 'grid' | 'done'

export default function Respond() {
  const { id } = useParams()
  const { data, error, reload } = useEvent(id, null, 8000)
  const store = getStore()
  const toast = useToast()
  const [me, setMe] = useState(store.me[id!] || null)
  const [tz, setTz] = useState<string | null>(store.tz[id!] || null)
  const [viewTz, setViewTz] = useState<string | null>(null)
  const [tzOpen, setTzOpen] = useState(false)
  const [step, setStep] = useState<Step>('invite')
  const [name, setName] = useState(me?.name || '')
  const [contact, setContact] = useState(store.session?.contact || '')
  const [avail, setAvail] = useState<Availability>({})
  const [method, setMethod] = useState('manual')
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  const ev = data?.event
  const mine = ev?.participants.find((p) => p.id === me?.id)

  // first load: pick a starting step and ask for the time zone
  useEffect(() => {
    if (!ev || initialized.current) return
    initialized.current = true
    if (!tz) setTzOpen(true)
    if (mine && Object.keys(mine.availability).length) {
      setAvail(mine.availability)
      setStep('done')
    } else if (me) setStep('method')
  }, [ev])

  if (error) return <Card className="max-w-md mx-auto text-center">{error}. Check the link, or <Link className="text-brand-700 font-semibold" to="/me">find your meetings</Link>.</Card>
  if (!data || !ev) return <div className="grid place-items-center py-20"><Spinner /></div>

  const myTz = tz || detectTz()
  const shownTz = viewTz || myTz
  const pickTz = (t: string) => {
    setTz(t)
    setViewTz(null)
    update((s) => { s.tz[id!] = t })
    setTzOpen(false)
  }

  const join = async (opts: { participantId?: string; contact?: string }) => {
    const r = await api.post<{ participant: { id: string; key: string; name: string } }>(`/api/events/${id}/join`, {
      name, contact: opts.contact ?? contact, tz: myTz, participantId: opts.participantId,
    })
    const p = r.participant
    setMe(p)
    update((s) => { s.me[id!] = p })
    await reload()
    const existing = ev.participants.find((x) => x.id === p.id)
    if (existing && Object.keys(existing.availability).length) {
      setAvail(existing.availability)
      setStep('done')
    } else setStep('method')
  }

  const submit = async () => {
    if (!me) return
    setSaving(true)
    try {
      await api.put(`/api/events/${id}/participants/${me.id}`, { pkey: me.key, availability: avail, method, tz: myTz })
      await reload()
      setStep('done')
      toast({ title: 'Availability submitted' })
    } catch (e: any) {
      toast({ title: 'Couldn’t save', body: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {tz && step !== 'grid' && (
        <div className="flex justify-end">
          <button onClick={() => setTzOpen(true)} className="text-sm rounded-lg border-2 border-ink/15 bg-white px-2.5 py-1 font-semibold hover:border-brand-500 cursor-pointer">
            {tzAbbr(myTz)}
          </button>
        </div>
      )}

      {step === 'invite' && <InviteStep ev={ev} myTz={myTz} name={name} setName={setName} onNext={(pid) => (pid ? join({ participantId: pid }) : setStep('identify'))} />}
      {step === 'identify' && (
        <IdentifyStep name={name} setName={setName} contact={contact} setContact={setContact}
          onCodeSent={() => setStep('code')}
          onSkip={() => join({ contact: '' })}
          onSignedIn={(c) => { setContact(c); join({ contact: c }) }} />
      )}
      {step === 'code' && (
        <CodeStep contact={contact} onBack={() => setStep('identify')} onVerified={(token, c) => {
          update((s) => { s.session = { token, contact: c } })
          join({ contact: c })
        }} />
      )}
      {step === 'method' && (
        <MethodStep ev={ev} tz={myTz} name={me?.name || name}
          onPicked={(a, m) => { setAvail(a); setMethod(m); setStep('grid') }} />
      )}
      {step === 'grid' && (
        <GridStep ev={ev} myTz={myTz} viewTz={shownTz} setViewTz={setViewTz} openTz={() => setTzOpen(true)}
          avail={avail} setAvail={setAvail} method={method} saving={saving}
          onBack={() => setStep('method')} onDone={submit} />
      )}
      {step === 'done' && me && mine && (
        <DoneStep ev={ev} me={me} p={mine} tz={myTz} onEdit={() => { setAvail(mine.availability); setMethod(mine.method || 'manual'); setStep('grid') }} reload={reload} />
      )}

      <TimeZonePopup open={tzOpen} onClose={() => { if (!tz) pickTz(detectTz()); else setTzOpen(false) }}
        onPick={pickTz} organizerTz={ev.tz} organizerName={ev.organizer.name} current={tz || undefined} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function InviteStep({ ev, myTz, name, setName, onNext }: { ev: MeetingEvent; myTz: string; name: string; setName: (s: string) => void; onNext: (participantId?: string) => void }) {
  const open = ev.participants.filter((p) => !Object.keys(p.availability).length && !p.isOrganizer)
  const [who, setWho] = useState<string | null>(null)
  return (
    <Card className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold">You’re invited</h1>
        <p className="text-ink/65 mt-1"><b>{ev.organizer.name}</b> invited you to <b>{ev.name}</b>{ev.org && <> ({ev.org})</>}.</p>
      </div>
      <div className="rounded-2xl bg-paper border border-ink/10 p-4 text-sm grid sm:grid-cols-3 gap-3">
        <div><div className="text-ink/50 text-xs font-semibold uppercase">When</div>{ev.recurring ? `Weekly, ${ev.dates.map((d) => format(parseISO(d), 'EEE')).join('/')}` : `${format(parseISO(ev.dates[0]), 'MMM d')} – ${format(parseISO(ev.dates[ev.dates.length - 1]), 'MMM d')}`}</div>
        <div><div className="text-ink/50 text-xs font-semibold uppercase">Length</div>{ev.durationMinutes} min</div>
        <div><div className="text-ink/50 text-xs font-semibold uppercase">Reply by</div>{fmt(ev.deadline, myTz, "EEE h:mm a")} {tzAbbr(myTz)}</div>
      </div>
      {ev.status === 'confirmed' && ev.confirmed && (
        <Callout tone="info">Set for <b>{fmt(ev.confirmed.start, myTz, 'EEE, MMM d · h:mm a')}</b></Callout>
      )}
      {open.length > 0 && (
        <div>
          <span className="block text-sm font-semibold mb-2">Who are you?</span>
          <div className="flex flex-wrap gap-2">
            {open.map((p) => (
              <button key={p.id} onClick={() => { setWho(p.id); setName(p.name) }}
                className={cx('rounded-full border-2 px-4 py-1.5 font-semibold cursor-pointer', who === p.id ? 'bg-brand-600 border-brand-600 text-white' : 'border-brand-600 text-brand-800 hover:bg-brand-50')}>
                {p.name}
              </button>
            ))}
            <button onClick={() => { setWho('new'); setName('') }}
              className={cx('rounded-full border-2 border-dashed px-4 py-1.5 font-semibold cursor-pointer', who === 'new' ? 'border-ink bg-ink/5' : 'border-ink/30 text-ink/60')}>
              Someone else
            </button>
          </div>
        </div>
      )}
      {(who === 'new' || !open.length) && (
        <Field label="Your name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First name is fine" /></Field>
      )}
      <Button size="lg" block disabled={!name.trim()} onClick={() => onNext()}>Continue</Button>
      {who && who !== 'new' && (
        <button className="block mx-auto text-sm text-ink/55 hover:underline cursor-pointer" onClick={() => onNext(who)}>Skip sign-in</button>
      )}
    </Card>
  )
}

function IdentifyStep({ name, setName, contact, setContact, onCodeSent, onSkip, onSignedIn }: {
  name: string; setName: (s: string) => void; contact: string; setContact: (s: string) => void
  onCodeSent: () => void; onSkip: () => void; onSignedIn: (contact: string) => void
}) {
  const toast = useToast()
  const [mode, setMode] = useState<'guest' | 'account'>('guest')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const sendCode = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await api.post<{ demoCode: string; channel: string }>('/api/auth/start', { contact })
      toast({ title: `${APP_NAME} code: ${r.demoCode}`, body: `Demo ${r.channel === 'email' ? 'email' : 'text'}` })
      onCodeSent()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const account = async (kind: 'login' | 'register') => {
    setErr(''); setBusy(true)
    try {
      const r = await api.post<{ token: string; contact: string }>(`/api/auth/${kind}`, { email, password: pw })
      update((s) => { s.session = { token: r.token, contact: r.contact } })
      onSignedIn(r.contact)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-5 max-w-md mx-auto">
      {mode === 'guest' ? (
        <>
          <div>
            <h1 className="text-2xl font-extrabold">Continue as guest</h1>
            <p className="text-sm text-ink/60 mt-1">So you can edit later and get reminders.</p>
          </div>
          <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email or phone number"><Input autoFocus inputMode="email" placeholder="you@school.edu or (312) 555-0100" value={contact} onChange={(e) => setContact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && contact && sendCode()} /></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <Button block size="lg" onClick={sendCode} disabled={!contact.trim() || !name.trim() || busy}>Send me a code</Button>
          <div className="flex items-center gap-3 text-xs text-ink/40"><span className="h-px flex-1 bg-ink/15" />or<span className="h-px flex-1 bg-ink/15" /></div>
          <div className="flex flex-col gap-2 text-sm text-center">
            <button className="font-semibold text-brand-700 hover:underline cursor-pointer" onClick={() => setMode('account')}>Sign in with a password</button>
            <button className="text-ink/55 hover:underline cursor-pointer" onClick={onSkip} disabled={!name.trim()}>Skip</button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold">Sign in / Register</h1>
          <Field label="Email"><Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => account('login')} disabled={busy}>Sign in</Button>
            <Button variant="secondary" onClick={() => account('register')} disabled={busy}>Register</Button>
          </div>
          <button className="block mx-auto text-sm font-semibold text-brand-700 hover:underline cursor-pointer" onClick={() => setMode('guest')}>Continue as guest</button>
        </>
      )}
    </Card>
  )
}

function CodeStep({ contact, onBack, onVerified }: { contact: string; onBack: () => void; onVerified: (token: string, contact: string) => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const verify = async () => {
    setErr('')
    try {
      const r = await api.post<{ token: string; contact: string }>('/api/auth/verify', { contact, code })
      onVerified(r.token, r.contact)
    } catch (e: any) { setErr(e.message) }
  }
  return (
    <Card className="space-y-5 max-w-md mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold">Enter the 6-digit code</h1>
        <p className="text-sm text-ink/60 mt-1">We sent it to <b>{contact}</b>.</p>
      </div>
      <Input autoFocus inputMode="numeric" maxLength={6} placeholder="••••••" value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()}
        className="text-center text-3xl tracking-[.5em] font-bold" />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <Button block size="lg" onClick={verify} disabled={code.length !== 6}>Confirm</Button>
      <button className="text-sm text-brand-700 font-semibold hover:underline cursor-pointer" onClick={onBack}>Use a different email or phone</button>
    </Card>
  )
}

function MethodStep({ ev, tz, name, onPicked }: { ev: MeetingEvent; tz: string; name: string; onPicked: (a: Availability, method: string) => void }) {
  const [connecting, setConnecting] = useState<null | 'google' | 'icloud'>(null)
  const [phase, setPhase] = useState<'ask' | 'loading'>('ask')
  const [text, setText] = useState('')
  const [textOpen, setTextOpen] = useState(false)
  const [icsErr, setIcsErr] = useState('')
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const connect = () => {
    setPhase('loading')
    setTimeout(() => {
      const a = fakeCalendarAvailability(ev, name || 'guest')
      setConnecting(null)
      setPhase('ask')
      toast({ title: `${connecting === 'google' ? 'Google' : 'iCloud'} Calendar connected` })
      onPicked(a, connecting!)
    }, 1400)
  }
  const onFile = async (f: File) => {
    setIcsErr('')
    try {
      const { availability, busyCount } = availabilityFromIcs(await f.text(), ev)
      toast({ title: 'Calendar file read', body: `${busyCount} busy event${busyCount === 1 ? '' : 's'} found` })
      onPicked(availability, 'ics')
    } catch {
      setIcsErr('That file didn’t look like a calendar (.ics). Try exporting it again.')
    }
  }
  const parsed = useMemo(() => (text.trim() ? parseFreeText(text, ev, tz) : null), [text, ev, tz])

  const Option = ({ title, onClick, primary }: { title: string; onClick: () => void; primary?: boolean }) => (
    <button onClick={onClick} className={cx('w-full text-left rounded-2xl border-2 px-4 py-3.5 font-bold text-brand-900 cursor-pointer transition',
      primary ? 'border-brand-600 bg-brand-200 hover:bg-brand-300' : 'border-brand-600 bg-white hover:bg-brand-50')}>
      {title}
    </button>
  )

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Share your availability</h1>
        <p className="text-sm text-ink/60 mt-1">You can review it before sending.</p>
      </div>
      <Option primary title="Connect Google Calendar" onClick={() => setConnecting('google')} />
      <Option title="Connect iCloud Calendar" onClick={() => setConnecting('icloud')} />
      <Option title="Upload a calendar file (.ics)" onClick={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {icsErr && <p className="text-sm text-red-700">{icsErr}</p>}
      <Option title="Type when you’re free" onClick={() => setTextOpen(true)} />
      <button className="block mx-auto text-sm font-semibold text-brand-700 hover:underline cursor-pointer" onClick={() => onPicked({}, 'manual')}>Or fill in the grid by hand</button>

      <Modal open={!!connecting} onClose={() => setConnecting(null)} title={connecting === 'google' ? 'Connect Google Calendar' : 'Connect iCloud Calendar'}>
        {phase === 'ask' ? (
          <div className="space-y-4">
            <p className="text-sm"><b>{APP_NAME}</b> will see when you’re busy, not event details.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setConnecting(null)}>Cancel</Button>
              <Button onClick={connect}>Allow</Button>
            </div>
          </div>
        ) : (
          <div className="py-8 grid place-items-center gap-3 text-sm text-ink/60"><Spinner className="size-8" />Reading your free/busy times…</div>
        )}
      </Modal>

      <Modal open={textOpen} onClose={() => setTextOpen(false)} title="Type when you’re free">
        <div className="space-y-3">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="weekday afternoons except Wed, Friday mornings if needed"
            className="w-full rounded-xl border-2 border-ink/15 px-3.5 py-2.5 outline-none focus:border-brand-500" />
          <div className="flex flex-wrap gap-1.5">
            {['weekday afternoons except wed', 'mon-thu after 3pm', 'tue & thu 10am-2pm', 'evenings if needed', 'anytime, busy monday morning'].map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-full bg-paper border border-ink/10 px-2.5 py-1 text-xs hover:bg-brand-50 cursor-pointer">{ex}</button>
            ))}
          </div>
          {parsed && (
            <div className="text-xs text-ink/60 space-y-0.5">
              {parsed.notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}
          <Button block disabled={!parsed?.matched} onClick={() => { onPicked(parsed!.availability, 'text'); setTextOpen(false) }}>
            Fill in {parsed?.matched || 0} time slots
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

function GridStep({ ev, myTz, viewTz, setViewTz, openTz, avail, setAvail, method, saving, onBack, onDone }: {
  ev: MeetingEvent; myTz: string; viewTz: string; setViewTz: (t: string | null) => void; openTz: () => void
  avail: Availability; setAvail: (a: Availability) => void; method: string; saving: boolean; onBack: () => void; onDone: () => void
}) {
  const [brush, setBrush] = useState<number>(AVAILABLE)
  const slots = useMemo(() => buildSlots(ev), [ev])
  const layout = useMemo(() => layoutForTz(slots, viewTz), [slots, viewTz])
  const [copyFrom, setCopyFrom] = useState(layout.cols[0])
  const filled = Object.keys(avail).length
  const suspicious = looksSuspicious(ev, avail)

  const copyDay = () => {
    const next = { ...avail }
    for (const r of layout.rows) {
      const src = layout.cell.get(`${copyFrom}|${r}`)
      const v = src != null ? avail[src] || 0 : 0
      for (const c of layout.cols) {
        if (c === copyFrom) continue
        const i = layout.cell.get(`${c}|${r}`)
        if (i == null) continue
        if (v) next[i] = v
        else delete next[i]
      }
    }
    setAvail(next)
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Check your times</h1>
        <p className="text-sm text-ink/60 mt-1">{method === 'manual' ? 'Drag to mark when you’re free.' : 'Filled in for you. Drag to fix anything.'}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            { v: AVAILABLE, label: 'Available', cls: 'bg-go-500 text-white border-go-500' },
            { v: IF_NEEDED, label: 'If needed', cls: 'bg-maybe-400 border-maybe-400' },
            { v: 0, label: 'Can’t', cls: 'bg-white border-ink/30' },
          ].map((b) => (
            <button key={b.v} onClick={() => setBrush(b.v)}
              className={cx('rounded-full border-2 px-3 py-1 text-sm font-semibold cursor-pointer', b.cls, brush === b.v ? 'ring-2 ring-offset-2 ring-ink' : 'opacity-70 hover:opacity-100')}>
              {b.label}
            </button>
          ))}
        </div>
        <TzBar viewTz={viewTz} myTz={myTz} onOpenPicker={openTz}
          members={ev.participants.filter((p) => p.tz && p.tz !== myTz).map((p) => ({ name: p.name, tz: p.tz }))}
          onView={(t) => setViewTz(t === myTz ? null : t)} />
      </div>

      <Grid mode="paint" event={ev} viewTz={viewTz} value={avail} onChange={setAvail} brush={brush} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Copy</span>
        <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="rounded-lg border border-ink/15 bg-white px-2 py-1 cursor-pointer">
          {layout.cols.map((c) => <option key={c} value={c}>{format(parseISO(c), ev.recurring ? 'EEEE' : 'EEE MMM d')}</option>)}
        </select>
        <span>to all days</span>
        <Button size="sm" variant="secondary" onClick={copyDay}>Copy</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setAvail({})}>Clear</Button>
      </div>

      {suspicious && <Callout tone="warn">You’re marked free almost all week. Mark busy times if that’s not right.</Callout>}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button size="lg" className="flex-1" onClick={onDone} disabled={saving || filled === 0}>{saving ? 'Saving…' : 'Done'}</Button>
      </div>
    </Card>
  )
}

function DoneStep({ ev, me, p, tz, onEdit, reload }: {
  ev: MeetingEvent; me: { id: string; key: string; name: string }; p: MeetingEvent['participants'][number]; tz: string; onEdit: () => void; reload: () => void
}) {
  const toast = useToast()
  const [rem, setRem] = useState(p.reminders || { h24: true, h1: true })
  const [enabled, setEnabled] = useState(!!(p.reminders?.h24 || p.reminders?.h1))
  const saveRem = async (next: { h24: boolean; h1: boolean }) => {
    setRem(next)
    await api.put(`/api/events/${ev.id}/participants/${me.id}`, { pkey: me.key, reminders: next })
  }
  const confirmCheck = async () => {
    await api.post(`/api/events/${ev.id}/participants/${me.id}/confirm`, { pkey: me.key })
    toast({ title: 'Thanks for confirming' })
    reload()
  }
  const cantMakeIt = async () => {
    if (!confirm('Let the organizer know you can’t make it?')) return
    await api.post(`/api/events/${ev.id}/participants/${me.id}/cant-make-it`, { pkey: me.key })
    toast({ title: `${ev.organizer.name} was notified` })
    reload()
  }
  const c = ev.confirmed
  return (
    <div className="space-y-5">
      {ev.status === 'confirmed' && c ? (
        <Card className="text-center space-y-3">
          <div className="animate-pop mx-auto size-14 rounded-full border-[5px] border-brand-700 grid place-items-center text-brand-700 text-2xl font-black">✓</div>
          <h1 className="text-2xl font-extrabold">Meeting set</h1>
          <div className="rounded-2xl border-2 border-brand-700 bg-brand-200 p-4 text-left">
            <div className="font-bold">{ev.name}</div>
            <div className="text-xl font-extrabold">{fmt(c.start, tz, 'EEE, MMM d · h:mm')}–{fmt(c.end, tz, 'h:mm a')} {tzAbbr(tz, c.start)}</div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="soft" onClick={() => downloadIcs(ev, c.start, c.end)}>Add to my calendar</Button>
            {!p.cantMakeIt ? <Button variant="danger" onClick={cantMakeIt}>I can’t make it anymore</Button> : <span className="text-sm text-red-700 font-semibold self-center">You told {ev.organizer.name} you can’t make it.</span>}
          </div>
        </Card>
      ) : (
        <Card className="space-y-2">
          <h1 className="text-3xl font-extrabold">Availability submitted</h1>
          <p className="text-ink/65">You’ll be notified when a time is picked.</p>
        </Card>
      )}

      {p.flagged && (
        <Callout tone="warn">
          You’re marked free almost all week.{' '}
          <button className="font-semibold underline cursor-pointer" onClick={confirmCheck}>Yes, I’m really free</button>{' · '}
          <button className="font-semibold underline cursor-pointer" onClick={onEdit}>Let me fix it</button>
        </Callout>
      )}

      <Card className="space-y-2">
        <Checkbox checked={enabled} onChange={(v) => { setEnabled(v); saveRem(v ? { h24: true, h1: true } : { h24: false, h1: false }) }}
          label="Reminders" />
        <div className={cx('pl-8 space-y-1 border-l-2 border-ink/10 ml-2.5', !enabled && 'opacity-40 pointer-events-none')}>
          <Checkbox checked={rem.h24} onChange={(v) => saveRem({ ...rem, h24: v })} label="24 hrs before" />
          <Checkbox checked={rem.h1} onChange={(v) => saveRem({ ...rem, h1: v })} label="1 hr before" />
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="soft" onClick={onEdit}>Edit availability</Button>
        <Link to="/me"><Button variant="ghost">All my meetings</Button></Link>
      </div>
    </div>
  )
}
