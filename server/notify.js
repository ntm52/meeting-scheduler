// Every "outside world" message goes through here. Nothing is really sent:
// messages land in the Outbox page so the concept can be demoed.
// In a real build: SMS -> Twilio, email -> SendGrid/SES, push -> Web Push.
import crypto from 'node:crypto'
import { getDb, save } from './store.js'

export const channelFor = (contact = '') => (contact.includes('@') ? 'email' : contact ? 'sms' : 'in-app')

export function notify({ to, toName, subject, body, eventId = null, kind = 'info', channel }) {
  const db = getDb()
  const msg = {
    id: crypto.randomUUID(),
    at: Date.now(),
    channel: channel || channelFor(to),
    to: to || '(no contact on file)',
    toName: toName || '',
    subject,
    body,
    eventId,
    kind,
  }
  db.outbox.unshift(msg)
  db.outbox = db.outbox.slice(0, 500)
  save()
  return msg
}
