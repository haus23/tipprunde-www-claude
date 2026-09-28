import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultScenario } from './fixtures.ts';
import { between, selectedOption, testApp } from './helpers.ts';

function h1(html: string) {
  return between(html, '<h1>', '</h1>');
}

describe('current championship routes', () => {
  it('/ shows the table of the championship with the highest nr', async () => {
    const scenario = defaultScenario();
    scenario.championships.reverse(); // API order must not matter
    const app = testApp({ scenario });
    const { status, html } = await app.get('/');
    assert.equal(status, 200);
    assert.match(html, /<title>Tabelle · Hinrunde 2026\/27/);
    assert.match(h1(html), /Aktuelle Tabelle/);
    assert.ok(app.calls.includes('/championships/hr2627/players'));
  });

  it('/spieler selects the leader by default', async () => {
    const app = testApp();
    const { html } = await app.get('/spieler');
    const leader = app.scenario.byId.hr2627?.players.find((p) => p.rank === 1);
    assert.equal(selectedOption(html, 'player-select'), leader?.playerId);
    assert.ok(app.calls.includes(`/championships/hr2627/player-tips?name=${leader?.playerId}`));
    assert.ok(!html.includes('data-replace-url'));
  });

  it('/spiel selects the last evaluated match by default', async () => {
    const app = testApp();
    const { html } = await app.get('/spiel');
    assert.equal(selectedOption(html, 'match-select'), '5');
    assert.ok(app.calls.includes('/championships/hr2627/match-tips?nr=5'));
  });

  it('keeps short URLs in the navigation', async () => {
    const { html } = await testApp().get('/spiel');
    assert.match(html, /<a href="\/spieler"/);
    assert.match(html, /href="\/spiel\?nr=4" rel="prev"/);
    assert.match(html, /href="\/spieler\?name=/);
  });
});

describe('slug routes', () => {
  it('/:slug shows a final table with published extra points', async () => {
    const { status, html } = await testApp().get('/wm2026');
    assert.equal(status, 200);
    assert.match(h1(html), /Abschlusstabelle/);
    assert.match(html, /Zusatz/);
    assert.match(html, /Gesamt/);
    assert.ok(!html.includes('Aktuelle Tipps'));
    assert.ok(!html.includes('data-live'));
  });

  it('/:slug/spieler?name= selects the player and links to slug routes', async () => {
    const { html } = await testApp().get('/wm2026/spieler?name=carla');
    assert.equal(selectedOption(html, 'player-select'), 'carla');
    assert.match(html, /href="\/wm2026\/spiel\?nr=1"/);
    assert.match(html, /Tipps von Carla/);
  });

  it('/:slug/spiel?nr= selects the match', async () => {
    const { html } = await testApp().get('/wm2026/spiel?nr=3');
    assert.equal(selectedOption(html, 'match-select'), '3');
    assert.match(html, /href="\/wm2026\/spiel\?nr=2" rel="prev"/);
    assert.match(html, /href="\/wm2026\/spiel\?nr=4" rel="next"/);
  });

  it('offers no neighbour beyond the first and last match', async () => {
    const first = (await testApp().get('/wm2026/spiel?nr=1')).html;
    assert.ok(!first.includes('rel="prev"'));
    assert.match(first, /href="\/wm2026\/spiel\?nr=2" rel="next"/);
    const last = (await testApp().get('/wm2026/spiel?nr=8')).html;
    assert.ok(!last.includes('rel="next"'));
    assert.match(last, /href="\/wm2026\/spiel\?nr=7" rel="prev"/);
  });

  it('answers unknown slugs and paths with 404', async () => {
    for (const path of ['/xx9999', '/xx9999/spiel?nr=1', '/wm2026/tabelle', '/a/b/c']) {
      const { status, html } = await testApp().get(path);
      assert.equal(status, 404, path);
      assert.match(html, /Seite nicht gefunden/);
    }
  });

  it('redirects trailing slashes', async () => {
    const { status, response } = await testApp().get('/wm2026/spieler/?name=ben');
    assert.equal(status, 301);
    assert.equal(response.headers.get('location'), '/wm2026/spieler?name=ben');
  });
});

describe('invalid query parameters', () => {
  it('fall back to the default player and normalise the URL', async () => {
    const { status, html } = await testApp().get('/spieler?name=%3Cscript%3E');
    assert.equal(status, 200);
    assert.match(html, /gibt es in diesem Turnier nicht/);
    assert.match(html, /data-replace-url="\/spieler"/);
    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;/);
  });

  it('fall back to the default match and keep other parameters', async () => {
    for (const nr of ['999', 'abc', '0', '-2']) {
      const { html } = await testApp().get(`/wm2026/spiel?x=1&nr=${nr}`);
      assert.equal(selectedOption(html, 'match-select'), '8', nr);
      assert.match(html, /data-replace-url="\/wm2026\/spiel\?x=1"/, nr);
    }
  });

  it('do not carry a selection into another championship', async () => {
    // A player of hr2627 that does not exist in the championship list links
    const { html } = await testApp().get('/wm2026/spieler?name=carla');
    const switcher = between(html, '<nav class="switcher-panel"', '</nav>');
    assert.match(switcher, /href="\/spieler"/);
    assert.ok(!switcher.includes('name='));
  });
});

describe('empty states', () => {
  it('championship without players', async () => {
    const app = testApp();
    for (const path of ['/lt0001', '/lt0001/spieler']) {
      const { status, html } = await app.get(path);
      assert.equal(status, 200, path);
      assert.match(html, /Noch keine Teilnehmer/, path);
    }
    assert.ok(!app.calls.some((c) => c.includes('player-tips')));
  });

  it('championship without matches', async () => {
    const app = testApp();
    const match = await app.get('/ot0001/spiel');
    assert.match(match.html, /Noch keine Spiele/);
    const player = await app.get('/ot0001/spieler');
    assert.match(player.html, /Noch keine Spiele/);
    assert.ok(!app.calls.some((c) => c.includes('match-tips') || c.includes('player-tips')));
  });

  it('championship without ranking and without evaluated matches', async () => {
    const app = testApp();
    const table = await app.get('/nt0001');
    assert.match(h1(table.html), /Teilnehmer/);
    assert.match(table.html, /Noch keine Wertung/);
    const player = await app.get('/nt0001/spieler');
    assert.equal(selectedOption(player.html, 'player-select'), 'anna');
    assert.match(player.html, /noch keine Wertung/);
    assert.ok(!player.html.includes('kein Tipp'));
    const match = await app.get('/nt0001/spiel');
    assert.equal(selectedOption(match.html, 'match-select'), '1');
    assert.match(match.html, /Noch nicht gewertet/);
  });

  it('no championships at all', async () => {
    const scenario = defaultScenario();
    scenario.championships = [];
    const { status, html } = await testApp({ scenario }).get('/');
    assert.equal(status, 200);
    assert.match(html, /Noch keine Turniere/);
  });
});

describe('tip states', () => {
  it('distinguishes missing tips, zero points and pending matches', async () => {
    const evaluated = (await testApp().get('/wm2026/spieler?name=eva')).html;
    assert.match(evaluated, /kein Tipp/);
    const pending = (await testApp().get('/spieler?name=anna')).html;
    assert.match(pending, /noch nicht gewertet/);
    assert.match(pending, /noch kein Ergebnis/);
  });

  it('marks jokers and lonely hits', async () => {
    const { html } = await testApp().get('/wm2026/spiel?nr=3');
    assert.match(html, /Alleintreffer/);
    assert.match(html, /mark-joker/);
  });

  it('shows open teams', async () => {
    const { html } = await testApp().get('/wm2026/spiel?nr=8');
    assert.match(between(html, '<div class="scoreboard">', '</div>'), /offen/);
  });
});

describe('robustness', () => {
  it('never renders e-mail addresses', async () => {
    const scenario = defaultScenario();
    for (const p of scenario.byId.hr2627?.players ?? []) (p.account as { email: string }).email = 'x@example.org';
    const { html } = await testApp({ scenario }).get('/');
    assert.ok(!html.includes('example.org'));
  });

  it('shows an error page for API failures', async () => {
    const fail500 = testApp({
      fetch: async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }),
    });
    assert.equal((await fail500.get('/')).status, 502);
    const offline = testApp({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const res = await offline.get('/spiel?nr=2');
    assert.equal(res.status, 503);
    assert.match(res.html, /Erneut versuchen/);
    assert.match(res.html, /href="\/spiel\?nr=2"/);
  });

  it('shows an error page for invalid API data', async () => {
    const app = testApp({
      fetch: async () =>
        new Response(JSON.stringify([{ id: 'x', nr: 'one' }]), { headers: { 'content-type': 'application/json' } }),
    });
    assert.equal((await app.get('/')).status, 502);
  });

  it('supports conditional requests', async () => {
    const app = testApp();
    const first = await app.get('/wm2026');
    const etag = first.response.headers.get('etag') ?? '';
    const second = await app.get('/wm2026', { headers: { 'if-none-match': etag } });
    assert.equal(second.status, 304);
  });

  it('rejects non-GET methods', async () => {
    assert.equal((await testApp().get('/', { method: 'POST' })).status, 405);
  });
});
