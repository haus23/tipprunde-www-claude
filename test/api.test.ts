import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ApiError, createApi } from '../src/api/client.ts';
import { ChampionshipPlayersSchema, ChampionshipsSchema } from '../src/api/schemas.ts';
import { type CachePolicy, clearMemoryCache, swr } from '../src/api/swr.ts';
import { parse, SchemaError } from '../src/api/validate.ts';
import { defaultScenario } from './fixtures.ts';

describe('schemas', () => {
  const scenario = defaultScenario();
  it('accept the contract fixtures', () => {
    assert.equal(parse(ChampionshipsSchema, scenario.championships).length, 5);
  });
  it('drop member e-mail addresses and unknown fields', () => {
    const players = parse(ChampionshipPlayersSchema, [
      { id: 'p', playerId: 'a', nr: 1, account: { id: 'a', name: 'A', email: 'a@example.org' }, extra: 1 },
    ]);
    assert.deepEqual(players[0], { id: 'p', playerId: 'a', nr: 1, account: { id: 'a', name: 'A' } });
    assert.ok(!('rank' in (players[0] ?? {})));
  });
  it('reject invalid data with a path', () => {
    assert.throws(
      () => parse(ChampionshipsSchema, [{ id: 'x', name: 'X', nr: 'eins', published: true }]),
      (e: unknown) => e instanceof SchemaError && e.path === '[0].nr',
    );
    assert.throws(() => parse(ChampionshipsSchema, { not: 'an array' }), SchemaError);
  });
});

const policy: CachePolicy = { fresh: 100, swr: 1000, error: 10_000 };

describe('stale-while-revalidate', () => {
  beforeEach(() => clearMemoryCache());

  function setup() {
    let now = 0;
    let version = 0;
    let fail = false;
    const background: Promise<unknown>[] = [];
    const calls: number[] = [];
    const run = () =>
      swr(
        'k',
        policy,
        async () => {
          calls.push(now);
          if (fail) throw new Error('down');
          version++;
          return { body: JSON.stringify({ version }), fetchedAt: now };
        },
        (body) => JSON.parse(body) as { version: number },
        { now: () => now, waitUntil: (p) => background.push(p) },
      );
    return {
      run,
      calls,
      background,
      setNow: (t: number) => {
        now = t;
      },
      setFail: (f: boolean) => {
        fail = f;
      },
    };
  }

  it('serves fresh data from cache', async () => {
    const s = setup();
    assert.equal((await s.run()).data.version, 1);
    s.setNow(50);
    assert.equal((await s.run()).data.version, 1);
    assert.equal(s.calls.length, 1);
  });

  it('serves stale data and revalidates in the background', async () => {
    const s = setup();
    await s.run();
    s.setNow(500);
    const stale = await s.run();
    assert.equal(stale.data.version, 1);
    assert.equal(s.background.length, 1);
    await Promise.all(s.background);
    s.setNow(510);
    assert.equal((await s.run()).data.version, 2);
  });

  it('blocks on expired data', async () => {
    const s = setup();
    await s.run();
    s.setNow(5000);
    const loaded = await s.run();
    assert.equal(loaded.data.version, 2);
    assert.equal(loaded.fallback, false);
  });

  it('falls back to cached data on upstream errors, then fails', async () => {
    const s = setup();
    await s.run();
    s.setFail(true);
    s.setNow(5000);
    const loaded = await s.run();
    assert.equal(loaded.fallback, true);
    assert.equal(loaded.data.version, 1);
    s.setNow(20_000);
    await assert.rejects(s.run());
  });

  it('never replaces good data with invalid data', async () => {
    let body = '{"version":1}';
    const run = (now: number) =>
      swr(
        'v',
        policy,
        async () => ({ body, fetchedAt: now }),
        (b) => {
          const value = JSON.parse(b) as { version?: number };
          if (typeof value.version !== 'number') throw new Error('invalid');
          return value;
        },
        { now: () => now, waitUntil: () => {} },
      );
    await run(0);
    body = '{"nope":true}';
    const loaded = await run(5000);
    assert.equal(loaded.fallback, true);
    assert.equal(loaded.data.version, 1);
  });
});

describe('api client', () => {
  beforeEach(() => clearMemoryCache());

  const client = (fetch: typeof globalThis.fetch) =>
    createApi({ base: 'https://api.test/api/v1', fetch, now: Date.now, waitUntil: () => {} });

  it('classifies HTTP errors', async () => {
    const api = client(
      async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    await assert.rejects(
      api.championships(),
      (e: unknown) => e instanceof ApiError && e.kind === 'status' && e.status === 500,
    );
  });
  it('classifies invalid bodies', async () => {
    const api = client(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await assert.rejects(api.championships(), (e: unknown) => e instanceof ApiError && e.kind === 'invalid');
    clearMemoryCache();
    const api2 = client(
      async () => new Response('{"a":1', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await assert.rejects(api2.championships(), (e: unknown) => e instanceof ApiError && e.kind === 'invalid');
  });
  it('classifies network errors', async () => {
    const api = client(async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(api.championships(), (e: unknown) => e instanceof ApiError && e.kind === 'network');
  });
  it('uses conditional requests on revalidation', async () => {
    const seen: (string | null)[] = [];
    let now = 0;
    const api = createApi({
      base: 'https://api.test/api/v1',
      now: () => now,
      waitUntil: () => {},
      fetch: async (_input, init) => {
        const inm = new Headers(init?.headers).get('if-none-match');
        seen.push(inm);
        return inm
          ? new Response(null, { status: 304 })
          : new Response('[]', { status: 200, headers: { 'content-type': 'application/json', etag: 'W/"1"' } });
      },
    });
    await api.championships();
    now = 60 * 60_000;
    const loaded = await api.championships();
    assert.deepEqual(seen, [null, 'W/"1"']);
    assert.equal(loaded.fetchedAt, now);
  });
  it('does not request current tips for completed championships', async () => {
    let called = false;
    const api = client(async () => {
      called = true;
      return new Response('[]');
    });
    const loaded = await api.currentTips({
      id: 'x',
      name: 'X',
      nr: 1,
      published: true,
      completed: true,
      extraPointsPublished: false,
    });
    assert.deepEqual(loaded.data, []);
    assert.equal(called, false);
  });
});

describe('persistent tier', () => {
  beforeEach(() => clearMemoryCache());

  it('registers writes with waitUntil and discards corrupt entries', async () => {
    const stored = new Map<string, { body: string; fetchedAt: number }>();
    stored.set('k', { body: '', fetchedAt: 0 });
    const waited: Promise<unknown>[] = [];
    const loaded = await swr(
      'k',
      policy,
      async () => ({ body: '{"ok":true}', fetchedAt: 1 }),
      (b) => JSON.parse(b) as { ok: boolean },
      {
        now: () => 1,
        waitUntil: (p) => waited.push(p),
        persistent: {
          get: async (key) => stored.get(key),
          put: async (key, entry) => {
            stored.set(key, entry);
          },
        },
      },
    );
    assert.deepEqual(loaded.data, { ok: true });
    await Promise.all(waited);
    assert.equal(waited.length, 1);
    assert.equal(stored.get('k')?.body, '{"ok":true}');
  });
});
