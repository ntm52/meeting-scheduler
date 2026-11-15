import { Link, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../../shared/config.js'
import { Button } from '../components/ui'
import { update } from '../lib/storage'

export default function Home() {
  const nav = useNavigate()
  const openDemo = () => {
    update((s) => { s.organizer.demo = 'demo' })
    nav('/e/demo/manage?k=demo')
  }
  return (
    <section className="text-center pt-10 sm:pt-20">
      <h1><img src="/logo.png" alt={APP_NAME} className="mx-auto w-full max-w-md h-auto" /></h1>
      <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/new"><Button size="lg" block>Schedule a meeting</Button></Link>
        <Button size="lg" variant="secondary" onClick={openDemo}>See a demo</Button>
      </div>
      <p className="mt-4 text-sm">
        <Link className="font-semibold text-brand-700 hover:underline" to="/me">Find a meeting you joined</Link>
      </p>
    </section>
  )
}
