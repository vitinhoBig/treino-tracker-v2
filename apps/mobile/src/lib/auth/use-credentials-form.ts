// The state both the sign-in and the sign-up form need: two fields, a busy flag and an error.
import { useRef, useState } from 'react';

import { authErrorKey, type AuthErrorKey } from './error-messages';

type Outcome = { ok: true } | { ok: false; code: string };

export function useCredentialsForm<R extends Outcome>(
  action: (credentials: { email: string; password: string }) => Promise<R>,
  /** Called with the result when the action worked, and the email that was sent. */
  onSuccess?: (result: Extract<R, { ok: true }>, email: string) => void,
) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // State only updates on the next render, so two quick taps could both get through it.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    // Only emptiness is checked here. Whether an email or a password is acceptable is Supabase's call.
    const trimmed = email.trim();
    if (!trimmed) return setError('auth.errors.email_required');
    if (!password) return setError('auth.errors.password_required');

    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await action({ email: trimmed, password });
      if (result.ok) onSuccess?.(result as Extract<R, { ok: true }>, trimmed);
      else setError(authErrorKey(result.code));
    } catch {
      setError('auth.errors.unknown_error');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return { email, setEmail, password, setPassword, error, submitting, submit };
}
