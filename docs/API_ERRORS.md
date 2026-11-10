# API error format

Every error from the FastAPI service has the same JSON shape, whether we raised it, FastAPI raised it (unknown route,
wrong method) or something crashed. Clients handle one format. The code is in `services/api/app/errors.py`.

```json
{ "error": { "code": "not_found", "message": "Not Found" } }
```

| Field | Always there | Purpose |
|---|---|---|
| `code` | yes | Stable, machine-readable. **Clients branch on this.** |
| `message` | yes | For people, in English. May change wording, so never match on it. |
| `details` | no | A list of `{ "field", "message" }`, only for validation errors. |

Success responses are plain data, with no envelope.

## Codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed request |
| 401 | `missing_token` | No bearer token |
| 401 | `invalid_token` | Token rejected |
| 401 | `token_expired` | Token expired, refresh and retry once |
| 401 | `unauthorized` | Any other 401 raised by the framework |
| 403 | `anonymous_user` | Anonymous sign-in, which isn't supported |
| 403 | `forbidden` | Not allowed |
| 404 | `not_found` | Unknown route or resource |
| 405 | `method_not_allowed` | Wrong HTTP method (the `Allow` header lists the right ones) |
| 409 | `conflict` | Clashes with current state |
| 422 | `validation_error` | Request body, path or query failed validation. Has `details`. |
| 429 | `too_many_requests` | Rate limited |
| 500 | `internal_error` | Unexpected failure. Fixed message, details only in the server log. |
| 503 | `auth_unavailable` | Can't verify tokens right now |
| other | `http_<status>` | Any status without a name above, e.g. `http_418` |

The auth codes are explained in [API_AUTH.md](API_AUTH.md#token_expired-vs-invalid_token).

## Examples

A missing token (401, with `WWW-Authenticate: Bearer`):

```json
{ "error": { "code": "missing_token", "message": "Authentication required." } }
```

A validation error (422). Only the field and the problem come back, never the value that was rejected, because it
could be a password or a token:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request is invalid.",
    "details": [
      {
        "field": "query.limit",
        "message": "Input should be a valid integer, unable to parse string as an integer"
      }
    ]
  }
}
```

An unexpected failure (500). Exception text can contain SQL, file paths or secrets, so it never reaches the client:

```json
{ "error": { "code": "internal_error", "message": "Something went wrong on our side." } }
```

## Adding an error

Raise `ApiError(status, code, message)` from a route or dependency. Pick a short `snake_case` code, add it to the
table above, and give it a test. In OpenAPI, protected routes document their auth errors with
`responses=AUTH_RESPONSES`, and `ErrorResponse` is the model to use for any other documented error.
