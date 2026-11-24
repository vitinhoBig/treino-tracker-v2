import { act, renderHook } from '@testing-library/react-native';

import { useCredentialsForm } from '@/lib/auth/use-credentials-form';

// The Enter key on the keyboard isn't stopped by the button being disabled, so the form itself
// must ignore a second submit while the first is waiting. Calling submit() twice stands in for it.
describe('useCredentialsForm', () => {
  it('sends once when submit is called again before the first request has answered', async () => {
    let answer: (value: { ok: true }) => void = () => {};
    const action = jest.fn(() => new Promise<{ ok: true }>((resolve) => (answer = resolve)));
    const { result } = await renderHook(() => useCredentialsForm(action));
    await act(async () => {
      result.current.setEmail('ana@example.com');
      result.current.setPassword('secret1');
    });

    await act(async () => {
      void result.current.submit();
      void result.current.submit();
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);

    await act(async () => answer({ ok: true }));
    expect(result.current.submitting).toBe(false);
  });

  it('can send again once the first request has finished', async () => {
    const action = jest.fn(async () => ({ ok: true as const }));
    const { result } = await renderHook(() => useCredentialsForm(action));
    await act(async () => {
      result.current.setEmail('ana@example.com');
      result.current.setPassword('secret1');
    });

    await act(async () => result.current.submit());
    await act(async () => result.current.submit());

    expect(action).toHaveBeenCalledTimes(2);
  });
});
