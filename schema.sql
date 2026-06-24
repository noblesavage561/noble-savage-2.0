create table if not exists workstreams (
  id text primary key,
  name text not null,
  tier text not null check (tier in ('Tier 1', 'Tier 2', 'Tier 3')),
  owner text,
  objective text,
  why text,
  color text
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  ws text not null references workstreams(id) on delete cascade,
  task text not null,
  prio text not null check (prio in ('P1', 'P2', 'P3')),
  status text not null check (status in ('Backlog', 'This Week', 'In Progress', 'Blocked', 'Done')),
  owner text,
  notes text,
  deleg text,
  bot text,
  due date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  prompt text,
  recommendation jsonb,
  actual_action text,
  status text check (status in ('DONE', 'IN MOTION', 'STILL BLUEPRINT')),
  week_of date
);

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  kind text not null check (kind in ('accept', 'edit', 'dismiss', 'correct', 'gap')),
  target text,
  before text,
  after text,
  agent text,
  notes text
);

create table if not exists onboarding (
  id uuid primary key default gen_random_uuid(),
  step text,
  complete boolean default false,
  collected jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
