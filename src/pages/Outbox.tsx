import { useEffect, useState } from 'react'
import { Card, Pill, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { relTime } from '../lib/tz'
import type { OutboxMessage } from '../lib/types'

const label: Record<string, string> = { email: 'Email', sms: 'Text', push: 'Push', 'in-app': 'In-app' }

export default function Outbox() {
  const [msgs, setMsgs] = useState<OutboxMessage[] | null>(null)
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    const load = () => api.get<{ messages: OutboxMessage[] }>('/api/outbox').then((r) => setMsgs(r.messages))
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])
  const shown = msgs?.filter((m) => filter === 'all' || m.channel === filter)
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold">Outbox</h1>
        <p className="text-ink/60 mt-1">Simulated texts, emails and notifications.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {['all', 'sms', 'email', 'push'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm font-semibold cursor-pointer ${filter === f ? 'bg-brand-600 text-white' : 'bg-white border border-ink/10 hover:bg-brand-50'}`}>
            {f === 'all' ? 'All' : label[f]}
          </button>
        ))}
      </div>
      {!msgs && <div className="grid place-items-center py-10"><Spinner /></div>}
      {shown?.length === 0 && <Card><p className="text-ink/55">Nothing sent yet.</p></Card>}
      <div className="space-y-3">
        {shown?.map((m) => (
          <Card key={m.id} className="!p-4">
            <div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="font-bold">{m.subject}</span>
                  <span className="text-xs text-ink/45">{relTime(m.at)}</span>
                </div>
                <div className="text-xs text-ink/55 mt-0.5">
                  <Pill tone="gray">{label[m.channel]}</Pill> to {m.toName && <b>{m.toName}</b>} {m.to}
                </div>
                <p className="text-sm mt-2 text-ink/80 break-words">{m.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
