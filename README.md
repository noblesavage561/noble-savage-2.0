# noble-savage-2.0

Noble Savage OS is a personal intelligence system with a realtime command center for execution, prioritization, and operational control.

This monorepo includes:

- FastAPI backend for tasks, onboarding, signals, and websocket board updates.
- Next.js frontend for the live command center UI.
- Existing Python assistant starter package, retained for compatibility and baseline testing.
- Operating contract in AGENTS.md.

## Architecture Snapshot

- Frontend: Next.js (App Router)
- Backend: FastAPI
- Data: SQLAlchemy with `DATABASE_URL` (`SQLite` local fallback, `Postgres`/Supabase ready)
- Realtime: WebSocket (`/ws/board`)

## Repository Layout

- `frontend/`: Next.js command center interface
- `backend/`: FastAPI API service
- `AGENTS.md`: product and agent operating contract
- `personal_assistant_ai/`: legacy assistant starter package
- `tests/`: unit tests for the legacy assistant package

## Run Locally

Prerequisites

- Python 3.10+
- Node.js 20+

### 1) Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/seed_workstreams.py
python scripts/bootstrap_knowledge.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

The frontend expects the backend at `http://localhost:8000` by default.

## Implemented API Surface

Health
- `GET /health`

Auth (public for register/login)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Workstreams and Tasks (token required)
- `GET /api/workstreams`
- `GET /api/tasks?filter=...`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`

Onboarding (token required)
- `GET /api/onboarding`
- `POST /api/onboarding`
- `POST /api/onboarding/turn`
- `POST /api/onboarding/reset`

Knowledge and Assistant (token required)
- `GET /api/knowledge`
- `POST /api/knowledge`
- `POST /api/knowledge/:id/reembed`
- `POST /api/assistant/query`

Signals (token required)
- `POST /api/signals`

Realtime (token in query)
- `WS /ws/board?token=<jwt>`

## Development Notes

- `DATABASE_URL` controls the database driver and target.
- If `DATABASE_URL` is empty, local SQLite is used at `backend/noble_savage.db`.
- For Supabase/Postgres, set `DATABASE_URL` in `backend/.env` (see `backend/.env.example`).
- In production, `JWT_SECRET` must be set and at least 32 characters.
- Set `FRONTEND_ORIGINS` to a comma-separated list of approved frontend origins.
- Use `CORS_ALLOW_ORIGIN_REGEX` only when you need wildcard host matching.
- OpenRouter is used for assistant answers grounded on `/api/knowledge` retrieval.
- Configure `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_EMBEDDING_MODEL` in `backend/.env`.
- Knowledge entries are embedded at ingest time and can be re-embedded with the API if needed.
- API routes under `/api/*` are protected with bearer auth (except auth/register/login).
- WebSocket board channel requires `?token=<jwt>` query parameter.
- Task create/update events are broadcast over websocket for live UI updates.
- This is the first shipping slice. Future iterations can layer Supabase Auth/Realtimes, agent orchestration, and cadence jobs without reworking the current foundation.

## Verification

Run end-to-end backend flow verification (health, auth, onboarding, websocket, tenant isolation):

```bash
cd backend
source .venv/bin/activate
python scripts/e2e_system_flow.py
```

Run auth smoke coverage:

```bash
cd backend
source .venv/bin/activate
python scripts/smoke_auth_flow.py
```

Run full local+production diagnostic sweep:

```bash
chmod +x scripts/full_diagnostic.sh
./scripts/full_diagnostic.sh
```

## Railway Deployment Checklist

Detailed copy-paste variable matrix: `RAILWAY_ENV_MATRIX.md`.

Deploy two Railway services from this monorepo:

1. Backend service root: `backend/`
2. Frontend service root: `frontend/`

Nixpacks config files are included:

- `backend/nixpacks.toml`
- `frontend/nixpacks.toml`

Backend variables (required unless marked optional):

- `DATABASE_URL`
- `JWT_SECRET` (32+ chars in production)
- `TOKEN_TTL_MINUTES`
- `FRONTEND_ORIGINS` (must include your Railway frontend URL, comma-separated if multiple)
- `CORS_ALLOW_ORIGIN_REGEX` (optional wildcard support)
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_EMBEDDING_MODEL`
- `OPENROUTER_SITE_URL` (set to your Railway frontend URL)
- `OPENROUTER_SITE_NAME`

Frontend variables:

- `NEXT_PUBLIC_API_URL` (must be the Railway backend public URL)

Cross-service sync rule:

- `NEXT_PUBLIC_API_URL` on frontend must match the backend public URL.
- `FRONTEND_ORIGINS` on backend must include the frontend public URL.

Post-deploy smoke checks:

1. Open frontend public URL and confirm login page renders.
2. Register or login and confirm onboarding, assistant, and board panels all load.
3. Confirm backend health endpoint returns `{"message":"ok"}` at `/health`.
4. Add a task and verify it appears immediately on the board.
5. Change task status and verify it updates without page refresh.

## Legacy Assistant Package

The original package remains available:

```bash
python -m personal_assistant_ai.cli
python -m unittest discover -s tests -p "test_*.py"
```
