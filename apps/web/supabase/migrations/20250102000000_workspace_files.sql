-- workspace_files table
-- Stores metadata for files uploaded to Supabase Storage by workspace members.
-- Actual file bytes live in the 'workspace-files' storage bucket.

create table if not exists public.workspace_files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  name          text not null,
  mime_type     text not null default 'application/octet-stream',
  size_bytes    bigint not null default 0,
  storage_bucket text not null default 'workspace-files',
  storage_path  text not null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Drop NOT NULL on created_by if it was created with that constraint (idempotent)
alter table public.workspace_files alter column created_by drop not null;

create index if not exists workspace_files_workspace_id_idx on public.workspace_files(workspace_id);
create index if not exists workspace_files_created_at_idx on public.workspace_files(workspace_id, created_at desc);

-- RLS
alter table public.workspace_files enable row level security;

-- Members of the workspace can read files
drop policy if exists "workspace_files_select" on public.workspace_files;
create policy "workspace_files_select" on public.workspace_files
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Any workspace member can upload (insert)
drop policy if exists "workspace_files_insert" on public.workspace_files;
create policy "workspace_files_insert" on public.workspace_files
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Only the uploader or workspace admins can delete
drop policy if exists "workspace_files_delete" on public.workspace_files;
create policy "workspace_files_delete" on public.workspace_files
  for delete using (
    created_by = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
