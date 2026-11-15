# MeetUp (CS 330 Group 1 prototype)

A group scheduling site built from our A3–A5 sketches. Its direction is high automation with user review: it imports calendars, suggests the best time and sends reminders automatically, and the organizer approves the final time.

## Run it

```bash
npm install
npm run dev        # site on http://localhost:5173, API on :8080
npm test           # scheduling-logic unit tests
npm run build && npm start   # production: one process serves site + API on 127.0.0.1:8080
```

Use `API_PORT` and `HOST` to change where the production server listens.

## Rename the product

Edit **`shared/config.js`** (`APP_NAME`, `APP_TAGLINE`). The header, page title, footer and every simulated text/email use it. Also update `<title>` in `index.html` (it only shows for a split second before the app loads).

## What's real vs. simulated

| Real | Simulated |
|---|---|
| Creating meetings, invite links, QR codes | Google / iCloud calendar connect (fills realistic fake busy times) |
| Availability grid (drag to paint, "if needed", copy a day) | Texts, emails, push notifications (everything goes to **/outbox**) |
| Time zone conversion, teammates' views | 6-digit codes (shown on screen + in the Outbox) |
| `.ics` calendar upload (parsed for real) and `.ics` download | |
| Best-time ranking, response tracker, "Check?" flagging | |
| Auto reminders 24 h before the deadline, auto-pick at deadline, meeting reminders 24 h / 1 h before | |
| Cancellations ("time stays unless fewer than N can come") | |
| "My meetings" lookup by email/phone; password accounts (scrypt-hashed) | |

Data is stored in `data/db.json` (created on first run).

## Presenting

- The home page's **See a live demo** button opens the seeded *CS 330 Group Meeting* (Adam, Ari, Nathan, Ivan, Zac).
- The **🎬 button** (or Shift+D) opens demo controls: next person responds, deadline is tomorrow, deadline passes, someone cancels, meeting is tomorrow, reset demo.
- On **My meetings**, try `nathan@example.edu` to see the demo meeting without a link.

## Layout

```
shared/   scheduling logic used by both browser and server (+ tests), config.js (name)
server/   Express API, JSON storage, simulated notifications, automation timer
src/      React front end (pages/, components/Grid.tsx is the availability grid)
```
