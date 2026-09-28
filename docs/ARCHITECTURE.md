# Architektur und Entscheidungen

## 1. Stack

| Entscheidung | Begründung | Folgen |
| --- | --- | --- |
| **Server-Rendering im Cloudflare Worker, Multi-Page-App** | Alle Ansichten sind lesende Tabellen. Fertiges HTML aus der Edge bringt die schnellste Erstansicht, funktioniert ohne JavaScript und ist direkt verlinkbar. | Jede Navigation ist ein Seitenabruf (klein, per ETag/304 günstig). Keine clientseitige Hydration. |
| **Kein Framework, eigene Templates** (`src/views/html.ts`) | Drei Ansichten rechtfertigen keine Framework-Runtime. Tagged Templates escapen jeden Wert automatisch. | Weniger Komfort als JSX, dafür 0 Laufzeit-Abhängigkeiten. Worker-Bundle ≈ 15 KB gzip. |
| **TypeScript ohne Build-Schritt** für Tests und Skripte | Node ≥ 22.18 führt `.ts` per Type-Stripping aus; Wrangler bündelt den Worker selbst. | Nur „erasable“ Syntax (kein `enum`, keine Parameter-Properties) – per `erasableSyntaxOnly` erzwungen. |
| **Eigene Mini-Validierung** statt Valibot/Zod (`src/api/validate.ts`) | Deckt genau die Konstrukte des Vertrags ab (~150 Zeilen). | Schemas in `src/api/schemas.ts` müssen bei Vertragsänderungen von Hand nachgezogen werden. |
| **Natives HTML für Interaktion** | `<select>` mit `<optgroup>` für Spieler/Spiele, `<details>` für Turnierwechsel und Runden, Links für Prev/Next. Tastatur, Touch und Screenreader funktionieren ohne eigene Widget-Logik. | Das Aufklappmenü der Selects ist browserspezifisch gestaltet. |
| **Dev-Abhängigkeiten**: `wrangler`, `typescript`, `@biomejs/biome`, `@cloudflare/workers-types`, `@types/node` | Je ein klarer Zweck: Build/Deploy, Typprüfung, Lint/Format, Typen. | Keine Komponenten- oder Iconbibliothek; die wenigen Icons liegen inline in `src/views/icons.ts`. |

## 2. Datenabruf, Caching, Revalidierung

### Datenquelle

Nur `GET` auf die öffentliche API (`API_BASE`, Standard `https://unterbau.runde.tips/api/v1`):
`/championships`, `/championships/{id}/players|matches|current-tips|player-tips|match-tips`.
Keine Schreibzugriffe, keine Cache-Invalidierungsroute.

Jede Antwort wird geprüft (`src/api/client.ts`):

1. Netzwerkfehler / Timeout (8 s) → `ApiError('network' | 'timeout')`
2. HTTP-Status ≠ 2xx → `ApiError('status')`; `304` bei Revalidierung → bisheriger Eintrag gilt weiter
3. Content-Type ohne `json` oder kaputtes JSON → `ApiError('invalid')`
4. Schema-Verletzung → `ApiError('invalid')` mit JSON-Pfad im Log

Unbekannte Felder werden verworfen – `email` wird gar nicht erst übernommen.

### Stale-while-revalidate an der Edge (`src/api/swr.ts`)

Jeder API-Eintrag trägt seinen Abrufzeitpunkt. Zwei Stufen: Speicher des
Worker-Isolates und Cloudflare Cache API (pro Rechenzentrum).

| Daten | frisch | SWR-Fenster | Notreserve bei API-Fehler |
| --- | --- | --- | --- |
| Turnierliste, laufende Turniere (`completed: false`) | 30 s | bis 10 min | 7 Tage |
| Abgeschlossene Turniere | 1 h | bis 30 Tage | 365 Tage |

- **Alter < frisch**: aus dem Cache, kein API-Aufruf.
- **frisch ≤ Alter < SWR-Fenster**: sofort aus dem Cache antworten, im Hintergrund
  (`ctx.waitUntil`) neu laden. Parallele Anfragen teilen sich einen Abruf.
- **älter / nicht vorhanden**: API-Aufruf abwarten.
- **API-Fehler**: vorhandenen Eintrag innerhalb der Notreserve ausliefern; die Seite
  zeigt dann „letzter bekannter Stand“. Ohne Eintrag: Fehlerseite (502/503).
- Revalidierungen senden `If-None-Match` (der Unterbau liefert ETags).
- Ungültige Daten ersetzen nie einen gültigen Eintrag.

### Browser

- HTML: `Cache-Control: no-cache` + ETag → jeder Aufruf fragt die Edge, unveränderte
  Seiten kosten nur ein 304.
- Assets unter `/assets/` tragen einen Inhalts-Hash und sind `immutable` (1 Jahr).
- Jede Seite trägt den Datenstand (`<body data-time>`, sichtbar im Footer).

`client/app.js` lädt die aktuelle Seite im Hintergrund neu und tauscht `<main>`
nur aus, wenn sich der Inhalt geändert hat (Aufklappzustände und Fokus bleiben
erhalten, Hinweis „Daten aktualisiert“):

| Ereignis | Bedingung |
| --- | --- |
| Seite geladen | Datenstand bereits veraltet (Edge hat „stale“ geliefert) → nach 1,5 s |
| Tab wird sichtbar, Fenster erhält Fokus | Datenstand älter als 30 s (laufend) bzw. 1 h (abgeschlossen) |
| Seite aus dem Back/Forward-Cache | wie oben |
| Netzwerk wieder da (`online`) | immer |
| Intervall, laufende Turniere | alle 2 min, nur bei sichtbarem Tab |

Mindestabstand zwischen zwei Prüfungen: 10 s. Navigation lädt ohnehin frisch von
der Edge. Speculation Rules (`prefetch`, „moderate“) laden Links bei Hover vor;
Browser ohne Unterstützung ignorieren sie.

### Offline

- `offline`-Ereignis → Hinweis mit Datenstand; `online` → Hinweis weg, Revalidierung.
- Service Worker (`client/sw.js`): Assets cache-first; Seiten **network-first**,
  die letzten 40 Seiten werden als Offline-Reserve gehalten. Aus dem Cache
  gelieferte Seiten sind markiert und zeigen den Offline-Hinweis; nie gesehene
  Seiten liefern eine Offline-Seite.

## 3. Routing und Standardauswahl

`src/routing.ts`, `src/domain/selection.ts`.

- **Aktuelles Turnier**: veröffentlichtes Turnier mit der höchsten `nr` – unabhängig
  von der API-Reihenfolge. Die kurzen Routen werden bei jedem Aufruf aufgelöst
  (kein Redirect); die Adresszeile bleibt `/`, `/spieler`, `/spiel`. Links
  innerhalb der Seite behalten die Form (kurz oder mit Slug), mit der die Seite
  aufgerufen wurde. `<link rel="canonical">` zeigt für das aktuelle Turnier auf
  die kurze Form.
- **Slug**: exakter Vergleich mit `Championship.id`. Unbekannt → 404-Seite mit
  Turnierliste. IDs werden nirgends interpretiert.
- **Spieler** (`?name=` = `playerId`, die Mitglieds-ID): Standard ist der
  Tabellenführer (kleinster `rank`, bei Gleichstand der erste in API-Reihenfolge);
  ohne Ranking der erste von der API gelieferte Teilnehmer.
- **Spiel** (`?nr=`): nur ganze Zahlen ≥ 1. Standard ist das letzte gewertete
  Spiel (Regel des Unterbaus: nach Datum sortiert, letztes mit Ergebnis); ohne
  gewertetes Spiel das Spiel mit der kleinsten `nr`; ohne Spiele ein Empty State.
- **Ungültige Parameter**: Standardauswahl + Hinweis; das Skript entfernt den
  ungültigen Parameter per `history.replaceState` aus der Adresszeile.
- **Prev/Next**: Nachbarn in `nr`-Reihenfolge (fachliche Spielreihenfolge, wie
  von der API sortiert). Am Rand gibt es keinen Link, nur einen deaktivierten
  Platzhalter. Links mit `rel="prev|next"`, Zielfläche ≥ 52 px.
- **Turnierwechsel**: Links führen zur gleichen Ansicht des Zielturniers **ohne**
  Query-Parameter – keine Auswahl wird übertragen.
- Abschließende Schrägstriche → 301 auf die Form ohne.

## 4. Darstellung

- **Tabelle**: laufend „Aktuelle Tabelle“, abgeschlossen „Abschlusstabelle“, ohne
  Ranking „Teilnehmer“ mit Hinweis. Geteilte Plätze nur in der ersten Zeile
  (für Screenreader in jeder). Sind Zusatzpunkte veröffentlicht, erscheinen
  Tipp-Punkte (`points`), Zusatz (`extraPoints`) und Gesamt (`totalPoints`),
  sonst nur Punkte (`totalPoints`). Fehlende Werte erscheinen als „–“, nicht als 0.
  Laufende Turniere zeigen die aktuellen Tipps (`current-tips`) als Spalten mit
  Tipp, Punkten, Joker (J) und Alleintreffer (★); die Namensspalte bleibt beim
  horizontalen Scrollen stehen.
- **Spieler**: Kennzahlen, Runden als aufklappbare Abschnitte (aktuelle Runde
  offen), Spiele verlinken zur Spielansicht.
- **Spiel**: Auswahl nach Runden gruppiert, Prev/Next, Anzeigetafel mit Ergebnis,
  Datum, Liga, Doppelrunde, Tipps aller Teilnehmer (verlinkt zur Spieleransicht).
- Zustände getrennt: „noch kein Tipp“ (Spiel offen), „kein Tipp“ (Spiel gewertet,
  0 Punkte), „–“ in der Punktespalte = noch nicht gewertet, `0` = null Punkte.
  Offene Teams erscheinen als „offen“.

### Gestaltung

- Systemschrift, Farb-Tokens als Custom Properties, helles/dunkles Schema per
  `prefers-color-scheme`. Nur Baseline-„widely available“-CSS (Nesting,
  `:has()`, `color-mix()`, `@media (scripting)`, `dvh`, `position: sticky`).
  Bewusst **nicht** verwendet: Popover-API, `light-dark()`, View Transitions,
  `@starting-style`, Anchor Positioning (noch nicht „widely available“).
- Logo: das SVG der Legacy-App (`client/logo.svg`), per `<use>` eingebunden.
- Interaktion nach den Design-Engineering-Grundsätzen von Emil Kowalski:
  Animationen < 250 ms mit `ease-out`-Kurve (`cubic-bezier(0.23, 1, 0.32, 1)`),
  nur `transform`/`opacity`; Druck-Feedback `scale(0.97)`; Menü öffnet von seinem
  Ursprung (`transform-origin`); häufige Aktionen (Tabs, Prev/Next, Seitenwechsel)
  werden nicht animiert; Hover-Effekte nur bei `(hover: hover) and (pointer: fine)`;
  `prefers-reduced-motion` schaltet Bewegung ab; `tabular-nums` für alle Zahlen.
- Zugänglichkeit: Skip-Link, Landmarks, `aria-current`, Tabellen mit `caption`
  und `scope`, sichtbare Fokusringe (`:focus-visible`), Zielgrößen ≥ 44 px,
  Textalternativen für J/★/„–“, Live-Region für Status- und Offline-Hinweise.

## 5. Sicherheit

- Alle Werte werden beim Rendern escaped; Query-Werte erscheinen nur gekürzt und
  escaped in Hinweisen.
- CSP: nur eigene Skripte und Styles (`'inline-speculation-rules'` für die
  Speculation Rules), `frame-ancestors 'none'`, `form-action 'self'`.
- Nur `GET`/`HEAD`; alles andere 405.
