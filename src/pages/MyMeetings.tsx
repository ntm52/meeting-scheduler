import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Input, Pill, Spinner, useToast } from '../components/ui'
import { api } from '../lib/api'
import { getStore, update } from '../lib/storage'
import { fmt, detectTz, relTime } from '../lib/tz'

type Item = {
  id: string; name: string; org: string; status: string; confirmed: { start: number; end: number } | null; deadline: number; tz: string
  role: 'organizer' | 'respondent'; manageKey?: string; participant: { id: string; key: string; name: string }; responded: boolean
}

export default function MyMeetings() {
  const toast = useToast()
  const [session, setSession] = useState(getStore().session)
  const [items, setItems] = useState<Item[] | null>(null)
  const [contact, setContact] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const tz = detectTz()

  useEffect(() => {
    if (!session) return
    api.get<{ events: Item[] }>('/api/me', session.token)
      .then((r) => {
        setItems(r.events)
        // remember these meetings in this browser too
        update((s) => {
          for (const e of r.events) {
            s.me[e.id] = e.participant
            if (e.manageKey) s.organizer[e.id] = e.manageKey
          }
        })
      })
      .catch(() => { update((s) => { delete s.session }); setSession(undefined) })
  }, [session])

  const start = async () => {
    setErr('')
    try {
      const r = await api.post<{ demoCode: string; channel: string }>('/api/auth/start', { contact })
      toast({ icon: r.channel === 'email' ? '✉️' : '💬', title: `Your code: ${r.demoCode}`, body: 'Demo: this is the message you’d receive.' })
      setSent(true)
    } catch (e: any) { setErr(e.message) }
  }
  const verify = async () => {
    setErr('')
    try {
      const r = await api.post<{ token: string; contact: string }>('/api/auth/verify', { contact, code })
      update((s) => { s.session = r })
      setSession(r)
    } catch (e: any) { setErr(e.message) }
  }

  // meetings remembered by this browser even without signing in
  const local = getStore()
  const localIds = [...new Set([...Object.keys(local.organizer), ...Object.keys(local.me)])].filter((id) => !items?.some((i) => i.id === id))

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-3xl font-extrabold">My meetings</h1>
      {!session ? (
        <Card className="space-y-4">
          <p className="text-ink/65">Lost the link? Enter the email or phone you used and we’ll find every meeting you organized or answered.</p>
          {!sent ? (
            <>
              <Field label="Email or phone"><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@school.edu" onKeyDown={(e) => e.key === 'Enter' && contact && start()} /></Field>
              <Button onClick={start} disabled={!contact.trim()}>Send me a code</Button>
              <p className="text-xs text-ink/45">Try <b>nathan@example.edu</b> to see the demo meeting.</p>
            </>
          ) : (
            <>
              <Field label={`6-digit code sent to ${contact}`}>
                <Input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl tracking-[.4em] font-bold" onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()} />
              </Field>
              <div className="flex gap-2"><Button onClick={verify} disabled={code.length !== 6}>Confirm</Button><Button variant="ghost" onClick={() => setSent(false)}>Back</Button></div>
            </>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
        </Card>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink/60">Signed in as <b className="text-ink">{session.contact}</b></span>
          <button className="text-brand-700 font-semibold hover:underline cursor-pointer" onClick={() => { update((s) => { delete s.session }); setSession(undefined); setItems(null) }}>Sign out</button>
        </div>
      )}

      {session && !items && <div className="grid place-items-center py-10"><Spinner /></div>}
      {items && items.length === 0 && <Card><p className="text-ink/60">No meetings found for {session?.contact} yet.</p></Card>}
      {items?.map((e) => (
        <Card key={e.id} className="!p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold truncate">{e.name}</span>
              <Pill tone={e.role === 'organizer' ? 'blue' : 'gray'}>{e.role === 'organizer' ? 'Organizer' : 'Respondent'}</Pill>
            </div>
            <div className="text-sm text-ink/60 mt-0.5">
              {e.status === 'confirmed' && e.confirmed ? <>✅ {fmt(e.confirmed.start, tz, 'EEE, MMM d · h:mm a')}</>
                : e.status === 'review' ? '✨ Time suggested, waiting on organizer'
                : <>Collecting · deadline {relTime(e.deadline)}{e.role === 'respondent' && !e.responded && ' · you haven’t answered'}</>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {e.role === 'organizer' && <Link to={`/e/${e.id}/manage?k=${e.manageKey}`}><Button size="sm">Dashboard</Button></Link>}
            <Link to={`/e/${e.id}`}><Button size="sm" variant="secondary">{e.responded ? 'My answer' : 'Answer'}</Button></Link>
          </div>
        </Card>
      ))}

      {localIds.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-ink/55 uppercase tracking-wide pt-4">Opened on this device</h2>
          {localIds.map((id) => (
            <Card key={id} className="!p-4 flex items-center justify-between">
              <span className="font-mono text-sm">{id === 'demo' ? 'CS 330 Group Meeting (demo)' : `/e/${id}`}</span>
              <div className="flex gap-2">
                {local.organizer[id] && <Link to={`/e/${id}/manage?k=${local.organizer[id]}`}><Button size="sm">Dashboard</Button></Link>}
                <Link to={`/e/${id}`}><Button size="sm" variant="secondary">Open</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
