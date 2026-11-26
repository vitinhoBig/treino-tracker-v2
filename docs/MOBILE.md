# Running the app on a phone

How to run the Expo app on a real phone against the services on your laptop, and a checklist for trying the sign-in
work by hand. Commands run from the repo root unless a step says otherwise.

## What you need

- The phone and the laptop on the same Wi-Fi network. Guest networks often block devices from reaching each other.
- Expo Go on the phone, from the App Store or Google Play.
- Docker running on the laptop, for local Supabase.

## 1. Start the services

```bash
npx supabase start
```

```bash
uv --directory services/api run fastapi dev app/main.py --host 0.0.0.0
```

```bash
npm --prefix apps/mobile start
```

Scan the QR code with the phone's camera (iOS) or with Expo Go (Android).

**Why `--host 0.0.0.0` for the API.** `fastapi dev` listens on `127.0.0.1` by default, which accepts connections from
the laptop only. `0.0.0.0` accepts them from the network too, so the phone can reach it. Local Supabase needs nothing
extra: Docker publishes it on every address (`0.0.0.0:54321`). The first time, macOS may ask whether Python or Node may
accept incoming connections. Allow it, or the phone gets no answer.

Stop Supabase with `npx supabase stop` when you are done, to free its containers.

## 2. The `.env` files

### `apps/mobile/.env`

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the publishable key that `npx supabase status` prints. **Leave both
URLs as `http://127.0.0.1:…`.**

On a phone, `127.0.0.1` means the phone itself, not your laptop. You don't have to type your laptop's address, because
`src/lib/config.ts` swaps it in. In a development build it replaces a `127.0.0.1` or `localhost` host with the address
Metro reports for the laptop, such as `192.168.1.20`, and keeps the port and path. It does that only when Metro's
address is an IPv4 address, which is the default LAN mode.

The swap does not happen with `npx expo start --tunnel` (Metro's address is then a domain name, and the tunnel only
reaches Metro, not Supabase or the API), or in a production build. If you ever need the addresses by hand, find the
laptop's address with `ipconfig getifaddr en0` and write it in:

```text
EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.20:54321
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```

Expo copies these values into the bundle when it builds it, so after changing `.env` restart with
`npm --prefix apps/mobile start -- --clear`.

### `services/api/.env`

```bash
cp services/api/.env.example services/api/.env
```

**Keep `SUPABASE_URL=http://127.0.0.1:54321` here, even though the phone reaches Supabase at the LAN address.** The
API compares each token's issuer with this URL, and local Supabase always writes its own configured address as the
issuer. A user who signed up through `http://192.168.87.214:54321` still got a token with
`iss: http://127.0.0.1:54321/auth/v1` (checked on 2026-11-25). Changing this value to the LAN address would make every
token fail with `invalid_token`.

## 3. When `apps/mobile/.env` is missing

The app reads its configuration the first time it needs Supabase, which is right after the first screen renders. With
a variable missing, `getConfig()` throws a `ConfigError` that names it and never prints a value:

```text
ConfigError: EXPO_PUBLIC_SUPABASE_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env.
```

What you see:

- **In a web browser** (checked): a blank white page. The error appears only in the browser's developer console.
- **On a phone in development** (not yet checked on a device): React Native's red error screen with the same message,
  and the same error in the terminal running Metro.
- **In a production build:** the app would close on start. Builds for the stores come in Phase 4.

The same error appears, with its own message, if the key is a secret key (`sb_secret_…`). Secret keys must never ship
inside the app.

To see it on purpose:

```bash
mv apps/mobile/.env apps/mobile/.env.off
```

```bash
npm --prefix apps/mobile start -- --clear
```

Open the app, read the error, then put the file back and restart with `--clear` again:

```bash
mv apps/mobile/.env.off apps/mobile/.env
```

## 4. Phone checklist

Use a fresh, made-up address for each sign-up, such as `victor+1@example.com`. Local Supabase sends no real email:
every message lands in Mailpit, at <http://127.0.0.1:54324> on the laptop. Locally, email confirmation is off, so a
sign-up signs you in straight away. Step 3 turns it on for a while.

1. **Signed out.** Open the app. You see the **Sign in** screen.
2. **Sign up.** Tap **New here? Create an account**. Try the password `abc` first: you see "That password is too weak.
   Use at least 6 characters." Then use a 6+ character password. You land on the home screen.
3. **The check-email screen.** In `supabase/config.toml`, under `[auth.email]`, set `enable_confirmations = true`, then
   restart Supabase:

   ```bash
   npx supabase stop && npx supabase start
   ```

   Sign out, sign up with a new address, and you see **Check your email**, naming the address. Try signing in with it
   now: you see "Confirm your email first. The link is in your inbox." Open Mailpit on the laptop, open the message
   and click the link. The page it ends on (`http://127.0.0.1:3000`) shows nothing, which is expected: the address is
   confirmed anyway. Sign in on the phone, and you land on the home screen. Then undo the change and restart Supabase:

   ```bash
   git checkout supabase/config.toml && npx supabase stop && npx supabase start
   ```

4. **Home shows the ID.** The home screen shows "Hello, treino-tracker", today's date and "Your account id: …" with a
   UUID. In Supabase Studio (<http://127.0.0.1:54323>), Authentication → Users shows the same ID for that email.
5. **Sign out.** Tap **Sign out**. You are back on **Sign in**. Close the app completely and open it again: still
   signed out.
6. **Sign in.** A wrong password shows "That email and password don't match. Check them and try again." The right one
   takes you home. Close the app completely and open it: you go straight to home, with no sign-in screen flashing past
   (the splash screen stays up until the stored session has loaded).
7. **No network.** Sign out. Turn on airplane mode, and **check that Wi-Fi is off too** (an iPhone keeps Wi-Fi on in
   airplane mode if you used it there before). Try to sign in. You see "We can't reach the server. Check your connection
   and try again." Turn the network back on.
8. **Airplane mode during a token refresh must not sign you out.** Follow [the section below](#airplane-mode-during-a-token-refresh).
9. **Language.** The app picks its language from the phone's language when it starts.
   - iPhone: Settings → General → Language & Region → iPhone Language → Português (Brasil).
   - Android: Settings → System → Languages → put Português (Brasil) first.

   Close Expo Go completely and open the project again. You see **Entrar**, **Novo por aqui? Crie sua conta**, and on
   home **Olá, treino-tracker**, "O ID da sua conta: …" and **Sair**. Switch back to English the same way and check
   that the English text returns.

If anything differs, note the step, what you saw and the time. For auth problems, `docker logs supabase_auth_treino-tracker-v2`
shows what Supabase Auth did.

## Airplane mode during a token refresh

### What this tests, and what it can't

An access token lasts an hour. supabase-js refreshes it on a timer while the app is in the foreground (the app starts
and stops the timer with the app state). The timer checks every 30 seconds and refreshes once less than 90 seconds are
left. After a failed refresh it waits 60 seconds before trying again.

This walk-through exercises **two paths**:

- **supabase-js's own refresh timer** failing because there is no network. The library keeps the stored session after
  a network failure, so the app must stay signed in.
- **Reading the access token** (`getAccessToken`, when you tap **Try again**) after the token has expired with no
  network. The library tries to refresh first, can't, and the app must report a network error, not "signed out".

It does **not** exercise the API client's own refresh, the one that runs when our API answers `token_expired` and the
refresh then can't reach Supabase (the `unavailable` result in [API_AUTH.md](API_AUTH.md#when-the-refresh-fails)). By
hand you can't make the API reachable while Supabase is not, because both run on the same laptop, and the app refreshes
ahead of expiry, so the API rarely sees an expired token at all. These are covered only by automated tests:

- that path: `api-client.test.ts`, the `token_expired` tests
- a 5xx from Supabase during a refresh, and the three refresh results: `session.test.tsx`, "tokens for the API client"
- the 15-second request timeout: `api-client.test.ts`, `timeout`

### Steps

1. **Shorten the token lifetime.** In `supabase/config.toml`, under `[auth]`, change `jwt_expiry = 3600` to
   `jwt_expiry = 120`, then restart Supabase:

   ```bash
   npx supabase stop && npx supabase start
   ```

   A token now lasts 2 minutes, so the timer refreshes about 30 seconds after you sign in, and then every 30 seconds.
2. **Get a short token.** On the phone, sign out and sign in again (tokens issued before the change keep their hour).
   Home shows your ID.
3. **Watch refreshes happen.** In Supabase Studio, open the SQL editor and run this, with your email:

   ```sql
   select created_at, revoked
   from auth.refresh_tokens
   where user_id = (select id from auth.users where email = 'victor+1@example.com')
   order by created_at desc
   limit 5;
   ```

   Each refresh adds a row and revokes the previous one. Run it again after a minute: there are new rows, and exactly
   one has `revoked = false`.
4. **Go offline.** Turn on airplane mode, with Wi-Fi off. **Keep the app open on the home screen** for at least 3
   minutes, longer than the token's lifetime.
5. **What you should see while offline:**
   - The app stays on the home screen, and your ID is still shown (it was already loaded).
   - It never jumps to the sign-in screen.
   - Tap **Try again**: you see "We couldn't load your account." and stay on home.
   - In Studio on the laptop, the query in step 3 shows no new rows.
6. **Go back online.** Turn airplane mode off. Within about a minute the timer refreshes (a new row in step 3's query).
   Tap **Try again**: your ID comes back. You were never asked to sign in.
7. **Fail condition.** If the sign-in screen appears at any point during steps 4 to 6, that is a bug. Note the time and
   save `docker logs supabase_auth_treino-tracker-v2`.
8. **Restore the token lifetime**, and restart Supabase:

   ```bash
   git checkout supabase/config.toml && npx supabase stop && npx supabase start
   ```

**Optional: the opposite case.** A refresh that Supabase *refuses* must sign you out. With the short lifetime still on
and the app on home, run `delete from auth.sessions where user_id = '<your id>';` in Studio. At the next refresh
(within about a minute) Supabase refuses the refresh token, and the app should go to the sign-in screen by itself.
