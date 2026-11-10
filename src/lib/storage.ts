// Per-browser memory: which meetings you organize/answered, and your session.
// Wrapped in try/catch because private windows can block storage.
const KEY = 'ms:v1'

type Store = {
  organizer: Record<string, string> // eventId -> manageKey
  me: Record<string, { id: string; key: string; name: string }> // eventId -> participant
  tz: Record<string, string> // eventId -> chosen time zone
  session?: { token: string; contact: string }
}

function load(): Store {
  try {
    return { organizer: {}, me: {}, tz: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { organizer: {}, me: {}, tz: {} }
  }
}

export function getStore() {
  return load()
}

export function update(fn: (s: Store) => void) {
  const s = load()
  fn(s)
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
  return s
}
