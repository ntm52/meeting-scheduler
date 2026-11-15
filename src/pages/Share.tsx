import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Button, Card, Input, Spinner, useToast } from '../components/ui'
import { useEvent } from '../lib/useEvent'
import { api } from '../lib/api'
import { getStore } from '../lib/storage'
import { fmt } from '../lib/tz'

export default function Share() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const k = sp.get('k') || getStore().organizer[id!] || ''
  const { data, error, reload } = useEvent(id, k, 0)
  const [qr, setQr] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const link = `${location.origin}/e/${id}`

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#02254b', light: '#ffffff' } }).then(setQr)
  }, [link])

  if (error) return <p className="text-center text-red-700">{error}</p>
  if (!data) return <div className="grid place-items-center py-20"><Spinner /></div>
  const ev = data.event
  const withContact = ev.participants.filter((p) => !p.isOrganizer && p.contact)
  const notSent = withContact.filter((p) => !p.invitedAt)
  const confirmed = ev.status === 'confirmed' && ev.confirmed

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    toast({ title: `${what} copied` })
  }
  const sendAll = async () => {
    const r = await api.post<{ sent: number }>(`/api/events/${id}/invite`, { k, link })
    toast({ title: `Invites sent to ${r.sent}` })
    reload()
  }
  const addPerson = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await api.post(`/api/events/${id}/invitees`, { k, name, contact, link })
      toast({ title: `Invite sent to ${name.trim()}` })
      setName('')
      setContact('')
      reload()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const groupText = `Add your availability for ${ev.name}: ${link}`

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold">Invite to “{ev.name}”</h1>
        <p className="text-ink/60 mt-1">
          {confirmed
            ? <>Set for {fmt(ev.confirmed!.start, ev.tz, "EEE, MMM d 'at' h:mm a")}</>
            : <>Responses due {fmt(ev.deadline, ev.tz, "EEE, MMM d 'at' h:mm a")}</>}
        </p>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row gap-5 items-center">
          {qr && <img src={qr} alt="QR code for the invite link" className="size-40 rounded-xl border border-ink/10" />}
          <div className="flex-1 w-full space-y-3">
            <div className="rounded-xl bg-paper border border-ink/10 px-3 py-2.5 font-mono text-sm break-all">{link}</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy(link, 'Link')}>Copy link</Button>
              {!confirmed && <Button variant="secondary" onClick={() => copy(groupText, 'Message')}>Copy group message</Button>}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Send invites directly</h2>
        {withContact.length > 0 && (
          <ul className="text-sm divide-y divide-ink/10">
            {withContact.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-1.5">
                <span className="font-medium">{p.name}</span>
                <span className="text-ink/55 truncate">{p.contact}{p.invitedAt && ' · sent'}</span>
              </li>
            ))}
          </ul>
        )}
        {notSent.length > 0 && (
          <Button variant="soft" onClick={sendAll}>Send to {notSent.length} {notSent.length === 1 ? 'person' : 'people'}</Button>
        )}
        <form onSubmit={addPerson} className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Phone or email" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={busy || !name.trim() || !contact.trim()}>Invite</Button>
        </form>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </Card>

      <Link to={`/e/${id}/manage?k=${k}`}><Button size="lg" block>Go to dashboard</Button></Link>
      <p className="text-center text-sm">
        <Link className="text-brand-700 font-semibold hover:underline" to={`/e/${id}`}>Add your own availability</Link>
      </p>
    </div>
  )
}
