create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.coffee_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null default encode(gen_random_bytes(8), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_team_memberships (
  team_id uuid not null references public.coffee_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.coffee_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.coffee_teams(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.coffee_teams(id) on delete cascade,
  type text not null check (type in ('contribution', 'purchase')),
  member_id uuid references public.coffee_members(id) on delete set null,
  buyer_id uuid references public.coffee_members(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  pods integer check (pods is null or pods > 0),
  entry_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists coffee_team_memberships_user_id_idx on public.coffee_team_memberships(user_id);
create index if not exists coffee_teams_created_by_idx on public.coffee_teams(created_by);
create unique index if not exists coffee_teams_invite_code_key on public.coffee_teams(invite_code);
create index if not exists coffee_members_team_id_idx on public.coffee_members(team_id);
create index if not exists coffee_entries_team_id_idx on public.coffee_entries(team_id);
create index if not exists coffee_entries_member_id_idx on public.coffee_entries(member_id);
create index if not exists coffee_entries_buyer_id_idx on public.coffee_entries(buyer_id);
create index if not exists coffee_entries_entry_date_created_at_idx on public.coffee_entries(entry_date desc, created_at desc);

create or replace function private.is_coffee_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coffee_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_coffee_team_owner(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coffee_team_memberships membership
    where membership.team_id = target_team_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
  );
$$;

create or replace function private.is_coffee_team_creator(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coffee_teams team
    where team.id = target_team_id
      and team.created_by = (select auth.uid())
  );
$$;

create or replace function public.join_coffee_team(team_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_team_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select team.id into target_team_id
  from public.coffee_teams team
  where team.invite_code = trim(team_invite_code)
  limit 1;

  if target_team_id is null then
    raise exception 'Invalid team invitation code';
  end if;

  insert into public.coffee_team_memberships (team_id, user_id, role)
  values (target_team_id, current_user_id, 'member')
  on conflict (team_id, user_id) do nothing;

  return target_team_id;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_coffee_team_member(uuid) to authenticated;
grant execute on function private.is_coffee_team_owner(uuid) to authenticated;
grant execute on function private.is_coffee_team_creator(uuid) to authenticated;
revoke all on schema private from anon, public;
revoke execute on function private.is_coffee_team_member(uuid) from anon, public;
revoke execute on function private.is_coffee_team_owner(uuid) from anon, public;
revoke execute on function private.is_coffee_team_creator(uuid) from anon, public;
revoke execute on function public.join_coffee_team(text) from anon, public;
grant execute on function public.join_coffee_team(text) to authenticated;
drop function if exists public.is_coffee_team_member(uuid);
drop function if exists public.is_coffee_team_owner(uuid);
drop function if exists public.is_coffee_team_creator(uuid);

alter table public.coffee_teams enable row level security;
alter table public.coffee_team_memberships enable row level security;
alter table public.coffee_members enable row level security;
alter table public.coffee_entries enable row level security;

drop policy if exists "coffee_teams_select_member" on public.coffee_teams;
drop policy if exists "coffee_teams_insert_authenticated" on public.coffee_teams;
drop policy if exists "coffee_teams_update_owner" on public.coffee_teams;
drop policy if exists "coffee_teams_delete_owner" on public.coffee_teams;
drop policy if exists "coffee_team_memberships_select_member" on public.coffee_team_memberships;
drop policy if exists "coffee_team_memberships_insert_owner_or_creator" on public.coffee_team_memberships;
drop policy if exists "coffee_team_memberships_update_owner" on public.coffee_team_memberships;
drop policy if exists "coffee_team_memberships_delete_self_or_owner" on public.coffee_team_memberships;
drop policy if exists "coffee_members_public_select" on public.coffee_members;
drop policy if exists "coffee_members_public_insert" on public.coffee_members;
drop policy if exists "coffee_members_public_update" on public.coffee_members;
drop policy if exists "coffee_members_public_delete" on public.coffee_members;
drop policy if exists "coffee_entries_public_select" on public.coffee_entries;
drop policy if exists "coffee_entries_public_insert" on public.coffee_entries;
drop policy if exists "coffee_entries_public_update" on public.coffee_entries;
drop policy if exists "coffee_entries_public_delete" on public.coffee_entries;
drop policy if exists "coffee_members_select_team_member" on public.coffee_members;
drop policy if exists "coffee_members_insert_team_member" on public.coffee_members;
drop policy if exists "coffee_members_update_team_member" on public.coffee_members;
drop policy if exists "coffee_members_delete_team_member" on public.coffee_members;
drop policy if exists "coffee_entries_select_team_member" on public.coffee_entries;
drop policy if exists "coffee_entries_insert_team_member" on public.coffee_entries;
drop policy if exists "coffee_entries_update_team_member" on public.coffee_entries;
drop policy if exists "coffee_entries_delete_team_member" on public.coffee_entries;

create policy "coffee_teams_select_member" on public.coffee_teams
  for select to authenticated
  using (private.is_coffee_team_member(id));

create policy "coffee_teams_insert_authenticated" on public.coffee_teams
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "coffee_teams_update_owner" on public.coffee_teams
  for update to authenticated
  using (private.is_coffee_team_owner(id))
  with check (private.is_coffee_team_owner(id));

create policy "coffee_teams_delete_owner" on public.coffee_teams
  for delete to authenticated
  using (private.is_coffee_team_owner(id));

create policy "coffee_team_memberships_select_member" on public.coffee_team_memberships
  for select to authenticated
  using (private.is_coffee_team_member(team_id));

create policy "coffee_team_memberships_insert_owner_or_creator" on public.coffee_team_memberships
  for insert to authenticated
  with check (
    private.is_coffee_team_owner(team_id)
    or (user_id = (select auth.uid()) and private.is_coffee_team_creator(team_id))
  );

create policy "coffee_team_memberships_update_owner" on public.coffee_team_memberships
  for update to authenticated
  using (private.is_coffee_team_owner(team_id))
  with check (private.is_coffee_team_owner(team_id));

create policy "coffee_team_memberships_delete_self_or_owner" on public.coffee_team_memberships
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_coffee_team_owner(team_id));

create policy "coffee_members_select_team_member" on public.coffee_members
  for select to authenticated
  using (private.is_coffee_team_member(team_id));

create policy "coffee_members_insert_team_member" on public.coffee_members
  for insert to authenticated
  with check (private.is_coffee_team_member(team_id));

create policy "coffee_members_update_team_member" on public.coffee_members
  for update to authenticated
  using (private.is_coffee_team_member(team_id))
  with check (private.is_coffee_team_member(team_id));

create policy "coffee_members_delete_team_member" on public.coffee_members
  for delete to authenticated
  using (private.is_coffee_team_member(team_id));

create policy "coffee_entries_select_team_member" on public.coffee_entries
  for select to authenticated
  using (private.is_coffee_team_member(team_id));

create policy "coffee_entries_insert_team_member" on public.coffee_entries
  for insert to authenticated
  with check (private.is_coffee_team_member(team_id));

create policy "coffee_entries_update_team_member" on public.coffee_entries
  for update to authenticated
  using (private.is_coffee_team_member(team_id))
  with check (private.is_coffee_team_member(team_id));

create policy "coffee_entries_delete_team_member" on public.coffee_entries
  for delete to authenticated
  using (private.is_coffee_team_member(team_id));
