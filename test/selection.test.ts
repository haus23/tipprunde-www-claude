import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Championship, ChampionshipPlayer, Match, Tip } from '../src/api/schemas.ts';
import {
  currentChampionship,
  defaultMatch,
  defaultPlayer,
  findChampionship,
  groupByRound,
  neighbours,
  parseMatchNr,
  rankLabels,
  selectMatch,
  selectPlayer,
  tipPoints,
} from '../src/domain/selection.ts';

const champ = (id: string, nr: number, published = true): Championship => ({
  id,
  name: id,
  nr,
  published,
  completed: false,
  extraPointsPublished: false,
});

const player = (id: string, rank?: number): ChampionshipPlayer => ({
  id: `doc-${id}`,
  playerId: id,
  nr: 1,
  ...(rank === undefined ? {} : { rank, points: 10, totalPoints: 10 }),
  account: { id, name: id },
});

const match = (nr: number, result = '', date = '', roundId = 'r1'): Match => ({
  id: `m${nr}`,
  nr,
  date,
  result,
  roundId,
  leagueId: '',
  hometeamId: '',
  awayteamId: '',
});

describe('current championship', () => {
  it('is the published championship with the highest nr, independent of API order', () => {
    const list = [champ('a', 3), champ('b', 12), champ('c', 7)];
    assert.equal(currentChampionship(list)?.id, 'b');
  });
  it('ignores unpublished championships', () => {
    assert.equal(currentChampionship([champ('a', 3), champ('b', 12, false)])?.id, 'a');
  });
  it('is undefined without championships', () => {
    assert.equal(currentChampionship([]), undefined);
  });
  it('resolves slugs exactly', () => {
    const list = [champ('em2024', 3)];
    assert.equal(findChampionship(list, 'em2024')?.id, 'em2024');
    assert.equal(findChampionship(list, 'EM2024'), undefined);
    assert.equal(findChampionship(list, 'spieler'), undefined);
  });
});

describe('player selection', () => {
  const players = [player('x', 3), player('y', 1), player('z', 1), player('w')];
  it('defaults to the leader (first in API order on shared rank)', () => {
    assert.equal(defaultPlayer(players)?.playerId, 'y');
  });
  it('falls back to the first API player without any ranking', () => {
    assert.equal(defaultPlayer([player('q'), player('r')])?.playerId, 'q');
  });
  it('is undefined without players', () => {
    assert.equal(defaultPlayer([]), undefined);
    assert.deepEqual(selectPlayer([], 'x'), { selected: undefined, invalid: true });
  });
  it('selects by member id (?name=)', () => {
    assert.deepEqual(selectPlayer(players, 'x'), { selected: players[0], invalid: false });
  });
  it('falls back for unknown or document ids', () => {
    assert.equal(selectPlayer(players, 'nobody').selected?.playerId, 'y');
    assert.equal(selectPlayer(players, 'nobody').invalid, true);
    assert.equal(selectPlayer(players, 'doc-x').invalid, true);
    assert.equal(selectPlayer(players, null).invalid, false);
  });
  it('marks shared ranks', () => {
    const labels = rankLabels([player('a', 1), player('b', 1), player('c', 3), player('d')]);
    assert.deepEqual(
      labels.map((l) => [l.rank, l.first, l.shared]),
      [
        [1, true, true],
        [1, false, true],
        [3, true, false],
        [undefined, true, false],
      ],
    );
  });
});

describe('match selection', () => {
  const matches = [
    match(1, '1:0', '2026-08-01'),
    match(2, '2:2', '2026-08-03'),
    match(3, '', '2026-08-02'),
    match(4, '', ''),
    match(5, '0:1', '2026-08-02'),
  ];
  it('defaults to the last evaluated match by date (Unterbau rule)', () => {
    assert.equal(defaultMatch(matches)?.nr, 2);
  });
  it('defaults to the first match by nr when none is evaluated', () => {
    assert.equal(defaultMatch([match(3), match(1), match(2)])?.nr, 1);
  });
  it('is undefined without matches', () => {
    assert.equal(defaultMatch([]), undefined);
  });
  it('selects by nr and falls back for invalid values', () => {
    assert.equal(selectMatch(matches, '4').selected?.nr, 4);
    for (const bad of ['99', 'abc', '0', '-1', '1.5', ' 3']) {
      const sel = selectMatch(matches, bad);
      assert.equal(sel.selected?.nr, 2, bad);
      assert.equal(sel.invalid, true, bad);
    }
    assert.equal(selectMatch(matches, null).invalid, false);
    assert.equal(parseMatchNr('0012'), 12);
  });
  it('finds neighbours in nr order', () => {
    const m = [match(3), match(1), match(2)];
    assert.deepEqual(neighbours(m, m[1] as Match), { prev: undefined, next: m[2] });
    assert.deepEqual(neighbours(m, m[0] as Match), { prev: m[2], next: undefined });
    assert.deepEqual(neighbours(m, m[2] as Match), { prev: m[1], next: m[0] });
  });
  it('groups by round and keeps orphans', () => {
    const groups = groupByRound(
      [
        { id: 'r2', nr: 2, isDoubleRound: true },
        { id: 'r1', nr: 1, isDoubleRound: false },
      ],
      [match(2, '', '', 'r1'), match(1, '', '', 'r2'), match(3, '', '', 'gone')],
    );
    assert.deepEqual(
      groups.map((g) => [g.round?.id, g.matches.map((x) => x.nr)]),
      [
        ['r1', [2]],
        ['r2', [1]],
        [undefined, [3]],
      ],
    );
  });
});

describe('tip points', () => {
  const tip = (t: string, points?: number): Tip => ({
    id: 't',
    tip: t,
    joker: false,
    ...(points === undefined ? {} : { points }),
    matchId: 'm',
    playerId: 'p',
  });
  it('distinguishes not evaluated from zero points', () => {
    assert.equal(tipPoints({ result: '' }, tip('1:0')), undefined);
    assert.equal(tipPoints({ result: '' }, undefined), undefined);
    assert.equal(tipPoints({ result: '2:0' }, tip('1:0', 0)), 0);
    assert.equal(tipPoints({ result: '2:0' }, tip('2:0', 3)), 3);
  });
  it('counts evaluated matches without tip as 0', () => {
    assert.equal(tipPoints({ result: '2:0' }, undefined), 0);
    assert.equal(tipPoints({ result: '2:0' }, tip('')), 0);
  });
  it('does not invent points for a tip without computed points', () => {
    assert.equal(tipPoints({ result: '2:0' }, tip('1:0')), undefined);
  });
});
