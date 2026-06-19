import { getGroupTeams } from "./data.js";
import { isRealTeam } from "./teams.js";

const SORT_KEYS = ["pts", "gd", "gf", "team"];

function emptyRecord(team) {
  return { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

function compareRows(a, b) {
  for (const key of SORT_KEYS) {
    if (key === "team") return a.team.localeCompare(b.team);
    if (a[key] !== b[key]) return b[key] - a[key];
  }
  return 0;
}

function applyResult(table, home, away, hs, as) {
  const h = table[home];
  const a = table[away];
  h.mp += 1;
  a.mp += 1;
  h.gf += hs;
  h.ga += as;
  a.gf += as;
  a.ga += hs;

  if (hs > as) {
    h.w += 1;
    h.pts += 3;
    a.l += 1;
  } else if (hs < as) {
    a.w += 1;
    a.pts += 3;
    h.l += 1;
  } else {
    h.d += 1;
    a.d += 1;
    h.pts += 1;
    a.pts += 1;
  }
  h.gd = h.gf - h.ga;
  a.gd = a.gf - a.ga;
}

export function computeStandings(matches, groupLetter) {
  const teams = getGroupTeams(matches, groupLetter);
  const table = Object.fromEntries(teams.map((t) => [t, emptyRecord(t)]));

  matches
    .filter(
      (m) =>
        m.group === groupLetter &&
        m.finished &&
        isRealTeam(m.home) &&
        isRealTeam(m.away)
    )
    .forEach((m) => applyResult(table, m.home, m.away, m.homeScore, m.awayScore));

  return teams.map((t) => table[t]).sort(compareRows);
}

export function computeAllStandings(matches) {
  const groups = [
    ...new Set(matches.filter((m) => m.group).map((m) => m.group)),
  ].sort();

  return groups.map((g) => ({
    group: g,
    rows: computeStandings(matches, g),
  }));
}

export function getTeamPoints(matches, team, groupLetter) {
  const rows = computeStandings(matches, groupLetter);
  return rows.find((r) => r.team === team)?.pts ?? 0;
}

export function getTeamGroupRank(matches, team, groupLetter) {
  if (!groupLetter || !isRealTeam(team)) return null;
  return rankInGroup(computeStandings(matches, groupLetter), team);
}

export function buildTableFromResults(matches, groupLetter, assumedResults) {
  const teams = getGroupTeams(matches, groupLetter);
  const table = Object.fromEntries(teams.map((t) => [t, emptyRecord(t)]));

  matches
    .filter(
      (m) =>
        m.group === groupLetter &&
        m.finished &&
        isRealTeam(m.home) &&
        isRealTeam(m.away)
    )
    .forEach((m) => applyResult(table, m.home, m.away, m.homeScore, m.awayScore));

  assumedResults.forEach(({ home, away, homeScore, awayScore }) => {
    if (table[home] && table[away]) {
      applyResult(table, home, away, homeScore, awayScore);
    }
  });

  return teams.map((t) => table[t]);
}

export function rankInGroup(tableRows, team) {
  const sorted = [...tableRows].sort(compareRows);
  return sorted.findIndex((r) => r.team === team) + 1;
}

export { compareRows };
