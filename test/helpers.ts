import { createApi } from '../src/api/client.ts';
import { clearMemoryCache } from '../src/api/swr.ts';
import { handleRequest } from '../src/app.ts';
import { defaultScenario, type Scenario, serveScenario } from './fixtures.ts';

export const API_BASE = 'https://api.test/api/v1';

export interface TestApp {
  get(path: string, init?: RequestInit): Promise<{ status: number; html: string; response: Response }>;
  calls: string[];
  scenario: Scenario;
}

export function testApp(opts: { scenario?: Scenario; fetch?: typeof fetch; now?: () => number } = {}): TestApp {
  clearMemoryCache();
  const scenario = opts.scenario ?? defaultScenario();
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname.replace('/api/v1', '') + url.search);
    const { status, body } = serveScenario(scenario, url);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  const api = createApi({
    base: API_BASE,
    fetch: opts.fetch ?? fakeFetch,
    now: opts.now ?? Date.now,
    waitUntil: () => {},
  });
  return {
    calls,
    scenario,
    async get(path, init) {
      const response = await handleRequest(new Request(`https://runde.test${path}`, init), api);
      return { status: response.status, html: await response.clone().text(), response };
    },
  };
}

/** Text content of the first element matching a simple regex-extracted region. */
export function between(html: string, start: string, end: string) {
  const i = html.indexOf(start);
  if (i < 0) return '';
  const j = html.indexOf(end, i + start.length);
  return html.slice(i, j < 0 ? undefined : j + end.length);
}

export function selectedOption(html: string, selectId: string) {
  const select = between(html, `<select id="${selectId}"`, '</select>');
  const match = select.match(/<option value="([^"]*)" selected>/);
  return match?.[1];
}
