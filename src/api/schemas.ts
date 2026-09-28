/**
 * Response contracts of the public Unterbau API (v1).
 *
 * Mirrors the OpenAPI description (generated from the Valibot schemas in
 * `@haus23/tipprunde-model`). IDs are treated as opaque non-empty strings; the
 * client never derives meaning from their format. Member e-mail addresses are
 * intentionally not part of the parsed shape, so they can never be rendered.
 */
import {
  array,
  boolean,
  type Infer,
  nonEmptyString,
  nullish,
  number,
  object,
  optional,
  record,
  string,
} from './validate.ts';

const id = nonEmptyString;
const positiveInt = () => number({ integer: true, min: 1 });

/** `"2:1"` or `""` (no result / no tip yet). */
const result = () => string(/^\d{1,2}:\d{1,2}$|^$/);
/** ISO date `YYYY-MM-DD` or `""` (date not yet known). */
const matchDate = () => string(/^\d{4}-[01]\d-[0-3]\d$|^$/);

export const ChampionshipSchema = object({
  id: id(),
  name: nonEmptyString(),
  nr: positiveInt(),
  published: boolean(),
  extraPointsPublished: boolean(),
  completed: boolean(),
});
export const ChampionshipsSchema = array(ChampionshipSchema);

const MemberSchema = object({
  id: id(),
  name: nonEmptyString(),
});

export const ChampionshipPlayerSchema = object({
  /** Document id of the participation; key of tips in match/current tips. */
  id: id(),
  /** Member id; used as `?name=` in URLs and for the player-tips endpoint. */
  playerId: id(),
  nr: positiveInt(),
  rank: optional(positiveInt()),
  points: optional(number()),
  extraPoints: optional(number()),
  totalPoints: optional(number()),
  account: MemberSchema,
});
export const ChampionshipPlayersSchema = array(ChampionshipPlayerSchema);

const RoundSchema = object({
  id: id(),
  nr: positiveInt(),
  isDoubleRound: optional(boolean(), false),
});

/** Optional team / league reference; `null`, missing and `""` all mean "open". */
const optionalRef = () => nullish(string(), '');

const MatchSchema = object({
  id: id(),
  nr: positiveInt(),
  date: optional(matchDate(), ''),
  result: optional(result(), ''),
  points: optional(number({ min: 0 })),
  roundId: id(),
  leagueId: optionalRef(),
  hometeamId: optionalRef(),
  awayteamId: optionalRef(),
});

const TeamSchema = object({
  id: id(),
  name: nonEmptyString(),
  shortname: nonEmptyString(),
});

export const ChampionshipMatchesSchema = object({
  rounds: array(RoundSchema),
  matches: array(MatchSchema),
  teams: record(TeamSchema),
  leagues: record(TeamSchema),
});

const TipSchema = object({
  id: id(),
  tip: result(),
  joker: boolean(),
  points: optional(number({ min: 0 })),
  lonelyHit: optional(boolean()),
  matchId: id(),
  playerId: id(),
});

export const ChampionshipCurrentTipsSchema = array(
  object({
    matchId: id(),
    nr: positiveInt(),
    hometeam: optional(string(), ''),
    awayteam: optional(string(), ''),
    result: optional(result(), ''),
    /** Keyed by championship player id (`ChampionshipPlayer.id`). */
    tips: record(TipSchema),
  }),
);

export const ChampionshipPlayerTipsSchema = object({
  playerId: id(),
  /** Keyed by match id. */
  tips: record(TipSchema),
});

export const ChampionshipMatchTipsSchema = object({
  matchId: id(),
  /** Keyed by championship player id (`ChampionshipPlayer.id`). */
  tips: record(TipSchema),
});

export type Championship = Infer<typeof ChampionshipSchema>;
export type ChampionshipPlayer = Infer<typeof ChampionshipPlayerSchema>;
export type ChampionshipMatches = Infer<typeof ChampionshipMatchesSchema>;
export type Round = Infer<typeof RoundSchema>;
export type Match = Infer<typeof MatchSchema>;
export type Team = Infer<typeof TeamSchema>;
export type Tip = Infer<typeof TipSchema>;
export type CurrentTips = Infer<typeof ChampionshipCurrentTipsSchema>;
export type CurrentTipsMatch = CurrentTips[number];
export type PlayerTips = Infer<typeof ChampionshipPlayerTipsSchema>;
export type MatchTips = Infer<typeof ChampionshipMatchTipsSchema>;
