-- PR rows and feed payloads are readable at the workouts scope, so they must never reveal body weight.
begin;
\ir helpers/fixtures.psql
\ir helpers/training.psql

select plan(10);

create temp table ex as select tests.exercise('pullup', 'bodyweight') as pullup, tests.exercise('legpress') as legpress;

-- An exercise marked external can still hold a snapshot, such as after its settings are changed.
select tests.lift(tests.workout('owner', '2026-01-01'), legpress, 10, 50, 'working', 72.5) from ex;
create temp table w1 as select tests.workout('owner', '2026-01-08') as id;
select tests.lift(w1.id, legpress, 10, 50, 'working', 90) from ex, w1;
select tests.rebuild('owner', legpress) from ex;
select is((select tests.records('owner', legpress) from ex), '{}', 'a snapshot on an external lift can''t create a PR through body weight gain');

create temp table w2 as select tests.workout('owner', '2026-01-15') as id;
select tests.lift(w2.id, legpress, 10, 55, 'working', 72.5) from ex, w2;
select tests.rebuild('owner', legpress) from ex;
select is((select tests.records('owner', legpress) from ex), '{"2026-01-15 load 55.000<-50.000"}', 'its PR compares added load, with no e1RM row');
select is(private.best_lift(id), null, 'with no usable e1RM, the feed highlights no lift rather than risk a leak') from w2;
select is((private.feed_payload(id) ->> 'pr_count')::int, 0, 'and doesn''t count it as an e1RM PR') from w2;

create temp table w3 as select tests.workout('owner', '2026-01-22') as id;
select tests.lift(w3.id, legpress, 5, 10, 'working', 72.5) from ex, w3;
select tests.rebuild('owner', legpress) from ex;
select is(private.best_lift(id), null, 'with no e1RM to compare, the near-best tier doesn''t use body weight') from w3;

-- What the user typed can be the body weight itself, as v1's pull-ups were.
select tests.lift(tests.workout('owner', '2026-01-01'), pullup, 10, 0, 'working', 72.5, 160, 'lb') from ex;
create temp table w4 as select tests.workout('owner', '2026-01-08') as id;
select tests.lift(w4.id, pullup, 12, 0, 'working', 72.5, 160, 'lb') from ex, w4;
select tests.rebuild('owner', pullup) from ex;
select is(private.best_lift(id) ->> 'tier', 'rep_pr', 'the rep PR is reported') from w4;
select is(private.best_lift(id) -> 'entered_load', 'null'::jsonb, 'the feed hides the typed load on a bodyweight set') from w4;
select is(private.best_lift(id) -> 'entered_unit', 'null'::jsonb, 'and its unit') from w4;

create temp table w5 as select tests.workout('owner', '2026-01-15') as id;
select tests.lift(w5.id, legpress, 10, 100, 'working', null, 220.46, 'lb') from ex, w5;
select is((select entered_load from private.counted_sets c, w5 where c.workout_id = w5.id), 220.46::numeric, 'external sets keep what the user typed') from ex;

-- The whole table, not just one row.
select is_empty(
  $$select r.id from public.personal_records r
    join public.workout_sets s on s.id = r.set_id
    where r.value = s.effective_load_kg and s.bodyweight_kg is not null and s.load_kg <> s.effective_load_kg$$,
  'no PR row stores a load that includes body weight');

select * from finish();
rollback;
