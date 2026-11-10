import { Link, useNavigate } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE } from '../../shared/config.js'
import { Button, Card } from '../components/ui'
import { update } from '../lib/storage'

const features = [
  { icon: '📅', title: 'No re-typing your calendar', body: 'Connect Google or iCloud, upload a calendar file, or just type “free weekday afternoons”.' },
  { icon: '✅', title: 'See who’s in at a glance', body: 'A live tracker shows who responded, who updated, and whose answer looks off.' },
  { icon: '🔔', title: 'Reminders send themselves', body: 'Nobody has to chase people. Reminders go out by text or email before the deadline.' },
  { icon: '🌍', title: 'Time zones just work', body: 'Every time shows in your own zone. Peek at a teammate’s view with one tap.' },
  { icon: '✨', title: 'We pick the best time', body: 'The best slots are ranked automatically. The organizer approves with one click.' },
  { icon: '🔁', title: 'Recurring meetings', body: 'Weekly club meetings and study groups, not just one-off events.' },
]

export default function Home() {
  const nav = useNavigate()
  const openDemo = () => {
    update((s) => { s.organizer.demo = 'demo' })
    nav('/e/demo/manage?k=demo')
  }
  return (
    <div className="space-y-12">
      <section className="text-center pt-4 sm:pt-10">
        <div className="inline-block rounded-full bg-brand-100 text-brand-800 text-xs font-bold px-3 py-1 mb-5">Group scheduling for students</div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">{APP_TAGLINE}</h1>
        <p className="mt-5 text-lg text-ink/65 max-w-xl mx-auto">
          {APP_NAME} pulls in everyone’s calendar, chases the stragglers, and suggests the time that works for the most people.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/new"><Button size="lg" block>Schedule a meeting</Button></Link>
          <Button size="lg" variant="secondary" onClick={openDemo}>See a live demo</Button>
        </div>
        <p className="mt-4 text-sm text-ink/50">No account needed. <Link className="font-semibold text-brand-700 hover:underline" to="/me">Find a meeting you already joined →</Link></p>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <Card key={f.title} className="!p-5">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h3 className="font-bold">{f.title}</h3>
            <p className="text-sm text-ink/65 mt-1">{f.body}</p>
          </Card>
        ))}
      </section>

      <section className="rounded-3xl bg-brand-700 text-white p-6 sm:p-10">
        <h2 className="text-2xl font-bold">How it works</h2>
        <ol className="mt-5 grid sm:grid-cols-4 gap-5 text-sm">
          {['Organizer names the meeting and invites the group', 'Everyone connects a calendar (or paints their times)', 'Reminders go out until the deadline', 'We suggest the best time and the organizer approves it'].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="size-7 shrink-0 rounded-full bg-white text-brand-800 font-bold grid place-items-center">{i + 1}</span>
              <span className="text-white/90">{s}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
