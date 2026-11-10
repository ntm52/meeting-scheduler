// Tiny JSON-file "database". Plenty for a class demo; swap for a real DB later.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const FILE = path.join(DATA_DIR, 'db.json')

const empty = () => ({ events: {}, outbox: [], codes: {}, sessions: {}, users: {} })

let db = empty()
try {
  db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }
} catch {
  /* first run */
}

let timer = null
export function save() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
    fs.renameSync(tmp, FILE)
  }, 100)
}

export function getDb() {
  return db
}
