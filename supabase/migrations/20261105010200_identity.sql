-- Profiles and sharing come first because every other table's policies call can_view.
-- Designed in docs/DATA_MODEL.md.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  avatar_path   text,
  unit_system   public.unit_system not null default 'imperial',
  locale        text not null default 'en' check (locale in ('en', 'pt-BR')),
  timezone      text not null default 'UTC',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.profile_details (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  birth_date             date not null,
  sex_for_calc           public.sex_for_calc not null default 'unspecified',
  height_cm              numeric(5, 2) not null check (height_cm between 50 and 272),
  experience_level       public.experience_level not null,
  goal                   public.goal_type not null,
  equipment_access       text[] not null default '{}',
  target_sessions_per_week smallint not null check (target_sessions_per_week between 1 and 14),
  updated_at             timestamptz not null default now()
);

create table public.shares (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  viewer_id          uuid references public.profiles (id) on delete cascade,
  scope              public.share_scope not null,
  status             public.share_status not null default 'pending',
  invite_token_hash  text unique,
  invite_expires_at  timestamptz,
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  revoked_at         timestamptz,
  check (owner_id <> viewer_id),
  check (status <> 'active' or viewer_id is not null)
);

create unique index shares_active_pair_uq on public.shares (owner_id, viewer_id)
  where status = 'active';

create index shares_viewer_idx on public.shares (viewer_id, owner_id) where status = 'active';

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profile_details_updated before update on public.profile_details
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Athlete'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

create function public.can_view(p_owner uuid, p_required public.share_scope)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid() or exists (
    select 1 from public.shares s
    where s.owner_id = p_owner
      and s.viewer_id = auth.uid()
      and s.status = 'active'
      and s.scope >= p_required
  );
$$;

-- True when the two users share in either direction. Lets each side see the other's name.
create function public.is_connected(p_other uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shares s
    where s.status = 'active'
      and ((s.owner_id = p_other and s.viewer_id = auth.uid())
        or (s.owner_id = auth.uid() and s.viewer_id = p_other))
  );
$$;

-- Returns the raw token exactly once. Only its hash is stored.
create function public.create_share_invite(p_scope public.share_scope)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.shares (owner_id, scope, invite_token_hash, invite_expires_at)
  values (auth.uid(), p_scope,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
          now() + interval '7 days');
  return v_token;
end $$;

create function public.accept_share(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.shares
     set viewer_id = auth.uid(), status = 'active', accepted_at = now(),
         invite_token_hash = null, invite_expires_at = null
   where invite_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and status = 'pending'
     and invite_expires_at > now()
     and owner_id <> auth.uid()
  returning id into v_id;
  if v_id is null then
    raise exception 'invalid or expired invite' using errcode = 'P0002';
  end if;
  return v_id;
end $$;

-- Only the owner can change how much is shared.
create function public.update_share_scope(p_share_id uuid, p_scope public.share_scope)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares set scope = p_scope
   where id = p_share_id and owner_id = auth.uid() and status in ('pending', 'active');
  if not found then
    raise exception 'share not found' using errcode = 'P0002';
  end if;
end $$;

-- Either side can end a share, and it takes effect on the next query.
create function public.revoke_share(p_share_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shares
     set status = 'revoked', revoked_at = now(),
         invite_token_hash = null, invite_expires_at = null
   where id = p_share_id
     and (owner_id = auth.uid() or viewer_id = auth.uid())
     and status <> 'revoked';
  if not found then
    raise exception 'share not found' using errcode = 'P0002';
  end if;
end $$;

-- Supabase grants EXECUTE to anon by default, so every function is locked down explicitly.
revoke all on function public.can_view(uuid, public.share_scope) from public, anon;

revoke all on function public.is_connected(uuid) from public, anon;

revoke all on function public.create_share_invite(public.share_scope) from public, anon;

revoke all on function public.accept_share(text) from public, anon;

revoke all on function public.update_share_scope(uuid, public.share_scope) from public, anon;

revoke all on function public.revoke_share(uuid) from public, anon;

grant execute on function public.can_view(uuid, public.share_scope) to authenticated;

grant execute on function public.is_connected(uuid) to authenticated;

grant execute on function public.create_share_invite(public.share_scope) to authenticated;

grant execute on function public.accept_share(text) to authenticated;

grant execute on function public.update_share_scope(uuid, public.share_scope) to authenticated;

grant execute on function public.revoke_share(uuid) to authenticated;

alter table public.profiles enable row level security;

alter table public.profile_details enable row level security;

alter table public.shares enable row level security;

-- Profiles: the owner, plus anyone connected through an active share. No INSERT or DELETE:
-- the auth trigger creates the row and deleting the auth user cascades.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_connected(id));

create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Owner-only tables.
create policy profile_details_owner on public.profile_details for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sharing: read-only for clients; changes go through the permission functions.
create policy shares_select on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));
