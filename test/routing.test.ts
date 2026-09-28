import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchRoute, viewPath } from '../src/routing.ts';

const route = (path: string) => matchRoute(new URL(`https://runde.test${path}`));

describe('routing', () => {
  it('maps the six public routes', () => {
    assert.deepEqual(route('/'), { kind: 'page', view: 'table', slug: undefined });
    assert.deepEqual(route('/spieler?name=anna'), { kind: 'page', view: 'player', slug: undefined });
    assert.deepEqual(route('/spiel?nr=3'), { kind: 'page', view: 'match', slug: undefined });
    assert.deepEqual(route('/em2024'), { kind: 'page', view: 'table', slug: 'em2024' });
    assert.deepEqual(route('/em2024/spieler'), { kind: 'page', view: 'player', slug: 'em2024' });
    assert.deepEqual(route('/em2024/spiel'), { kind: 'page', view: 'match', slug: 'em2024' });
  });
  it('rejects unknown shapes', () => {
    for (const path of ['/em2024/tabelle', '/spieler/x', '/a/spiel/b', '/%E0%A4%A']) {
      assert.deepEqual(route(path), { kind: 'not-found' }, path);
    }
  });
  it('redirects trailing slashes and keeps the query', () => {
    assert.deepEqual(route('/em2024/spiel/?nr=2'), { kind: 'redirect', location: '/em2024/spiel?nr=2' });
  });
  it('builds paths', () => {
    assert.equal(viewPath(undefined, 'table'), '/');
    assert.equal(viewPath(undefined, 'player', { name: 'anna' }), '/spieler?name=anna');
    assert.equal(viewPath('em2024', 'table'), '/em2024');
    assert.equal(viewPath('em2024', 'match', { nr: 7 }), '/em2024/spiel?nr=7');
    assert.equal(viewPath('a b', 'player', { name: 'x&y' }), '/a%20b/spieler?name=x%26y');
  });
});
