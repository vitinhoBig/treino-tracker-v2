// Turns the session's error codes into the i18n keys of the messages screens show.
//
// The codes come from Supabase (`invalid_credentials`, `weak_password`, ...) or from the app
// (`network_error`, `unknown_error`). Several Supabase codes share one message, and a code nobody
// listed gets the generic one, so a new Supabase code never shows up as a raw string or a blank.
export type AuthErrorKey =
  | 'auth.errors.email_required'
  | 'auth.errors.password_required'
  | 'auth.errors.invalid_credentials'
  | 'auth.errors.email_not_confirmed'
  | 'auth.errors.weak_password'
  | 'auth.errors.account_not_created'
  | 'auth.errors.invalid_email'
  | 'auth.errors.rate_limited'
  | 'auth.errors.network_error'
  | 'auth.errors.unknown_error';

// A Map, not an object: a plain object answers to names like "constructor" and "toString".
const KEY_BY_CODE = new Map<string, AuthErrorKey>([
  ['invalid_credentials', 'auth.errors.invalid_credentials'],
  ['email_not_confirmed', 'auth.errors.email_not_confirmed'],
  ['weak_password', 'auth.errors.weak_password'],
  // Supabase says an address is taken only when email confirmation is off, and then it is already
  // telling the caller. The words stay vague so the app doesn't confirm it on top of that.
  ['user_already_exists', 'auth.errors.account_not_created'],
  ['email_exists', 'auth.errors.account_not_created'],
  ['email_address_invalid', 'auth.errors.invalid_email'],
  ['validation_failed', 'auth.errors.invalid_email'],
  ['over_request_rate_limit', 'auth.errors.rate_limited'],
  ['over_email_send_rate_limit', 'auth.errors.rate_limited'],
  ['network_error', 'auth.errors.network_error'],
]);

export function authErrorKey(code: string): AuthErrorKey {
  return KEY_BY_CODE.get(code) ?? 'auth.errors.unknown_error';
}
