import type { Championship } from '../api/schemas.ts';
import { ASSETS } from '../generated/assets.ts';
import { type View, viewPath } from '../routing.ts';
import { formatStamp } from './format.ts';
import { type Html, html, raw } from './html.ts';
import { icon } from './icons.ts';

export interface ChampionshipNav {
  championship: Championship;
  /** Slug used in links; `undefined` for the short routes of the current championship. */
  linkSlug: string | undefined;
  /** All published championships, newest first. */
  championships: Championship[];
  currentId: string | undefined;
  view: View;
}

export interface LayoutProps {
  title: string;
  description?: string;
  /** Canonical path of the page, if any. */
  canonical?: string;
  nav?: ChampionshipNav;
  /** Oldest fetch time of the displayed data (epoch ms). */
  dataTime?: number;
  /** Data had to be served from cache because the API failed. */
  fallback?: boolean;
  /** Replace the address bar URL after load (invalid query values). */
  replaceUrl?: string;
  body: Html;
}

const TABS: { view: View; label: string; icon: Parameters<typeof icon>[0] }[] = [
  { view: 'table', label: 'Tabelle', icon: 'table' },
  { view: 'player', label: 'Spieler', icon: 'user' },
  { view: 'match', label: 'Spiele', icon: 'ball' },
];

const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }],
});

function championshipSwitcher(nav: ChampionshipNav) {
  const { championship, championships, currentId, view } = nav;
  return html`<details class="switcher" data-menu>
    <summary class="switcher-button">
      <span class="visually-hidden">Turnier wechseln, gewählt: </span>
      <span class="switcher-label">${championship.name}</span>
      ${icon('chevron-down')}
    </summary>
    <nav class="switcher-panel" aria-label="Turniere">
      <ul role="list">
        ${championships.map((c) => {
          const slug = c.id === currentId ? undefined : c.id;
          const selected = c.id === championship.id;
          return html`<li>
            <a href="${viewPath(slug, view)}" ${selected ? raw('aria-current="page"') : ''}>
              <span>${c.name}</span>
              ${c.id === currentId ? html`<span class="tag">aktuell</span>` : ''}
              ${selected ? icon('check') : ''}
            </a>
          </li>`;
        })}
      </ul>
    </nav>
  </details>`;
}

function viewTabs(nav: ChampionshipNav) {
  return html`<nav class="tabs" aria-label="Ansichten">
    <ul role="list">
      ${TABS.map(
        (tab) => html`<li>
          <a href="${viewPath(nav.linkSlug, tab.view)}" ${tab.view === nav.view ? raw('aria-current="page"') : ''}>
            ${icon(tab.icon)}<span>${tab.label}</span>
          </a>
        </li>`,
      )}
    </ul>
  </nav>`;
}

export function layout(props: LayoutProps) {
  const { nav } = props;
  const title = props.title ? `${props.title} · runde.tips` : 'runde.tips';
  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${props.description ?? 'Tabelle, Tipps und Spiele der Haus23-Tipprunde.'}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101218" media="(prefers-color-scheme: dark)">
${props.canonical ? html`<link rel="canonical" href="${props.canonical}">` : ''}
<link rel="stylesheet" href="${ASSETS.css}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<script type="module" src="${ASSETS.js}"></script>
<script type="speculationrules">${raw(SPECULATION_RULES)}</script>
</head>
<body${props.dataTime ? html` data-time="${props.dataTime}"` : ''}${nav && !nav.championship.completed ? raw(' data-live') : ''}${props.replaceUrl ? html` data-replace-url="${props.replaceUrl}"` : ''}>
<a class="skip-link" href="#main">Zum Inhalt springen</a>
<header class="site-header">
  <div class="header-bar">
    <a class="brand" href="/" aria-label="runde.tips – aktuelles Turnier">
      <svg class="logo" viewBox="0 0 3160 2610" aria-hidden="true"><use href="${ASSETS.logo}#logo"></use></svg>
      <span class="brand-name" aria-hidden="true">runde.tips</span>
    </a>
    ${nav ? championshipSwitcher(nav) : ''}
  </div>
  ${nav ? viewTabs(nav) : ''}
</header>
<div class="status" id="status" role="status" aria-live="polite">${
    props.fallback
      ? html`<p class="banner warn">Die Daten konnten gerade nicht aktualisiert werden. Angezeigt wird der letzte bekannte Stand.</p>`
      : ''
  }</div>
<main id="main" tabindex="-1">
${props.body}
</main>
<footer class="site-footer">
  ${props.dataTime ? html`<p>Stand: <time id="data-time" datetime="${new Date(props.dataTime).toISOString()}">${formatStamp(props.dataTime)}</time></p>` : ''}
  <p>Haus23-Tipprunde · <a href="https://unterbau.runde.tips/docs">Datenquelle</a></p>
</footer>
</body>
</html>`;
}
