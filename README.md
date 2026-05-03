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

### What to do locally

In backend/, copy the example file:

```bash
cp .env.example .env
```

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

## Environment

- Backend env: `backend/.env` (see `backend/.env.example`)
- Frontend env: `frontend/.env` (Vite var `VITE_BACKEND_URL`)

## Deploy to Render

This repo includes [`render.yaml`](render.yaml): Postgres, Redis (Key Value), Node backend, and Node frontend (Vite build + `vite preview`).

1. Push this repository to GitHub (or GitLab) under your account.
2. Open [Render Dashboard](https://dashboard.render.com/) and sign in (use your preferred email for your Render account).
3. Click **New** → **Blueprint**, connect the repo, and select the branch that contains `render.yaml` at the repo root.
4. Before you apply the blueprint, edit `render.yaml` if needed: service names `caimera-math-quiz-api` and `caimera-math-quiz-web` must be **globally unique** on Render. If a name is taken, change the `name` fields and update `CLIENT_ORIGIN` / `VITE_BACKEND_URL` so they stay `https://<exact-service-name>.onrender.com` for the web and API services respectively.
5. Apply the blueprint. Wait for all services to go **Live**; open the frontend URL (`https://<frontend-service-name>.onrender.com`).

Notes: free Postgres on Render may expire after a trial period (see [Render pricing](https://render.com/pricing)). Free web instances can spin down when idle; the first request after sleep can be slow. WebSockets reconnect after a refresh if the instance slept.
