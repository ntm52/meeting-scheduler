import { formatInTimeZone } from 'date-fns-tz'

export const detectTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'

const ALL: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[]
  } catch {
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Madrid', 'Asia/Tokyo', 'UTC']
  }
})()

export function tzAbbr(tz: string, at = Date.now()) {
  try {
    const short = (loc: string) =>
      new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || ''
    let a = short('en-US')
    // US English only has letters for US zones; British English knows CET, BST, etc.
    if (/^(GMT|UTC)[+-]/.test(a)) {
      const gb = short('en-GB')
      if (!/^(GMT|UTC)[+-]/.test(gb)) a = gb
    }
    return a || formatInTimeZone(at, tz, 'zzz')
  } catch {
    return tz
  }
}

export function tzOffset(tz: string, at = Date.now()) {
  return formatInTimeZone(at, tz, 'xxx')
}

/** Friendly label, e.g. "Chicago · CST (UTC−06:00)" */
export function tzLabel(tz: string) {
  const city = tz.split('/').pop()!.replace(/_/g, ' ')
  return `${city} · ${tzAbbr(tz)} (UTC${tzOffset(tz).replace('-', '−')})`
}

export type TzOption = { tz: string; label: string; search: string; offset: string }
let cache: TzOption[] | null = null
export function tzOptions(): TzOption[] {
  if (cache) return cache
  const extra = ['UTC']
  cache = [...new Set([...ALL, ...extra])].map((tz) => {
    const label = tzLabel(tz)
    return { tz, label, offset: tzOffset(tz), search: `${tz} ${label}`.toLowerCase().replace(/_/g, ' ') }
  })
  cache.sort((a, b) => a.offset.localeCompare(b.offset) || a.tz.localeCompare(b.tz))
  return cache
}

export const fmt = (t: number, tz: string, f: string) => formatInTimeZone(t, tz, f)

export function minLabel(min: number) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  const ap = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${ap}` : `${h12}${ap}`
}

export function relTime(t: number) {
  const d = t - Date.now()
  const abs = Math.abs(d)
  const units: [number, string][] = [[86400000, 'day'], [3600000, 'hour'], [60000, 'minute']]
  for (const [ms, u] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms)
      return d > 0 ? `in ${n} ${u}${n > 1 ? 's' : ''}` : `${n} ${u}${n > 1 ? 's' : ''} ago`
    }
  }
  return d > 0 ? 'in a moment' : 'just now'
}
