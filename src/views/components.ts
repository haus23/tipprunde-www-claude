import type { Tip } from '../api/schemas.ts';
import { hasTip } from '../domain/selection.ts';
import { type Html, html } from './html.ts';
import { type IconName, icon } from './icons.ts';

export function visuallyHidden(text: string) {
  return html`<span class="visually-hidden">${text}</span>`;
}

/** Joker / lonely-hit markers with text alternatives. */
export function tipMarks(tip: Tip | undefined) {
  if (!tip) return '';
  return html`${
    tip.joker && hasTip(tip)
      ? html`<span class="mark mark-joker" title="Joker"><span aria-hidden="true">J</span>${visuallyHidden(' Joker')}</span>`
      : ''
  }${
    tip.lonelyHit === true
      ? html`<span class="mark mark-lonely" title="Alleintreffer"><span aria-hidden="true">★</span>${visuallyHidden(' Alleintreffer')}</span>`
      : ''
  }`;
}

export function isHighlighted(tip: Tip | undefined) {
  return !!tip && ((tip.joker && hasTip(tip)) || tip.lonelyHit === true);
}

/** The tip itself, or a distinct placeholder for "no tip". */
export function tipValue(tip: Tip | undefined, evaluated: boolean) {
  if (hasTip(tip)) return html`<span class="score">${tip.tip}</span>`;
  return evaluated
    ? html`<span class="muted">kein Tipp</span>`
    : html`<span class="muted" aria-hidden="true">–</span>${visuallyHidden('noch kein Tipp')}`;
}

/** Awarded points; `undefined` means "not evaluated yet" and never shows as 0. */
export function pointsValue(points: number | undefined) {
  if (points === undefined) {
    return html`<span class="pending" aria-hidden="true">–</span>${visuallyHidden('noch nicht gewertet')}`;
  }
  return html`<span class="points">${points}</span>`;
}

export function emptyState(title: string, text?: string | Html, iconName: IconName = 'ball') {
  return html`<div class="empty">
    ${icon(iconName)}
    <p class="empty-title">${title}</p>
    ${text ? html`<p>${text}</p>` : ''}
  </div>`;
}

export function notice(text: string | Html) {
  return html`<p class="banner info" role="note">${text}</p>`;
}

export function pageHeading(eyebrow: string, title: string | Html, extra?: Html) {
  return html`<div class="page-head">
    <p class="eyebrow">${eyebrow}</p>
    <h1>${title}</h1>
    ${extra ?? ''}
  </div>`;
}

export interface Stat {
  label: string;
  value: string | number | Html;
}

export function stats(items: Stat[]) {
  return html`<dl class="stats">
    ${items.map((s) => html`<div><dt>${s.label}</dt><dd>${s.value}</dd></div>`)}
  </dl>`;
}

export function tipLegend() {
  return html`<p class="legend">
    <span><span class="mark mark-joker" aria-hidden="true">J</span> Joker</span>
    <span><span class="mark mark-lonely" aria-hidden="true">★</span> Alleintreffer</span>
    <span><span class="pending" aria-hidden="true">–</span> noch nicht gewertet</span>
  </p>`;
}
