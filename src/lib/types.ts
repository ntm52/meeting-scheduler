export type Availability = Record<string, number>

export type Participant = {
  id: string
  name: string
  contact?: string
  hasContact?: boolean
  tz: string | null
  isOrganizer: boolean
  status: 'invited' | 'responded' | 'updated'
  method: string | null
  availability: Availability
  flagged: boolean
  autoReminded: boolean
  cantMakeIt: boolean
  reminders: { h24: boolean; h1: boolean }
  respondedAt: number | null
  updatedAt: number | null
  invitedAt?: number
}

export type MeetingEvent = {
  id: string
  name: string
  org: string
  organizer: { name: string; contact?: string }
  tz: string
  dates: string[]
  startMin: number
  endMin: number
  slotMinutes: number
  durationMinutes: number
  deadline: number
  minAttendees: number
  recurring: null | { freq: string; days: number[] }
  status: 'collecting' | 'review' | 'confirmed'
  proposed: null | { start: number; end: number; can: string[]; ifNeeded: string[]; cannot: string[] }
  confirmed: null | { start: number; end: number; auto?: boolean }
  participants: Participant[]
  createdAt: number
}

export type OutboxMessage = {
  id: string
  at: number
  channel: 'email' | 'sms' | 'push' | 'in-app'
  to: string
  toName: string
  subject: string
  body: string
  eventId: string | null
  kind: string
}
