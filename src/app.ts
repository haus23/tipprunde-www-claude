/**
 * Request handling: route → data → view → response.
 *
 * Runtime-agnostic (only Web APIs), so it runs in the Worker and in tests.
 */
import { type Api, ApiError } from './api/client.ts';
import type { Championship } from './api/schemas.ts';
import type { Loaded } from './api/swr.ts';
import {
  currentChampionship,
  findChampionship,
  parseMatchNr,
  selectMatch,
  selectPlayer,
  sortChampionships,
} from './domain/selection.ts';
import { ASSETS } from './generated/assets.ts';
import { matchRoute, type View, viewPath } from './routing.ts';
import type { Html } from './views/html.ts';
import { type ChampionshipNav, type LayoutProps, layout } from './views/layout.ts';
import { matchView } from './views/match.ts';
import { playerView } from './views/player.ts';
import { errorView, noChampionshipsView, notFoundView } from './views/states.ts';
import { tableView } from './views/table.ts';

const VIEW_TITLES: Record<View, string> = { table: 'Tabelle', player: 'Spieler', match: 'Spiele' };

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'inline-speculation-rules'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
};

interface PageResult {
  status: number;
  props: LayoutProps;
}

/** Tracks the oldest data timestamp and whether any stale fallback was used. */
class DataStamp {
  time = Number.POSITIVE_INFINITY;
  fallback = false;

  add<T>(loaded: Loaded<T>): T {
    this.time = Math.min(this.time, loaded.fetchedAt);
    this.fallback ||= loaded.fallback;
    return loaded.data;
  }

  get props() {
    return {
      dataTime: Number.isFinite(this.time) ? this.time : undefined,
      fallback: this.fallback,
    };
  }
}

function withoutParam(url: URL, name: string) {
  const params = new URLSearchParams(url.search);
  params.delete(name);
  const search = params.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

function queryParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  return value === null || value === '' ? null : value;
}

function shorten(value: string) {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

async function renderPage(url: URL, view: View, slug: string | undefined, api: Api): Promise<PageResult> {
  const stamp = new DataStamp();
  const championships = sortChampionships(stamp.add(await api.championships()));
  const current = currentChampionship(championships);

  const championship = slug === undefined ? current : findChampionship(championships, slug);
  if (!championship) {
    if (slug === undefined) {
      return { status: 200, props: { title: '', body: noChampionshipsView(), ...stamp.props } };
    }
    return {
      status: 404,
      props: { title: 'Nicht gefunden', body: notFoundView(championships, current?.id), ...stamp.props },
    };
  }

  const nav: ChampionshipNav = {
    championship,
    linkSlug: slug,
    championships,
    currentId: current?.id,
    view,
  };
  const base = {
    title: `${VIEW_TITLES[view]} · ${championship.name}`,
    canonical: viewPath(championship.id === current?.id ? undefined : championship.id, view),
    nav,
  };

  let body: Html;
  let replaceUrl: string | undefined;

  if (view === 'table') {
    const [players, currentTips] = await Promise.all([api.players(championship), api.currentTips(championship)]);
    body = tableView({
      championship,
      linkSlug: slug,
      players: stamp.add(players),
      currentTips: stamp.add(currentTips),
    });
  } else if (view === 'player') {
    const name = queryParam(url, 'name');
    // Start the tips request for an explicitly requested player right away.
    const speculative = name === null ? undefined : optional(api.playerTips(championship, name));
    const [playersLoaded, matchesLoaded] = await Promise.all([api.players(championship), api.matches(championship)]);
    const players = stamp.add(playersLoaded);
    const matches = stamp.add(matchesLoaded);
    const { selected, invalid } = selectPlayer(players, name);
    let tips: Loaded<Awaited<ReturnType<Api['playerTips']>>['data']> | undefined;
    if (selected && matches.matches.length > 0) {
      tips = (!invalid && (await speculative)) || (await api.playerTips(championship, selected.playerId));
    }
    if (invalid && selected) replaceUrl = withoutParam(url, 'name');
    body = playerView({
      championship,
      linkSlug: slug,
      players,
      player: selected,
      invalidName: invalid && name !== null ? shorten(name) : undefined,
      matches,
      tips: tips && stamp.add(tips),
    });
  } else {
    const nrParam = queryParam(url, 'nr');
    const requestedNr = parseMatchNr(nrParam);
    const speculative = requestedNr === undefined ? undefined : optional(api.matchTips(championship, requestedNr));
    const [playersLoaded, matchesLoaded] = await Promise.all([api.players(championship), api.matches(championship)]);
    const players = stamp.add(playersLoaded);
    const matches = stamp.add(matchesLoaded);
    const { selected, invalid } = selectMatch(matches.matches, nrParam);
    let tips: Loaded<Awaited<ReturnType<Api['matchTips']>>['data']> | undefined;
    if (selected) {
      tips = (!invalid && (await speculative)) || (await api.matchTips(championship, selected.nr));
      // Guard against inconsistent upstream data: tips must belong to the match.
      if (tips.data.matchId !== selected.id) tips = undefined;
    }
    if (invalid && selected) replaceUrl = withoutParam(url, 'nr');
    body = matchView({
      championship,
      linkSlug: slug,
      players,
      matches,
      match: selected,
      invalidNr: invalid && nrParam !== null ? shorten(nrParam) : undefined,
      tips: tips && stamp.add(tips),
    });
  }

  return { status: 200, props: { ...base, body, replaceUrl, ...stamp.props } };
}

/** Swallow errors of speculative requests; the caller falls back to a regular one. */
function optional<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch(() => undefined);
}

async function etagFor(body: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `W/"${hex.slice(0, 20)}"`;
}

async function htmlResponse(request: Request, status: number, markup: string) {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    // Always revalidate with the edge; unchanged pages cost a 304 only.
    'cache-control': 'no-cache',
    link: `<${ASSETS.css}>; rel=preload; as=style`,
    ...SECURITY_HEADERS,
  });
  const etag = await etagFor(markup);
  headers.set('etag', etag);
  if (status === 200 && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : markup, { status, headers });
}

export async function handleRequest(request: Request, api: Api): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const url = new URL(request.url);
  const route = matchRoute(url);

  if (route.kind === 'redirect') {
    return new Response(null, { status: 301, headers: { location: route.location } });
  }

  let page: PageResult;
  try {
    if (route.kind === 'not-found') {
      let championships: Championship[] = [];
      try {
        championships = sortChampionships((await api.championships()).data);
      } catch {
        // The 404 page works without the list.
      }
      page = {
        status: 404,
        props: {
          title: 'Nicht gefunden',
          body: notFoundView(championships, currentChampionship(championships)?.id),
        },
      };
    } else {
      page = await renderPage(url, route.view, route.slug, api);
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    console.error(`[api] ${error.kind} ${error.status ?? ''} ${error.url}: ${error.message}`);
    const unreachable = error.kind === 'network' || error.kind === 'timeout';
    page = {
      status: unreachable ? 503 : 502,
      props: { title: 'Daten nicht verfügbar', body: errorView(url, unreachable) },
    };
  }

  // Indentation from the templates carries no meaning; keep one whitespace.
  const markup = layout(page.props).value.replace(/\n\s+/g, '\n');
  const response = await htmlResponse(request, page.status, markup);
  if (page.status >= 500) response.headers.set('retry-after', '30');
  return response;
}
