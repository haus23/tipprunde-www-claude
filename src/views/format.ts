import type { Match, Team } from '../api/schemas.ts';

const TIME_ZONE = 'Europe/Berlin';

const matchDateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'UTC',
});
const shortDateFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const stampFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const decimalFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(Date.UTC(y, m - 1, d));
}

/** `"2025-05-17"` → `"Sa., 17.05.25"`; empty dates stay empty. */
export function formatMatchDate(date: string) {
  const parsed = date ? parseDate(date) : undefined;
  return parsed ? matchDateFormat.format(parsed) : '';
}

/** `"2025-05-17"` → `"17.05."` */
export function formatShortDate(date: string) {
  const parsed = date ? parseDate(date) : undefined;
  return parsed ? `${shortDateFormat.format(parsed)}` : '';
}

export function formatStamp(epochMs: number) {
  return stampFormat.format(new Date(epochMs));
}

export function formatDecimal(value: number) {
  return decimalFormat.format(value);
}

export const OPEN_TEAM = 'offen';

export function teamName(teams: Record<string, Team>, teamId: string, variant: 'name' | 'shortname') {
  return (teamId && teams[teamId]?.[variant]) || OPEN_TEAM;
}

export function matchLabel(teams: Record<string, Team>, match: Match, variant: 'name' | 'shortname' = 'shortname') {
  return `${teamName(teams, match.hometeamId, variant)} – ${teamName(teams, match.awayteamId, variant)}`;
}
