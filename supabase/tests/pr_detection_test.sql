-- PR rules: what counts as a record, and what must never be called one.
begin;
\ir helpers/fixtures.psql
\ir helpers/training.psql

select plan(24);

-- Baseline, then a clear improvement.
create temp table ex as select tests.exercise('bench') as bench, tests.exercise('squat') as squat,
  tests.exercise('row') as row_ex, tests.exercise('curl') as curl, tests.exercise('press') as press,
  tests.exercise('lunge') as lunge, tests.exercise('deadlift') as deadlift, tests.exercise('fly') as fly,
  tests.exercise('dip', 'bodyweight') as dip, tests.exercise('raise') as raise_ex;

select tests.lift(tests.workout('owner', '2026-01-01'), bench, 10, 90) from ex;
select tests.rebuild('owner', bench) from ex;
select is((select tests.records('owner', bench) from ex), '{}', 'the first log of an exercise is a baseline, never a PR');

select tests.lift(tests.workout('owner', '2026-01-08'), bench, 10, 100) from ex;
select tests.rebuild('owner', bench) from ex;
select is((select tests.records('owner', bench) from ex),
  '{"2026-01-08 e1rm 133.333<-120.000","2026-01-08 load 100.000<-90.000"}',
  'a heavier set at the same reps is an e1RM PR and a load PR');

select tests.lift(tests.workout('owner', '2026-01-15'), bench, 10, 100) from ex;
select is((select tests.rebuild('owner', bench) from ex), 2, 'matching the best is not a new PR');
select tests.lift(tests.workout('owner', '2026-01-22'), bench, 10, 95) from ex;
select is((select tests.rebuild('owner', bench) from ex), 2, 'a lighter set is not a PR');
select is((select tests.rebuild('owner', bench) from ex), 2, 'rebuilding twice changes nothing');

-- One session.
select tests.lift(w, squat, 5, 100), tests.lift(w, squat, 5, 110) from ex, tests.workout('owner', '2026-01-01') w;
select tests.rebuild('owner', squat) from ex;
select is((select tests.records('owner', squat) from ex), '{}', 'sets in the first session are not PRs against each other');
select tests.lift(w, squat, 5, 115), tests.lift(w, squat, 5, 120) from ex, tests.workout('owner', '2026-01-08') w;
select tests.rebuild('owner', squat) from ex;
select is((select array_agg(s.load_kg) from public.personal_records r join public.workout_sets s on s.id = r.set_id, ex where r.exercise_id = ex.squat and r.type = 'e1rm'),
  '{120.000}', 'one session records one PR per type, on its best set');

-- Sets that must not count.
select tests.lift(tests.workout('owner', '2026-01-01'), row_ex, 10, 50) from ex;
select tests.lift(tests.workout('owner', '2026-01-08'), row_ex, 5, 200, 'warmup') from ex;
select tests.lift(tests.workout('owner', '2026-01-15', 'in_progress'), row_ex, 10, 300) from ex;
select tests.lift(tests.workout('owner', '2026-01-22'), row_ex, 0, 400) from ex;
select tests.rebuild('owner', row_ex) from ex;
select is((select tests.records('owner', row_ex) from ex), '{}', 'warm-ups, unfinished workouts and zero-rep sets never count');
select tests.lift(tests.workout('owner', '2026-01-29'), row_ex, 10, 60) from ex;
select tests.rebuild('owner', row_ex) from ex;
select is((select tests.records('owner', row_ex) from ex),
  '{"2026-01-29 e1rm 80.000<-66.667","2026-01-29 load 60.000<-50.000"}',
  'those ignored sets don''t raise the bar either');

-- Rep PRs.
select tests.lift(tests.workout('owner', '2026-01-01'), curl, 8, 40) from ex;
select tests.lift(tests.workout('owner', '2026-01-08'), curl, 9, 40) from ex;
select tests.rebuild('owner', curl) from ex;
select ok((select '2026-01-08 reps_at_load 9.000<-8.000' = any(tests.records('owner', curl)) from ex), 'more reps at the same load is a rep PR');
select tests.lift(tests.workout('owner', '2026-01-15'), curl, 9, 35) from ex;
select tests.rebuild('owner', curl) from ex;
select ok((select not exists (select 1 from public.personal_records r where r.exercise_id = ex.curl and r.local_date = '2026-01-15') from ex), 'matching your reps at a lighter load is not a rep PR');
select tests.lift(tests.workout('owner', '2026-01-22'), curl, 1, 60) from ex;
select tests.rebuild('owner', curl) from ex;
select ok((select not exists (select 1 from public.personal_records r where r.exercise_id = ex.curl and r.local_date = '2026-01-22' and r.type = 'reps_at_load') from ex), 'a new top load has no rep record to beat');
select ok((select '2026-01-22 load 60.000<-40.000' = any(tests.records('owner', curl)) from ex), 'a heavy single is still a load PR');

-- High reps have no e1RM, but they can still be rep PRs.
select tests.lift(tests.workout('owner', '2026-01-01'), raise_ex, 13, 10) from ex;
select tests.lift(tests.workout('owner', '2026-01-08'), raise_ex, 15, 10) from ex;
select tests.rebuild('owner', raise_ex) from ex;
select is((select tests.records('owner', raise_ex) from ex), '{"2026-01-08 reps_at_load 15.000<-13.000"}', 'above 12 reps, only the rep PR applies');

-- Unit rounding.
select tests.lift(tests.workout('owner', '2026-01-01'), press, 5, 100) from ex;
select tests.lift(tests.workout('owner', '2026-01-08'), press, 5, 100.017, 'working', null, 220.5, 'lb') from ex;
select tests.rebuild('owner', press) from ex;
select is((select tests.records('owner', press) from ex), '{}', 'switching units is not a PR: 100 kg vs 220.5 lb');

-- History order.
select tests.lift(tests.workout('owner', '2026-02-01'), lunge, 10, 60) from ex;
select tests.lift(tests.workout('owner', '2026-01-01'), lunge, 10, 50) from ex;
select tests.rebuild('owner', lunge) from ex;
select is((select array_agg(r.local_date::text) from public.personal_records r, ex where r.exercise_id = ex.lunge and r.type = 'load'),
  '{2026-02-01}', 'a backdated workout takes its place in history, whichever was logged first');

select tests.lift(tests.workout('owner', '2026-01-01', 'completed', 18), fly, 10, 30) from ex;
select tests.lift(tests.workout('owner', '2026-01-01', 'completed', 7), fly, 10, 20) from ex;
select tests.rebuild('owner', fly) from ex;
select is((select array_agg(r.value) from public.personal_records r, ex where r.exercise_id = ex.fly and r.type = 'load'),
  '{30.000}', 'two sessions on one day are ordered by start time');

-- Real v1 data: squats went from 260 lb to a later 230 lb, which can't be called a PR.
select tests.lift(tests.workout('owner', '2025-07-01'), deadlift, 10, 117.934) from ex;
select tests.lift(tests.workout('owner', '2026-03-01'), deadlift, 10, 102.058) from ex;
select tests.lift(tests.workout('owner', '2026-03-08'), deadlift, 10, 104.326) from ex;
select tests.rebuild('owner', deadlift) from ex;
select is((select tests.records('owner', deadlift) from ex), '{}', 'a comeback below your all-time best is not a PR');

-- Bodyweight lifts.
select tests.lift(tests.workout('owner', '2026-01-01'), dip, 10, 0, 'working', 72) from ex;
select tests.lift(tests.workout('owner', '2026-01-08'), dip, 10, 0, 'working', 75) from ex;
select tests.rebuild('owner', dip) from ex;
select is((select tests.records('owner', dip) from ex), '{}', 'gaining body weight doesn''t turn the same reps into a PR');
select tests.lift(tests.workout('owner', '2026-01-15'), dip, 11, 0, 'working', 75) from ex;
select tests.rebuild('owner', dip) from ex;
select is((select tests.records('owner', dip) from ex), '{"2026-01-15 reps_at_load 11.000<-10.000"}', 'more bodyweight reps is a rep PR');
select tests.lift(tests.workout('owner', '2026-01-22'), dip, 8, 5, 'working', 75) from ex;
select tests.rebuild('owner', dip) from ex;
select ok((select '2026-01-22 load 5.000<-0.000' = any(tests.records('owner', dip)) from ex), 'adding weight to a bodyweight lift is a load PR');

-- Editing and isolation.
update public.workout_sets set load_kg = 50 where load_kg = 120 and exercise_id = (select squat from ex);
update public.workout_sets set load_kg = 50 where load_kg = 115 and exercise_id = (select squat from ex);
select tests.rebuild('owner', squat) from ex;
select is((select tests.records('owner', squat) from ex), '{}', 'fixing a typo removes the PR it created');

select tests.lift(tests.workout('stranger', '2026-01-01'), press, 5, 150) from ex;
select tests.rebuild('stranger', press) from ex;
select is((select tests.records('stranger', press) from ex), '{}', 'other people''s lifts are not your baseline');
select tests.lift(tests.workout('owner', '2026-01-15'), press, 5, 120) from ex;
select tests.rebuild('owner', press) from ex;
select ok((select '2026-01-15 load 120.000<-100.017' = any(tests.records('owner', press)) from ex), 'your records ignore other people''s heavier lifts');

select * from finish();
rollback;
