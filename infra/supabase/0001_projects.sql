create extension if not exists pgcrypto;

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  status text not null default 'draft',
  version integer not null default 0 check (version >= 0),
  thumbnail_url text,
  total_duration_ms bigint not null default 0 check (total_duration_ms >= 0),
  video_count integer not null default 0 check (video_count >= 0),
  progress numeric(5,2) not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;

create policy "owners read projects" on projects for select using (auth.uid() = owner_id);
create policy "owners create projects" on projects for insert with check (auth.uid() = owner_id);
create policy "owners update projects" on projects for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners delete projects" on projects for delete using (auth.uid() = owner_id);
