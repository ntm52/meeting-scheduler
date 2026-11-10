import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Button, Card, RoleBadge, Spinner, useToast } from '../components/ui'
import { useEvent } from '../lib/useEvent'
import { api } from '../lib/api'
import { getStore } from '../lib/storage'
import { fmt } from '../lib/tz'

export default function Share() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const k = sp.get('k') || getStore().organizer[id!] || ''
  const { data, error } = useEvent(id, k, 0)
  const [qr, setQr] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const toast = useToast()
  const link = `${location.origin}/e/${id}`

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#1d4f30', light: '#ffffff' } }).then(setQr)
  }, [link])

  if (error) return <p className="text-center text-red-700">{error}</p>
  if (!data) return <div className="grid place-items-center py-20"><Spinner /></div>
  const ev = data.event
  const withContact = ev.participants.filter((p) => !p.isOrganizer && p.contact)

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    toast({ icon: '📋', title: `${what} copied` })
  }
  const sendInvites = async () => {
    const r = await api.post<{ sent: number }>(`/api/events/${id}/invite`, { k, link })
    setSent(r.sent)
    toast({ icon: '📨', title: `Invites sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`, body: 'See them in the Outbox.' })
  }
  const groupText = `Hey! Add your availability for ${ev.name} here (takes 30 sec, you can connect your calendar): ${link}`

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <RoleBadge role="Organizer" name={ev.organizer.name} />
        <h1 className="text-3xl font-extrabold">Share “{ev.name}”</h1>
        <p className="text-ink/60 mt-1">Responses are due {fmt(ev.deadline, ev.tz, "EEE, MMM d 'at' h:mm a")}. We’ll remind people for you.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-5 items-center">
          {qr && <img src={qr} alt="QR code for the invite link" className="size-40 rounded-xl border border-ink/10" />}
          <div className="flex-1 w-full space-y-3">
            <div className="rounded-xl bg-paper border border-ink/10 px-3 py-2.5 font-mono text-sm break-all">{link}</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy(link, 'Link')}>Copy link</Button>
              <Button variant="secondary" onClick={() => copy(groupText, 'Group chat message')}>Copy group chat message</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Send invites directly</h2>
        {withContact.length ? (
          <>
            <ul className="text-sm space-y-1">
              {withContact.map((p) => (
                <li key={p.id} className="flex justify-between"><span className="font-medium">{p.name}</span><span className="text-ink/55">{p.contact?.includes('@') ? '✉️ email' : '💬 text'} · {p.contact}</span></li>
              ))}
            </ul>
            <Button variant="soft" onClick={sendInvites} disabled={sent !== null}>{sent !== null ? `Sent to ${sent} ✓` : `Text / email ${withContact.length} ${withContact.length === 1 ? 'person' : 'people'}`}</Button>
          </>
        ) : (
          <p className="text-sm text-ink/55">You didn’t add phone numbers or emails, so share the link above in your group chat.</p>
        )}
      </Card>

      <Link to={`/e/${id}/manage?k=${k}`}><Button size="lg" block>Go to my dashboard →</Button></Link>
      <p className="text-center text-sm text-ink/55">
        Add your own availability too: <Link className="text-brand-700 font-semibold hover:underline" to={`/e/${id}`}>open the invite as yourself</Link>
      </p>
    </div>
  )
}
