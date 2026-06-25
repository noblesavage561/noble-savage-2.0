# Build Plan (Execution Backlog)

This file tracks the next concrete slices for Noble Savage OS.

## Current shipped slice

- FastAPI backend scaffold with tasks/signals/onboarding APIs.
- WebSocket board channel for realtime task updates.
- Next.js command center UI with live counters and status updates.
- Local run/build instructions documented in README.
- Onboarding bot v1 (one-question turn flow, resumable state, confirm writes).
- Authentication + tenant isolation (JWT auth, user-scoped APIs, user-scoped websocket updates).

## Next 3 slices

### Slice 1: Supabase foundation

- Replace SQLite store with Postgres connection (Supabase-compatible).
- Add migration script for workstreams/tasks/decisions/signals/onboarding.
- Add seeded default six workstreams.

Done when:

- Backend reads/writes from Postgres.
- Local and hosted environments use env-driven DB URLs.

### Slice 2: Reliability and quality floor

- Add backend API test coverage for auth, tasks, onboarding, signals, and websocket auth.
- Add frontend critical-path test coverage for auth, onboarding turns, and task updates.
- Standardize API error messaging and session-expiration handling in UI.

Done when:

- Test suite runs in one command and covers the core authenticated flows.
- UI surfaces actionable errors for network, API, and token-expiry failures.

### Slice 3: Morning Brief and cadence

- Add daily brief generator endpoint.
- Add cadence scheduler hooks (cron-ready function stubs).
- Add frontend brief card with trust countdown and P1 summary.

Done when:

- Manual trigger returns morning brief from current task state.
- UI renders brief and highlights chokepoint.

## Working rules

- Every slice ends with runnable code and a verification command.
- No new framework before core onboarding and command center trust loop are stable.
- Prioritize shipping over expansion.

## Improvement backlog (next high-impact adds)

1. Add audit trail UI for `signals` and onboarding corrections.
2. Add recurring cadence jobs (morning brief, mid-week unblock, Friday ledger).
3. Add workstream detail view (objective, blockers, owner workload).
4. Add Supabase Realtime channel and row-level security for hosted deployment.
5. Add role-based access (owner, collaborator, viewer) for delegated operations.
