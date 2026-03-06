// ─── Session ID (persisted in localStorage for anonymous history) ─────────────
const SESSION_KEY = 'mindguard_session_id';

function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ─── Typed API error ──────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Base URL: empty string in dev (Vite proxy), or VITE_API_BASE_URL in prod ─
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

// ─── Core request function ────────────────────────────────────────────────────
interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** Request timeout in ms – default 45 s (long for OpenAI calls) */
  timeout?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeout = 45_000, ...init } = options;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal:  controller.signal,
      headers: {
        'Content-Type':   'application/json',
        'x-session-id':   getSessionId(),
        ...init.headers,
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, string>;
      throw new ApiError(
        res.status,
        body['error'] ?? `Request failed with status ${res.status}`,
        body['code'],
      );
    }

    return res.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof ApiError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. The analysis is taking too long — please try again.');
    }

    throw new ApiError(0, 'Network error. Please check your connection and try again.');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...opts }),

  post: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...opts }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...opts }),
};
