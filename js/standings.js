import { getGroupTeams, getTeamMatches } from "./data.js";
import { isRealTeam, formatRank } from "./teams.js";

const SORT_KEYS = ["pts", "gd", "gf", "team"];

function emptyRecord(team) {
  return { team, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, rank: null };
}

function compareRows(a, b) {
  for (const key of SORT_KEYS) {
    if (key === "team") return a.team.localeCompare(b.team, "zh-CN");
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

/** 从体彩场次中的联赛排名构建积分榜（官方排名优先） */
export function computeLeagueRankStandings(currentMatches) {
  const groups = new Map();

  for (const m of currentMatches) {
    if (!m.group) continue;
    if (!groups.has(m.group)) {
      groups.set(m.group, {
        group: m.group,
        groupLabel: m.groupLabel || m.league || m.group,
        rankLeague: m.rankLeague || m.group,
        teams: new Map(),
      });
    }
    const g = groups.get(m.group);
    if (isRealTeam(m.home) && m.homeRank != null && !g.teams.has(m.home)) {
      g.teams.set(m.home, { team: m.home, rank: m.homeRank });
    }
    if (isRealTeam(m.away) && m.awayRank != null && !g.teams.has(m.away)) {
      g.teams.set(m.away, { team: m.away, rank: m.awayRank });
    }
  }

  return [...groups.values()]
    .map((g) => ({
      group: g.group,
      groupLabel: g.groupLabel,
      rankLeague: g.rankLeague,
      rows: [...g.teams.values()]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => ({
          team: r.team,
          rank: r.rank,
          mp: null,
          w: null,
          d: null,
          l: null,
          gf: null,
          ga: null,
          gd: null,
          pts: null,
          rankLabel: formatRank(r.rank, g.rankLeague),
        })),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));
}

function fixtureTeamsFromMatches(matches, group) {
  const teams = [];
  const seen = new Set();
  for (const m of matches || []) {
    if (group && m.group !== group) continue;
    for (const team of [m.home, m.away]) {
      if (!isRealTeam(team) || seen.has(team)) continue;
      seen.add(team);
      teams.push(team);
    }
  }
  return teams;
}

/** 当天有赛的联赛都要出 Tab：官方榜优先，否则本地赛果，再否则列出参赛球队 */
export function mergeStandingsWithToday(remoteGroups = [], currentMatches = [], allMatches = []) {
  const byGroup = new Map((remoteGroups || []).map((g) => [g.group, g]));
  const todayGroups = [...new Set((currentMatches || []).map((m) => m.group).filter(Boolean))];
  const keys = todayGroups.length ? todayGroups : [...byGroup.keys()];

  return keys
    .map((group) => {
      const remote = byGroup.get(group);
      if (remote?.rows?.length) return remote;

      const sample = (currentMatches || []).find((m) => m.group === group);
      const label = remote?.groupLabel || sample?.groupLabel || sample?.league || group;
      const computed = computeStandings(allMatches, group).filter((r) => r.mp > 0);
      if (computed.length) {
        return {
          group,
          groupLabel: label,
          mode: "computed",
          anchorMatchId: remote?.anchorMatchId || sample?.id,
          rows: computed,
        };
      }

      const teams = fixtureTeamsFromMatches(currentMatches, group);
      return {
        group,
        groupLabel: label,
        mode: "fixture",
        note: "资格赛/淘汰赛阶段官方暂无联赛积分榜，下列为今日参赛球队",
        anchorMatchId: remote?.anchorMatchId || sample?.id,
        rows: teams.map((team, i) => ({
          ...emptyRecord(team),
          rank: i + 1,
        })),
      };
    })
    .sort((a, b) => String(a.group).localeCompare(String(b.group), "zh-CN"));
}

export function computeAllStandings(allMatches, currentMatches = []) {
  const fromResults = [
    ...new Set(allMatches.filter((m) => m.group && m.finished).map((m) => m.group)),
  ];

  if (fromResults.length > 0) {
    return fromResults.sort().map((g) => ({
      group: g,
      groupLabel: allMatches.find((m) => m.group === g)?.groupLabel || g,
      mode: "computed",
      rows: computeStandings(allMatches, g),
    }));
  }

  return computeLeagueRankStandings(currentMatches).map((g) => ({ ...g, mode: "official" }));
}

export function getTeamGroupRank(matches, team, groupLetter) {
  if (!groupLetter || !isRealTeam(team)) return null;
  const row = computeAllStandings(matches).flatMap((g) => g.rows).find((r) => r.team === team);
  if (row?.rank != null) return row.rank;
  return rankInGroup(computeStandings(matches, groupLetter), team);
}

export function rankInGroup(tableRows, team) {
  const sorted = [...tableRows].sort(compareRows);
  return sorted.findIndex((r) => r.team === team) + 1;
}

export function getTeamPoints(matches, team, groupLetter) {
  const rows = computeStandings(matches, groupLetter);
  return rows.find((r) => r.team === team)?.pts ?? null;
}

export function getTeamRecentForm(allMatches, team, count = 5) {
  return getTeamMatches(allMatches, team)
    .filter((m) => m.finished)
    .slice(-count);
}

export { compareRows };
