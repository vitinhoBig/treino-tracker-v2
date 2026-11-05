-- What each persona gets when reading the owner's sets through get_shared_sets.
begin;
\ir helpers/fixtures.psql
\ir helpers/training.psql

select plan(46);

create temp table ex as select tests.exercise('pullup', 'bodyweight') as pullup, tests.exercise('squat') as squat, tests.exercise('legpress') as legpress;
create temp table w as select tests.workout('owner', '2026-03-10') as id;
create temp table early as select tests.workout('owner', '2026-03-01') as id;
create temp table unfinished as select tests.workout('owner', '2026-03-11', 'in_progress') as id;
create temp table other as select tests.workout('viewer_w', '2026-03-10') as id;
create temp table s as select
  tests.lift(w.id, ex.pullup, 8, 5, 'working', 72.5, 11, 'lb') as pull,
  tests.lift(w.id, ex.squat, 10, 100, 'working', null, 220.46, 'lb') as squat,
  tests.lift(w.id, ex.legpress, 10, 50, 'working', 72.5) as snap,
  tests.lift(early.id, ex.squat, 10, 90) as early_squat,
  tests.lift(unfinished.id, ex.pullup, 8, 5, 'working', 72.5) as live,
  tests.lift(other.id, ex.squat, 5, 60) as others
from ex, w, early, unfinished, other;
grant select on ex, w, early, unfinished, other, s to authenticated, anon;

-- One row as JSON, read as the given persona.
create function tests.read(p_persona text, p_set uuid) returns jsonb language plpgsql as $$
declare v_row jsonb;
begin
  perform tests.become(p_persona);
  select to_jsonb(r) into v_row from public.get_shared_sets(tests.uid('owner')) r where r.id = p_set;
  perform tests.as_admin();
  return v_row;
end $$;

create function tests.total(p_persona text, p_owner text default 'owner', p_workout uuid default null, p_from date default null, p_to date default null) returns int language plpgsql as $$
declare v_count int;
begin
  perform tests.become(p_persona);
  select count(*) into v_count from public.get_shared_sets(tests.uid(p_owner), p_workout, p_from, p_to);
  perform tests.as_admin();
  return v_count;
end $$;
grant execute on function tests.read(text, uuid), tests.total(text, text, uuid, date, date) to authenticated, anon;

-- Workouts-only viewer: bodyweight sets are masked in every column that reveals body weight.
select is(tests.read('viewer_w', pull) -> 'body_masked', 'true'::jsonb, 'workouts viewer: a bodyweight set is flagged as masked') from s;
select is(tests.read('viewer_w', pull) -> 'bodyweight_kg', 'null'::jsonb, 'workouts viewer: bodyweight_kg hidden') from s;
select is(tests.read('viewer_w', pull) -> 'effective_load_kg', 'null'::jsonb, 'workouts viewer: effective load hidden') from s;
select is(tests.read('viewer_w', pull) -> 'volume_kg', 'null'::jsonb, 'workouts viewer: volume hidden') from s;
select is(tests.read('viewer_w', pull) -> 'e1rm_kg', 'null'::jsonb, 'workouts viewer: e1RM hidden') from s;
select is(tests.read('viewer_w', pull) -> 'entered_load', 'null'::jsonb, 'workouts viewer: typed load hidden') from s;
select is(tests.read('viewer_w', pull) -> 'entered_unit', 'null'::jsonb, 'workouts viewer: typed unit hidden') from s;
select is((tests.read('viewer_w', pull) ->> 'reps')::int, 8, 'workouts viewer: reps still visible') from s;
select is((tests.read('viewer_w', pull) ->> 'load_kg')::numeric, 5.000, 'workouts viewer: added load still visible') from s;

-- No hidden field survives anywhere in the row.
select is(
  (select array_agg(key order by key) from jsonb_each(tests.read('viewer_w', pull)) where jsonb_typeof(value) = 'number'),
  '{exercise_order,load_kg,reps,set_number}',
  'workouts viewer: the only numbers on a masked row are safe ones') from s;

-- A snapshot on an exercise marked external is masked as well.
select is(tests.read('viewer_w', snap) -> 'body_masked', 'true'::jsonb, 'workouts viewer: any set with a snapshot is masked') from s;
select is(tests.read('viewer_w', snap) -> 'e1rm_kg', 'null'::jsonb, 'workouts viewer: its e1RM is hidden') from s;
select is(tests.read('viewer_w', snap) -> 'volume_kg', 'null'::jsonb, 'workouts viewer: its volume is hidden') from s;

-- Ordinary lifts aren't touched.
select is(tests.read('viewer_w', squat) -> 'body_masked', 'false'::jsonb, 'workouts viewer: an external lift isn''t masked') from s;
select is((tests.read('viewer_w', squat) ->> 'volume_kg')::numeric, 1000.000, 'workouts viewer: sees external volume') from s;
select is((tests.read('viewer_w', squat) ->> 'e1rm_kg')::numeric, 133.333, 'workouts viewer: sees external e1RM') from s;
select is((tests.read('viewer_w', squat) ->> 'entered_load')::numeric, 220.46, 'workouts viewer: sees the typed load') from s;

-- Body access lifts the mask, at both higher tiers.
select is(tests.read(p, pull) -> 'body_masked', 'false'::jsonb, p || ': not masked') from s, unnest(array['viewer_b', 'viewer_e', 'owner']) p;
select is((tests.read(p, pull) ->> 'bodyweight_kg')::numeric, 72.500, p || ': sees body weight') from s, unnest(array['viewer_b', 'viewer_e', 'owner']) p;
select is((tests.read(p, pull) ->> 'effective_load_kg')::numeric, 77.500, p || ': sees effective load') from s, unnest(array['viewer_b', 'viewer_e', 'owner']) p;
select is((tests.read(p, pull) ->> 'volume_kg')::numeric, 620.000, p || ': sees volume') from s, unnest(array['viewer_b', 'viewer_e', 'owner']) p;

-- Which rows come back.
select is(tests.total('viewer_w'), 5, 'a viewer gets finished sets, including the fixture''s');
select is(tests.total('stranger'), 0, 'a stranger gets nothing');
select is(tests.read('viewer_w', live), null, 'unfinished workouts stay hidden') from s;
select is(tests.total('viewer_e', 'stranger'), 0, 'a viewer gets nothing from someone who doesn''t share with them');
select is(tests.total('viewer_b', 'viewer_w'), 0, 'viewers can''t read each other through a shared owner');

select tests.as_anon();
select throws_ok($$select * from public.get_shared_sets(tests.uid('owner'))$$, '42501', null, 'anon cannot call it');
select tests.as_admin();

-- Filters.
select is(tests.total('viewer_w', 'owner', w.id), 3, 'p_workout_id narrows to one workout') from w;
select is(tests.total('viewer_w', 'owner', other.id), 0, 'a workout belonging to someone else returns nothing') from other;
select is(tests.total('viewer_w', 'owner', null, '2026-03-05'), 4, 'p_from excludes earlier workouts');
select is(tests.total('viewer_w', 'owner', null, '2026-03-05', '2026-03-09'), 0, 'p_to excludes later workouts');

-- Filtering on a hidden column finds nothing, so it can't be used to guess the value.
select tests.as_user('viewer_w');
select is((select count(*)::int from public.get_shared_sets(tests.uid('owner')) r where r.bodyweight_kg > 0 and r.exercise_id = (select pullup from ex)), 0, 'filtering on a hidden value matches nothing');

select is((select count(*)::int from public.workout_sets where user_id = tests.uid('owner') and bodyweight_kg > 70), 0, 'viewers can''t filter the table directly either');
select is((select count(*)::int from public.workout_sets where user_id = tests.uid('owner')), 0, 'viewers have no direct access to the table');
select tests.as_admin();

-- Access changes apply on the next read.
select tests.as_user('owner');
select public.update_share_scope((select id from public.shares where viewer_id = tests.uid('viewer_b')), 'workouts');
select is(tests.read('viewer_b', pull) -> 'bodyweight_kg', 'null'::jsonb, 'lowering a viewer''s scope masks at once') from s;
select tests.as_user('owner');
select public.update_share_scope((select id from public.shares where viewer_id = tests.uid('viewer_w')), 'workouts_and_body');
select is((tests.read('viewer_w', pull) ->> 'bodyweight_kg')::numeric, 72.500, 'raising a viewer''s scope unmasks at once') from s;
select tests.as_user('owner');
select public.revoke_share((select id from public.shares where viewer_id = tests.uid('viewer_w')));
select is(tests.total('viewer_w'), 0, 'revoking removes all sets at once');

-- Reading your own sets is never masked.
select is((tests.read('owner', snap) ->> 'bodyweight_kg')::numeric, 72.500, 'owners always see their own body weight') from s;

select * from finish();
rollback;
