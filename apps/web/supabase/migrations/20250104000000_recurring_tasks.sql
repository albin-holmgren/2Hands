-- Recurring Tasks: AI-schedulable recurring work items
create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  schedule_cron text not null, -- cron expression e.g. '0 9 * * 1' (Mon 9am)
  schedule_timezone text not null default 'UTC',
  next_run_at timestamptz,
  last_run_at timestamptz,
  status text not null default 'active'
    check (status in ('active','paused','completed','failed')),
  created_by text not null default 'user'
    check (created_by in ('user','ai')),
  task_type text not null default 'action'
    check (task_type in ('research','monitor','report','action')),
  output_destination text not null default 'board'
    check (output_destination in ('board','memory','chat','integration')),
  board_column text default 'inbox',
  mission_id uuid references public.missions(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  config jsonb not null default '{}', -- extra config: agent template, prompts, etc.
  run_count integer not null default 0,
  last_output text, -- summary of last run result
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_tasks_workspace_status_idx
  on public.recurring_tasks (workspace_id, status);

create index if not exists recurring_tasks_next_run_idx
  on public.recurring_tasks (next_run_at)
  where status = 'active';

-- RLS
alter table public.recurring_tasks enable row level security;

drop policy if exists "users can select own recurring tasks" on public.recurring_tasks;
create policy "users can select own recurring tasks"
  on public.recurring_tasks for select
  using (user_id = auth.uid());

drop policy if exists "users can insert own recurring tasks" on public.recurring_tasks;
create policy "users can insert own recurring tasks"
  on public.recurring_tasks for insert
  with check (user_id = auth.uid());

drop policy if exists "users can update own recurring tasks" on public.recurring_tasks;
create policy "users can update own recurring tasks"
  on public.recurring_tasks for update
  using (user_id = auth.uid());

drop policy if exists "users can delete own recurring tasks" on public.recurring_tasks;
create policy "users can delete own recurring tasks"
  on public.recurring_tasks for delete
  using (user_id = auth.uid());

-- Auto-update updated_at
create or replace function public.touch_recurring_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recurring_tasks_updated_at on public.recurring_tasks;
create trigger recurring_tasks_updated_at
  before update on public.recurring_tasks
  for each row execute function public.touch_recurring_tasks_updated_at();

-- Execution history log
create table if not exists public.recurring_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  workspace_id uuid not null,
  status text not null default 'running'
    check (status in ('running','completed','failed')),
  output text,
  board_card_id uuid references public.mission_cards(id) on delete set null,
  memory_id uuid references public.ai_manager_memories(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer
);

create index if not exists recurring_task_runs_task_idx
  on public.recurring_task_runs (task_id, started_at desc);

-- RLS for runs
alter table public.recurring_task_runs enable row level security;

drop policy if exists "users can select own task runs" on public.recurring_task_runs;
create policy "users can select own task runs"
  on public.recurring_task_runs for select
  using (
    task_id in (
      select id from public.recurring_tasks where user_id = auth.uid()
    )
  );
