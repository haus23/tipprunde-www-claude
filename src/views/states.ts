import type { Championship } from '../api/schemas.ts';
import { viewPath } from '../routing.ts';
import { emptyState, pageHeading } from './components.ts';
import { html } from './html.ts';

function championshipList(championships: Championship[], currentId: string | undefined) {
  if (championships.length === 0) return '';
  return html`<h2 class="section-title">Veröffentlichte Turniere</h2>
  <ul class="link-list" role="list">
    ${championships.map(
      (c) => html`<li><a href="${viewPath(c.id === currentId ? undefined : c.id, 'table')}">${c.name}</a></li>`,
    )}
  </ul>`;
}

export function notFoundView(championships: Championship[], currentId: string | undefined) {
  return html`${pageHeading('Fehler 404', 'Seite nicht gefunden')}
  <p class="lead">Hoppla, so etwas gibt es bei uns nicht. Vielleicht hilft einer dieser Links weiter:</p>
  <p><a class="button" href="/">Zum aktuellen Turnier</a></p>
  ${championshipList(championships, currentId)}`;
}

export function noChampionshipsView() {
  return html`${pageHeading('runde.tips', 'Willkommen')}
  ${emptyState('Noch keine Turniere', 'Sobald ein Turnier veröffentlicht ist, erscheint hier die Tabelle.')}`;
}

export function errorView(url: URL, offline: boolean) {
  return html`${pageHeading('Fehler', 'Daten nicht verfügbar')}
  ${emptyState(
    offline ? 'Der Datendienst ist gerade nicht erreichbar' : 'Die Daten konnten nicht gelesen werden',
    'Bitte versuche es in einem Moment erneut.',
    'alert',
  )}
  <p class="center"><a class="button" href="${url.pathname}${url.search}">Erneut versuchen</a></p>`;
}
