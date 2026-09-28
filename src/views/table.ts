import type { Championship, ChampionshipPlayer, CurrentTips, CurrentTipsMatch } from '../api/schemas.ts';
import { hasRanking, isEvaluated, rankLabels, sortByRank, tipPoints } from '../domain/selection.ts';
import { viewPath } from '../routing.ts';
import {
  emptyState,
  isHighlighted,
  pageHeading,
  pointsValue,
  tipLegend,
  tipMarks,
  visuallyHidden,
} from './components.ts';
import { OPEN_TEAM } from './format.ts';
import { cx, html } from './html.ts';

export interface TableProps {
  championship: Championship;
  linkSlug: string | undefined;
  players: ChampionshipPlayer[];
  currentTips: CurrentTips;
}

function optionalNumber(value: number | undefined) {
  return value === undefined ? html`<span class="muted" aria-hidden="true">–</span>${visuallyHidden('keine')}` : value;
}

function currentMatchHeader(m: CurrentTipsMatch, linkSlug: string | undefined) {
  const home = m.hometeam || OPEN_TEAM;
  const away = m.awayteam || OPEN_TEAM;
  return html`<th scope="col" class="col-tip">
    <a href="${viewPath(linkSlug, 'match', { nr: m.nr })}" class="match-head">
      <span>${home}</span><span aria-hidden="true">–</span>${visuallyHidden(' gegen ')}<span>${away}</span>
    </a>
    <span class="match-head-result">${isEvaluated(m) ? m.result : html`<span class="muted">offen</span>`}</span>
  </th>`;
}

function currentTipCell(m: CurrentTipsMatch, player: ChampionshipPlayer) {
  const tip = m.tips[player.id];
  const evaluated = isEvaluated(m);
  const hasTip = tip !== undefined && tip.tip !== '';
  return html`<td class="${cx('col-tip', isHighlighted(tip) && 'hl')}">
    <span class="tip-cell">
      ${hasTip ? html`<span class="score">${tip.tip}</span>` : html`<span class="muted" aria-hidden="true">–</span>${visuallyHidden('kein Tipp')}`}
      ${evaluated ? html`<span class="tip-points">${pointsValue(tipPoints(m, tip))}${visuallyHidden(' Punkte')}</span>` : ''}
      ${tipMarks(tip)}
    </span>
  </td>`;
}

export function tableView(props: TableProps) {
  const { championship, linkSlug, currentTips } = props;
  const players = sortByRank(props.players);
  const ranked = hasRanking(players);
  const showCurrent = !championship.completed && currentTips.length > 0;
  const showExtra = ranked && championship.extraPointsPublished;

  const title = !ranked ? 'Teilnehmer' : championship.completed ? 'Abschlusstabelle' : 'Aktuelle Tabelle';
  const status = championship.completed ? 'abgeschlossen' : 'läuft';

  if (players.length === 0) {
    return html`${pageHeading(`${championship.name} · ${status}`, 'Tabelle')}
      ${emptyState('Noch keine Teilnehmer', 'Für dieses Turnier sind noch keine Mitspieler eingetragen.', 'user')}`;
  }

  const labels = rankLabels(players);

  return html`${pageHeading(`${championship.name} · ${status}`, title)}
  ${
    !ranked
      ? html`<p class="lead">Noch keine Wertung – die Tabelle erscheint, sobald das erste Spiel ausgewertet ist.</p>`
      : ''
  }
  <div class="table-scroll" tabindex="0" role="region" aria-labelledby="ranking-caption">
    <table class="${cx('data', 'ranking', showCurrent && 'with-current')}">
      <caption id="ranking-caption" class="visually-hidden">${title} ${championship.name}${showCurrent ? ' mit aktuellen Tipps' : ''}</caption>
      <thead>
        ${
          showCurrent
            ? html`<tr class="group-row">
          <td colspan="${1 + (ranked ? 1 : 0) + (ranked ? (showExtra ? 3 : 1) : 0)}"></td>
          <th scope="colgroup" colspan="${currentTips.length}" class="col-tip group-head">Aktuelle Tipps</th>
        </tr>`
            : ''
        }
        <tr>
          ${ranked ? html`<th scope="col" class="col-rank"><abbr title="Platz">Pl.</abbr></th>` : ''}
          <th scope="col" class="col-name">Name</th>
          ${
            ranked
              ? showExtra
                ? html`<th scope="col" class="col-num"><abbr title="Punkte aus Tipps">Tipps</abbr></th>
                  <th scope="col" class="col-num"><abbr title="Zusatzpunkte">Zusatz</abbr></th>
                  <th scope="col" class="col-num col-total">Gesamt</th>`
                : html`<th scope="col" class="col-num col-total">Punkte</th>`
              : ''
          }
          ${showCurrent ? currentTips.map((m) => currentMatchHeader(m, linkSlug)) : ''}
        </tr>
      </thead>
      <tbody>
        ${players.map((p, ix) => {
          const label = labels[ix];
          return html`<tr>
            ${
              ranked
                ? html`<td class="col-rank">${
                    label?.rank === undefined
                      ? html`<span class="muted" aria-hidden="true">–</span>${visuallyHidden('ohne Platz')}`
                      : label.first
                        ? `${label.rank}.`
                        : visuallyHidden(`${label.rank}.`)
                  }</td>`
                : ''
            }
            <th scope="row" class="col-name"><a href="${viewPath(linkSlug, 'player', { name: p.playerId })}">${p.account.name}</a></th>
            ${
              ranked
                ? showExtra
                  ? html`<td class="col-num">${optionalNumber(p.points)}</td>
                    <td class="col-num">${optionalNumber(p.extraPoints)}</td>
                    <td class="col-num col-total">${optionalNumber(p.totalPoints)}</td>`
                  : html`<td class="col-num col-total">${optionalNumber(p.totalPoints)}</td>`
                : ''
            }
            ${showCurrent ? currentTips.map((m) => currentTipCell(m, p)) : ''}
          </tr>`;
        })}
      </tbody>
    </table>
  </div>
  ${showCurrent ? tipLegend() : ''}`;
}
