create extension if not exists pgcrypto;

create table if not exists public.coffee_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz not null default now()
);

create unique index if not exists coffee_teams_invite_code_key on public.coffee_teams(invite_code);

create table if not exists public.coffee_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.coffee_teams(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists coffee_members_team_id_idx on public.coffee_members(team_id);

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

create index if not exists coffee_entries_team_id_idx on public.coffee_entries(team_id);
create index if not exists coffee_entries_entry_date_created_at_idx on public.coffee_entries(entry_date desc, created_at desc);

create or replace function public.create_coffee_team_public(p_team_name text)
returns table(id uuid, name text, invite_code text, created_at timestamptz)
language plpgsql
as $$
declare
  normalized_name text := nullif(trim(p_team_name), '');
begin
  if normalized_name is null then
    raise exception 'Team name is required';
  end if;

  return query
    insert into public.coffee_teams (name)
    values (normalized_name)
    returning coffee_teams.id, coffee_teams.name, coffee_teams.invite_code, coffee_teams.created_at;
end;
$$;

create or replace function public.join_coffee_team_public(p_invite_code text)
returns table(id uuid, name text, invite_code text, created_at timestamptz)
language plpgsql
as $$
declare
  normalized_code text := nullif(trim(p_invite_code), '');
begin
  if normalized_code is null then
    raise exception 'Team invitation code is required';
  end if;

  return query
    select team.id, team.name, team.invite_code, team.created_at
    from public.coffee_teams team
    where team.invite_code = normalized_code
    limit 1;

  if not found then
    raise exception 'Invalid team invitation code';
  end if;
end;
$$;

create or replace function public.get_coffee_team_public(p_team_id uuid)
returns table(id uuid, name text, invite_code text, created_at timestamptz)
language sql
as $$
  select team.id, team.name, team.invite_code, team.created_at
  from public.coffee_teams team
  where team.id = p_team_id
  limit 1;
$$;

create or replace function public.list_coffee_members_public(p_team_id uuid)
returns table(id uuid, team_id uuid, name text, created_at timestamptz)
language sql
as $$
  select member.id, member.team_id, member.name, member.created_at
  from public.coffee_members member
  where member.team_id = p_team_id
  order by member.name;
$$;

create or replace function public.list_coffee_entries_public(p_team_id uuid)
returns table(
  id uuid,
  team_id uuid,
  type text,
  member_id uuid,
  buyer_id uuid,
  amount numeric,
  pods integer,
  entry_date date,
  note text,
  created_at timestamptz
)
language sql
as $$
  select entry.id, entry.team_id, entry.type, entry.member_id, entry.buyer_id, entry.amount, entry.pods, entry.entry_date, entry.note, entry.created_at
  from public.coffee_entries entry
  where entry.team_id = p_team_id
  order by entry.entry_date desc, entry.created_at desc;
$$;

create or replace function public.create_coffee_member_public(p_team_id uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  new_member_id uuid;
  normalized_name text := nullif(trim(p_name), '');
begin
  if normalized_name is null then
    raise exception 'Member name is required';
  end if;

  if not exists (select 1 from public.coffee_teams team where team.id = p_team_id) then
    raise exception 'Unknown team';
  end if;

  insert into public.coffee_members (team_id, name)
  values (p_team_id, normalized_name)
  returning id into new_member_id;

  return new_member_id;
end;
$$;

create or replace function public.delete_coffee_member_public(p_team_id uuid, p_member_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.coffee_members
  where id = p_member_id
    and team_id = p_team_id;
end;
$$;

create or replace function public.create_coffee_entry_public(
  p_team_id uuid,
  p_type text,
  p_member_id uuid,
  p_buyer_id uuid,
  p_amount numeric,
  p_pods integer,
  p_entry_date date,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  new_entry_id uuid;
begin
  if not exists (select 1 from public.coffee_teams team where team.id = p_team_id) then
    raise exception 'Unknown team';
  end if;

  if p_type not in ('contribution', 'purchase') then
    raise exception 'Invalid entry type';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if p_type = 'contribution' and not exists (
    select 1 from public.coffee_members member
    where member.id = p_member_id and member.team_id = p_team_id
  ) then
    raise exception 'Unknown member';
  end if;

  if p_type = 'purchase' and not exists (
    select 1 from public.coffee_members member
    where member.id = p_buyer_id and member.team_id = p_team_id
  ) then
    raise exception 'Unknown buyer';
  end if;

  insert into public.coffee_entries (team_id, type, member_id, buyer_id, amount, pods, entry_date, note)
  values (
    p_team_id,
    p_type,
    case when p_type = 'contribution' then p_member_id else null end,
    case when p_type = 'purchase' then p_buyer_id else null end,
    p_amount,
    case when p_type = 'purchase' then p_pods else null end,
    coalesce(p_entry_date, current_date),
    coalesce(p_note, '')
  )
  returning id into new_entry_id;

  return new_entry_id;
end;
$$;

create or replace function public.delete_coffee_entry_public(p_team_id uuid, p_entry_id uuid)
returns void
language plpgsql
as $$
begin
  delete from public.coffee_entries
  where id = p_entry_id
    and team_id = p_team_id;
end;
$$;

create or replace function public.clear_coffee_team_data_public(p_team_id uuid)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.coffee_teams team where team.id = p_team_id) then
    raise exception 'Unknown team';
  end if;

  delete from public.coffee_entries where team_id = p_team_id;
  delete from public.coffee_members where team_id = p_team_id;
end;
$$;
