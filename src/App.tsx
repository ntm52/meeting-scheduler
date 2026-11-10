import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { APP_NAME } from '../shared/config.js'
import { ToastProvider } from './components/ui'
import { DemoPanel } from './components/DemoPanel'
import Home from './pages/Home'
import NewMeeting from './pages/NewMeeting'
import Share from './pages/Share'
import Manage from './pages/Manage'
import Respond from './pages/Respond'
import MyMeetings from './pages/MyMeetings'
import Outbox from './pages/Outbox'

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-extrabold text-base sm:text-lg tracking-tight text-brand-800">
      <img src="/favicon.svg" alt="" className="size-7" />
      {APP_NAME}
    </Link>
  )
}

export default function App() {
  const loc = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])
  const nav = ({ isActive }: { isActive: boolean }) =>
    `px-2 sm:px-3 py-1.5 rounded-lg text-[13px] sm:text-sm font-semibold ${isActive ? 'bg-brand-100 text-brand-800' : 'text-ink/70 hover:bg-ink/5'}`
  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col">
        <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-black/5">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2 whitespace-nowrap">
            <Logo />
            <nav className="flex items-center gap-0.5 sm:gap-1">
              <NavLink to="/me" className={nav}>My meetings</NavLink>
              <NavLink to="/outbox" className={nav}>Outbox</NavLink>
              <NavLink to="/new" className={({ isActive }) => `hidden sm:inline-flex ${nav({ isActive })}`}>New</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewMeeting />} />
            <Route path="/e/:id/share" element={<Share />} />
            <Route path="/e/:id/manage" element={<Manage />} />
            <Route path="/e/:id" element={<Respond />} />
            <Route path="/me" element={<MyMeetings />} />
            <Route path="/outbox" element={<Outbox />} />
            <Route path="*" element={<p className="text-center text-ink/60">Page not found. <Link className="text-brand-700 font-semibold" to="/">Go home</Link></p>} />
          </Routes>
        </main>
        <footer className="text-center text-xs text-ink/45 py-6">
          {APP_NAME} · CS 330 Group 1 prototype · texts, emails & calendar sync are simulated (see Outbox)
        </footer>
        <DemoPanel />
      </div>
    </ToastProvider>
  )
}
