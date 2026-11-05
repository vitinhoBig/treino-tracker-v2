-- Who can change what. RLS silently filters UPDATE and DELETE, so those check for zero affected rows;
-- INSERT raises an error when a policy rejects it.
begin;
\ir helpers/fixtures.psql

create function tests.affected(p_persona text, p_sql text) returns bigint
language plpgsql as $$
declare v_count bigint;
begin
  perform tests.become(p_persona);
  begin
    execute p_sql;
    get diagnostics v_count = row_count;
  exception when insufficient_privilege then
    v_count := 0;
  end;
  perform tests.as_admin();
  return v_count;
end $$;
grant execute on function tests.affected(text, text) to anon, authenticated;

create function tests.denied(p_persona text, p_sql text) returns text
language plpgsql as $$
declare v_state text := 'no error';
begin
  perform tests.become(p_persona);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  perform tests.as_admin();
  return v_state;
end $$;
grant execute on function tests.denied(text, text) to anon, authenticated;

create function tests.works(p_persona text, p_sql text) returns text
language plpgsql as $$
declare v_state text := 'ok';
begin
  perform tests.become(p_persona);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate || ': ' || sqlerrm;
  end;
  perform tests.as_admin();
  return v_state;
end $$;
grant execute on function tests.works(text, text) to anon, authenticated;

create table tests.owned (tbl text, col text);
insert into tests.owned values
  ('profiles', 'display_name'), ('profile_details', 'height_cm'), ('user_sports', 'sport_id'),
  ('schedule_preferences', 'mode'), ('availability_slots', 'weekday'), ('planned_sessions', 'label'),
  ('exercises', 'name'), ('workouts', 'notes'), ('workout_sets', 'reps'), ('personal_records', 'value'),
  ('body_metrics', 'weight_kg'), ('daily_wellness', 'sleep_hours'), ('v1_weekly_aggregates', 'total_sets'),
  ('foods', 'name'), ('meals', 'notes'), ('meal_items', 'grams'), ('nutrition_targets', 'kcal'),
  ('weekly_reviews', 'payload'), ('supplements', 'name'), ('supplement_logs', 'dose'), ('experiments', 'dose'),
  ('shares', 'scope'), ('feed_events', 'payload');

-- Runs in order, as the stranger writing their own rows. Later rows depend on earlier ones.
create table tests.own_writes (ord serial, label text, stmt text, spoofed text);
insert into tests.own_writes (label, stmt, spoofed) values
  ('profile_details',
   $$insert into public.profile_details (user_id, birth_date, height_cm, experience_level, goal, target_sessions_per_week) values (%s, '2000-01-01', 170, 'beginner', 'strength', 2)$$, null),
  ('user_sports', $$insert into public.user_sports values (%s, 'test_soccer')$$, null),
  ('schedule_preferences', $$insert into public.schedule_preferences (user_id, mode) values (%s, 'fixed')$$, null),
  ('availability_slots', $$insert into public.availability_slots (user_id, weekday, start_time, end_time) values (%s, 1, '07:00', '08:00')$$, null),
  ('planned_sessions', $$insert into public.planned_sessions (user_id, planned_date, label) values (%s, '2026-11-09', 'Pull')$$, null),
  ('exercises', $$insert into public.exercises (owner_id, name) values (%s, 'My lift')$$, null),
  ('workouts', $$insert into public.workouts (id, user_id, local_date, started_at) values ('b0000000-0000-4000-8000-0000000000f1', %s, '2026-11-01', now())$$, null),
  ('workout_sets', $$insert into public.workout_sets (id, workout_id, user_id, exercise_id, exercise_order, set_number, reps) values ('c0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000f1', %s, 'e0000000-0000-4000-8000-000000000001', 0, 1, 5)$$, null),
  ('body_metrics', $$insert into public.body_metrics (user_id, measured_on, weight_kg) values (%s, '2026-11-01', 80)$$, null),
  ('daily_wellness', $$insert into public.daily_wellness (user_id, local_date) values (%s, '2026-11-01')$$, null),
  ('custom foods', $$insert into public.foods (source, owner_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g) values ('custom', %s, 'My food', 1, 1, 1, 1)$$, null),
  ('meals', $$insert into public.meals (id, user_id, local_date, eaten_at, meal_type) values ('d0000000-0000-4000-8000-0000000000f1', %s, '2026-11-01', now(), 'snack')$$, null),
  ('meal_items', $$insert into public.meal_items (id, meal_id, user_id, food_name, grams, kcal, protein_g, carbs_g, fat_g, entry_method) values ('d1000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000f1', %s, 'X', 1, 1, 1, 1, 1, 'manual')$$, null),
  ('supplements', $$insert into public.supplements (id, owner_id, name) values ('f0000000-0000-4000-8000-0000000000f1', %s, 'My supplement')$$, null),
  ('supplement_logs', $$insert into public.supplement_logs (user_id, supplement_id, taken_on, dose) values (%s, 'f0000000-0000-4000-8000-0000000000f1', '2026-11-01', 1)$$, null),
  ('experiments', $$insert into public.experiments (user_id, supplement_id, dose, baseline_start, baseline_end, start_date, metrics) values (%s, 'f0000000-0000-4000-8000-0000000000f1', 1, '2026-09-01', '2026-09-30', '2026-10-01', array['volume'])$$, null);

-- Rows that exist only to give spoofing attempts valid foreign keys are the owner's.
create table tests.read_only (label text, stmt text);
insert into tests.read_only values
  ('personal_records', $$insert into public.personal_records (user_id, exercise_id, set_id, workout_id, type, value, local_date) values (auth.uid(), 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'load', 999, '2026-11-01')$$),
  ('feed_events', $$insert into public.feed_events (actor_id, type, payload, local_date) values (auth.uid(), 'trained_today', '{}', '2026-11-01')$$),
  ('nutrition_targets', $$insert into public.nutrition_targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g) values (auth.uid(), '2026-12-01', 500, 1, 1, 1)$$),
  ('weekly_reviews', $$insert into public.weekly_reviews (user_id, week_start, payload) values (auth.uid(), '2026-12-07', '{}')$$),
  ('v1_weekly_aggregates', $$insert into public.v1_weekly_aggregates (user_id, week) values (auth.uid(), 99)$$),
  ('shares', $$insert into public.shares (owner_id, viewer_id, scope, status) values (auth.uid(), tests.uid('stranger'), 'everything', 'active')$$),
  ('catalog exercises', $$insert into public.exercises (slug, name) values ('forged', 'Forged')$$),
  ('cached foods', $$insert into public.foods (source, source_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g) values ('usda', 'forged', 'Fake 0 kcal', 0, 0, 0, 0)$$),
  ('custom row posing as usda', $$insert into public.foods (source, source_id, owner_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g) values ('usda', 'forged2', auth.uid(), 'Fake', 0, 0, 0, 0)$$),
  ('sports', $$insert into public.sports values ('forged', 'Forged')$$),
  ('muscle_groups', $$insert into public.muscle_groups values ('forged', 'Forged')$$);

select plan((
  (select count(*) from tests.owned) * 4     -- update and delete, by the top viewer and the stranger
  + (select count(*) from tests.own_writes) * 2  -- writing your own row works; spoofing someone else fails
  + (select count(*) from tests.read_only)
  + 5  -- owner blocked from read-only updates
  + 6  -- owner edits, catalog tampering, storage
  + 5  -- references to another user's custom rows
)::int);

-- Nobody else can change or delete the owner's rows, however much they can read.
select is(
  tests.affected(p.persona, format(
    'update public.%I set %I = %I where %s',
    o.tbl, o.col, o.col,
    case o.tbl when 'profiles' then 'id' when 'exercises' then 'owner_id' when 'foods' then 'owner_id'
               when 'supplements' then 'owner_id' when 'shares' then 'owner_id' when 'feed_events' then 'actor_id'
               else 'user_id' end || ' = tests.uid(''owner'')')),
  0::bigint, o.tbl || ': ' || p.persona || ' cannot update the owner''s rows')
from tests.owned o cross join (values ('viewer_e'), ('stranger')) as p(persona)
order by o.tbl, p.persona;

select is(
  tests.affected(p.persona, format(
    'delete from public.%I where %s', o.tbl,
    case o.tbl when 'profiles' then 'id' when 'exercises' then 'owner_id' when 'foods' then 'owner_id'
               when 'supplements' then 'owner_id' when 'shares' then 'owner_id' when 'feed_events' then 'actor_id'
               else 'user_id' end || ' = tests.uid(''owner'')')),
  0::bigint, o.tbl || ': ' || p.persona || ' cannot delete the owner''s rows')
from tests.owned o cross join (values ('viewer_e'), ('stranger')) as p(persona)
order by o.tbl, p.persona;

-- Policies must allow real use, not just deny everything. Then the same insert aimed at someone else fails.
select is(tests.works('stranger', format(w.stmt, 'auth.uid()')), 'ok', w.label || ': user can write their own row')
from tests.own_writes w order by w.ord;

select is(
  tests.denied('stranger', format(replace(w.stmt, 'f1''', 'f2'''), 'tests.uid(''owner'')')),
  '42501', w.label || ': user cannot write a row as someone else')
from tests.own_writes w order by w.ord;

-- Derived and shared tables reject direct writes, even from the person the row would belong to.
select is(tests.denied('owner', r.stmt), '42501', r.label || ': clients cannot insert')
from tests.read_only r order by r.label;

select is(tests.affected('owner', 'update public.personal_records set value = 999'), 0::bigint, 'owner cannot edit their PRs');
select is(tests.affected('owner', $$update public.feed_events set payload = '{"forged":true}'$$), 0::bigint, 'owner cannot edit feed events');
select is(tests.affected('owner', 'delete from public.feed_events'), 0::bigint, 'owner cannot delete feed events directly');
select is(tests.affected('owner', $$update public.shares set scope = 'workouts', status = 'revoked'$$), 0::bigint, 'shares cannot be updated directly');
select is(tests.affected('owner', 'update public.nutrition_targets set kcal = 500'), 0::bigint, 'owner cannot lower a target below its floor by editing');

select is(tests.affected('owner', $$update public.workouts set notes = 'mine' where user_id = auth.uid()$$), 2::bigint, 'owner can edit their workouts');
select is(tests.affected('owner', $$update public.profiles set display_name = 'Renamed'$$), 1::bigint, 'owner can rename only themselves');
select is(tests.affected('stranger', $$update public.exercises set name = 'Hacked' where slug = 'test_squat'$$), 0::bigint, 'users cannot edit the catalog');
select is(tests.denied('stranger', $$update public.profiles set id = tests.uid('owner') where id = auth.uid()$$), '42501', 'a profile cannot be re-pointed at another user');
select is(tests.works('stranger', $$insert into storage.objects (bucket_id, name) values ('food-photos', auth.uid()::text || '/mine.jpg')$$), 'ok', 'user can upload to their own photo folder');
select is(tests.denied('stranger', $$insert into storage.objects (bucket_id, name) values ('food-photos', tests.uid('owner')::text || '/planted.jpg')$$), '42501', 'user cannot upload to someone else''s photo folder');

-- Foreign keys ignore RLS, so policies must stop a viewer from referencing rows they can read but
-- don't own. Otherwise they could block the owner from ever deleting that exercise or their account.
select tests.as_admin();
insert into public.workouts (id, user_id, local_date, started_at) values ('b0000000-0000-4000-8000-0000000000e1', tests.uid('viewer_e'), '2026-11-01', now());
insert into public.exercises (id, owner_id, name) values ('e0000000-0000-4000-8000-0000000000e1', tests.uid('viewer_e'), 'Viewer custom lift');

select is(tests.denied('viewer_e', $$insert into public.workout_sets (id, workout_id, user_id, exercise_id, exercise_order, set_number, reps) values (gen_random_uuid(), 'b0000000-0000-4000-8000-0000000000e1', auth.uid(), 'e0000000-0000-4000-8000-000000000002', 0, 1, 5)$$), '42501', 'viewer cannot log sets on the owner''s custom exercise');
select is(tests.works('viewer_e', $$insert into public.workout_sets (id, workout_id, user_id, exercise_id, exercise_order, set_number, reps) values (gen_random_uuid(), 'b0000000-0000-4000-8000-0000000000e1', auth.uid(), 'e0000000-0000-4000-8000-0000000000e1', 0, 2, 5)$$), 'ok', 'user can log sets on their own custom exercise');
select is(tests.denied('viewer_e', $$insert into public.supplement_logs (user_id, supplement_id, taken_on, dose) values (auth.uid(), 'f0000000-0000-4000-8000-000000000001', '2026-11-01', 1)$$), '42501', 'viewer cannot log the owner''s custom supplement');
select is(tests.denied('viewer_e', $$insert into public.experiments (user_id, supplement_id, dose, baseline_start, baseline_end, start_date, metrics) values (auth.uid(), 'f0000000-0000-4000-8000-000000000001', 1, '2026-09-01', '2026-09-30', '2026-10-01', array['volume'])$$), '42501', 'viewer cannot run an experiment on the owner''s supplement');
select is(tests.denied('viewer_e', $$update public.workout_sets set exercise_id = 'e0000000-0000-4000-8000-000000000002' where user_id = auth.uid()$$), '42501', 'viewer cannot re-point an existing set at the owner''s exercise');

select * from finish();
rollback;
