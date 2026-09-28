/**
 * Verifies the app against the real Unterbau API.
 *
 *   npm run verify:live                      # https://unterbau.runde.tips/api/v1
 *   API_BASE=http://127.0.0.1:8788/api/v1 npm run verify:live
 *
 * For every published championship it renders all route variants in-process
 * (same code as the Worker) and checks status codes, default selections,
 * explicit selections, prev/next boundaries and fallbacks for invalid query
 * values. Any API response that violates the contract shows up as a 502.
 */
import { createApi, DEFAULT_API_BASE } from '../src/api/client.ts';
import { ChampionshipMatchesSchema, ChampionshipPlayersSchema, ChampionshipsSchema } from '../src/api/schemas.ts';
import { parse } from '../src/api/validate.ts';
import { handleRequest } from '../src/app.ts';
import { currentChampionship, defaultMatch, defaultPlayer, sortMatches } from '../src/domain/selection.ts';

const base = process.env.API_BASE ?? DEFAULT_API_BASE;
const api = createApi({ base, fetch, now: Date.now, waitUntil: () => {} });
let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, info = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${info ? ` – ${info}` : ''}`);
}

async function get(path: string) {
  const response = await handleRequest(new Request(`https://runde.local${path}`), api);
  return { status: response.status, html: await response.text() };
}

function selected(html: string, id: string) {
  const start = html.indexOf(`<select id="${id}"`);
  const select = html.slice(start, html.indexOf('</select>', start));
  return select.match(/<option value="([^"]*)" selected>/)?.[1];
}

async function json(path: string) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

console.log(`Unterbau: ${base}\n`);
const championships = parse(ChampionshipsSchema, await json('/championships'));
const current = currentChampionship(championships);
console.log(`${championships.length} championships, current: ${current?.id ?? '–'}\n`);

for (const c of championships.toSorted((a, b) => b.nr - a.nr)) {
  const isCurrent = c.id === current?.id;
  console.log(`# ${c.id} – ${c.name}${isCurrent ? ' (current)' : ''}${c.completed ? ' [completed]' : ''}`);
  const players = parse(ChampionshipPlayersSchema, await json(`/championships/${c.id}/players`));
  const matches = parse(ChampionshipMatchesSchema, await json(`/championships/${c.id}/matches`));
  const prefixes = isCurrent ? ['', `/${c.id}`] : [`/${c.id}`];

  for (const prefix of prefixes) {
    const table = await get(prefix || '/');
    check(`${prefix || '/'} → 200`, table.status === 200, String(table.status));

    const player = await get(`${prefix}/spieler`);
    check(`${prefix}/spieler → 200`, player.status === 200, String(player.status));
    const expectedPlayer = defaultPlayer(players)?.playerId;
    check(
      `${prefix}/spieler default = ${expectedPlayer ?? '(none)'}`,
      selected(player.html, 'player-select') === expectedPlayer,
    );

    const match = await get(`${prefix}/spiel`);
    check(`${prefix}/spiel → 200`, match.status === 200, String(match.status));
    const expectedMatch = defaultMatch(matches.matches)?.nr;
    check(
      `${prefix}/spiel default = ${expectedMatch ?? '(none)'}`,
      selected(match.html, 'match-select') === (expectedMatch === undefined ? undefined : String(expectedMatch)),
    );
  }

  const prefix = isCurrent ? '' : `/${c.id}`;
  for (const p of players.slice(-2)) {
    const r = await get(`${prefix}/spieler?name=${encodeURIComponent(p.playerId)}`);
    check(`?name=${p.playerId}`, r.status === 200 && selected(r.html, 'player-select') === p.playerId);
  }
  const sorted = sortMatches(matches.matches);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first && last) {
    const f = await get(`${prefix}/spiel?nr=${first.nr}`);
    check(`?nr=${first.nr} (first) has no prev`, f.status === 200 && !f.html.includes('rel="prev"'));
    const l = await get(`${prefix}/spiel?nr=${last.nr}`);
    check(`?nr=${last.nr} (last) has no next`, l.status === 200 && !l.html.includes('rel="next"'));
  }
  const badNr = await get(`${prefix}/spiel?nr=99999`);
  check(
    'invalid ?nr falls back',
    badNr.status === 200 && (sorted.length === 0 || badNr.html.includes('data-replace-url')),
  );
  const badName = await get(`${prefix}/spieler?name=__unknown__`);
  check('invalid ?name falls back', badName.status === 200);
  console.log('');
}

const missing = await get('/xx0000');
check('unknown slug → 404', missing.status === 404);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
