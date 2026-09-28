/**
 * Read-only client for the public Unterbau API.
 *
 * Checks HTTP status codes, validates every response against the contract and
 * routes all reads through the stale-while-revalidate cache.
 */
import {
  type Championship,
  ChampionshipCurrentTipsSchema,
  ChampionshipMatchesSchema,
  ChampionshipMatchTipsSchema,
  ChampionshipPlayersSchema,
  ChampionshipPlayerTipsSchema,
  ChampionshipsSchema,
  type CurrentTips,
} from './schemas.ts';
import { ARCHIVE_POLICY, type CacheEntry, LIVE_POLICY, type Loaded, type SwrOptions, swr } from './swr.ts';
import { type Parser, parse } from './validate.ts';

export const DEFAULT_API_BASE = 'https://unterbau.runde.tips/api/v1';
const TIMEOUT_MS = 8000;

export type ApiErrorKind = 'network' | 'timeout' | 'status' | 'invalid';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly url: string;

  constructor(kind: ApiErrorKind, url: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.url = url;
    this.status = status;
  }
}

export interface ApiOptions extends SwrOptions {
  base: string;
  fetch: typeof fetch;
}

export type Api = ReturnType<typeof createApi>;

export function createApi(opts: ApiOptions) {
  const base = opts.base.replace(/\/+$/, '');

  async function request(url: string, previous: CacheEntry | undefined): Promise<CacheEntry> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (previous?.etag) headers['if-none-match'] = previous.etag;

    let response: Response;
    try {
      response = await opts.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const timeout = error instanceof Error && error.name === 'TimeoutError';
      throw new ApiError(timeout ? 'timeout' : 'network', url, `Request failed: ${String(error)}`);
    }

    if (response.status === 304 && previous) {
      return { ...previous, fetchedAt: opts.now() };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError('status', url, `Unexpected status ${response.status}`, response.status);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      await response.body?.cancel();
      throw new ApiError('invalid', url, `Unexpected content type "${contentType}"`);
    }
    return {
      body: await response.text(),
      fetchedAt: opts.now(),
      etag: response.headers.get('etag') ?? undefined,
    };
  }

  function get<T>(path: string, schema: Parser<T>, archived: boolean): Promise<Loaded<T>> {
    const url = `${base}${path}`;
    return swr(
      url,
      archived ? ARCHIVE_POLICY : LIVE_POLICY,
      (previous) => request(url, previous),
      (body) => {
        try {
          return parse(schema, JSON.parse(body));
        } catch (error) {
          throw new ApiError('invalid', url, `Invalid response: ${String(error)}`);
        }
      },
      opts,
    );
  }

  const champ = (c: Championship) => `/championships/${encodeURIComponent(c.id)}`;

  return {
    championships: () => get('/championships', ChampionshipsSchema, false),
    players: (c: Championship) => get(`${champ(c)}/players`, ChampionshipPlayersSchema, c.completed),
    matches: (c: Championship) => get(`${champ(c)}/matches`, ChampionshipMatchesSchema, c.completed),
    /** Completed championships have no current tips by contract; skip the request. */
    currentTips: (c: Championship): Promise<Loaded<CurrentTips>> =>
      c.completed
        ? Promise.resolve({ data: [], fetchedAt: opts.now(), fallback: false })
        : get(`${champ(c)}/current-tips`, ChampionshipCurrentTipsSchema, false),
    /** `memberId` is the `playerId` (member id) of a championship player. */
    playerTips: (c: Championship, memberId: string) =>
      get(`${champ(c)}/player-tips?name=${encodeURIComponent(memberId)}`, ChampionshipPlayerTipsSchema, c.completed),
    matchTips: (c: Championship, nr: number) =>
      get(`${champ(c)}/match-tips?nr=${nr}`, ChampionshipMatchTipsSchema, c.completed),
  };
}
