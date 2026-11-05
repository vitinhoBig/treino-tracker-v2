-- The sharing lifecycle: invite, accept, change scope, revoke.
begin;
\ir helpers/fixtures.psql

select plan(24);

-- Scratch space for tokens, since each step runs as a different role.
create table tests.vars (key text primary key, value text);
grant all on tests.vars to authenticated;

select tests.as_user('stranger');
insert into tests.vars
  select 'token', public.create_share_invite('workouts');
insert into tests.vars
  select 'token_everything', public.create_share_invite('everything');
select tests.as_admin();

select is(
  (select count(*)::int from public.shares where invite_token_hash = (select value from tests.vars where key = 'token')),
  0, 'the raw invite token is never stored');
select is(
  (select count(*)::int from public.shares where invite_token_hash = encode(sha256(convert_to((select value from tests.vars where key = 'token'), 'UTF8')), 'hex')),
  1, 'only the token hash is stored');
select ok(
  (select bool_and(invite_expires_at between now() + interval '6 days' and now() + interval '8 days') from public.shares where owner_id = tests.uid('stranger')),
  'invites expire after about 7 days');

-- A pending invite grants nothing.
select tests.as_user('owner');
select is((select count(*)::int from public.workouts where user_id = tests.uid('stranger')), 0, 'a pending invite gives no access');
select is((select count(*)::int from public.profiles where id = tests.uid('stranger')), 0, 'a pending invite does not reveal names');

select throws_ok(format('select public.accept_share(%L)', 'not-a-real-token'), 'PT404', null, 'a bad token is rejected');

select tests.as_user('stranger');
select throws_ok(format('select public.accept_share(%L)', (select value from tests.vars where key = 'token')), 'PT404', null, 'owners cannot accept their own invite');

-- Accepting creates the link, so the stranger's data becomes visible at that scope.
select tests.as_admin();
insert into public.workouts (id, user_id, local_date, started_at, status) values ('b0000000-0000-4000-8000-0000000000a1', tests.uid('stranger'), '2026-11-01', now(), 'completed');
insert into public.body_metrics (user_id, measured_on, weight_kg) values (tests.uid('stranger'), '2026-11-01', 80);

select tests.as_user('owner');
insert into tests.vars select 'share', public.accept_share((select value from tests.vars where key = 'token'))::text;
select is((select count(*)::int from public.workouts where user_id = tests.uid('stranger')), 1, 'accepting grants workouts');
select is((select count(*)::int from public.body_metrics where user_id = tests.uid('stranger')), 0, 'the scope is respected');
select is((select count(*)::int from public.profiles where id = tests.uid('stranger')), 1, 'viewer sees the sharer''s name');
select throws_ok(format('select public.accept_share(%L)', (select value from tests.vars where key = 'token')), 'PT404', null, 'a token works only once');

-- A second invite between the same pair can't create a duplicate active share.
select throws_ok(format('select public.accept_share(%L)', (select value from tests.vars where key = 'token_everything')), '23505', null, 'one active share per pair');

select tests.as_user('stranger');
select is((select count(*)::int from public.profiles where id = tests.uid('owner')), 1, 'sharer sees the viewer''s name');

-- Viewers can't widen their own access.
select tests.as_user('owner');
select throws_ok(format($$select public.update_share_scope(%L, 'everything')$$, (select value from tests.vars where key = 'share')), 'PT404', null, 'viewers cannot raise their own scope');

select tests.as_user('viewer_e');
select throws_ok(format($$select public.update_share_scope(%L, 'everything')$$, (select value from tests.vars where key = 'share')), 'PT404', null, 'outsiders cannot change a share');
select throws_ok(format('select public.revoke_share(%L)', (select value from tests.vars where key = 'share')), 'PT404', null, 'outsiders cannot revoke a share');

-- Scope changes apply on the very next query.
select tests.as_user('stranger');
select lives_ok(format($$select public.update_share_scope(%L, 'workouts_and_body')$$, (select value from tests.vars where key = 'share')), 'sharer can raise the scope');
select tests.as_user('owner');
select is((select count(*)::int from public.body_metrics where user_id = tests.uid('stranger')), 1, 'a wider scope applies immediately');

-- Revoking cuts off everything at once, and a revoked share can't be revived.
select tests.as_user('stranger');
select lives_ok(format('select public.revoke_share(%L)', (select value from tests.vars where key = 'share')), 'sharer can revoke');
select throws_ok(format($$select public.update_share_scope(%L, 'everything')$$, (select value from tests.vars where key = 'share')), 'PT404', null, 'a revoked share cannot be changed');
select tests.as_user('owner');
select is((select count(*)::int from public.workouts where user_id = tests.uid('stranger')), 0, 'revoking removes data immediately');
select is((select count(*)::int from public.profiles where id = tests.uid('stranger')), 0, 'revoking removes the name too');

-- A viewer can leave on their own.
select tests.as_user('viewer_w');
select lives_ok(format('select public.revoke_share(%L)', (select id from public.shares where viewer_id = tests.uid('viewer_w'))), 'viewer can stop viewing');
select is((select count(*)::int from public.workouts where user_id = tests.uid('owner')), 0, 'leaving removes access');

select * from finish();
rollback;
