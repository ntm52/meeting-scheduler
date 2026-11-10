// The demo event from the sketches: CS 330 Group Meeting, organized by Adam.
import { formatInTimeZone } from 'date-fns-tz'
import { fakeCalendarAvailability, AVAILABLE, buildSlots } from '../shared/schedule.js'

const DAY = 86400000

function upcomingWeekdays(tz) {
  // the next Monday-Friday (starting tomorrow at the earliest)
  const dates = []
  let t = Date.now() + DAY
  while (formatInTimeZone(t, tz, 'i') !== '1') t += DAY
  for (let k = 0; k < 5; k++) dates.push(formatInTimeZone(t + k * DAY, tz, 'yyyy-MM-dd'))
  return dates
}

export function makeDemoEvent() {
  const tz = 'America/Chicago'
  const now = Date.now()
  const ev = {
    id: 'demo',
    manageKey: 'demo',
    name: 'CS 330 Group Meeting',
    org: 'CS 330 · Group 1',
    organizer: { name: 'Adam', contact: 'adam@example.edu' },
    tz,
    dates: upcomingWeekdays(tz),
    startMin: 9 * 60,
    endMin: 18 * 60,
    slotMinutes: 30,
    durationMinutes: 60,
    deadline: now + 2 * DAY,
    minAttendees: 3,
    recurring: null,
    status: 'collecting',
    proposed: null,
    confirmed: null,
    sent24: false,
    createdAt: now - DAY,
    participants: [],
  }
  const people = [
    { id: 'p-adam', name: 'Adam', contact: 'adam@example.edu', tz: 'America/Chicago', isOrganizer: true, method: 'google' },
    { id: 'p-ari', name: 'Ari', contact: '(312) 555-0142', tz: 'America/Denver', method: 'google' },
    { id: 'p-nathan', name: 'Nathan', contact: 'nathan@example.edu', tz: 'America/Chicago', method: 'icloud', updated: true },
    { id: 'p-ivan', name: 'Ivan', contact: '(847) 555-0199', tz: 'Europe/Madrid', method: null },
    { id: 'p-zac', name: 'Zac', contact: 'zac@example.edu', tz: 'America/Los_Angeles', method: 'text', suspicious: true },
  ]
  for (const p of people) {
    let availability = {}
    if (p.method) availability = fakeCalendarAvailability(ev, p.name)
    if (p.suspicious) {
      availability = {}
      for (const s of buildSlots(ev)) availability[s.i] = AVAILABLE
    }
    ev.participants.push({
      id: p.id,
      key: p.id,
      name: p.name,
      contact: p.contact,
      tz: p.tz,
      isOrganizer: !!p.isOrganizer,
      status: p.method ? (p.updated ? 'updated' : 'responded') : 'invited',
      method: p.method,
      availability,
      flagged: !!p.suspicious,
      autoReminded: false,
      cantMakeIt: false,
      reminders: { h24: true, h1: true },
      sentMeetingReminders: {},
      respondedAt: p.method ? now - DAY / 2 : null,
      updatedAt: p.updated ? now - DAY / 6 : null,
    })
  }
  return ev
}
