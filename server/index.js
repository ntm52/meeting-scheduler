import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getDb, save } from './store.js'
import { notify, channelFor } from './notify.js'
import { makeDemoEvent } from './seed.js'
import { suggestTimes, looksSuspicious, formatRange, fakeCalendarAvailability } from '../shared/schedule.js'
import { APP_NAME } from '../shared/config.js'

const PORT = Number(process.env.API_PORT || 8080)
const HOST = process.env.HOST || '127.0.0.1'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOUR = 3600000

const app = express()
app.use(express.json({ limit: '1mb' }))

const db = getDb()
if (!db.events.demo) {
  db.events.demo = makeDemoEvent()
  save()
}

const id = (n = 6) => crypto.randomBytes(n).toString('base64url').slice(0, n + 2)
const bad = (res, code, error) => res.status(code).json({ error })

// ---- helpers --------------------------------------------------------------

function publicEvent(ev) {
  const { manageKey, ...rest } = ev
  return {
    ...rest,
    participants: ev.participants.map(({ key, contact, ...p }) => ({ ...p, hasContact: !!contact })),
  }
}

function getEvent(req, res) {
  const ev = db.events[req.params.id]
  if (!ev) bad(res, 404, 'Meeting not found')
  return ev
}

function requireOrganizer(req, res, ev) {
  const k = req.query.k || req.body?.k
  if (k !== ev.manageKey) {
    bad(res, 403, 'Only the organizer can do that')
    return false
  }
  return true
}

function getParticipant(req, res, ev) {
  const p = ev.participants.find((x) => x.id === req.params.pid)
  if (!p) return bad(res, 404, 'Person not found'), null
  const k = req.body?.pkey || req.query.pkey
  if (k !== p.key && k !== ev.manageKey) return bad(res, 403, 'Not your response'), null
  return p
}

function confirmTime(ev, start, end, auto = false) {
  ev.status = 'confirmed'
  ev.confirmed = { start, end, at: Date.now(), auto }
  ev.proposed = null
  for (const p of ev.participants) {
    p.sentMeetingReminders = {}
    p.cantMakeIt = false
    notify({
      to: p.contact,
      toName: p.name,
      eventId: ev.id,
      kind: 'confirmed',
      subject: `Meeting set: ${ev.name}`,
      body: `${ev.name} is set for ${formatRange(start, end, p.tz || ev.tz)}. It’s been added to your calendar (invite attached). — ${APP_NAME}`,
    })
  }
}

function attendingCount(ev) {
  if (!ev.confirmed) return 0
  const s = suggestTimes({ ...ev, participants: ev.participants.filter((p) => !p.cantMakeIt) }, 50)
    .find((x) => x.start === ev.confirmed.start)
  return s ? s.can.length + s.ifNeeded.length : ev.participants.filter((p) => !p.cantMakeIt).length
}

// ---- events ---------------------------------------------------------------

app.post('/api/events', (req, res) => {
  const b = req.body || {}
  if (!b.name?.trim()) return bad(res, 400, 'Give the meeting a name')
  if (!Array.isArray(b.dates) || b.dates.length === 0) return bad(res, 400, 'Pick at least one day')
  if (!(b.endMin > b.startMin)) return bad(res, 400, 'Latest time must be after earliest time')
  const now = Date.now()
  const ev = {
    id: id(6),
    manageKey: id(12),
    name: b.name.trim(),
    org: b.org?.trim() || '',
    organizer: { name: b.organizerName?.trim() || 'Organizer', contact: b.organizerContact?.trim() || '' },
    tz: b.tz || 'America/Chicago',
    dates: b.dates,
    startMin: b.startMin,
    endMin: b.endMin,
    slotMinutes: 30,
    durationMinutes: b.durationMinutes || 60,
    deadline: b.deadline || now + 2 * 24 * HOUR,
    minAttendees: b.minAttendees || 2,
    recurring: b.recurring || null,
    status: 'collecting',
    proposed: null,
    confirmed: null,
    sent24: false,
    createdAt: now,
    participants: [],
  }
  const organizer = {
    id: 'p-' + id(5), key: id(10), name: ev.organizer.name, contact: ev.organizer.contact, tz: ev.tz,
    isOrganizer: true, status: 'invited', method: null, availability: {}, flagged: false,
    autoReminded: false, cantMakeIt: false, reminders: { h24: true, h1: true }, sentMeetingReminders: {},
    respondedAt: null, updatedAt: null,
  }
  ev.participants.push(organizer)
  for (const inv of b.invitees || []) {
    if (!inv.name?.trim()) continue
    ev.participants.push({
      id: 'p-' + id(5), key: id(10), name: inv.name.trim(), contact: inv.contact?.trim() || '', tz: null,
      isOrganizer: false, status: 'invited', method: null, availability: {}, flagged: false,
      autoReminded: false, cantMakeIt: false, reminders: { h24: true, h1: true }, sentMeetingReminders: {},
      respondedAt: null, updatedAt: null,
    })
  }
  db.events[ev.id] = ev
  save()
  res.json({ event: publicEvent(ev), manageKey: ev.manageKey, organizer: { id: organizer.id, key: organizer.key } })
})

app.get('/api/events/:id', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev) return
  const isOrg = req.query.k === ev.manageKey
  const out = publicEvent(ev)
  if (isOrg) out.participants = ev.participants.map(({ key, ...p }) => p)
  res.json({ event: out, isOrganizer: isOrg, suggestions: suggestTimes(ev, 3), attending: attendingCount(ev) })
})

function sendInvite(ev, p, link) {
  const tz = p.tz || ev.tz
  const body = ev.status === 'confirmed' && ev.confirmed
    ? `${ev.organizer.name} invited you to ${ev.name}, set for ${formatRange(ev.confirmed.start, ev.confirmed.end, tz)}. Details: ${link}`
    : `${ev.organizer.name} invited you to ${ev.name}. Add your availability: ${link} — Reply by ${new Date(ev.deadline).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`
  notify({ to: p.contact, toName: p.name, eventId: ev.id, kind: 'invite', subject: `${ev.organizer.name} invited you to ${ev.name}`, body })
  p.invitedAt = Date.now()
}

// send invites to everyone with a contact who hasn't been invited yet
app.post('/api/events/:id/invite', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev || !requireOrganizer(req, res, ev)) return
  let sent = 0
  for (const p of ev.participants) {
    if (p.isOrganizer || !p.contact || p.invitedAt) continue
    sendInvite(ev, p, req.body.link)
    sent++
  }
  save()
  res.json({ sent })
})

// organizer adds one more person (works before or after the time is set) and invites them
app.post('/api/events/:id/invitees', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev || !requireOrganizer(req, res, ev)) return
  const name = req.body.name?.trim()
  const contact = req.body.contact?.trim() || ''
  if (!name) return bad(res, 400, 'Enter a name')
  if (!contact) return bad(res, 400, 'Enter a phone or email')
  let p = ev.participants.find((x) => x.contact && x.contact.toLowerCase() === contact.toLowerCase())
  if (!p) {
    p = {
      id: 'p-' + id(5), key: id(10), name, contact, tz: null,
      isOrganizer: false, status: 'invited', method: null, availability: {}, flagged: false,
      autoReminded: false, cantMakeIt: false, reminders: { h24: true, h1: true }, sentMeetingReminders: {},
      respondedAt: null, updatedAt: null,
    }
    ev.participants.push(p)
  }
  sendInvite(ev, p, req.body.link)
  save()
  res.json({ ok: true })
})

// join as a respondent (matches an existing invitee by contact or name)
app.post('/api/events/:id/join', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev) return
  const { name, contact, tz, participantId } = req.body || {}
  let p = null
  if (participantId) p = ev.participants.find((x) => x.id === participantId)
  if (!p && contact) p = ev.participants.find((x) => x.contact && x.contact.toLowerCase() === contact.toLowerCase())
  if (!p && name) p = ev.participants.find((x) => x.name.toLowerCase() === name.trim().toLowerCase() && !x.isOrganizer)
  if (!p) {
    if (!name?.trim()) return bad(res, 400, 'Tell us your name')
    p = {
      id: 'p-' + id(5), key: id(10), name: name.trim(), contact: contact || '', tz: tz || null,
      isOrganizer: false, status: 'invited', method: null, availability: {}, flagged: false,
      autoReminded: false, cantMakeIt: false, reminders: { h24: true, h1: true }, sentMeetingReminders: {},
      respondedAt: null, updatedAt: null,
    }
    ev.participants.push(p)
  }
  if (contact && !p.contact) p.contact = contact
  if (tz) p.tz = tz
  save()
  res.json({ participant: { id: p.id, key: p.key, name: p.name } })
})

app.put('/api/events/:id/participants/:pid', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev) return
  const p = getParticipant(req, res, ev)
  if (!p) return
  const { availability, method, tz, reminders } = req.body
  if (availability) {
    const had = Object.keys(p.availability || {}).length > 0
    p.availability = availability
    p.method = method || p.method || 'manual'
    p.status = had ? 'updated' : 'responded'
    if (had) p.updatedAt = Date.now()
    else p.respondedAt = Date.now()
    p.flagged = looksSuspicious(ev, availability)
    if (!p.isOrganizer) {
      notify({
        to: ev.organizer.contact, toName: ev.organizer.name, eventId: ev.id, kind: 'response', channel: 'push',
        subject: had ? `${p.name} updated their availability` : `${p.name} responded`,
        body: had
          ? `${p.name} updated their availability for ${ev.name}.`
          : `${p.name} added their availability for ${ev.name}. ${ev.participants.filter((x) => Object.keys(x.availability).length).length} of ${ev.participants.length} are in.`,
      })
    }
    // if a time is already set and this person's change breaks it, handle like a cancellation
  }
  if (tz) p.tz = tz
  if (reminders) p.reminders = { ...p.reminders, ...reminders }
  save()
  res.json({ ok: true, flagged: p.flagged })
})

app.post('/api/events/:id/participants/:pid/confirm', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev) return
  const p = getParticipant(req, res, ev)
  if (!p) return
  p.flagged = false
  save()
  res.json({ ok: true })
})

app.post('/api/events/:id/participants/:pid/cant-make-it', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev) return
  const p = getParticipant(req, res, ev)
  if (!p) return
  cancelFor(ev, p)
  res.json({ ok: true, status: ev.status })
})

function cancelFor(ev, p) {
  p.cantMakeIt = true
  const n = attendingCount(ev)
  if (ev.status === 'confirmed' && n < ev.minAttendees) {
    ev.status = 'collecting'
    ev.confirmed = null
    notify({
      to: ev.organizer.contact, toName: ev.organizer.name, eventId: ev.id, kind: 'cancel', channel: 'push',
      subject: `${ev.name} needs a new time`,
      body: `${p.name} can’t make it, so only ${n} can come (fewer than ${ev.minAttendees}). We reopened the meeting and will suggest a new time.`,
    })
  } else {
    notify({
      to: ev.organizer.contact, toName: ev.organizer.name, eventId: ev.id, kind: 'cancel', channel: 'push',
      subject: `${p.name} can’t make it`,
      body: `${p.name} can’t make ${ev.name}. ${n} can still attend, so the time stays (it only changes if fewer than ${ev.minAttendees} can come).`,
    })
  }
  save()
}

app.post('/api/events/:id/remind', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev || !requireOrganizer(req, res, ev)) return
  const ids = new Set(req.body.participantIds || [])
  const link = req.body.link || ''
  let sent = 0
  for (const p of ev.participants) {
    if (!ids.has(p.id)) continue
    notify({
      to: p.contact, toName: p.name, eventId: ev.id, kind: 'reminder',
      subject: `Reminder: add your availability for ${ev.name}`,
      body: `Hi ${p.name}, ${ev.organizer.name} is still waiting on your availability for ${ev.name}. It takes 30 seconds: ${link}`,
    })
    sent++
  }
  res.json({ sent })
})

app.post('/api/events/:id/approve', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev || !requireOrganizer(req, res, ev)) return
  const { start, end } = req.body
  if (!start || !end) return bad(res, 400, 'Pick a time')
  confirmTime(ev, start, end)
  save()
  res.json({ ok: true })
})

app.post('/api/events/:id/reopen', (req, res) => {
  const ev = getEvent(req, res)
  if (!ev || !requireOrganizer(req, res, ev)) return
  ev.status = 'collecting'
  ev.confirmed = null
  ev.proposed = null
  if (ev.deadline < Date.now()) ev.deadline = Date.now() + 24 * HOUR
  ev.sent24 = false
  save()
  res.json({ ok: true })
})

// ---- simulated sign-in (6-digit code) --------------------------------------

app.post('/api/auth/start', (req, res) => {
  const contact = (req.body.contact || '').trim()
  if (!contact) return bad(res, 400, 'Enter an email or phone number')
  const code = String(Math.floor(100000 + Math.random() * 900000))
  db.codes[contact.toLowerCase()] = { code, at: Date.now() }
  notify({
    to: contact, kind: 'code',
    subject: `Your ${APP_NAME} code`,
    body: `Your ${APP_NAME} code is ${code}. It expires in 10 minutes.`,
  })
  save()
  // Demo only: hand the code back so it can be shown on screen.
  res.json({ ok: true, channel: channelFor(contact), demoCode: code })
})

app.post('/api/auth/verify', (req, res) => {
  const contact = (req.body.contact || '').trim()
  const rec = db.codes[contact.toLowerCase()]
  if (!rec || rec.code !== String(req.body.code || '').trim()) return bad(res, 400, 'That code doesn’t match. Check the latest message and try again.')
  delete db.codes[contact.toLowerCase()]
  const token = id(16)
  db.sessions[token] = { contact, at: Date.now() }
  save()
  res.json({ token, contact })
})

// Optional account (email + password). Passwords are hashed with scrypt.
app.post('/api/auth/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const pw = req.body.password || ''
  if (!email || pw.length < 6) return bad(res, 400, 'Use an email and a password of 6+ characters')
  if (db.users[email]) return bad(res, 400, 'That email already has an account. Sign in instead.')
  const salt = crypto.randomBytes(16).toString('hex')
  db.users[email] = { salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex') }
  const token = id(16)
  db.sessions[token] = { contact: email, at: Date.now() }
  save()
  res.json({ token, contact: email })
})

app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const u = db.users[email]
  if (!u || crypto.scryptSync(req.body.password || '', u.salt, 32).toString('hex') !== u.hash)
    return bad(res, 400, 'Email or password is wrong')
  const token = id(16)
  db.sessions[token] = { contact: email, at: Date.now() }
  save()
  res.json({ token, contact: email })
})

app.get('/api/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const s = db.sessions[token]
  if (!s) return bad(res, 401, 'Please sign in again')
  const c = s.contact.toLowerCase()
  const out = []
  for (const ev of Object.values(db.events)) {
    const p = ev.participants.find((x) => x.contact && x.contact.toLowerCase() === c)
    if (!p) continue
    out.push({
      id: ev.id, name: ev.name, org: ev.org, status: ev.status, confirmed: ev.confirmed, deadline: ev.deadline, tz: ev.tz,
      role: p.isOrganizer ? 'organizer' : 'respondent',
      manageKey: p.isOrganizer ? ev.manageKey : undefined,
      participant: { id: p.id, key: p.key, name: p.name },
      responded: Object.keys(p.availability).length > 0,
    })
  }
  res.json({ contact: s.contact, events: out })
})

// ---- outbox -----------------------------------------------------------------

app.get('/api/outbox', (req, res) => {
  const ev = req.query.event
  res.json({ messages: db.outbox.filter((m) => !ev || m.eventId === ev).slice(0, 200) })
})

// ---- demo controls (for presenting) ----------------------------------------

app.post('/api/demo/:id/:action', (req, res) => {
  const ev = db.events[req.params.id]
  if (!ev) return bad(res, 404, 'Meeting not found')
  const a = req.params.action
  if (a === 'next-response') {
    const p = ev.participants.find((x) => Object.keys(x.availability).length === 0)
    if (!p) return res.json({ message: 'Everyone has already responded' })
    p.availability = fakeCalendarAvailability(ev, p.name)
    p.method = 'google'
    p.status = 'responded'
    p.respondedAt = Date.now()
    p.flagged = false
    notify({ to: ev.organizer.contact, toName: ev.organizer.name, eventId: ev.id, kind: 'response', channel: 'push',
      subject: `${p.name} responded`, body: `${p.name} connected their Google Calendar for ${ev.name}.` })
    save()
    return res.json({ message: `${p.name} connected their calendar` })
  }
  if (a === 'near-deadline') {
    ev.deadline = Date.now() + 23 * HOUR
    ev.sent24 = false
    tick()
    return res.json({ message: 'Deadline is now 23 hours away, so automatic reminders went out' })
  }
  if (a === 'deadline') {
    ev.deadline = Date.now() - 1000
    tick()
    return res.json({ message: 'Deadline passed: the best time was picked and sent to the organizer for approval' })
  }
  if (a === 'cancel') {
    if (ev.status !== 'confirmed') return res.json({ message: 'Approve a time first, then simulate a cancellation' })
    const p = ev.participants.find((x) => !x.isOrganizer && !x.cantMakeIt)
    if (!p) return res.json({ message: 'Nobody left to cancel' })
    cancelFor(ev, p)
    return res.json({ message: `${p.name} can’t make it anymore` })
  }
  if (a === 'meeting-soon') {
    if (ev.status !== 'confirmed') return res.json({ message: 'Approve a time first' })
    const len = ev.confirmed.end - ev.confirmed.start
    ev.confirmed.start = Date.now() + 23 * HOUR
    ev.confirmed.end = ev.confirmed.start + len
    tick()
    return res.json({ message: 'Meeting is now 23 hours away, so 24-hour reminders went out' })
  }
  if (a === 'reset') {
    if (ev.id !== 'demo') return res.json({ message: 'Only the demo meeting can be reset' })
    db.events.demo = makeDemoEvent()
    db.outbox = db.outbox.filter((m) => m.eventId !== 'demo')
    save()
    return res.json({ message: 'Demo meeting reset' })
  }
  bad(res, 400, 'Unknown demo action')
})

// ---- automation: reminders, deadline pick, meeting reminders ---------------

function tick() {
  const now = Date.now()
  let changed = false
  for (const ev of Object.values(db.events)) {
    if (ev.status === 'collecting') {
      if (!ev.sent24 && ev.deadline - now <= 24 * HOUR && ev.deadline > now) {
        ev.sent24 = true
        changed = true
        for (const p of ev.participants) {
          if (Object.keys(p.availability).length) continue
          p.autoReminded = true
          notify({
            to: p.contact, toName: p.name, eventId: ev.id, kind: 'reminder',
            subject: `Last call for ${ev.name}`,
            body: `Hi ${p.name}, ${ev.name} gets scheduled in less than a day. Add your availability so you’re included.`,
          })
        }
      }
      if (ev.deadline <= now) {
        changed = true
        const [best] = suggestTimes(ev, 1)
        ev.status = 'review'
        ev.proposed = best || null
        notify({
          to: ev.organizer.contact, toName: ev.organizer.name, eventId: ev.id, kind: 'review', channel: 'push',
          subject: `We found a time for ${ev.name}`,
          body: best
            ? `Best time: ${formatRange(best.start, best.end, ev.tz)} (${best.can.length + best.ifNeeded.length} of ${ev.participants.length} can attend). Tap to approve it.`
            : `The deadline passed but nobody shared availability yet.`,
        })
      }
    }
    if (ev.status === 'confirmed' && ev.confirmed) {
      for (const p of ev.participants) {
        if (p.cantMakeIt) continue
        p.sentMeetingReminders ||= {}
        const until = ev.confirmed.start - now
        for (const [key, ms, label] of [['h24', 24 * HOUR, '24 hours'], ['h1', HOUR, '1 hour']]) {
          if (p.reminders?.[key] && !p.sentMeetingReminders[key] && until <= ms && until > 0) {
            p.sentMeetingReminders[key] = true
            changed = true
            notify({
              to: p.contact, toName: p.name, eventId: ev.id, kind: 'meeting-reminder',
              subject: `${ev.name} in ${label}`,
              body: `Reminder: ${ev.name} starts ${formatRange(ev.confirmed.start, ev.confirmed.end, p.tz || ev.tz)}.`,
            })
          }
        }
      }
    }
  }
  if (changed) save()
}
setInterval(tick, 15000)

// ---- static front end (production) -----------------------------------------

const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, HOST, () => console.log(`${APP_NAME} listening on http://${HOST}:${PORT}`))
