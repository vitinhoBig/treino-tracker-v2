# API authentication

How the FastAPI service decides who is calling. The code is in `services/api/app/auth.py` (checks) and
`app/jwks.py` (signing-key cache). Verifying a token only tells the API **who** is calling. What that person may read
is still decided by RLS, because the API forwards the same token to Supabase (see
[ARCHITECTURE.md](ARCHITECTURE.md#authorization-lives-only-in-the-database)).

## Use it in a route

```python
from app.auth import AUTH_RESPONSES, CurrentUser

router = APIRouter(prefix="/v1", responses=AUTH_RESPONSES)   # Lists the 401/403/503 errors in /docs


@router.get("/me")
def me(user: CurrentUser) -> Me:        # user.id is a UUID; user.token is what gets forwarded to Supabase
    ...
```

Routes without `CurrentUser` are public. Today that is only `/health`.

## What is checked

The client sends `Authorization: Bearer <access token>`, the token Supabase Auth issued at sign-in. A token is accepted
only if all of this holds, checked in this order:

1. It is a well-formed JWT whose header `alg` is one of **ES256, RS256 or EdDSA**, and which names a key id (`kid`).
2. Supabase publishes a key with that `kid`, at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, and the key's own
   algorithm equals the token's.
3. The signature verifies against that public key.
4. `exp`, `iss`, `aud` and `sub` are present. `iss` is `<SUPABASE_URL>/auth/v1`, `aud` is `authenticated`, `exp`
   (and `nbf` or `iat`, if present) is valid within the leeway below.
5. `role` is `authenticated` and `sub` is a UUID.
6. The account is not an anonymous sign-in (`is_anonymous` is not `true`). This is a product decision: anonymous
   users get a 403 `anonymous_user`.

Steps 1 and 2 happen *before* any verification, so a token cannot choose its own rules.

`SUPABASE_URL` must be written exactly as the stack reports it (`http://127.0.0.1:54321` locally, not `localhost`),
because tokens carry that string as their issuer.

## Which algorithms, and why

The accepted algorithms all work with a key pair: Supabase signs with a private key that never leaves it, and
publishes the matching public key in the JWKS. The API fetches those keys, caches them for 10 minutes, refetches at
most once every 30 seconds when it sees an unknown `kid` (so garbage tokens can't make us hammer Supabase), and keeps
serving the last good keys for up to 24 hours if Supabase is unreachable. Keys of any other type in the JWKS are ignored.

### Why HS256 is refused

HS256 is symmetric: the same secret both signs and verifies a token, so Supabase and this API would have to share it. If that secret ever leaked from the API server, an attacker could forge a valid token for any user. It also enables an algorithm-confusion attack: since the public key is public, an attacker can sign a token with HS256 using that public key as the secret, and a server that trusts the token's own `alg` header would verify it with the same key and accept it. By requiring asymmetric algorithms like ES256, the API only needs public keys, and the private signing key stays inside Supabase.

## Time: leeway, `exp`, `nbf`

Servers' clocks drift, so time checks allow a **leeway** of `JWT_LEEWAY_SECONDS` (default 10, allowed range 0–60).
A token that expired 5 seconds ago is still accepted; one that expired a minute ago is not. The range is bounded
because every second of leeway also extends the life of a stolen, expired token.

- `exp` is required. Past it (beyond leeway) the token is **expired**.
- `nbf` ("not before") is optional and Supabase tokens don't normally carry it. If present, a token used before it
  (beyond leeway) is rejected as `invalid_token`, since it is not valid yet rather than out of date.
- `iat` in the future (beyond leeway) is rejected the same way.

## `token_expired` vs `invalid_token`

Both are HTTP 401, and the error `code` tells the client what to do next:

| Code | Meaning | What the app should do |
|---|---|---|
| `token_expired` | A genuine token that has simply run out. Normal: access tokens last an hour. | Refresh the session with the refresh token, then retry the request **once**. Sign the user out only if the refresh fails. |
| `invalid_token` | Malformed, wrongly signed, wrong audience/issuer, not valid yet, or from an unknown key. Retrying cannot help. | Do not retry. Clear the local session and send the user to sign in. |
| `missing_token` | No `Authorization: Bearer` header. | A client bug if the user is signed in. Otherwise send the user to sign in. |
| `anonymous_user` (403) | Signed in anonymously, which this app doesn't support. | Show a message and offer sign-up or sign-in. |
| `auth_unavailable` (503) | The API can't reach Supabase's signing keys and has no usable cached copy. Not the user's fault. | Keep the session, show "try again", and retry with backoff. Never sign the user out for this. |

The two 401s are kept apart so that a token that merely aged out doesn't log people out. The `WWW-Authenticate`
header is set as well, per RFC 6750. The app doesn't exist yet, so this table is the contract the Expo client will be
built to.

The response never says *why* a token was invalid (wrong key, bad signature, wrong audience), since that would help
an attacker. The reason goes to the server log, never the token itself.

## Testing

- `tests/test_auth.py`: the accepted cases and a catalogue of rejected tokens, using keys generated by the test.
- `tests/test_me.py`: the `/v1/me` route end to end with fake signing keys.
- `tests/test_me_integration.py`: signs up a throwaway user on the **local** Supabase stack and sends its real
  token. Skips itself when the stack isn't running (so CI stays green) or when `SUPABASE_URL` isn't a local address.
  Start the stack with `npx supabase start`, then run `uv --directory services/api run pytest -rs`.

Errors are described in [API_ERRORS.md](API_ERRORS.md).
