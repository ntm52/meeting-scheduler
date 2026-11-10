import ICAL from 'ical.js'
import { buildSlots, AVAILABLE } from '../../shared/schedule.js'
import type { Availability, MeetingEvent } from './types'
import { APP_NAME } from '../../shared/config.js'

const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** A real calendar invite file for the confirmed time. */
export function downloadIcs(ev: MeetingEvent, start: number, end: number) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//EN`, 'BEGIN:VEVENT',
    `UID:${ev.id}-${start}@meeting-scheduler`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${ev.name}`, `DESCRIPTION:Scheduled with ${APP_NAME}${ev.org ? ` · ${ev.org}` : ''}`,
    ...(ev.recurring ? [`RRULE:FREQ=${ev.recurring.freq === 'daily' ? 'DAILY' : ev.recurring.freq === 'monthly' ? 'MONTHLY' : 'WEEKLY'}${ev.recurring.freq === 'biweekly' ? ';INTERVAL=2' : ''}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${ev.name.replace(/[^\w\- ]/g, '')}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * Read an exported calendar (.ics from Google, Apple, Outlook) and mark every
 * slot that doesn't overlap a busy event as available.
 */
export function availabilityFromIcs(text: string, ev: MeetingEvent): { availability: Availability; busyCount: number } {
  const comp = new ICAL.Component(ICAL.parse(text))
  const slots = buildSlots(ev)
  if (!slots.length) return { availability: {}, busyCount: 0 }
  const step = (ev.slotMinutes || 30) * 60000
  const rangeStart = slots[0].t
  const rangeEnd = slots[slots.length - 1].t + step
  const busy: [number, number][] = []
  for (const v of comp.getAllSubcomponents('vevent')) {
    const e = new ICAL.Event(v)
    if ((v.getFirstPropertyValue('transp') as string) === 'TRANSPARENT') continue
    const len = e.endDate ? e.endDate.toJSDate().getTime() - e.startDate.toJSDate().getTime() : 3600000
    if (e.isRecurring()) {
      const it = e.iterator()
      let next, guard = 0
      while ((next = it.next()) && guard++ < 2000) {
        const s = next.toJSDate().getTime()
        if (s > rangeEnd) break
        if (s + len > rangeStart) busy.push([s, s + len])
      }
    } else {
      const s = e.startDate.toJSDate().getTime()
      if (s < rangeEnd && s + len > rangeStart) busy.push([s, s + len])
    }
  }
  const availability: Availability = {}
  for (const sl of slots) {
    const overlaps = busy.some(([a, b]) => sl.t < b && a < sl.t + step)
    if (!overlaps) availability[sl.i] = AVAILABLE
  }
  return { availability, busyCount: busy.length }
}
