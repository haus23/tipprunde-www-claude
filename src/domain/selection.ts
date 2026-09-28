/**
 * Domain rules: current championship, default selections, ordering.
 *
 * Pure functions without I/O, so they can be tested directly.
 */
import type { Championship, ChampionshipPlayer, Match, Round, Tip } from '../api/schemas.ts';

/** The current championship is the published one with the highest `nr`. */
export function currentChampionship(championships: readonly Championship[]): Championship | undefined {
  let current: Championship | undefined;
  for (const c of championships) {
    if (c.published && (!current || c.nr > current.nr)) current = c;
  }
  return current;
}

export function findChampionship(championships: readonly Championship[], slug: string) {
  return championships.find((c) => c.published && c.id === slug);
}

/** Published championships, newest first. */
export function sortChampionships(championships: readonly Championship[]) {
  return championships.filter((c) => c.published).toSorted((a, b) => b.nr - a.nr);
}

// --- Players -------------------------------------------------------------

export function hasRanking(players: readonly ChampionshipPlayer[]) {
  return players.some((p) => p.rank !== undefined);
}

/** Players by rank; unranked players keep API order at the end. */
export function sortByRank(players: readonly ChampionshipPlayer[]) {
  return players.toSorted((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY));
}

/**
 * Default player: the leader (lowest rank, first in API order on ties). Without
 * any ranking, the first participant as delivered by the API.
 */
export function defaultPlayer(players: readonly ChampionshipPlayer[]) {
  return sortByRank(players)[0];
}

export interface Selection<T> {
  selected: T | undefined;
  /** The requested value could not be resolved and a default was used. */
  invalid: boolean;
}

/** Resolve `?name=<playerId>`; unknown names fall back to the default player. */
export function selectPlayer(
  players: readonly ChampionshipPlayer[],
  name: string | null,
): Selection<ChampionshipPlayer> {
  if (name !== null) {
    const player = players.find((p) => p.playerId === name);
    if (player) return { selected: player, invalid: false };
  }
  return { selected: defaultPlayer(players), invalid: name !== null };
}

/**
 * Rank label per row: shared ranks are shown only on the first row of a group,
 * like in the legacy app. Returns `undefined` for unranked players.
 */
export function rankLabels(players: readonly ChampionshipPlayer[]) {
  return players.map((p, ix) => {
    if (p.rank === undefined) return { rank: undefined, shared: false, first: true };
    const previous = players[ix - 1]?.rank;
    const next = players[ix + 1]?.rank;
    return { rank: p.rank, shared: previous === p.rank || next === p.rank, first: previous !== p.rank };
  });
}

// --- Matches -------------------------------------------------------------

/** A match counts as evaluated ("gewertet") once it has a result. */
export function isEvaluated(match: Pick<Match, 'result'>) {
  return match.result !== '';
}

/** Domain order of matches: by running number. */
export function sortMatches(matches: readonly Match[]) {
  return matches.toSorted((a, b) => a.nr - b.nr);
}

/**
 * The last evaluated match. Same rule as the Unterbau's match-tips default:
 * order by date (stable, so equal dates keep `nr` order), take the last one
 * with a result.
 */
export function lastEvaluatedMatch(matches: readonly Match[]) {
  return sortMatches(matches)
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .findLast(isEvaluated);
}

/** Default match: last evaluated one, otherwise the first by `nr`. */
export function defaultMatch(matches: readonly Match[]) {
  return lastEvaluatedMatch(matches) ?? sortMatches(matches)[0];
}

/** Parse a `?nr=` value. Only plain positive integers are accepted. */
export function parseMatchNr(value: string | null) {
  if (value === null || !/^\d{1,6}$/.test(value)) return undefined;
  const nr = Number(value);
  return nr >= 1 ? nr : undefined;
}

export function selectMatch(matches: readonly Match[], nrParam: string | null): Selection<Match> {
  const nr = parseMatchNr(nrParam);
  const match = nr === undefined ? undefined : matches.find((m) => m.nr === nr);
  if (match) return { selected: match, invalid: false };
  return { selected: defaultMatch(matches), invalid: nrParam !== null };
}

/** Immediate neighbours in domain order. */
export function neighbours(matches: readonly Match[], match: Match) {
  const sorted = sortMatches(matches);
  const ix = sorted.findIndex((m) => m.id === match.id);
  return {
    prev: ix > 0 ? sorted[ix - 1] : undefined,
    next: ix >= 0 && ix < sorted.length - 1 ? sorted[ix + 1] : undefined,
  };
}

export interface RoundGroup {
  round: Round | undefined;
  matches: Match[];
}

/**
 * Matches grouped by round (rounds by `nr`). Matches referencing an unknown
 * round are collected in a trailing group instead of being dropped.
 */
export function groupByRound(rounds: readonly Round[], matches: readonly Match[]): RoundGroup[] {
  const sorted = sortMatches(matches);
  const groups: RoundGroup[] = rounds
    .toSorted((a, b) => a.nr - b.nr)
    .map((round) => ({ round, matches: sorted.filter((m) => m.roundId === round.id) }));
  const known = new Set(rounds.map((r) => r.id));
  const orphans = sorted.filter((m) => !known.has(m.roundId));
  if (orphans.length > 0) groups.push({ round: undefined, matches: orphans });
  return groups;
}

/** Round of the last evaluated match (by `nr`), else the round of the first match. */
export function currentRoundId(matches: readonly Match[]) {
  const sorted = sortMatches(matches);
  return (sorted.findLast(isEvaluated) ?? sorted[0])?.roundId;
}

// --- Tips ----------------------------------------------------------------

export function hasTip(tip: Tip | undefined): tip is Tip {
  return tip !== undefined && tip.tip !== '';
}

/**
 * Points shown for a tip:
 * - `undefined` → the match is not evaluated yet, or a submitted tip has no
 *                 computed points yet
 * - a number    → awarded points; evaluated matches without a tip count 0,
 *                 as in the legacy app
 */
export function tipPoints(match: Pick<Match, 'result'>, tip: Tip | undefined) {
  if (!isEvaluated(match)) return undefined;
  if (tip?.points !== undefined) return tip.points;
  if (!hasTip(tip)) return 0;
  return undefined;
}

export function average(points: number, count: number) {
  return count > 0 ? points / count : undefined;
}
