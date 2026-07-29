# BioAuth – Behavioral Biometrics Authentication.                 

A full-stack web application that continuously verifies user identity through **keystroke dynamics** and **mouse movement analysis** — no extra hardware needed.

![BioAuth Dashboard](https://img.shields.io/badge/Status-Working-brightgreen) ![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Node.js%20%2B%20tRPC-blue)

---

## What It Does 

Traditional authentication stops at login. BioAuth **keeps verifying you** — every 10 seconds it analyzes how you type and move your mouse, comparing it against your personal behavioral baseline. If something seems off, it challenges you or blocks the session.

---

## Features

- **Keystroke Dynamics** — tracks key hold time and flight time between keystrokes
- **Mouse Movement Analysis** — tracks speed, distance, and acceleration patterns
- **Continuous Authentication** — silent background verification every 10 seconds
- **Anomaly Detection** — statistical z-score engine compares live data against your profile
- **4-Level Risk System** — LOW → MEDIUM → HIGH → CRITICAL with automatic responses
- **Re-auth Challenges** — prompts password re-entry when unusual behavior is detected
- **Admin Panel** — view all active sessions, behavior logs, terminate sessions
- **No Database Required** — runs fully in-memory for local development
- **Local Auth** — register/login with email + password, no OAuth dependency

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Node.js, Express 4, tRPC 11 |
| Auth | JWT (jose), HTTP-only cookies |
| Behavioral Engine | Custom TypeScript — z-score anomaly detection |
| ORM | Drizzle ORM (MySQL) |
| DB Fallback | In-memory store (no MySQL needed locally) |
| Build Tools | Vite 7, tsx watch |

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm

### Run Locally (No Database Needed)

```bash
git clone https://github.com/Pradeepkumar160/behavioral-auth-app.git
cd behavioral-auth-app
pnpm install
pnpm dev
```

Open `http://localhost:3000` → Register → Dashboard ✅

### With MySQL (Optional)

Set `DATABASE_URL` in `.env`:
```
DATABASE_URL=mysql://root:password@localhost:3306/bioauth
```

---

## How Behavioral Authentication Works

```
User logs in
     ↓
System collects keystroke & mouse data silently
     ↓
After 5 sessions → behavioral baseline is built
     ↓
Every 10s → live data compared against baseline
     ↓
Anomaly score calculated (0 - 100%)
     ↓
LOW (<30%)      → Allow
MEDIUM (30-55%) → Monitor
HIGH (55-75%)   → Re-auth challenge
CRITICAL (>75%) → Block session
```

---

## Project Structure

```
behavioral-auth-app/
├── client/                     # React frontend (Vite)
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Register.tsx
│       │   ├── Dashboard.tsx   # Main behavioral monitoring UI
│       │   └── Admin.tsx       # Admin panel
│       └── hooks/
│           └── useBehaviorCollector.ts  # Captures keystrokes & mouse
├── server/
│   ├── _core/
│   │   ├── sdk.ts              # JWT auth & session management
│   │   └── cookies.ts          # Secure cookie config
│   ├── authRouter.ts           # Register / Login endpoints
│   ├── behaviorRouter.ts       # Behavioral data & risk endpoints
│   ├── behaviorEngine.ts       # Core anomaly detection engine
│   ├── db.ts                   # MySQL + in-memory fallback
│   └── memDb.ts                # In-memory store (no MySQL needed)
├── drizzle/
│   └── schema.ts               # DB schema (users, sessions, profiles, events)
└── shared/
    └── types.ts                # Shared TypeScript types
```

---

## Screenshots

**Login Page**
> Clean dark UI with behavioral feature badges

**Dashboard**
> Live anomaly score chart, risk level indicator, behavioral test area, event history

**Admin Panel**
> Active sessions table, behavior logs, session termination

---

## Key Design Decisions

- **No raw keystrokes stored** — only timing metadata (hold time, flight time)
- **No raw mouse positions stored** — only derived metrics (speed, distance, acceleration)
- **Welford online merge** for incremental profile updates without storing all historical data
- **In-memory fallback** so the app runs fully without any database setup

---

## License

MIT — feel free to use, modify, and build on this.
