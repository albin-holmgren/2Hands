-- Confidence snapshots: lightweight periodic health records
-- Written by the /api/confidence/snapshot cron (every 30 min) and
-- read by /api/confidence/history to power the 24h stability bar
-- in the Mission Control Health tab.
--
-- Service-role only: reads and writes go through the admin client.
-- No user-level RLS needed — this is an operator/platform table.

create table if not exists public.confidence_snapshots (
  id          bigserial    primary key,
  level       text         not null check (level in ('healthy', 'degraded', 'unhealthy')),
  stale_runs  int          not null default 0,
  stale_locks int          not null default 0,
  fail_count  int          not null default 0,
  warn_count  int          not null default 0,
  source      text         not null default 'cron',
  top_issues  jsonb,
  created_at  timestamptz  not null default now()
);

-- Fast descending lookups used by readRecentSnapshots()
create index if not exists confidence_snapshots_created_at_idx
  on public.confidence_snapshots (created_at desc);

-- Index for filtering by level (useful for future dashboard queries)
create index if not exists confidence_snapshots_level_idx
  on public.confidence_snapshots (level, created_at desc);

-- Disable RLS: this table is accessed only via the service role key
-- (createAdminClient). If direct user access is ever needed,
-- add RLS with a service_role bypass policy.
alter table public.confidence_snapshots disable row level security;

-- Auto-purge snapshots older than 7 days to keep the table lightweight.
-- This is a best-effort cleanup triggered by any new insert.
create or replace function public.purge_old_confidence_snapshots()
returns trigger
language plpgsql
as $$
begin
  delete from public.confidence_snapshots
  where created_at < now() - interval '7 days';
  return new;
end;
$$;

drop trigger if exists confidence_snapshots_purge on public.confidence_snapshots;
create trigger confidence_snapshots_purge
  after insert on public.confidence_snapshots
  for each statement
  execute function public.purge_old_confidence_snapshots();
