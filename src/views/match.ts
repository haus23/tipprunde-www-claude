import type { Championship, ChampionshipMatches, ChampionshipPlayer, Match, MatchTips } from '../api/schemas.ts';
import { groupByRound, hasTip, isEvaluated, neighbours, sortByRank, tipPoints } from '../domain/selection.ts';
import { viewPath } from '../routing.ts';
import {
  emptyState,
  isHighlighted,
  notice,
  pageHeading,
  pointsValue,
  tipLegend,
  tipMarks,
  tipValue,
} from './components.ts';
import { formatMatchDate, matchLabel, teamName } from './format.ts';
import { cx, html } from './html.ts';
import { icon } from './icons.ts';

export interface MatchProps {
  championship: Championship;
  linkSlug: string | undefined;
  players: ChampionshipPlayer[];
  matches: ChampionshipMatches;
  match: Match | undefined;
  invalidNr: string | undefined;
  tips: MatchTips | undefined;
}

function matchPicker(props: MatchProps, match: Match) {
  const { rounds, matches, teams } = props.matches;
  return html`<form class="picker" method="get" action="${viewPath(props.linkSlug, 'match')}" data-autosubmit>
    <label for="match-select" class="visually-hidden">Spiel auswählen</label>
    <span class="select">
      <select id="match-select" name="nr">
        ${groupByRound(rounds, matches).map(
          (
            group,
          ) => html`<optgroup label="${group.round ? `Runde ${group.round.nr}${group.round.isDoubleRound ? ' (Doppelrunde)' : ''}` : 'Ohne Runde'}">
            ${group.matches.map(
              (m) =>
                html`<option value="${m.nr}" ${m.id === match.id ? 'selected' : ''}>${m.nr}. ${matchLabel(teams, m)}${isEvaluated(m) ? ` (${m.result})` : ''}</option>`,
            )}
          </optgroup>`,
        )}
      </select>
    </span>
    <button type="submit" class="button js-hidden">Anzeigen</button>
  </form>`;
}

function stepLink(props: MatchProps, target: Match | undefined, direction: 'prev' | 'next') {
  const label = html`${direction === 'prev' ? 'Vorheriges' : 'Nächstes'}<span class="step-word"> Spiel</span>`;
  const iconName = direction === 'prev' ? 'chevron-left' : 'chevron-right';
  if (!target) {
    // No target → nothing to activate. Keeps the layout stable.
    return html`<span class="step step-${direction} is-disabled" aria-hidden="true">${icon(iconName)}<span class="step-text"><span class="step-label">${label}</span></span></span>`;
  }
  return html`<a class="step step-${direction}" href="${viewPath(props.linkSlug, 'match', { nr: target.nr })}" rel="${direction}" data-step="${direction}">
    ${icon(iconName)}
    <span class="step-text">
      <span class="step-label">${label}</span>
      <span class="step-match">${target.nr}. ${matchLabel(props.matches.teams, target)}</span>
    </span>
  </a>`;
}

export function matchView(props: MatchProps) {
  const { championship, match, linkSlug } = props;
  const eyebrow = championship.name;

  if (!match) {
    return html`${pageHeading(eyebrow, 'Spiele')}
      ${emptyState('Noch keine Spiele', 'Für dieses Turnier sind noch keine Spiele angesetzt.')}`;
  }

  const { teams, leagues, rounds, matches } = props.matches;
  const round = rounds.find((r) => r.id === match.roundId);
  const league = match.leagueId ? leagues[match.leagueId] : undefined;
  const evaluated = isEvaluated(match);
  const { prev, next } = neighbours(matches, match);
  const players = sortByRank(props.players);
  const tips = props.tips?.tips ?? {};
  const tipCount = players.filter((p) => hasTip(tips[p.id])).length;
  const home = teamName(teams, match.hometeamId, 'name');
  const away = teamName(teams, match.awayteamId, 'name');

  return html`${pageHeading(
    eyebrow,
    html`<span class="visually-hidden">Tipps zum Spiel ${match.nr}: ${home} gegen ${away}</span><span aria-hidden="true">Tipps zum Spiel</span>`,
    matchPicker(props, match),
  )}
  ${
    props.invalidNr !== undefined
      ? notice(
          html`Ein Spiel Nr. „${props.invalidNr}“ gibt es in diesem Turnier nicht. Angezeigt wird Spiel ${match.nr}.`,
        )
      : ''
  }
  <nav class="stepper" aria-label="Benachbarte Spiele">
    ${stepLink(props, prev, 'prev')}
    ${stepLink(props, next, 'next')}
  </nav>
  <section class="match-card" aria-label="Spieldaten">
    <p class="match-meta">
      <span>Spiel ${match.nr}</span>
      ${round ? html`<span>Runde ${round.nr}</span>` : ''}
      ${match.date ? html`<span>${formatMatchDate(match.date)}</span>` : html`<span>Termin offen</span>`}
      ${league ? html`<span>${league.name}</span>` : ''}
    </p>
    <div class="scoreboard">
      <span class="${cx('team', !match.hometeamId && 'muted')}">${home}</span>
      <span class="${cx('final', !evaluated && 'is-open')}">${evaluated ? match.result : '–:–'}</span>
      <span class="${cx('team', !match.awayteamId && 'muted')}">${away}</span>
    </div>
    <p class="match-summary">
      ${evaluated ? html`<span>Punkte gesamt: <strong>${match.points ?? '–'}</strong></span>` : html`<span>Noch nicht gewertet</span>`}
      <span>${tipCount} von ${players.length} ${players.length === 1 ? 'Tipp' : 'Tipps'} abgegeben</span>
    </p>
    ${
      round?.isDoubleRound
        ? html`<p class="banner info">Das Spiel gehört zu einer Doppelrunde: Alle erzielten Punkte werden verdoppelt.</p>`
        : ''
    }
  </section>
  ${
    players.length === 0
      ? emptyState('Noch keine Teilnehmer', 'Für dieses Turnier sind noch keine Mitspieler eingetragen.', 'user')
      : html`<div class="table-scroll">
    <table class="data match-tips">
      <caption class="visually-hidden">Tipps aller Teilnehmer zu Spiel ${match.nr}</caption>
      <thead><tr>
        <th scope="col" class="col-name">Spieler</th>
        <th scope="col" class="col-score">Tipp</th>
        <th scope="col" class="col-num">Punkte</th>
      </tr></thead>
      <tbody>
      ${players.map((p) => {
        const tip = tips[p.id];
        return html`<tr class="${cx(isHighlighted(tip) && 'hl')}">
          <th scope="row" class="col-name"><a href="${viewPath(linkSlug, 'player', { name: p.playerId })}">${p.account.name}</a></th>
          <td class="col-score"><span class="tip-cell">${tipValue(tip, evaluated)}${hasTip(tip) ? tipMarks(tip) : ''}</span></td>
          <td class="col-num">${pointsValue(tipPoints(match, tip))}</td>
        </tr>`;
      })}
      </tbody>
    </table>
  </div>
  ${tipLegend()}`
  }`;
}
