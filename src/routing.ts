/**
 * Public URL scheme.
 *
 *   /                 table of the current championship
 *   /spieler          player view of the current championship   (?name=<playerId>)
 *   /spiel            match view of the current championship    (?nr=<matchNr>)
 *   /:slug            table of championship `slug`
 *   /:slug/spieler    player view of championship `slug`        (?name=<playerId>)
 *   /:slug/spiel      match view of championship `slug`         (?nr=<matchNr>)
 *
 * The short routes are resolved to the current championship on every request
 * (no redirect), so the address bar keeps the public URL.
 */

export type View = 'table' | 'player' | 'match';

export type Route =
  | { kind: 'page'; view: View; slug: string | undefined }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' };

const VIEW_SEGMENTS: Record<string, View> = { spieler: 'player', spiel: 'match' };
const SEGMENT_FOR: Record<View, string> = { table: '', player: 'spieler', match: 'spiel' };

function decode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

export function matchRoute(url: URL): Route {
  const path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) {
    return { kind: 'redirect', location: path.replace(/\/+$/, '') + url.search };
  }

  const segments = path.split('/').filter(Boolean).map(decode);
  if (segments.some((s) => s === undefined || s === '')) return { kind: 'not-found' };
  const [first, second, ...rest] = segments as string[];

  if (first === undefined) return { kind: 'page', view: 'table', slug: undefined };
  if (rest.length > 0) return { kind: 'not-found' };

  const shortView = VIEW_SEGMENTS[first];
  if (shortView) {
    return second === undefined ? { kind: 'page', view: shortView, slug: undefined } : { kind: 'not-found' };
  }
  if (second === undefined) return { kind: 'page', view: 'table', slug: first };
  const view = VIEW_SEGMENTS[second];
  return view ? { kind: 'page', view, slug: first } : { kind: 'not-found' };
}

/**
 * Path of a view. `slug === undefined` addresses the current championship
 * through the short routes.
 */
export function viewPath(slug: string | undefined, view: View, query?: Record<string, string | number>) {
  const base = slug === undefined ? '' : `/${encodeURIComponent(slug)}`;
  const segment = SEGMENT_FOR[view];
  const path = segment ? `${base}/${segment}` : base || '/';
  const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : undefined;
  const search = params?.toString();
  return search ? `${path}?${search}` : path;
}
