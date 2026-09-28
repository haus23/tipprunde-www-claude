import type { Championship, ChampionshipMatches, ChampionshipPlayer, PlayerTips } from '../api/schemas.ts';
import {
  average,
  currentRoundId,
  groupByRound,
  hasTip,
  isEvaluated,
  sortByRank,
  tipPoints,
} from '../domain/selection.ts';
import { viewPath } from '../routing.ts';
import {
  emptyState,
  isHighlighted,
  notice,
  pageHeading,
  pointsValue,
  type Stat,
  stats,
  tipLegend,
  tipMarks,
  tipValue,
  visuallyHidden,
} from './components.ts';
import { formatDecimal, formatShortDate, matchLabel, teamName } from './format.ts';
import { cx, html } from './html.ts';

export interface PlayerProps {
  championship: Championship;
  linkSlug: string | undefined;
  players: ChampionshipPlayer[];
  player: ChampionshipPlayer | undefined;
  invalidName: string | undefined;
  matches: ChampionshipMatches;
  tips: PlayerTips | undefined;
}

function playerPicker(props: PlayerProps, player: ChampionshipPlayer) {
  const players = sortByRank(props.players);
  return html`<form class="picker" method="get" action="${viewPath(props.linkSlug, 'player')}" data-autosubmit>
    <label for="player-select" class="visually-hidden">Spieler auswählen</label>
    <span class="select">
      <select id="player-select" name="name">
        ${players.map(
          (p) => html`<option value="${p.playerId}" ${p.id === player.id ? 'selected' : ''}>${p.account.name}</option>`,
        )}
      </select>
    </span>
    <button type="submit" class="button js-hidden">Anzeigen</button>
  </form>`;
}

export function playerView(props: PlayerProps) {
  const { championship, player, linkSlug } = props;
  const eyebrow = championship.name;

  if (!player) {
    return html`${pageHeading(eyebrow, 'Spieler')}
      ${emptyState('Noch keine Teilnehmer', 'Für dieses Turnier sind noch keine Mitspieler eingetragen.', 'user')}`;
  }

  const { matches, teams } = props.matches;
  const tips = props.tips?.tips ?? {};
  const evaluated = matches.filter(isEvaluated);
  const avg = player.points === undefined ? undefined : average(player.points, evaluated.length);

  const statItems: Stat[] = [
    { label: 'Platz', value: player.rank === undefined ? 'noch keine Wertung' : `${player.rank}.` },
    { label: championship.extraPointsPublished ? 'Tipp-Punkte' : 'Punkte', value: player.points ?? '–' },
  ];
  if (championship.extraPointsPublished) {
    statItems.push({ label: 'Zusatzpunkte', value: player.extraPoints ?? '–' });
    statItems.push({ label: 'Gesamt', value: player.totalPoints ?? '–' });
  }
  statItems.push({ label: 'Gewertete Spiele', value: `${evaluated.length} von ${matches.length}` });
  statItems.push({ label: 'Schnitt', value: avg === undefined ? '–' : formatDecimal(avg) });

  const heading = html`<span class="visually-hidden">Tipps von ${player.account.name}</span><span aria-hidden="true">Tipps von</span>`;

  if (matches.length === 0) {
    return html`${pageHeading(eyebrow, heading, playerPicker(props, player))}
      ${props.invalidName !== undefined ? invalidNotice(props.invalidName, player) : ''}
      ${stats(statItems)}
      ${emptyState('Noch keine Spiele', 'Sobald Spiele angesetzt sind, erscheinen hier die Tipps.')}`;
  }

  const openRound = currentRoundId(matches);
  const groups = groupByRound(props.matches.rounds, matches);

  return html`${pageHeading(eyebrow, heading, playerPicker(props, player))}
  ${props.invalidName !== undefined ? invalidNotice(props.invalidName, player) : ''}
  ${stats(statItems)}
  <div class="rounds">
  ${groups.map((group) => {
    const roundEvaluated = group.matches.filter(isEvaluated);
    const roundPoints = group.matches.reduce((sum, m) => sum + (tipPoints(m, tips[m.id]) ?? 0), 0);
    const roundAvg = average(roundPoints, roundEvaluated.length);
    const title = group.round ? `Runde ${group.round.nr}` : 'Ohne Runde';
    const open = group.round ? group.round.id === openRound : false;
    return html`<details class="round" ${open ? 'open' : ''}>
      <summary>
        <h2 class="round-title">${title}${group.round?.isDoubleRound ? html` <span class="tag">Doppelrunde</span>` : ''}</h2>
        ${
          roundEvaluated.length > 0
            ? html`<span class="round-stats">
              <span><span class="visually-hidden">Gewertete </span>Spiele ${roundEvaluated.length}</span>
              <span>Punkte ${roundPoints}</span>
              <span><abbr title="Schnitt">⌀</abbr> ${roundAvg === undefined ? '–' : formatDecimal(roundAvg)}</span>
            </span>`
            : html`<span class="round-stats muted">${group.matches.length} ${group.matches.length === 1 ? 'Spiel' : 'Spiele'}</span>`
        }
      </summary>
      ${
        group.matches.length === 0
          ? html`<p class="round-empty">Keine Spiele in dieser Runde.</p>`
          : html`<div class="table-scroll">
        <table class="data player-tips">
          <caption class="visually-hidden">${title}: Tipps von ${player.account.name}</caption>
          <thead><tr>
            <th scope="col" class="col-nr"><abbr title="Spielnummer">Nr.</abbr></th>
            <th scope="col" class="col-date">Datum</th>
            <th scope="col" class="col-match">Spiel</th>
            <th scope="col" class="col-score">Ergebnis</th>
            <th scope="col" class="col-score">Tipp</th>
            <th scope="col" class="col-num"><abbr title="Punkte">Pkt.</abbr></th>
          </tr></thead>
          <tbody>
          ${group.matches.map((m) => {
            const tip = tips[m.id];
            const done = isEvaluated(m);
            return html`<tr class="${cx(isHighlighted(tip) && 'hl', !done && 'upcoming')}">
              <td class="col-nr">${m.nr}</td>
              <td class="col-date">${formatShortDate(m.date) || html`<span class="muted">offen</span>`}</td>
              <th scope="row" class="col-match"><a href="${viewPath(linkSlug, 'match', { nr: m.nr })}">
                <span class="long">${matchLabel(teams, m, 'name')}</span><span class="short" aria-hidden="true">${teamName(teams, m.hometeamId, 'shortname')} – ${teamName(teams, m.awayteamId, 'shortname')}</span>
              </a></th>
              <td class="col-score">${done ? html`<span class="score">${m.result}</span>` : html`<span class="muted" aria-hidden="true">–</span>${visuallyHidden('noch kein Ergebnis')}`}</td>
              <td class="col-score"><span class="tip-cell">${tipValue(tip, done)}${hasTip(tip) ? tipMarks(tip) : ''}</span></td>
              <td class="col-num">${pointsValue(tipPoints(m, tip))}</td>
            </tr>`;
          })}
          </tbody>
        </table>
      </div>`
      }
    </details>`;
  })}
  </div>
  ${tipLegend()}`;
}

function invalidNotice(name: string, player: ChampionshipPlayer) {
  return notice(html`Einen Spieler „${name}“ gibt es in diesem Turnier nicht. Angezeigt wird ${player.account.name}.`);
}
