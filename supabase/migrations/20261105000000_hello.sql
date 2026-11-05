-- Hello-world that proves migrations apply and the API can reach the database.
-- Dropped by the first real schema migration. It reads no data, so it needs no RLS.
create function public.hello()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Hello from Supabase'::text;
$$;
