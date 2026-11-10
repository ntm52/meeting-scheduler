// "Type when you're free" -> grid. A small rule-based parser (a real product
// might hand this to an LLM; the sketch mentioned Gemini). Understands things like:
//   "weekday afternoons except wed"
//   "mon-thu after 3pm"
//   "tuesday 1-4pm, friday mornings"
//   "busy monday morning"   "evenings if needed"
import { buildSlots, AVAILABLE, IF_NEEDED } from '../../shared/schedule.js'
import { formatInTimeZone } from 'date-fns-tz'
import type { Availability, MeetingEvent } from './types'

const DAY_WORDS: [RegExp, number][] = [
  [/\bmon(day)?s?\b/, 1], [/\btue(s|sday)?s?\b/, 2], [/\bwed(nesday)?s?\b/, 3], [/\bthu(r|rs|rsday)?s?\b/, 4],
  [/\bfri(day)?s?\b/, 5], [/\bsat(urday)?s?\b/, 6], [/\bsun(day)?s?\b/, 7],
]
const dayIndex = (w: string) => DAY_WORDS.find(([re]) => re.test(w))?.[1]

function parseTime(s: string, ampmHint?: string): number | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!m) {
    if (/noon/.test(s)) return 12 * 60
    if (/midnight/.test(s)) return 24 * 60
    return null
  }
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  const ap = (m[3] || ampmHint || '').replace(/^a$/, 'am').replace(/^p$/, 'pm')
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (!ap && h >= 1 && h <= 7) h += 12 // "after 3" almost always means 3pm for students
  return h * 60 + min
}

function daysIn(text: string): Set<number> {
  const out = new Set<number>()
  // ranges like mon-thu / monday through thursday
  const range = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:-|–|to|through|thru)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*/g
  let r
  while ((r = range.exec(text))) {
    const a = dayIndex(r[1])!, b = dayIndex(r[2])!
    for (let d = a; d !== b % 7 + 1; d = d % 7 + 1) out.add(d)
    out.add(b)
  }
  if (/\bweekdays?\b/.test(text)) [1, 2, 3, 4, 5].forEach((d) => out.add(d))
  if (/\bweekends?\b/.test(text)) [6, 7].forEach((d) => out.add(d))
  if (/\b(every ?day|all week|daily)\b/.test(text)) [1, 2, 3, 4, 5, 6, 7].forEach((d) => out.add(d))
  for (const w of text.split(/[^a-z]+/)) {
    const d = dayIndex(w)
    if (d) out.add(d)
  }
  return out
}

function windowsIn(text: string): [number, number][] {
  const w: [number, number][] = []
  if (/\bmornings?\b/.test(text)) w.push([0, 12 * 60])
  if (/\b(afternoons?|after lunch)\b/.test(text)) w.push([12 * 60, 17 * 60])
  if (/\b(evenings?|nights?|tonight)\b/.test(text)) w.push([17 * 60, 24 * 60])
  if (/\blunch\b/.test(text) && !/after lunch/.test(text)) w.push([11 * 60 + 30, 13 * 60 + 30])
  const span = /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|–|to|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon)/g
  let m
  while ((m = span.exec(text))) {
    const endAp = m[2].match(/(am|pm|a|p)$/)?.[1]
    const a = parseTime(m[1], /\d$/.test(m[1].trim()) ? endAp : undefined)
    const b = parseTime(m[2])
    if (a != null && b != null) w.push([a, b > a ? b : b + 12 * 60])
  }
  const after = text.match(/\b(?:after|from|starting)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon)(?!\s*(?:-|–|to|until))/)
  if (after) { const t = parseTime(after[1]); if (t != null) w.push([t, 24 * 60]) }
  const before = text.match(/\b(?:before|until|till|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?|noon)/)
  if (before && !w.length) { const t = parseTime(before[1]); if (t != null) w.push([0, t]) }
  else if (before && w.length) { const t = parseTime(before[1]); if (t != null) w.forEach((x) => (x[1] = Math.min(x[1], t))) }
  return w
}

export type ParseResult = { availability: Availability; matched: number; notes: string[] }

export function parseFreeText(input: string, ev: MeetingEvent, tz: string, base: Availability = {}): ParseResult {
  const slots = buildSlots(ev)
  const availability: Availability = { ...base }
  const notes: string[] = []
  const clauses = input.toLowerCase().split(/[.;\n]+|,\s*(?=(?:and\s+)?(?:but\s+)?(?:busy|not|except|mon|tue|wed|thu|fri|sat|sun|weekday|weekend|every|any|maybe|morning|afternoon|evening))/)
  for (const raw of clauses) {
    let text = raw.trim()
    if (!text) continue
    const busy = /\b(busy|can'?t|cannot|not free|unavailable|no)\b/.test(text) && !/\bexcept\b/.test(text)
    const level = /\b(if needed|if i have to|maybe|prefer not|rather not|if necessary)\b/.test(text) ? IF_NEEDED : AVAILABLE
    let exceptDays = new Set<number>()
    const ex = text.match(/\b(?:except|but not|not on|other than|besides)\b(.*)$/)
    if (ex) {
      exceptDays = daysIn(ex[1])
      text = text.slice(0, ex.index)
    }
    let days = daysIn(text)
    if (!days.size) days = new Set([1, 2, 3, 4, 5, 6, 7])
    exceptDays.forEach((d) => days.delete(d))
    let wins = windowsIn(text)
    if (!wins.length) wins = [[0, 24 * 60]]
    let n = 0
    for (const s of slots) {
      const dow = +formatInTimeZone(s.t, tz, 'i')
      const [h, m] = formatInTimeZone(s.t, tz, 'HH:mm').split(':').map(Number)
      const min = h * 60 + m
      if (!days.has(dow)) continue
      if (!wins.some(([a, b]) => min >= a && min < b)) continue
      if (busy) delete availability[s.i]
      else availability[s.i] = level
      n++
    }
    notes.push(`${busy ? 'Busy' : level === IF_NEEDED ? 'If needed' : 'Free'}: ${n} time slot${n === 1 ? '' : 's'} from “${raw.trim()}”`)
  }
  return { availability, matched: Object.keys(availability).length, notes }
}
