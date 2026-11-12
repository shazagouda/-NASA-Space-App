import { signal } from '../signals';
import { configService, AppConfig } from './app-config';

export interface ApiError { status: number; message: string; retryable: boolean }

/** Bearer token lives only in memory — never in storage — and is only attached to requests for the configured API origin. */
export class AuthTokenStore {
  private token = signal<string | null>(null);
  readonly present = () => this.token() !== null;
  set(t: string | null): void { this.token.set(t && /^[\w\-.~+/=]{8,4096}$/.test(t) ? t : null); }
  get(): string | null { return this.token(); }
}
export const authToken = new AuthTokenStore();

class HttpStatusError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); this.name = 'HttpStatusError'; }
}

function isRetryable(e: unknown): boolean {
  return e instanceof HttpStatusError ? e.status === 0 || e.status >= 500 : true;
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof HttpStatusError) {
    const msg = e.status === 0 ? 'The data service could not be reached.' : e.status === 401 || e.status === 403 ? 'The data service refused the request (authentication).'
      : e.status === 404 ? 'The requested endpoint does not exist.' : e.status === 429 ? 'Too many requests — try again shortly.'
      : e.status >= 500 ? 'The data service reported an internal error.' : `The data service returned ${e.status}.`;
    return { status: e.status, message: msg, retryable: e.status === 0 || e.status >= 500 };
  }
  if ((e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError') return { status: 0, message: 'The data service did not answer in time.', retryable: true };
  if (e instanceof TypeError) return { status: 0, message: 'The data service could not be reached.', retryable: true };
  return { status: 0, message: 'Unexpected response from the data service.', retryable: false };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One request with the security headers, timeout and retry policy from config.json (the Angular app did this in an interceptor). */
async function request<T>(cfg: AppConfig, url: string, init: RequestInit): Promise<T> {
  const token = authToken.get();
  const headers: Record<string, string> = {
    Accept: 'application/json', 'X-Requested-With': 'beyond-earth-web',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let attempt = 0;
  for (;;) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers, credentials: 'omit', signal: ctl.signal });
      if (!res.ok) throw new HttpStatusError(res.status);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt >= cfg.retries || !isRetryable(e)) throw e;
      await sleep(400 * 2 ** attempt++);
    } finally { clearTimeout(timer); }
  }
}

export class ApiClient {
  private cfg = configService;
  readonly lastLatencyMs = signal<number | null>(null);

  get available(): boolean { return !!this.cfg.config().apiBaseUrl; }

  async get<T = unknown>(endpoint: keyof AppConfig['endpoints'], params?: Record<string, string>): Promise<T> {
    const c = this.cfg.config();
    if (!c.apiBaseUrl) throw { status: 0, message: 'No API base URL is configured.', retryable: false } satisfies ApiError;
    const t0 = performance.now();
    try {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      const body = await request<T>(c, c.apiBaseUrl + c.endpoints[endpoint] + qs, { method: 'GET' });
      this.lastLatencyMs.set(Math.round(performance.now() - t0));
      return body;
    } catch (e) { throw (e as ApiError)?.message && !(e instanceof Error) ? e : toApiError(e); }
  }

  async post<T = unknown>(endpoint: 'search' | 'assistant', body: unknown): Promise<T> {
    const c = this.cfg.config();
    if (!c.apiBaseUrl) throw { status: 0, message: 'No API base URL is configured.', retryable: false } satisfies ApiError;
    try {
      return await request<T>(c, c.apiBaseUrl + c.endpoints[endpoint], { method: 'POST', body: JSON.stringify(body) });
    } catch (e) { throw (e as ApiError)?.message && !(e instanceof Error) ? e : toApiError(e); }
  }
}
export const api = new ApiClient();
