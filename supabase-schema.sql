create extension if not exists pgcrypto;

create table if not exists public.coffee_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('contribution', 'purchase')),
  member_id uuid references public.coffee_members(id) on delete set null,
  buyer_id uuid references public.coffee_members(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  pods integer check (pods is null or pods > 0),
  entry_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.coffee_members enable row level security;
alter table public.coffee_entries enable row level security;

drop policy if exists "coffee_members_public_select" on public.coffee_members;
drop policy if exists "coffee_members_public_insert" on public.coffee_members;
drop policy if exists "coffee_members_public_update" on public.coffee_members;
drop policy if exists "coffee_members_public_delete" on public.coffee_members;
drop policy if exists "coffee_entries_public_select" on public.coffee_entries;
drop policy if exists "coffee_entries_public_insert" on public.coffee_entries;
drop policy if exists "coffee_entries_public_update" on public.coffee_entries;
drop policy if exists "coffee_entries_public_delete" on public.coffee_entries;

create policy "coffee_members_public_select" on public.coffee_members
  for select using (true);

create policy "coffee_members_public_insert" on public.coffee_members
  for insert with check (true);

create policy "coffee_members_public_update" on public.coffee_members
  for update using (true) with check (true);

create policy "coffee_members_public_delete" on public.coffee_members
  for delete using (true);

create policy "coffee_entries_public_select" on public.coffee_entries
  for select using (true);

create policy "coffee_entries_public_insert" on public.coffee_entries
  for insert with check (true);

create policy "coffee_entries_public_update" on public.coffee_entries
  for update using (true) with check (true);

create policy "coffee_entries_public_delete" on public.coffee_entries
  for delete using (true);
