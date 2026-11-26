# Roadmap

Each phase ends with a working, demonstrable app. A phase is done when its exit check passes. Each checkbox is
roughly one conventional commit or a small series of them, and each module gets 1–2 `TODO(victor):` items.

## Phase 0: Planning

- [x] `CLAUDE.md`
- [x] `docs/PRODUCT_SPEC.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATA_MODEL.md`, with schema and RLS tested on a throwaway Postgres
- [x] `docs/ROADMAP.md`
- [x] Victor approves the plan

## MVP

**Foundations**

- [x] Monorepo scaffold: `apps/mobile`, `services/api`, `supabase/`, `.gitignore`, `.env.example`
- [x] Local Supabase running, with the schema as migrations
- [x] RLS test suite in pgTAP, ported from the Phase 0 checks
- [x] CI: lint and tests for client, API and database on every push
- [x] FastAPI skeleton: `/health`, JWT verification, error format
- [x] CI runs the API integration tests against a local Supabase
- [x] Expo skeleton: routing with signed-in and signed-out route groups, TanStack Query, i18n (English, Brazilian
  Portuguese), secure session storage. Running it on a phone: [MOBILE.md](MOBILE.md)
- [ ] Unit formatting: kg and lb display that shows the entered value (split out of the skeleton, not built yet)

**Onboarding and profile**

- [x] Sign up, sign in and sign out. Automated tests pass; the phone checklist in [MOBILE.md](MOBILE.md) is still to run
- [ ] Onboarding questionnaire with the 13+ gate
- [ ] Profile editing, including units and language
- [ ] Permanent account deletion, including stored files, which database cascades don't reach

**Exercise catalog**

- [ ] Seed muscle groups and exercises, covering everything in v1
- [ ] Search, filter and custom exercises

**Workout logging**

- [ ] Log per set, with exercise, reps, load and optional RPE
- [ ] Prefill from last session
- [ ] Rest timer
- [ ] Unilateral, warm-up and bodyweight handling
- [ ] Local draft that survives no signal and an app restart
- [x] `finish_workout` with PR detection and pgTAP tests
- [ ] Live PR preview, tested against the shared e1RM fixture
- [ ] Editing and deleting past workouts, with PR recompute

**Progress**

- [ ] Port v1 analytics to `services/api/app/analytics`, with tests
- [ ] Volume per muscle group per week
- [ ] e1RM trend per exercise
- [ ] Consistency: completed vs weekly target, and streak

**Sharing**

- [ ] Invite link, accept and revoke
- [ ] "Trained today" feed event with best-lift selection
- [ ] Viewer feed screen
- [ ] Read other people's sets only through `get_shared_sets`, and show masked values as hidden

**v1 import**

- [ ] Exercise mapping file, reviewed by Victor
- [ ] `services/api/scripts/import_v1.py`, with `--dry-run`, and tests
- [ ] Import real data and check totals week by week

**Known gaps** (found while building, not yet scheduled)

- The OpenAPI docs show FastAPI's default 422 shape, not our `{"error": ...}` format.
- A missing `SUPABASE_URL` only fails on the first protected request. It should fail at startup (deploy work).
- Nothing checks that the error-code table in `docs/API_ERRORS.md` matches the codes in the API. A test should.
- Deleting an account must also remove stored files, which database cascades don't reach. See the account deletion item.
- A cold-start deep link to an `(app)` route is lost: while the stored session loads the guard counts the user as signed
  out and redirects, and nothing restores the link once the session arrives. Only `/` exists today, so nothing breaks yet.
- No dark mode: screens use fixed light colors, so a phone in dark mode still shows white screens.
- The home screen's **Try again** shows one message for every error, so being offline looks the same as being refused
  (the screen doesn't read the error code yet).
- `query-provider.test.tsx` keeps its own copy of the provider setup that `src/test-support/app-providers.tsx` now
  provides, so the two can drift apart.
- `query-provider.test.tsx` sometimes prints a "not wrapped in act(...)" warning, which means a state update lands
  after a test step finished. Harmless today, but it can hide a real one.
- A 429 (rate limit) on a token refresh counts as "refused" and signs the user out, because supabase-js drops the
  session for every refresh error except network and 5xx ones and the app follows it. To be covered by the security
  review.

**Exit check:** Victor logs a real gym session on a phone, including a stretch in airplane mode. A PR appears, an
invited viewer sees the correct feed line, and revoking access removes it. Charts show the 16 imported weeks.

## Phase 2: Plan and eat

- [ ] Sports sessions in logging
- [ ] Schedule modes: fixed, flexible and custom
- [ ] Weekly split suggestions from a tested rule table
- [ ] Rescheduling after a missed session
- [ ] Planned vs completed consistency
- [ ] Weak points: stalled lifts, undertrained muscles and push/pull imbalance
- [ ] Multiple viewers and all three sharing scopes in the UI
- [ ] Food search through USDA, with caching
- [ ] Barcode logging through Open Food Facts
- [ ] Meal logging with per-meal and daily totals
- [ ] Weekly review with one concrete suggestion

**Exit check:** a full real week runs through the app, from plan to review, and the suggestion points to specific data.

## Phase 3: Adapt

- [ ] Photo food logging with consent, strict schema and USDA matching
- [ ] Labeled photo set to measure recognition quality
- [ ] Calorie and macro targets from profile and goal
- [ ] Guardrail test suite: calorie floor, loss-rate flag, under-18 and underweight rules
- [ ] Weekly target adjustment from weight trend vs intake
- [ ] Supplement experiments with baseline comparison and honest verdicts
- [ ] "Not medical advice" on all nutrition and supplement screens

**Exit check:** every guardrail has a test that fails if it is removed. Victor's creatine experiment produces a verdict
with its limits stated, using data logged in v2.

## Phase 4: Ship

- [ ] Notifications: planned sessions and weekly review
- [ ] Kudos on feed events
- [ ] Performance and accessibility pass, plus full Portuguese review
- [ ] Deploy the API to a managed host, with error monitoring
- [ ] Production Supabase project, with backups confirmed
- [ ] Expo EAS builds for iOS and Android
- [ ] Privacy policy, and the open items in `PRODUCT_SPEC.md` if going public
- [ ] Portfolio README with screenshots and an architecture summary

**Exit check:** someone outside the project installs the app from a build link and logs a workout with no help.
