-- Invite edge cases, and access for callers who aren't signed in.
begin;
\ir helpers/fixtures.psql

select plan(7);

select tests.as_admin();
insert into public.shares (owner_id, scope, invite_token_hash, invite_expires_at)
values (tests.uid('owner'), 'workouts', encode(sha256(convert_to('expired-token', 'UTF8')), 'hex'), now() - interval '1 day');

select tests.as_user('stranger');
select throws_ok($$select public.accept_share('expired-token')$$, 'P0002', null, 'an expired invite is rejected');

select tests.as_anon();
select throws_ok($$select public.create_share_invite('workouts')$$, '42501', null, 'anon cannot create invites');
select throws_ok($$select public.accept_share('x')$$, '42501', null, 'anon cannot accept invites');
select throws_ok($$select public.revoke_share('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'anon cannot revoke');
select throws_ok($$select public.can_view(tests.uid('owner'), 'workouts')$$, '42501', null, 'anon cannot probe can_view');
select throws_ok($$select public.is_connected(tests.uid('owner'))$$, '42501', null, 'anon cannot probe is_connected');

select tests.as_user('stranger');
select is(public.can_view(tests.uid('owner'), 'workouts'), false, 'can_view is false with no share');

-- TODO(victor): Add a test that can_view is true when the owner checks their own data.
-- Hint: run tests.as_user('owner'), then copy the is(...) above. Change plan(7) to plan(8).

select * from finish();
rollback;
