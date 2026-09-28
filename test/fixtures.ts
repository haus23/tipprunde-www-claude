/**
 * Synthetic API data following the Unterbau contract. Used by the tests and
 * by `scripts/mock-api.ts` for local browser checks. Real data verification
 * is done against https://unterbau.runde.tips (see docs/VERIFICATION.md).
 */

type Json = Record<string, unknown>;

export interface Scenario {
  championships: Json[];
  byId: Record<
    string,
    {
      players: Json[];
      matches: { rounds: Json[]; matches: Json[]; teams: Json; leagues: Json };
      tips: Json[];
    }
  >;
}

const MEMBERS = [
  ['anna', 'Anna'],
  ['ben', 'Ben'],
  ['carla', 'Carla'],
  ['dirk', 'Dirk'],
  ['eva', 'Eva'],
  ['falk', 'Falk'],
] as const;

const TEAMS = {
  bvb: { id: 'bvb', name: 'Borussia Dortmund', shortname: 'Dortmund' },
  fcb: { id: 'fcb', name: 'FC Bayern München', shortname: 'Bayern' },
  s04: { id: 's04', name: 'FC Schalke 04', shortname: 'Schalke' },
  svw: { id: 'svw', name: 'SV Werder Bremen', shortname: 'Bremen' },
  hsv: { id: 'hsv', name: 'Hamburger SV', shortname: 'HSV' },
  koe: { id: 'koe', name: '1. FC Köln', shortname: 'Köln' },
};
const LEAGUES = { bl1: { id: 'bl1', name: '1. Bundesliga', shortname: 'BL' } };

function championship(id: string, name: string, nr: number, completed: boolean, extraPointsPublished: boolean) {
  return { id, name, nr, rulesId: 'standard', published: true, completed, extraPointsPublished };
}

function account(ix: number) {
  const [id, name] = MEMBERS[ix] ?? ['x', 'X'];
  return { id, name, email: '' };
}

/** A championship with six players, two rounds (second one doubled) and tips. */
function runningChampionship(prefix: string, evaluatedCount: number, withExtra: boolean) {
  const teamIds = Object.keys(TEAMS);
  const rounds = [
    { id: `${prefix}-r1`, nr: 1, isDoubleRound: false },
    { id: `${prefix}-r2`, nr: 2, isDoubleRound: true },
  ];
  const results = ['2:1', '0:0', '1:3', '2:2', '4:0', '1:0', '0:2', '3:3'];
  const matches = results.map((result, ix) => {
    const evaluated = ix < evaluatedCount;
    const home = teamIds[ix % teamIds.length] ?? '';
    const away = teamIds[(ix + 1) % teamIds.length] ?? '';
    return {
      id: `${prefix}-m${ix + 1}`,
      nr: ix + 1,
      date: `2026-08-${String(10 + ix * 2).padStart(2, '0')}`,
      result: evaluated ? result : '',
      ...(evaluated ? { points: 0 } : {}),
      roundId: rounds[ix < 4 ? 0 : 1]?.id,
      leagueId: 'bl1',
      // Last match has an open away team.
      hometeamId: home,
      awayteamId: ix === results.length - 1 ? '' : away,
    };
  });

  const tipPatterns = ['2:1', '1:1', '1:2', '2:2', '3:0', '1:0', '0:1', '2:0'];
  const tips: Json[] = [];
  const pointsByPlayer = new Map<string, number>();
  MEMBERS.forEach((_, p) => {
    matches.forEach((m, ix) => {
      // Player "falk" never tips the first match; player "eva" has no tip for match 6.
      if ((p === 5 && ix === 0) || (p === 4 && ix === 5)) return;
      const tip = tipPatterns[(ix + p) % tipPatterns.length] ?? '';
      const joker = p === ix % MEMBERS.length;
      const evaluated = m.result !== '';
      let points: number | undefined;
      if (evaluated) {
        points = tip === m.result ? 3 : Math.sign(eval1(tip)) === Math.sign(eval1(m.result)) ? 1 : 0;
        if (joker) points *= 2;
        if (m.roundId?.endsWith('r2')) points *= 2;
        pointsByPlayer.set(`${prefix}-p${p + 1}`, (pointsByPlayer.get(`${prefix}-p${p + 1}`) ?? 0) + points);
      }
      tips.push({
        id: `${prefix}-t${p + 1}-${ix + 1}`,
        tip,
        joker,
        ...(points !== undefined ? { points } : {}),
        ...(evaluated && p === 2 && ix === 2 ? { lonelyHit: true } : {}),
        matchId: m.id,
        playerId: `${prefix}-p${p + 1}`,
      });
    });
  });
  for (const m of matches) {
    if (m.result) {
      m.points = tips.filter((t) => t.matchId === m.id).reduce((s, t) => s + ((t.points as number) ?? 0), 0);
    }
  }

  const players = MEMBERS.map((_, p) => {
    const id = `${prefix}-p${p + 1}`;
    const points = pointsByPlayer.get(id);
    const extraPoints = withExtra ? (p % 3) * 2 : undefined;
    return {
      id,
      playerId: MEMBERS[p]?.[0],
      nr: p + 1,
      ...(points !== undefined ? { points, totalPoints: points + (withExtra ? (extraPoints ?? 0) : 0) } : {}),
      ...(extraPoints !== undefined ? { extraPoints } : {}),
      account: account(p),
    };
  });
  // Rank like the Unterbau: by total points, shared ranks for equal totals.
  const ranked = players
    .filter((p) => p.totalPoints !== undefined)
    .sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  ranked.forEach((p, ix) => {
    const prev = ranked[ix - 1];
    (p as Json).rank = prev && prev.totalPoints === p.totalPoints ? (prev as Json).rank : ix + 1;
  });
  players.sort((a, b) => (((a as Json).rank as number) ?? 99) - (((b as Json).rank as number) ?? 99) || a.nr - b.nr);

  return { players, matches: { rounds, matches, teams: TEAMS, leagues: LEAGUES }, tips };
}

function eval1(result: string) {
  const [h, a] = result.split(':').map(Number);
  return (h ?? 0) - (a ?? 0);
}

export function defaultScenario(): Scenario {
  return {
    championships: [
      championship('hr2627', 'Hinrunde 2026/27', 31, false, false),
      championship('wm2026', 'WM 2026', 30, true, true),
      championship('nt0001', 'Neues Turnier', 7, false, false),
      championship('lt0001', 'Leeres Turnier', 6, false, false),
      championship('ot0001', 'Ohne Spiele', 5, false, false),
    ],
    byId: {
      hr2627: runningChampionship('hr2627', 5, false),
      wm2026: runningChampionship('wm2026', 8, true),
      // Players and matches, but nothing evaluated yet → no ranking.
      nt0001: runningChampionship('nt0001', 0, false),
      lt0001: { players: [], matches: { rounds: [], matches: [], teams: {}, leagues: {} }, tips: [] },
      ot0001: {
        players: runningChampionship('ot0001', 0, false).players,
        matches: { rounds: [], matches: [], teams: {}, leagues: {} },
        tips: [],
      },
    },
  };
}

/**
 * Minimal re-implementation of the Unterbau handlers on top of a scenario,
 * including the documented status codes.
 */
export function serveScenario(scenario: Scenario, url: URL): { status: number; body: unknown } {
  const path = url.pathname.replace(/^.*\/api\/v1/, '');
  if (path === '/championships') return { status: 200, body: scenario.championships };

  const m = path.match(/^\/championships\/([^/]+)\/([a-z-]+)$/);
  if (!m) return { status: 404, body: { status: 404, error: 'Not Found' } };
  const [, id, resource] = m;
  if (!/^[a-z]{2}\d{4}$/.test(id ?? '')) return { status: 406, body: { status: 406, error: 'Bad championship id' } };
  const champ = scenario.championships.find((c) => c.id === id);
  const data = id ? scenario.byId[id] : undefined;
  if (!champ || !data) return { status: 404, body: { status: 404, error: 'Championship not found' } };

  switch (resource) {
    case 'players':
      return { status: 200, body: data.players };
    case 'matches':
      return { status: 200, body: data.matches };
    case 'current-tips': {
      if (champ.completed) return { status: 200, body: [] };
      const sorted = data.matches.matches.toSorted((a, b) => String(a.date).localeCompare(String(b.date)));
      const byPlayed = [...sorted.filter((x) => x.result), ...sorted.filter((x) => !x.result)];
      const last = byPlayed.findLastIndex((x) => x.result);
      const start = Math.min(Math.max(0, last - 1), byPlayed.length - 4);
      return {
        status: 200,
        body: byPlayed.slice(Math.max(0, start), Math.max(0, start) + 4).map((match) => ({
          matchId: match.id,
          nr: match.nr,
          hometeam: (data.matches.teams as Record<string, Json>)[match.hometeamId as string]?.shortname,
          awayteam: (data.matches.teams as Record<string, Json>)[match.awayteamId as string]?.shortname,
          result: match.result,
          tips: Object.fromEntries(data.tips.filter((t) => t.matchId === match.id).map((t) => [t.playerId, t])),
        })),
      };
    }
    case 'player-tips': {
      if (data.players.length === 0)
        return { status: 400, body: { status: 400, error: 'Championship has no players' } };
      const name = url.searchParams.get('name');
      const player = name ? data.players.find((p) => p.playerId === name) : data.players[0];
      if (!player)
        return {
          status: name && MEMBERS.some(([mid]) => mid === name) ? 404 : 406,
          body: { status: 404, error: 'No player' },
        };
      return {
        status: 200,
        body: {
          playerId: player.id,
          tips: Object.fromEntries(data.tips.filter((t) => t.playerId === player.id).map((t) => [t.matchId, t])),
        },
      };
    }
    case 'match-tips': {
      const matches = data.matches.matches;
      if (matches.length === 0) return { status: 400, body: { status: 400, error: 'Championship has no matches' } };
      const nr = url.searchParams.get('nr');
      const match = nr ? matches.find((x) => x.nr === Number(nr)) : (matches.findLast((x) => x.result) ?? matches[0]);
      if (!match) return { status: 404, body: { status: 404, error: 'No match with this nr' } };
      return {
        status: 200,
        body: {
          matchId: match.id,
          tips: Object.fromEntries(data.tips.filter((t) => t.matchId === match.id).map((t) => [t.playerId, t])),
        },
      };
    }
    default:
      return { status: 404, body: { status: 404, error: 'Not Found' } };
  }
}
