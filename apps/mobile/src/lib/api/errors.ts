/**
 * Every failure from the API client is an ApiError. `code` is what the app branches on, as in
 * docs/API_ERRORS.md. Two codes come from the client itself, for failures where the server never
 * gave an answer in our format.
 */

export const NETWORK_ERROR = 'network_error';
export const UNEXPECTED_RESPONSE = 'unexpected_response';

export type ErrorDetail = { field: string; message: string };

export class ApiError extends Error {
  /** The HTTP status, or null when no response arrived at all. */
  readonly status: number | null;
  readonly code: string;
  readonly details?: ErrorDetail[];

  // `message` is the server's English text, meant for logs and developers. Screens show their
  // own translated text, chosen by `code`.
  constructor(status: number | null, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ErrorDetail).field === 'string' &&
    typeof (value as ErrorDetail).message === 'string'
  );
}

/**
 * Reads an error response body. Anything that is not `{"error": {"code", "message", ...}}`, such
 * as an HTML page from a proxy, becomes `unexpected_response` with the status kept.
 */
export function errorFromBody(status: number, text: string): ApiError {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new ApiError(status, UNEXPECTED_RESPONSE, `Unexpected non-JSON response (HTTP ${status}).`);
  }
  const error = (body as { error?: unknown } | null)?.error as
    | { code?: unknown; message?: unknown; details?: unknown }
    | undefined;
  if (typeof error?.code !== 'string' || typeof error.message !== 'string') {
    return new ApiError(status, UNEXPECTED_RESPONSE, `Unexpected response shape (HTTP ${status}).`);
  }
  const details =
    Array.isArray(error.details) && error.details.every(isErrorDetail) ? error.details : undefined;
  return new ApiError(status, error.code, error.message, details);
}
