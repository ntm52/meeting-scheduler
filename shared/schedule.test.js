import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSlots, layoutForTz, suggestTimes, looksSuspicious, AVAILABLE, IF_NEEDED } from './schedule.js'

const ev = (participants = []) => ({
  id: 't', tz: 'America/Chicago', dates: ['2026-11-16', '2026-11-17'], startMin: 9 * 60, endMin: 12 * 60,
  slotMinutes: 30, durationMinutes: 60, participants,
})
const all = (e, v = AVAILABLE) => Object.fromEntries(buildSlots(e).map((s) => [s.i, v]))

test('builds 30-minute slots per day', () => {
  const s = buildSlots(ev())
  assert.equal(s.length, 12)
  assert.equal(s[1].t - s[0].t, 30 * 60000)
  assert.equal(new Date(s[0].t).toISOString(), '2026-11-16T15:00:00.000Z') // 9am CST
})

test('picks the slot where everyone is free and prefers available over if-needed', () => {
  const e = ev()
  const a = {}, b = {}
  // A free Tue 10-11 (indices 8,9). B free Tue 10-11 too, and Mon 9-10 only "if needed"
  a[8] = a[9] = AVAILABLE; a[0] = a[1] = AVAILABLE
  b[8] = b[9] = AVAILABLE; b[0] = b[1] = IF_NEEDED
  e.participants = [{ name: 'A', availability: a }, { name: 'B', availability: b }]
  const [best, second] = suggestTimes(e)
  assert.equal(best.slotIndex, 8)
  assert.deepEqual(best.can, ['A', 'B'])
  assert.equal(second.slotIndex, 0)
  assert.deepEqual(second.ifNeeded, ['B'])
})

test('meetings never span two days', () => {
  const e = ev()
  const a = {}; a[5] = a[6] = AVAILABLE // Mon 11:30 and Tue 9:00
  e.participants = [{ name: 'A', availability: a }]
  assert.equal(suggestTimes(e).length, 0)
})

test('no suggestions with no responses', () => {
  assert.equal(suggestTimes(ev([{ name: 'X', availability: {} }])).length, 0)
})

test('flags free-all-week answers', () => {
  const e = ev()
  assert.equal(looksSuspicious(e, all(e)), true)
  assert.equal(looksSuspicious(e, { 0: AVAILABLE }), false)
})

test('layout in a far zone keeps a day in one column across midnight', () => {
  const e = { ...ev(), startMin: 16 * 60, endMin: 19 * 60 } // 4-7pm CST = 11pm-2am CET
  const l = layoutForTz(buildSlots(e), 'Europe/Madrid')
  assert.equal(l.cols.length, 2)
  assert.equal(l.rows[0], 23 * 60) // first row 11pm, then 11:30pm, 12am...
  assert.equal(l.rows[2], 0)
  assert.equal(l.cell.size, 12)
})
