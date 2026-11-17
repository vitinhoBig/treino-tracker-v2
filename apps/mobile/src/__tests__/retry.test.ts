import { ApiError, NETWORK_ERROR, TIMEOUT, UNEXPECTED_RESPONSE } from '@/lib/api/errors';
import { ConfigError } from '@/lib/config';
import { MAX_RETRIES, shouldRetry } from '@/lib/query/retry';

const apiError = (status: number | null, code: string) => new ApiError(status, code, code);

describe('shouldRetry', () => {
  it.each([
    ['no answer at all', null, NETWORK_ERROR],
    ['a timeout', null, TIMEOUT],
    // The API can't verify tokens right now. The user did nothing wrong, so try again.
    ['auth_unavailable', 503, 'auth_unavailable'],
    ['an unexpected server failure', 500, 'internal_error'],
    ['a proxy error page', 502, UNEXPECTED_RESPONSE],
  ])('retries %s', (_name, status, code) => {
    expect(shouldRetry(0, apiError(status, code))).toBe(true);
  });

  it.each([
    [400, 'bad_request'],
    [401, 'token_expired'], // the API client already refreshed once, so this one is final
    [401, 'invalid_token'],
    [403, 'anonymous_user'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'validation_error'],
    [429, 'too_many_requests'],
  ])('never retries a %i answer (%s): the same request gets the same answer', (status, code) => {
    expect(shouldRetry(0, apiError(status, code))).toBe(false);
  });

  it('does not retry an answer it could not read, such as a 200 that is not JSON', () => {
    expect(shouldRetry(0, apiError(200, UNEXPECTED_RESPONSE))).toBe(false);
  });

  it.each([new TypeError('undefined is not a function'), new ConfigError('EXPO_PUBLIC_API_URL is not set')])(
    'does not retry an error that is not from the API (%s): it would fail the same way again',
    (error) => {
      expect(shouldRetry(0, error)).toBe(false);
    },
  );

  it('keeps retrying until the last allowed try', () => {
    const error = apiError(503, 'auth_unavailable');

    expect(shouldRetry(MAX_RETRIES - 1, error)).toBe(true);
  });
});

// TODO(victor): add a test that the rule gives up. For an error it normally retries (a 503
// auth_unavailable and a network_error), shouldRetry(MAX_RETRIES, error) must be false, and so must
// a count above it. To see it fail, delete the first line of shouldRetry in lib/query/retry.ts: the
// query would then retry forever while the server stays down.
