#!/usr/bin/env bash
# Proves the body weight masking tests can fail. Each check breaks one protection in the local database,
# confirms the pgTAP suite notices, then rebuilds the database from migrations.
#
# Run from the repo root with local Supabase running. It RESETS the local database, so never point it at
# anything else. It exits non-zero if any break goes unnoticed.
set -uo pipefail

CONTAINER="supabase_db_treino-tracker-v2"
psql_local() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1; }
reset_db() { npx supabase db reset >/dev/null 2>&1; }
run_tests() { npx supabase test db 2>&1; }

# Rewrites a function in place. Fails if the text isn't found, so a stale pattern can't look like a pass.
break_function() {
  cat <<SQL
do \$m\$
declare
  d text := pg_get_functiondef('$1'::regprocedure);
  o text := \$o\$$2\$o\$;
begin
  if position(o in d) = 0 then raise exception 'pattern not found: %', o; end if;
  execute replace(d, o, \$n\$$3\$n\$);
end \$m\$;
SQL
}

# Rewrites the private view the same way. Patterns match Postgres's normalized view text.
break_view() {
  cat <<SQL
do \$m\$
declare
  d text := pg_get_viewdef('private.counted_sets'::regclass);
  o text := \$o\$$1\$o\$;
begin
  if position(o in d) = 0 then raise exception 'pattern not found: %', o; end if;
  execute 'create or replace view private.counted_sets as ' || replace(d, o, \$n\$$2\$n\$);
end \$m\$;
SQL
}

SETS='public.get_shared_sets(uuid,uuid,date,date)'
caught=0
missed=0
invalid=0

check() {
  local name="$1" sql="$2" out
  reset_db
  if ! echo "$sql" | psql_local >/dev/null 2>/tmp/break.err; then
    echo "INVALID  $name: $(grep -m1 -E 'ERROR' /tmp/break.err | cut -c1-110)"
    invalid=$((invalid + 1))
    return
  fi
  out="$(run_tests)"
  if echo "$out" | grep -q '^Result: FAIL'; then
    echo "caught   $name  <- $(echo "$out" | grep -E '^# Failed test' | head -1 | cut -d'"' -f2 | cut -c1-70)"
    caught=$((caught + 1))
  else
    echo "MISSED   $name"
    missed=$((missed + 1))
  fi
}

# A failing baseline would make every break below look "caught".
reset_db
if ! run_tests | grep -q '^Result: PASS'; then
  echo "The suite must pass before breaks mean anything. Fix it first." >&2
  exit 2
fi
echo "baseline passes"

check "viewers get direct table access back" \
  "create policy broken on public.workout_sets for select to authenticated using (public.can_view(user_id, 'workouts'));"
check "workouts tier counts as body access" \
  "$(break_function "$SETS" "public.can_view(p_owner, 'workouts_and_body') as can_see_body" "public.can_view(p_owner, 'workouts') as can_see_body")"
check "bodyweight_kg left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.bodyweight_kg end" "s.bodyweight_kg")"
check "effective load left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.effective_load_kg end" "s.effective_load_kg")"
check "volume left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.volume_kg end" "s.volume_kg")"
check "e1RM left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.e1rm_kg end" "s.e1rm_kg")"
check "typed load left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.entered_load end" "s.entered_load")"
check "typed unit left unmasked" \
  "$(break_function "$SETS" "case when m.masked then null else s.entered_unit end" "s.entered_unit")"
check "snapshots on external lifts not masked" \
  "$(break_function "$SETS" "(e.load_type = 'bodyweight' or s.bodyweight_kg is not null) and not a.can_see_body" "e.load_type = 'bodyweight' and not a.can_see_body")"
check "external lifts masked too" \
  "$(break_function "$SETS" "(e.load_type = 'bodyweight' or s.bodyweight_kg is not null) and not a.can_see_body" "not a.can_see_body")"
check "owners masked from their own data" \
  "$(break_function "$SETS" "public.can_view(p_owner, 'workouts_and_body') as can_see_body" "false as can_see_body")"
check "no access check at all" \
  "$(break_function "$SETS" "where a.can_read
    and" "where true
    and")"
check "owner filter removed" \
  "$(break_function "$SETS" "and s.user_id = p_owner" "")"
check "unfinished workouts included" \
  "$(break_function "$SETS" "and w.status = 'completed'" "")"
check "workout filter ignored" \
  "$(break_function "$SETS" "and (p_workout_id is null or s.workout_id = p_workout_id)" "")"
check "date filter ignored" \
  "$(break_function "$SETS" "and (p_from is null or w.local_date >= p_from)" "")"
check "anon can call get_shared_sets" \
  "grant execute on function $SETS to anon;"
check "function runs with caller's rights" \
  "alter function $SETS security invoker;"
check "records use e1RM that includes body weight" \
  "$(break_view "WHEN (s.bodyweight_kg IS NULL) THEN s.e1rm_kg" "WHEN true THEN s.e1rm_kg")"
check "records compare load including body weight" \
  "$(break_view "WHEN ((e.load_type = 'bodyweight'::load_type) OR (s.bodyweight_kg IS NOT NULL)) THEN s.load_kg" "WHEN (e.load_type = 'bodyweight'::load_type) THEN s.load_kg")"
check "feed shows the typed load on bodyweight sets" \
  "$(break_view "WHEN ((e.load_type = 'external'::load_type) AND (s.bodyweight_kg IS NULL)) THEN s.entered_load" "WHEN true THEN s.entered_load")"
check "feed shows the typed unit on bodyweight sets" \
  "$(break_view "WHEN ((e.load_type = 'external'::load_type) AND (s.bodyweight_kg IS NULL)) THEN s.entered_unit" "WHEN true THEN s.entered_unit")"

reset_db
echo "caught: $caught, missed: $missed, invalid: $invalid"
[ "$missed" -eq 0 ] && [ "$invalid" -eq 0 ]
