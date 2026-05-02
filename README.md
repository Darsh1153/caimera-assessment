# caimera-assessment

# Competitive Math Quiz (Realtime)

Frontend: React + Tailwind (Vite)  
Backend: Node.js + Express + WebSocket  
Concurrency: Redis (atomic first-winner)  
High Scores: PostgreSQL

## Quick start (recommended)

Make sure **Docker Desktop is running** (macOS).

Start Redis + Postgres:

```bash
docker compose up -d
```

Note: this repo maps Postgres to **localhost:55432** (to avoid conflicts with existing Postgres installs).

Start backend:

```bash
cd backend
npm install
npm run dev
```

Start frontend:

```bash
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173` in **two** browser windows and race.

## How “first answer wins” works

- Each question has an id (e.g. `173...-7`).
- On a correct submission, the backend runs an **atomic Redis script** (`SETNX` equivalent) on a key:
  - `quiz:winner:<questionId>`
- Only the first correct submit can create that key, so only that submit is the winner.
- A second Redis key `quiz:advance:<questionId>` ensures only one server instance advances/broadcasts.

## Environment

- Backend env: `backend/.env` (see `backend/.env.example`)
- Frontend env: `frontend/.env` (Vite var `VITE_BACKEND_URL`)

