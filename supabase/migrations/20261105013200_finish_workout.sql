-- The two functions clients call. finish_workout completes a workout, updates records and publishes the
-- feed event in one transaction. recompute_prs repairs records after a finished set is edited or deleted.

create function private.feed_payload(p_workout uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'workout_type', w.type,
    'sport_id', w.sport_id,
    'best_lift', private.best_lift(w.id),
    'pr_count', (
      select count(distinct r.exercise_id)
      from public.personal_records r
      join public.exercises e on e.id = r.exercise_id
      where r.workout_id = w.id
        and (r.type = 'e1rm' or (r.type = 'load' and e.load_type = 'bodyweight'))
    )
  )
  from public.workouts w
  where w.id = p_workout;
$$;

-- The user's current date. A bad timezone must not stop someone finishing a workout, so it falls back to UTC.
create function private.user_today(p_user uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text;
begin
  select timezone into v_timezone from public.profiles where id = p_user;
  return (now() at time zone v_timezone)::date;
exception when others then
  return (now() at time zone 'UTC')::date;
end $$;

-- Changing an exercise's records can change what any feed event should say. This only updates events
-- that already exist: editing history never announces anything new.
create function private.refresh_feed_events(p_user uuid, p_exercises uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.feed_events f
  set payload = private.feed_payload(f.workout_id)
  where f.actor_id = p_user
    and f.workout_id is not null
    and (
      f.payload -> 'best_lift' ->> 'exercise_id' = any (select x::text from unnest(p_exercises) as x)
      or exists (
        select 1 from public.workout_sets s
        where s.workout_id = f.workout_id and s.exercise_id = any (p_exercises)
      )
    );
$$;

create function public.finish_workout(p_workout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_workout public.workouts;
  v_exercises uuid[];
  v_exercise uuid;
  v_today date;
  v_has_sets boolean;
  v_shared boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Rebuilds delete and re-insert rows, so a retry racing the original request must wait its turn.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- The same error for "doesn't exist" and "not yours", so this can't be used to probe for workouts.
  update public.workouts w
  set status = 'completed',
      -- Keeps the first finish time on retries. A phone clock running ahead of the server can make
      -- started_at later than now, which the table's check constraint would reject.
      ended_at = coalesce(w.ended_at, greatest(now(), w.started_at))
  where w.id = p_workout_id and w.user_id = v_user
  returning w.* into v_workout;
  if not found then
    raise exception 'workout not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct s.exercise_id), '{}') into v_exercises
  from public.workout_sets s
  where s.workout_id = p_workout_id;

  foreach v_exercise in array v_exercises loop
    perform private.rebuild_prs(v_user, v_exercise);
  end loop;
  perform private.refresh_feed_events(v_user, v_exercises);

  -- Publish only when someone can see it, it really is about today, and there's something to report.
  -- Timezones can put local_date a day either side of the server's idea of the user's today.
  v_today := private.user_today(v_user);
  select exists (select 1 from private.counted_sets c where c.workout_id = p_workout_id) into v_has_sets;
  select exists (select 1 from public.shares s where s.owner_id = v_user and s.status = 'active') into v_shared;

  if v_shared
     and v_workout.source = 'app'
     and v_workout.local_date between v_today - 1 and v_today + 1
     and (v_has_sets or v_workout.type = 'sport') then
    insert into public.feed_events (actor_id, type, workout_id, required_scope, payload, local_date)
    values (v_user, 'trained_today', p_workout_id, 'workouts', private.feed_payload(p_workout_id), v_workout.local_date)
    on conflict (workout_id, type) do update set payload = excluded.payload;
  end if;

  return jsonb_build_object(
    'workout_id', p_workout_id,
    'best_lift', private.best_lift(p_workout_id),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', r.exercise_id, 'set_id', r.set_id, 'type', r.type,
        'value', r.value, 'previous_value', r.previous_value
      ) order by r.exercise_id, r.type)
      from public.personal_records r
      where r.workout_id = p_workout_id
    ), '[]'::jsonb),
    'published', exists (
      select 1 from public.feed_events f where f.workout_id = p_workout_id and f.type = 'trained_today'
    )
  );
end $$;

-- Call after editing or deleting a finished set. Only ever touches the caller's own records.
-- Returns how many records the exercise now has.
create function public.recompute_prs(p_exercise_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_count := private.rebuild_prs(v_user, p_exercise_id);
  perform private.refresh_feed_events(v_user, array[p_exercise_id]);
  return v_count;
end $$;

revoke all on function public.finish_workout(uuid) from public, anon;
revoke all on function public.recompute_prs(uuid) from public, anon;
grant execute on function public.finish_workout(uuid) to authenticated;
grant execute on function public.recompute_prs(uuid) to authenticated;
