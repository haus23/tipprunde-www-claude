# Auftrag: Moderner Web-Client für runde.tips

Entwickle einen neuen öffentlichen Web-Client für die Fußball-Tipprunde
`runde.tips`. Der Client liest ausschließlich aus der bestehenden öffentlichen
Unterbau-API und soll die fachlichen Ansichten und URLs der bisherigen
WWW-Anwendung bereitstellen.

## Arbeitsweise

1. Untersuche zuerst die Unterbau-API und ihre Dokumentation:
   - Startseite: <https://unterbau.runde.tips/>
   - interaktive API-Referenz: <https://unterbau.runde.tips/docs>
   - OpenAPI-Beschreibung: <https://unterbau.runde.tips/openapi.json>
2. Nutze die dokumentierten Verträge und realen API-Antworten als maßgebliche
   Datenquelle. Erfinde keine Felder oder Endpunkte.
3. Sieh dir als fachliche und funktionale Referenz die bisherige WWW-App an:
   <https://github.com/haus23/tipprunde-legacy/tree/v1/apps/www>
4. Übernimm aus der Legacy-App die relevanten Begriffe, Berechnungen und
   Navigationsziele. Kopiere weder deren technische Architektur noch ihr
   visuelles Design ungeprüft.
5. Triff begründete technische Entscheidungen selbst. Halte wichtige
   Entscheidungen und deren Folgen in einer kurzen Projektdokumentation fest.

## Technischer Rahmen

- Zielplattform ist das Web.
- Framework, Sprache, Renderingmodell und Anwendungsarchitektur sind frei
  wählbar. SPA, SSR, SSG oder eine hybride Lösung sind möglich.
- Die fertige Anwendung muss auf Cloudflare deploybar sein, beispielsweise als
  Cloudflare Worker. Lege die dafür nötige Konfiguration und eine kurze
  Deployment-Anleitung an.
- Verwende moderne, von Baseline Widely Available abgedeckte CSS-Funktionen.
  Vermeide unnötige Polyfills und unnötiges clientseitiges JavaScript.
- Optimiere für schnelle Erstansicht, kleine ausgelieferte Ressourcen,
  effiziente Navigation und sinnvolles Caching.
- Die Daten sollen zugleich bestmöglich aktuell bleiben. Verwende ein
  Stale-while-revalidate-Verfahren oder ein vergleichbares Muster. Definiere
  nachvollziehbar, wann Daten als veraltet gelten und bei welchen Ereignissen
  im Hintergrund neu geladen wird, etwa bei Navigation, Fokuswechsel oder
  erneuter Netzwerkverbindung.
- Behandle Lade-, Fehler-, Offline- und leere Datenzustände ausdrücklich. Ein
  fehlendes Turnier, ein Turnier ohne Teilnehmer, ein Turnier ohne Spiele und
  noch nicht ausgewertete Spiele dürfen keine Laufzeitfehler verursachen.
- Prüfe HTTP-Statuscodes und behandle ungültige API-Antworten kontrolliert.
- Die Anwendung soll responsiv, mit Tastatur bedienbar und semantisch
  zugänglich sein. Beachte reduzierte Bewegung und sichtbare Fokuszustände.

## Gestaltung

- Es gibt keine Vorgabe für Farben, Layout oder visuelle Stilrichtung.
- Verwende das bestehende Logo von `runde.tips`. Es ist auf der Startseite des
  Unterbaus sichtbar und liegt außerdem in der Legacy-WWW-App.
- Folge bei Interaktionen, Animationen und Oberflächenqualität den Grundsätzen
  aus Emil Kowalskis Design-Engineering-Skill:
  <https://emilkowal.ski/skill>
- Du darfst eine geeignete Komponentenbibliothek und Iconbibliothek verwenden
  oder die Oberfläche individuell implementieren. Begrenze Abhängigkeiten auf
  Pakete mit einem klaren Nutzen.
- Animationen sollen Orientierung und Feedback verbessern. Sie dürfen die
  Bedienung nicht verzögern oder von den Daten ablenken.

## Fachliche Navigation und URLs

Erhalte die folgenden öffentlichen Routen. Query-Parameter gehören zur URL und
müssen direkt aufrufbar, teilbar sowie nach einem Reload stabil sein.

### Aktuelles Turnier

Das aktuelle Turnier ist das veröffentlichte Turnier mit dem höchsten Feld
`nr`.

- `/` zeigt seine Tabelle.
- `/spieler` zeigt seine Spieleransicht. Standardmäßig ist der Tabellenführer
  ausgewählt.
- `/spiel` zeigt seine Spielansicht. Standardmäßig ist das letzte bereits
  gewertete Spiel ausgewählt.

### Gewähltes Turnier

`slug` ist die Turnier-ID aus der API.

- `/:slug` zeigt die Tabelle des gewählten Turniers.
- `/:slug/spieler` zeigt dessen Spieleransicht. Standardmäßig ist der
  Tabellenführer ausgewählt.
- `/:slug/spiel` zeigt dessen Spielansicht. Standardmäßig ist das letzte bereits
  gewertete Spiel ausgewählt.

### Auswahl per Query-Parameter

- Die Spieleransicht akzeptiert `?name=:playerId` und wählt diesen Spieler aus.
- Die Spielansicht akzeptiert `?nr=:matchNr` und wählt das Spiel mit dieser
  Nummer aus.
- Ungültige oder nicht mehr vorhandene Parameterwerte müssen ohne Absturz auf
  eine sinnvolle Standardauswahl zurückfallen und die Oberfläche soll einen
  konsistenten Zustand zeigen.
- Existiert noch kein Ranking, wähle in der Spieleransicht einen stabilen,
  nachvollziehbaren Fallback, beispielsweise den ersten von der API gelieferten
  Teilnehmer.
- Existiert noch kein gewertetes Spiel, wähle in der Spielansicht ein sinnvolles
  vorhandenes Spiel. Gibt es gar kein Spiel, zeige einen passenden Empty State.

Die kurzen Routen des aktuellen Turniers dürfen intern auf kanonische
Slug-Routen abgebildet werden. In der Adresszeile müssen jedoch die oben
festgelegten öffentlichen URLs und Query-Parameter zuverlässig funktionieren.

## Ansichten

### Tabelle

- Zeige die Teilnehmer und ihre Platzierung beziehungsweise ihren noch nicht
  gewerteten Zustand.
- Unterscheide sinnvoll zwischen einem laufenden Turnier, einer Abschlusstabelle
  und einem Turnier, für das noch kein Ranking existiert.
- Beachte die dokumentierte Bedeutung von `points`, `extraPoints`,
  `totalPoints`, `extraPointsPublished`, `rank` und `completed`.
- Bei einem aktuellen Turnier (`completed: false`) müssen zusätzlich die
  aktuellen Tipps der Teilnehmer erreichbar beziehungsweise sichtbar sein.
  Nutze dafür den dafür vorgesehenen API-Endpunkt und stelle Joker, Punkte und
  besondere Treffer verständlich dar, soweit die API diese Informationen
  liefert.

### Spieler

- Biete eine Auswahl aller Teilnehmer des Turniers.
- Zeige für den ausgewählten Teilnehmer seine Tipps über die Spiele und Runden
  hinweg sowie vorhandene Ranking- und Punktedaten.
- Verlinke Spiele sinnvoll zur Spielansicht.
- Noch nicht getippte oder noch nicht ausgewertete Spiele müssen klar von
  Ergebnissen mit null Punkten unterscheidbar sein.

### Spiele

- Biete eine nach Runden verständlich gruppierte Auswahl aller Spiele.
- Biete zusätzlich eine schnelle Vorheriges-/Nächstes-Navigation zum unmittelbar
  benachbarten Spiel, sofern dieses existiert. Die Reihenfolge muss der
  fachlichen Spielreihenfolge entsprechen. Am ersten beziehungsweise letzten
  Spiel darf kein nicht vorhandenes Ziel angeboten werden.
- Die Prev/Next-Navigation muss den `nr`-Query-Parameter aktualisieren, direkt
  verlinkbar bleiben und mit Tastatur sowie Touch-Eingabe gut bedienbar sein.
- Zeige für das ausgewählte Spiel die Tipps aller Teilnehmer.
- Stelle Ergebnis, Tipp, Punkte, Joker und besondere Treffer korrekt dar, soweit
  diese Werte vorhanden sind.
- Verlinke Teilnehmer sinnvoll zur Spieleransicht.
- Behandle offene Teams, ausstehende Tipps und noch nicht ausgewertete Spiele
  ausdrücklich.

### Turnierwechsel

- Die veröffentlichten Turniere sollen erreichbar und auswählbar sein.
- Ein Turnierwechsel muss zu den dazugehörigen Daten und URLs führen, ohne
  Auswahlzustände eines anderen Turniers versehentlich zu übernehmen.

## Daten und Datenschutz

- Verwende ausschließlich die öffentliche Lese-API unter
  `https://unterbau.runde.tips/api/v1`.
- Implementiere keine Schreibzugriffe und verwende nicht die interne
  Cache-Invalidierungsroute.
- Behandle IDs als opaque fachliche Schlüssel und leite aus ihnen keine
  zusätzlichen Bedeutungen ab.
- Zeige keine E-Mail-Adressen an. Die API liefert bei Mitgliedern aus
  Datenschutzgründen ein leeres `email`-Feld.
- Beachte optionale Felder gemäß API-Schema. `undefined`, leere Werte und null
  Punkte sind fachlich nicht zwangsläufig dasselbe.

## Qualität und Verifikation

- Lege eine verständliche lokale Entwicklungsanleitung bei.
- Richte Linting beziehungsweise statische Prüfung, Typprüfung und einen
  reproduzierbaren Production Build ein, sofern der gewählte Stack dies
  unterstützt.
- Teste mindestens die Auswahl des aktuellen Turniers, die Auflösung eines
  Slugs, die Standardauswahl und explizite Auswahl von Spieler und Spiel sowie
  die wichtigsten leeren Datenzustände.
- Verifiziere die Anwendung mit realen Antworten der Unterbau-API.
- Prüfe vor Abschluss alle sechs Routenvarianten, direkte Deep Links mit ihren
  Query-Parametern, Reloads und den Wechsel zwischen Turnieren.
- Prüfe die Prev/Next-Navigation der Spielansicht einschließlich des ersten und
  letzten Spiels sowie den dadurch aktualisierten `nr`-Query-Parameter.
- Prüfe die Oberfläche in schmalen und breiten Viewports sowie mit Tastatur.
- Führe einen Production Build aus und dokumentiere das Ergebnis.

## Erwartetes Ergebnis

Liefere einen eigenständig ausführbaren, dokumentierten und auf Cloudflare
deploybaren Web-Client. Erläutere am Ende knapp:

1. den gewählten Stack und die wichtigsten Architekturentscheidungen,
2. Datenabruf, Caching und Revalidierung,
3. Routing und Standardauswahlen,
4. ausgeführte Prüfungen,
5. bekannte Einschränkungen oder bewusst vertagte Punkte.

Wenn API-Vertrag, reale Daten und Legacy-Verhalten einander widersprechen,
dokumentiere den konkreten Befund und entscheide nicht stillschweigend. Frage
bei einer fachlich sichtbaren oder nicht reversiblen Entscheidung nach, statt
eine neue Fachregel zu erfinden.
