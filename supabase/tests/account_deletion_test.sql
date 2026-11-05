-- Deleting an account must remove all of that person's data, and nobody else's. The fixtures include sets
-- logged on the owner's custom exercise, the case that breaks if foreign key checks aren't deferred.
-- `set constraints all immediate` forces those checks now, because this transaction never commits.
begin;
\ir helpers/fixtures.psql

select plan(7);

select is(
  (select display_name from public.profiles where id = tests.uid('owner')), 'owner',
  'signing up creates a profile with the chosen name');

select throws_ok(
  $$delete from public.exercises where id = 'e0000000-0000-4000-8000-000000000002';
    set constraints all immediate$$,
  '23503', null, 'a custom exercise that is still in use cannot be deleted');

select throws_ok(
  $$delete from public.supplements where id = 'f0000000-0000-4000-8000-000000000001';
    set constraints all immediate$$,
  '23503', null, 'a custom supplement used by an experiment cannot be deleted');

select lives_ok(
  $$delete from auth.users where id = tests.uid('owner');
    set constraints all immediate$$,
  'an account with logged history can be deleted');

select is_empty($$
  select t.table_name
  from information_schema.columns t
  join information_schema.tables b using (table_schema, table_name)
  cross join lateral (
    select (xpath('/row/c/text()', query_to_xml(
      format('select count(*) as c from public.%I where %I = %L', t.table_name, t.column_name, tests.uid('owner')),
      false, true, '')))[1]::text::int as n
  ) c
  where t.table_schema = 'public' and b.table_type = 'BASE TABLE'
    and t.column_name in ('user_id', 'owner_id', 'actor_id', 'id') and c.n > 0
$$, 'no row in any table still belongs to the deleted user');

select is(
  (select count(*)::int from public.shares where viewer_id in (tests.uid('viewer_w'), tests.uid('viewer_b'), tests.uid('viewer_e'))),
  0, 'shares from the deleted user are gone');
select is((select count(*)::int from public.profiles where id = tests.uid('viewer_e')), 1, 'viewers keep their own accounts');

select * from finish();
rollback;
