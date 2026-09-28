# Befunde: API-Vertrag, reale Daten, Legacy-Verhalten

Quellen: OpenAPI- und Handler-Code des Unterbaus sowie die WWW-App im Repository
`haus23/tipprunde-legacy` (Branch `v1`, Stand 28.09.2026, Commit `3623318`).

> **Einschränkung:** Aus der Entwicklungsumgebung waren `unterbau.runde.tips`
> (API, `/docs`, `/openapi.json`) und `emilkowal.ski` durch die Netzwerk-Richtlinie
> gesperrt. Der Vertrag wurde deshalb aus dem Quellcode abgeleitet, aus dem die
> OpenAPI-Beschreibung generiert wird (`apps/unterbau/src/api/openapi.ts` +
> Valibot-Schemas in `packages/model`). Reale Antworten sind noch nicht geprüft –
> siehe [VERIFICATION.md](VERIFICATION.md).

## Entscheidungen mit sichtbarer Wirkung (bitte bestätigen)

1. **Zusatzpunkte in der Abschlusstabelle.** Legacy zeigt bei abgeschlossenen
   Turnieren die Spalte „Zusatzpunkte“ immer, auch wenn
   `extraPointsPublished: false`. Der Vertrag sagt: `extraPointsPublished`
   „steuert, ob Zusatzpunkte öffentlich sichtbar sind“. **Umgesetzt nach Vertrag:**
   Die Spalte erscheint nur bei `extraPointsPublished: true`.
2. **Gewertetes Spiel = Ergebnis vorhanden.** Der Vertrag beschreibt fehlende
   `points` (Spiel und Tipp) als „noch nicht ausgewertet“; Unterbau
   (`match-tips`-Standard, `current-tips`) und Legacy verwenden dagegen ein
   gesetztes `result`. **Umgesetzt:** `result !== ''` gilt als gewertet (so auch
   die Standardauswahl „letztes gewertetes Spiel“). Hat ein Tipp trotz Ergebnis
   keine `points`, zeigen wir „–“ statt einer erfundenen 0.
3. **Kein Tipp bei gewertetem Spiel = 0 Punkte.** Übernommen aus Legacy
   (Changelog 0.22.22), aber als „kein Tipp“ vom getippten 0-Punkte-Ergebnis
   unterscheidbar.
4. **Standardspiel ohne gewertetes Spiel:** Spiel mit der kleinsten `nr`
   (entspricht Unterbau-Standard `matches[0]`).
5. **Reihenfolge für Prev/Next:** `nr` aufsteigend (so liefert die API die
   Spiele). Die Standardauswahl sortiert dagegen – wie der Unterbau – nach Datum.
   Weichen Datum und `nr` voneinander ab, ist das „letzte gewertete Spiel“ nicht
   zwingend das mit der höchsten `nr`.

## Weitere Befunde

- **Aktuelles Turnier:** Legacy nimmt `championships[0]` und verlässt sich auf die
  Sortierung der API (`nr` absteigend). Wir bestimmen das Maximum explizit.
- **Zwei Arten von Spieler-IDs:** `ChampionshipPlayer.id` (Teilnahme-Dokument,
  Schlüssel in `match-tips.tips` und `current-tips.tips`, Feld `Tip.playerId`)
  und `ChampionshipPlayer.playerId` (Mitglieds-ID, Parameter `?name=` bei
  `player-tips` und in der URL). Beides wird als opaker Schlüssel behandelt.
- **Fehlerstatus:** `player-tips` antwortet 400 (keine Teilnehmer), 404 (nicht im
  Turnier), 406 (unbekanntes Mitglied); `match-tips` 400 (keine Spiele) und 404
  (unbekannte `nr`). Der Client prüft Auswahl und Existenz vorher lokal und
  ruft diese Endpunkte in diesen Fällen nicht auf.
- **Turnier-ID-Format:** Der Unterbau prüft `^[a-z]{2}\d{4}$` (406 sonst). Der
  Client wertet das Format nicht aus, sondern vergleicht nur mit der Turnierliste.
- **`current-tips`:** Der Handler filtert `m.date !== undefined`; nach dem Parsen
  ist `date` aber immer ein String (Default `''`). Spiele ohne Datum können also
  im Ausschnitt landen (sie sortieren nach vorn). Für den Client ohne Folgen.
- **Legacy-Punkteschnitt:** `points / Anzahl gewerteter Spiele` (ohne
  Zusatzpunkte, unabhängig davon, ob getippt wurde). Übernommen.
- **Geteilte Plätze:** Legacy blendet wiederholte Ränge aus. Übernommen, für
  Screenreader bleibt der Rang lesbar.
- **Caching des Unterbaus:** keine `Cache-Control`-Header, Express-ETags ja;
  intern bis zu 24 h Cache mit Invalidierung durch den Hinterhof. Unsere kurze
  Frische (30 s) sorgt dafür, dass Invalidierungen schnell ankommen.
- **Legacy-Link-Muster:** Legacy übernimmt beim Wechsel zwischen Ansichten die
  bisherigen Query-Parameter (`search: prev => …`). Wir übertragen beim
  Turnierwechsel bewusst nichts.
