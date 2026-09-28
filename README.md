# runde.tips – Web-Client

Öffentlicher Web-Client der Fußball-Tipprunde **runde.tips**. Liest ausschließlich
aus der öffentlichen Unterbau-API (`https://unterbau.runde.tips/api/v1`) und
zeigt Tabelle, Spieler- und Spielansicht aller veröffentlichten Turniere.

- Server-Rendering in einem **Cloudflare Worker**, ohne Framework
- ~3 KB (gzip) optionales Client-JavaScript, ~4 KB CSS
- Stale-while-revalidate an der Edge und im Browser
- Laufzeit-Abhängigkeiten: keine

Weitere Dokumente:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – Entscheidungen, Datenfluss, Caching, Routing
- [docs/FINDINGS.md](docs/FINDINGS.md) – Befunde zu API-Vertrag, Daten und Legacy-Verhalten
- [docs/VERIFICATION.md](docs/VERIFICATION.md) – ausgeführte Prüfungen und offene Punkte

## Routen

| URL | Ansicht |
| --- | --- |
| `/` | Tabelle des aktuellen Turniers (höchste `nr`) |
| `/spieler?name=:playerId` | Spieleransicht (Standard: Tabellenführer) |
| `/spiel?nr=:matchNr` | Spielansicht (Standard: letztes gewertetes Spiel) |
| `/:slug` | Tabelle des Turniers `slug` |
| `/:slug/spieler?name=:playerId` | Spieleransicht des Turniers |
| `/:slug/spiel?nr=:matchNr` | Spielansicht des Turniers |

## Lokale Entwicklung

Voraussetzungen: Node.js ≥ 22.18 (TypeScript wird nativ per Type-Stripping
ausgeführt), npm.

```sh
npm install
npm run dev          # Worker auf http://localhost:8787 gegen die echte API
```

Ohne Zugriff auf die echte API (oder für Randfälle) gibt es eine Mock-API mit
synthetischen Daten nach API-Vertrag:

```sh
npm run mock-api     # Terminal 1: http://127.0.0.1:8788/api/v1
npm run dev:mock     # Terminal 2: Worker gegen die Mock-API
```

Die Mock-Daten enthalten ein laufendes Turnier (`/`), eine Abschlusstabelle mit
Zusatzpunkten (`/wm2026`), ein Turnier ohne Wertung (`/nt0001`), eines ohne
Teilnehmer (`/lt0001`) und eines ohne Spiele (`/ot0001`).
`MOCK_FAIL=1` bzw. `MOCK_DELAY=2000` simulieren Fehler bzw. langsame Antworten.

### Prüfungen

```sh
npm run lint         # Biome (Lint + Format-Check)
npm run typecheck    # tsc (Worker/Tests) + tsc für client/app.js (checkJs)
npm test             # node:test – Domänenregeln, Routing, Schemas, SWR, alle Routen
npm run check        # alle drei
npm run build        # Assets + Wrangler-Bundle nach dist/ (ohne Deployment)
npm run verify:live  # alle Routen gegen die echte Unterbau-API
```

`npm run format` formatiert und sortiert Imports.

## Deployment auf Cloudflare

Konfiguration: [`wrangler.jsonc`](wrangler.jsonc) (Worker + Static Assets aus
`public/`, erzeugt von `scripts/build-assets.ts`).

```sh
npx wrangler login   # einmalig
npm run deploy       # baut die Assets und deployt den Worker
```

- Die API-Adresse ist die Variable `API_BASE` in `wrangler.jsonc`.
- Für eine eigene Domain den `routes`-Eintrag in `wrangler.jsonc` aktivieren
  (`{ "pattern": "runde.tips", "custom_domain": true }`). Die persistente
  Cache-Stufe nutzt die Cloudflare Cache API, die laut Cloudflare nur auf eigenen
  Domains wirkt; unter `*.workers.dev` bleibt der Speicher-Cache der Isolates.
- CI: `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` setzen, dann
  `npm ci && npm run check && npm run deploy`.

## Projektstruktur

```
src/
  worker.ts            Worker-Einstieg (Bindings, Cache API)
  app.ts               Request → Route → Daten → View → Response
  routing.ts           öffentliche URLs
  api/                 Client, Vertrags-Schemas, Validierung, SWR-Cache
  domain/selection.ts  Fachregeln: aktuelles Turnier, Standardauswahl, Reihenfolgen
  views/               HTML-Templates (auto-escaping)
client/                CSS, Progressive-Enhancement-Skript, Service Worker, Logo
scripts/               Asset-Build, Mock-API, Live-Verifikation
test/                  Tests und synthetische Vertragsdaten
```
