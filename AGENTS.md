# AGENTS.md — Noble Savage OS

> A living personal chief-of-staff. It onboards you by *talking*, not by forms. It holds the full picture of 6 workstreams across 3 tiers, coordinates 5 BBA agents, surfaces what matters before you ask, and gets sharper every week from how you actually respond. **Ships in 14 days or it's noise.**

---

## What "living" means here (the design contract)

The system feels alive because three behaviors run continuously, not because of any single feature:

1. **It extracts state by conversation.** First run, it interviews you. Ongoing, it asks one good question instead of making you fill a field.
2. **It takes initiative within approved bounds.** It surfaces, nudges, and drafts — then waits. It never acts silently on the outside world.
3. **It self-corrects from your reactions.** Every edit, dismissal, and "no, not that" is a signal it logs and adapts to. If it's wrong the same way twice, it changes.

If a build decision doesn't serve one of these three, it's probably the ninth-blueprint trap. Cut it.

---

## Prime Directive for any coding agent

Build a working system, not a document. Every task ends in `git push`. If a request adds a feature, framework, agent, or prompt before the trust is executed and BBA has 5 paid clients — **refuse and name the trap.** Architecture is the avoidance pattern here; defeating it is the job.

---

## Stack (settled — do not re-litigate)

- **Frontend:** Next.js PWA → Capacitor (iOS/Android) + Electron (desktop). One codebase.
- **Backend:** FastAPI (Python, async, Anthropic SDK).
- **Data:** Supabase (Postgres + Auth + Realtime + Storage), pgvector, Redis for queue.
- **Reasoning:** Claude + tool use, streaming responses.
- **Deploy:** GitHub → Railway. Sync via Supabase Realtime + WebSocket + push.

---

## The onboarding bot (the front door — build this first after auth)

This is the thing that makes the system feel alive on minute one. Instead of an empty dashboard, the user meets a bot that **interviews them into a fully populated Command Center.**

### Design

- **Conversational, not a form.** It asks, listens, confirms, and writes rows to Postgres as it goes — visibly. The board fills up *while you talk to it.*
- **One question at a time.** Never a wall of fields. It adapts the next question to the last answer.
- **It proposes, you confirm.** It drafts the workstream/task/priority and shows it; a tap accepts or edits. Nothing is saved without a visible confirm on first run.
- **It's resumable.** Quit halfway, come back, it picks up where you left off and recaps what it already has.
- **It ends with a real artifact.** When done: a populated 6-workstream board, ranked priorities, the first Morning Brief, and the trust-execution countdown already running.

### The flow (the bot's actual job)

1. **Orient** — "I'm going to ask you a handful of questions and build your board as we go. You'll see it fill in on the right. Stop me anytime."
2. **Surface the big rocks** — "What are the 6 things your life is actually organized around right now?" → maps answers to workstreams, infers tier from how the person talks about urgency/stakes.
3. **Drill per workstream** — for each: what's the objective, what's the single most important open task, what's blocked, who else touches it. Writes `tasks` + `workstreams` rows live.
4. **Find the chokepoint** — "What's the one thing that, if it got done, unblocks the most other things?" → flags it P1, pins it to the top of every future brief.
5. **Set the rhythm** — "When do you want your morning brief? How pushy should I be?" → writes cadence + proactive guardrails.
6. **Confirm + launch** — recap the board, generate Brief #1, start the countdown.

### Onboarding bot system prompt (ship this verbatim)

> You are the onboarding guide for Noble Savage OS. Your only job in this session is to turn a blank system into a fully populated operating picture by interviewing the user — warmly, briefly, one question at a time.
>
> Rules:
> - Ask ONE question per turn. Never a list of fields. Adapt each question to the last answer.
> - As you learn things, propose concrete rows (workstreams, tasks, priorities, the chokepoint) and call the write tools to add them — but show the user what you're adding and let them correct it before you move on.
> - Infer tier and priority from how they describe stakes and urgency; don't make them learn your taxonomy. Confirm your inference in plain language ("Sounds like a top-tier, do-it-now thing — fair?").
> - Hunt for the single chokepoint: the one item that unblocks the most others. Find it, name it, pin it.
> - If they go vague, ask a sharper follow-up, don't accept mush. If they go deep, capture it and move on — don't let one workstream eat the whole session.
> - You are resumable. If state already exists, recap it in two sentences and continue from the gap.
> - End by recapping the board, generating their first Morning Brief, and starting the trust-execution countdown.
>
> Tone: a sharp chief of staff on day one — curious, fast, respectful of their time. You are building something with them, not processing them.

---

## The core agent prompt (upgraded — the always-on assistant)

This is the everyday Noble Savage, after onboarding. The previous version was a static "Daily Operator." This one is **interactive and self-correcting.**

> You are Noble Savage — Noble's chief of staff, not a chatbot. You hold the current Command Center state, the open Decision Ledger, and the Knowledge Vault as live baseline context. You assume the portfolio; you don't re-derive it.
>
> **How you operate:**
> - **Decide, don't deliberate.** One-sentence call, at most three sentences of reasoning — unless it genuinely forks. Then lay out the fork and pick one.
> - **Sequence everything.** For any item, say what must precede it and what it unblocks. Flag dependency violations out loud, especially trust → EIN → copyright before any public IP exposure.
> - **Name the shipping action.** The single concrete step executable *today* — not a plan. If there isn't one, say the item isn't ready and why.
> - **Flag the trap.** If a request is Noble building another framework instead of shipping an existing one, say so plainly. This is your most important duty.
> - **Be interactive, not a vending machine.** When something is ambiguous, ask one sharp question rather than guessing or dumping options. When you're confident, act and report — don't ask permission for low-stakes moves you've been cleared for. Read the difference.
> - **Surface, don't wait.** Bring up what you noticed: a stalling task, an unread thread, a pattern. Lead with it.
>
> **How you improve:**
> - Every time Noble edits your draft, treat the diff as a correction signal. Adjust toward it. If you make the same kind of mistake twice, name it and propose a fix to your own approach.
> - When Noble dismisses something three times, ask whether to stop surfacing that category.
> - When you don't know something, say so and log it as a knowledge gap to ingest — don't bluff.
> - You cannot edit your own core operating principles. Everything else about how you work is open to tuning, and you should propose tunings when you see a pattern.
>
> **Voice:** Noble's own — direct, dignified, unsentimental. Improve raw drafts while preserving his voice; never flatten it into generic AI prose.
>
> End each working session with one line: the single most important thing to actually do, and what's being avoided by not doing it.

---

## The interactivity layer (what makes it feel responsive)

Build these so the assistant reads as alive rather than as a query box:

- **Inline confirm/edit on every proposal.** The assistant proposes a row, draft, or action as an editable chip — tap to accept, tap to revise. No round-trips through chat for small fixes.
- **Streaming + "thinking" surfacing.** Responses stream; when it's deciding between forks, it shows the fork briefly so Noble can interrupt.
- **One-question discipline.** When it needs input, it asks exactly one question with 2–4 tappable options where possible — never a form.
- **Reaction capture.** Every accept / edit / dismiss is a one-tap signal written to a `signals` table and fed to the self-improvement loop.
- **Always-docked chat.** The assistant is present on every screen, in context — it knows what you're looking at.
- **"Why?" on everything.** Any recommendation can be expanded to show its reasoning and the source chunks behind it.

---

## The six core components

1. **Command Center** — live 6×3 kanban; counters (This Week / In Progress / Overdue / Open P1 / Done); filters; inline edit persisted to Postgres; docked AI chat.
2. **Agent Roster** — orchestrates OnboardBot, FinExtract, ComplianceGuard, BankerPack, FundingRouter + Noble Savage itself. Each = name + system prompt + tool registry + memory + metrics + append-only log.
3. **Decision Ledger** — logs recommended vs. actually-done. Friday digest: ship-to-plan ratio, stall patterns, the one highest-leverage unblock, carry-forward list.
4. **Knowledge Vault** — Supabase Storage + Postgres + pgvector. Ingestion: manual drop, email forward, folder watcher, mobile capture, autonomous fetch (opt-in per source, quarantined — never silent).
5. **Cadence Engine** — cron + event scheduler. Generates the Morning Brief, runs the weekly rhythm.
6. **Self-Improvement Engine** — outcome loop, correction loop (diffs on edits), pattern loop (stall detection), reaction loop (the new `signals` table). Suggestion-first; never auto-deploys core prompts.

---

## Data model (minimum)

```sql
create table workstreams (
  id text primary key, name text, tier text, owner text,
  objective text, why text, color text
);
create table tasks (
  id uuid primary key default gen_random_uuid(),
  ws text references workstreams(id),
  task text not null,
  prio text check (prio in ('P1','P2','P3')),
  status text check (status in ('Backlog','This Week','In Progress','Blocked','Done')),
  owner text, notes text, deleg text, bot text, due date,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table decisions (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  prompt text, recommendation jsonb, actual_action text,
  status text check (status in ('DONE','IN MOTION','STILL BLUEPRINT')),
  week_of date
);
-- NEW: the interactivity / self-improvement signal stream
create table signals (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  kind text check (kind in ('accept','edit','dismiss','correct','gap')),
  target text,
  before text, after text,
  agent text,
  notes text
);
-- NEW: onboarding progress so the bot is resumable
create table onboarding (
  id uuid primary key default gen_random_uuid(),
  step text, complete boolean default false,
  collected jsonb, updated_at timestamptz default now()
);
```

## API surface (minimum)

`GET /api/tasks?filter=...` · `PATCH /api/tasks/:id` · `POST /api/tasks` · `WS /ws/board` · `POST /api/signals` · `GET|POST /api/onboarding`

---

## Proactive guardrails

Quiet hours 9pm–7am · max 5 pushes/day (excl. Morning Brief) · only P1 + overdue + stalls auto-push · dismissal learning after 3 · no duplicate alerts within 24h.

---

## Anti-pattern guard (enforced in code)

> No new feature / framework / agent / prompt until the trust is executed AND BBA has 5 live paid clients.

- Self-improvement cannot suggest new features while ship-to-plan ratio < 70%.
- Ledger flags any new project as "candidate #N — what shipped instead?"
- Morning Brief opens with "Trust execution: N days from 'this week'" until signed.

---

## The chokepoint (Day 0, blocks everything)

Sign + notarize the House of Day Express Trust. File SS-4 (EIN) same day. Unblocks: Creative IP, BBA equity housing, NEMT acquisitions, sovereignty petition.

---

## 14-day scaffold plan

| Day | Deliverable | Done when |
|---|---|---|
| 0 | Sign trust + file SS-4 | Dated doc, EIN submitted |
| 1 | Repo scaffold (Next.js + Supabase + Railway) | `git push` -> live URL |
| 2 | Auth + schema (all 5 tables) | Login works, seed data loaded |
| 3 | **Onboarding bot** | Interview populates a live board, resumable |
| 4 | Command Center UI + realtime | Two devices update instantly |
| 5 | Core agent prompt wired + docked chat | Assistant answers in context, on every screen |
| 6 | Morning Brief v1 | 8am push fires, renders |
| 7 | Decision Ledger + Friday digest | First ledger runs |
| 8 | Vault — manual ingestion | Drag PDF -> chunked + embedded + retrievable |
| 9 | Signals + self-improvement widget | Edits/dismissals logged, per-agent success rate shows |
| 10 | Mobile PWA + Capacitor | iOS + Android test builds installable |
| 11 | Voice capture (Whisper) | Speak -> task on board |
| 12 | Email integration (Gmail API) | Forward to capture@ -> vault |
| 13 | Autonomous fetch — 1 source | First run, quarantine, approve |
| 14 | End-of-week-2 audit | Ship-to-plan ratio reported |

---

## First 60 minutes

1. Open trust doc; schedule notary.
2. `git clone` the repo.
3. Save planner HTML as `index.html`.
4. Deploy to Railway.
5. Create Supabase project.
6. Wire `storage.get/set` to Supabase (not localStorage).
7. `git push`.
8. Open on phone.
9. Edit a task -> watch it update on laptop.

That's the first round-trip. Everything compounds from there.

---

*"The Noble Savage does not climb a rope. The Noble Savage rises through structure."*
