-- Schema-wide rules. These cover future tables automatically, so a new table can't quietly skip RLS.
begin;
select plan(10);

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'every public table has RLS enabled'
);

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)$$,
  'every public table has at least one policy'
);

select is_empty(
  $$select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and roles <> '{authenticated}'$$,
  'every policy applies only to authenticated users'
);

select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)$$,
  'every SECURITY DEFINER function pins an empty search_path'
);

select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'execute')
        or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE'))$$,
  'anon and public cannot execute any SECURITY DEFINER function'
);

select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'users cannot call the auth trigger function directly'
);

select is(
  enum_range(null::public.share_scope)::text,
  '{workouts,workouts_and_body,everything}',
  'share scopes stay ordered from narrowest to widest'
);

-- Every foreign key needs an index that leads with one of its columns, or deletes scan the child table.
select is_empty(
  $$select c.conrelid::regclass::text || ' ' || c.conname
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = any (c.conkey)
      )$$,
  'every foreign key has a supporting index'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage')
    and not has_schema_privilege('anon', 'private', 'usage'),
  'API roles cannot reach the private schema');

-- PostgREST turns most error codes into HTTP 500. PT404 is a real 404, and anything meant for
-- clients should use a PT code or a standard class that PostgREST maps, such as 28000.
select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%P0002%'$$,
  'no API function raises an error that reaches clients as HTTP 500');

select * from finish();
rollback;
