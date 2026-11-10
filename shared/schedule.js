// Shared scheduling logic, used by both the browser and the Node server.
// Every slot is an absolute instant (UTC ms), so time zones only affect how
// the grid is *displayed*, never what is stored.
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

export const AVAILABLE = 2
export const IF_NEEDED = 1

const pad = (n) => String(n).padStart(2, '0')
export const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** All candidate slots for an event, in time order. */
export function buildSlots(event) {
  const step = event.slotMinutes || 30
  const out = []
  for (const date of event.dates) {
    for (let m = event.startMin; m < event.endMin; m += step) {
      const t = fromZonedTime(`${date}T${minToHHMM(m)}:00`, event.tz).getTime()
      out.push({ i: out.length, t })
    }
  }
  return out
}

/** How the slots lay out as a grid for someone viewing in `tz`. */
export function layoutForTz(slots, tz) {
  const cols = new Set()
  const rows = new Set()
  const cell = new Map()
  const localMin = (t) => {
    const [h, m] = formatInTimeZone(t, tz, 'HH:mm').split(':').map(Number)
    return h * 60 + m
  }
  // A "column day" starts at the local time of the very first slot, so a
  // meeting window that crosses midnight in this zone (e.g. 4pm–1am CET)
  // stays in one column instead of spilling into the next day.
  const pivot = slots.length ? localMin(slots[0].t) : 0
  for (const s of slots) {
    const min = localMin(s.t)
    const d = formatInTimeZone(s.t - pivot * 60000, tz, 'yyyy-MM-dd')
    cols.add(d)
    rows.add(min)
    cell.set(`${d}|${min}`, s.i)
  }
  const order = (m) => (m - pivot + 1440) % 1440
  return {
    cols: [...cols].sort(),
    rows: [...rows].sort((a, b) => order(a) - order(b)),
    cell,
  }
}

export function respondedParticipants(event) {
  return event.participants.filter((p) => p.availability && Object.keys(p.availability).length > 0 && p.status !== 'declined')
}

/**
 * Rank start times by how many people can make the full meeting.
 * score = 2 * (fully available) + 1 * (only "if needed"); flagged
 * ("Check?") answers count half until the person confirms them.
 */
export function suggestTimes(event, limit = 3) {
  const slots = buildSlots(event)
  const step = (event.slotMinutes || 30) * 60000
  const need = Math.max(1, Math.round((event.durationMinutes || 60) / (event.slotMinutes || 30)))
  const people = respondedParticipants(event)
  const results = []
  for (let s = 0; s + need <= slots.length; s++) {
    let ok = true
    for (let k = 1; k < need; k++) {
      if (slots[s + k].t - slots[s + k - 1].t !== step) { ok = false; break }
    }
    if (!ok) continue
    const can = [], ifNeeded = [], cannot = []
    let score = 0
    for (const p of people) {
      let min = AVAILABLE
      for (let k = 0; k < need; k++) {
        const v = p.availability[slots[s + k].i] || 0
        if (v < min) min = v
      }
      const w = p.flagged ? 0.5 : 1
      if (min === AVAILABLE) { can.push(p.name); score += 2 * w }
      else if (min === IF_NEEDED) { ifNeeded.push(p.name); score += 1 * w }
      else cannot.push(p.name)
    }
    if (score > 0) results.push({ start: slots[s].t, end: slots[s].t + need * step, slotIndex: s, can, ifNeeded, cannot, score })
  }
  results.sort((a, b) => b.score - a.score || a.start - b.start)
  // don't return three overlapping versions of the same window
  const picked = []
  for (const r of results) {
    if (picked.length >= limit) break
    if (picked.some((p) => r.start < p.end && p.start < r.end)) continue
    picked.push(r)
  }
  return picked
}

/** Heatmap counts per slot index. */
export function slotCounts(event) {
  const slots = buildSlots(event)
  const people = respondedParticipants(event)
  return slots.map((s) => {
    const avail = [], maybe = []
    for (const p of people) {
      const v = p.availability[s.i] || 0
      if (v === AVAILABLE) avail.push(p.name)
      else if (v === IF_NEEDED) maybe.push(p.name)
    }
    return { avail, maybe }
  })
}

/** "Free all week" style answers look suspicious; ask the person to confirm. */
export function looksSuspicious(event, availability) {
  const total = buildSlots(event).length
  const free = Object.values(availability).filter((v) => v === AVAILABLE).length
  return total > 0 && free / total >= 0.9
}

// ---- Simulated calendar connection ---------------------------------------

function seeded(str) {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/**
 * Pretend we read someone's Google/iCloud calendar: a few class/work blocks
 * per day, and everything else free. Deterministic per person so a demo
 * looks the same every time.
 */
export function fakeCalendarAvailability(event, seedName) {
  const rand = seeded(seedName + event.id)
  const slots = buildSlots(event)
  const byDay = new Map()
  for (const s of slots) {
    const d = formatInTimeZone(s.t, event.tz, 'yyyy-MM-dd')
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d).push(s)
  }
  const avail = {}
  for (const daySlots of byDay.values()) {
    const busy = new Set()
    const blocks = 2 + Math.floor(rand() * 3)
    for (let b = 0; b < blocks; b++) {
      const start = Math.floor(rand() * daySlots.length)
      const len = 2 + Math.floor(rand() * 3)
      for (let k = start; k < Math.min(daySlots.length, start + len); k++) busy.add(k)
    }
    daySlots.forEach((s, k) => {
      if (!busy.has(k)) avail[s.i] = rand() < 0.15 ? IF_NEEDED : AVAILABLE
    })
  }
  return avail
}

/** Short zone name: "CST", "PST", and "CET" rather than "GMT+1" where possible. */
export function tzShort(tz, at = Date.now()) {
  const part = (loc) =>
    new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || ''
  try {
    const us = part('en-US')
    if (!/^(GMT|UTC)[+-]/.test(us)) return us
    const gb = part('en-GB')
    return /^(GMT|UTC)[+-]/.test(gb) ? us : gb
  } catch {
    return tz
  }
}

export function formatRange(start, end, tz) {
  return `${formatInTimeZone(start, tz, 'EEE, MMM d · h:mm')}–${formatInTimeZone(end, tz, 'h:mm a')} ${tzShort(tz, start)}`
}
