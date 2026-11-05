begin;
select plan(2);

select has_function('public', 'hello', 'hello() exists after migrations run');
select is(public.hello(), 'Hello from Supabase', 'hello() returns the greeting');

-- TODO(victor): Add a third test that anonymous users can call hello().
-- Hint: run `set local role anon;` before another `select is(...)`, then change plan(2) to plan(3).
select * from finish();
rollback;
