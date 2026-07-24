-- 2Hands Native Skills System
-- Modular, user-extensible AI capabilities with progressive loading

create table if not exists public.ai_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- Level 1: Metadata (always loaded)
  name text not null check (name ~ '^[a-z0-9-]+$'),
  description text not null,
  category text not null default 'custom'
    check (category in ('research','coding','writing','analysis','product','custom')),
  icon text,

  -- Invocation control
  user_invocable boolean not null default true,
  model_invocable boolean not null default true,

  -- Level 2: Instructions (loaded when triggered)
  instructions text not null,

  -- Configuration
  allowed_tools jsonb not null default '[]',
  required_integrations jsonb not null default '[]',
  config jsonb not null default '{}',

  -- Level 3: Resources (loaded on-demand)
  resources jsonb not null default '[]',

  -- State
  is_enabled boolean not null default true,
  is_system boolean not null default false,
  is_favorite boolean not null default false,

  -- Analytics
  usage_count integer not null default 0,
  last_used_at timestamptz,
  avg_tokens_per_run integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(workspace_id, name)
);

create index if not exists ai_skills_workspace_enabled_idx
  on public.ai_skills (workspace_id, is_enabled);

create index if not exists ai_skills_category_idx
  on public.ai_skills (workspace_id, category);

-- Skill execution tracking
create table if not exists public.skill_runs (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.ai_skills(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  user_id uuid not null,
  workspace_id uuid not null,

  trigger_type text not null default 'model'
    check (trigger_type in ('user','model','scheduled','chained')),
  arguments text,

  status text not null default 'running'
    check (status in ('running','completed','failed','cancelled')),
  output text,
  error_message text,

  tokens_input integer,
  tokens_output integer,
  duration_ms integer,

  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists skill_runs_skill_idx
  on public.skill_runs (skill_id, started_at desc);

create index if not exists skill_runs_workspace_idx
  on public.skill_runs (workspace_id, started_at desc);

-- RLS
alter table public.ai_skills enable row level security;

drop policy if exists "users manage own skills" on public.ai_skills;
create policy "users manage own skills"
  on public.ai_skills for all
  using (user_id = auth.uid());

alter table public.skill_runs enable row level security;

drop policy if exists "users view own skill runs" on public.skill_runs;
create policy "users view own skill runs"
  on public.skill_runs for all
  using (user_id = auth.uid());

-- Auto-update updated_at
create or replace function public.touch_ai_skills_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_skills_updated_at on public.ai_skills;
create trigger ai_skills_updated_at
  before update on public.ai_skills
  for each row execute function public.touch_ai_skills_updated_at();
