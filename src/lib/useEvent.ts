import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { MeetingEvent } from './types'
import type { Suggestion } from '../../shared/schedule.js'

type Res = { event: MeetingEvent; isOrganizer: boolean; suggestions: Suggestion[]; attending: number }

/** Loads a meeting and keeps it fresh (polls so dashboards update live). */
export function useEvent(id: string | undefined, k?: string | null, pollMs = 4000) {
  const [data, setData] = useState<Res | null>(null)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await api.get<Res>(`/api/events/${id}${k ? `?k=${encodeURIComponent(k)}` : ''}`)
      if (alive.current) { setData(r); setError('') }
    } catch (e: any) {
      if (alive.current) setError(e.message)
    }
  }, [id, k])
  useEffect(() => {
    alive.current = true
    load()
    const onDemo = () => load()
    window.addEventListener('ms:refresh', onDemo)
    const t = pollMs ? setInterval(load, pollMs) : undefined
    return () => { alive.current = false; clearInterval(t); window.removeEventListener('ms:refresh', onDemo) }
  }, [load, pollMs])
  return { data, error, reload: load }
}
