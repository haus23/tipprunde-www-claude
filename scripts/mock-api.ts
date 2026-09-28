/**
 * Local mock of the Unterbau API serving the synthetic test scenario.
 *
 *   npm run mock-api            # http://127.0.0.1:8788/api/v1
 *   npm run dev:mock            # Worker against the mock
 *
 * MOCK_FAIL=1 answers every request with 500 (error states),
 * MOCK_DELAY=<ms> delays every response (loading behaviour).
 */
import { createServer } from 'node:http';
import { defaultScenario, serveScenario } from '../test/fixtures.ts';

const port = Number(process.env.PORT ?? 8788);
const scenario = defaultScenario();

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const delay = Number(process.env.MOCK_DELAY ?? 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  const { status, body } = process.env.MOCK_FAIL
    ? { status: 500, body: { status: 500, error: 'Internal Server Error' } }
    : serveScenario(scenario, url);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  console.log(status, url.pathname + url.search);
}).listen(port, '127.0.0.1', () => {
  console.log(`mock Unterbau API on http://127.0.0.1:${port}/api/v1`);
});
