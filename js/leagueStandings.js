import { isCupLikeLeague } from "./data.js";
import { teamNamesLooselyEqual } from "./matchHistory.js";

const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const LEAGUE_BASE = "https://webapi.sporttery.cn/gateway/uniform/football/league";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/zqlszl/",
  Accept: "application/json, text/plain, */*",
};

const cache = new Map();

async function fetchUniform(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${UNIFORM_BASE}/${path}`, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data.value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLeague(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${LEAGUE_BASE}/${path}`, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success ? data.value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseIntField(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTableRow(raw) {
  return {
    team: raw.abbCnName || raw.teamShortName || "",
    rank: parseIntField(raw.ranking, null),
    mp: parseIntField(raw.totalLegCnt),
    w: parseIntField(raw.winGoalMatchCnt),
    d: parseIntField(raw.drawMatchCnt),
    l: parseIntField(raw.lossGoalMatchCnt),
    gf: parseIntField(raw.goalCnt),
    ga: parseIntField(raw.lossGoalCnt),
    gd: parseIntField(raw.netGoal),
    pts: parseIntField(raw.points),
    groupName: raw.groupName || "",
    uniformTeamId: raw.uniformTeamId || null,
    sportteryTeamId: raw.sportteryTeamId || null,
  };
}

function formatGroupLeague(groupName, tournamentShortName = "") {
  const raw = String(groupName || "").trim();
  const letter = raw.match(/Group\s*([A-Ha-h])/i) || raw.match(/([A-Ha-h])\s*组/);
  if (letter) return `${letter[1].toUpperCase()}组`;
  if (raw) return raw;
  return tournamentShortName || "";
}

function longestCommonSubstrLen(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let k = 0;
      while (a[i + k] && a[i + k] === b[j + k]) k += 1;
      if (k > best) best = k;
    }
  }
  return best;
}

function teamMatchScore(tableTeam, matchTeam) {
  if (!tableTeam || !matchTeam) return 0;
  if (tableTeam === matchTeam) return 100;
  if (teamNamesLooselyEqual(tableTeam, matchTeam)) return 80;
  const compact = (name) =>
    String(name || "")
      .replace(/足球俱乐部|足球队|俱乐部|\s+/g, "")
      .replace(/[尔爾]/g, "")
      .toLowerCase();
  const a = compact(tableTeam);
  const b = compact(matchTeam);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return 70;
  const lcs = longestCommonSubstrLen(a, b);
  return lcs >= 2 ? lcs * 10 : 0;
}

function pickTableRowsForMatch(rows, match) {
  const list = (rows || []).filter((r) => r?.team);
  if (!list.length) return { homeRow: null, awayRow: null };

  let bestHome = null;
  let bestAway = null;
  let bestScore = -1;
  for (const home of list) {
    const hs = teamMatchScore(home.team, match.home);
    for (const away of list) {
      if (away === home) continue;
      const as = teamMatchScore(away.team, match.away);
      const total = hs + as;
      if (hs > 0 && as > 0 && total > bestScore) {
        bestScore = total;
        bestHome = home;
        bestAway = away;
      }
    }
  }

  if (!bestHome) {
    const ranked = list
      .map((r) => ({ r, s: teamMatchScore(r.team, match.home) }))
      .sort((a, b) => b.s - a.s);
    if (ranked[0]?.s > 0) bestHome = ranked[0].r;
  }
  if (!bestAway) {
    const ranked = list
      .map((r) => ({ r, s: teamMatchScore(r.team, match.away) }))
      .filter((x) => x.r !== bestHome)
      .sort((a, b) => b.s - a.s);
    if (ranked[0]?.s > 0) bestAway = ranked[0].r;
  }

  // 本场小组榜通常只有对阵双方：一侧对上后，剩下那行归另一侧
  if (list.length === 2 && bestHome && !bestAway) {
    bestAway = list.find((r) => r !== bestHome) || null;
  }
  if (list.length === 2 && bestAway && !bestHome) {
    bestHome = list.find((r) => r !== bestAway) || null;
  }

  return { homeRow: bestHome, awayRow: bestAway };
}

/** 用本场小组积分榜覆盖杯赛配对名次（[解放者杯1]/[解放者杯2]） */
export function applyTableRanksToMatch(match, tableRows = [], tournamentShortName = "") {
  if (!match || !tableRows?.length) return false;
  const { homeRow, awayRow } = pickTableRowsForMatch(tableRows, match);
  let changed = false;
  const league =
    formatGroupLeague(homeRow?.groupName || awayRow?.groupName, tournamentShortName) ||
    match.rankLeague ||
    "";

  if (homeRow?.rank != null && homeRow.rank !== match.homeRank) {
    match.homeRank = homeRow.rank;
    changed = true;
  }
  if (awayRow?.rank != null && awayRow.rank !== match.awayRank) {
    match.awayRank = awayRow.rank;
    changed = true;
  }
  if (league && league !== match.rankLeague && (homeRow?.rank != null || awayRow?.rank != null)) {
    match.rankLeague = league;
    changed = true;
  }
  return changed;
}

/** 杯赛场次补小组排名，避免赛程上一直显示「解放者杯第1/第2」 */
export async function enrichMatchesWithTableRanks(...matchLists) {
  const byId = new Map();
  for (const list of matchLists) {
    for (const m of list || []) {
      if (m?.id == null) continue;
      const key = String(m.id);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(m);
    }
  }

  const samples = [...byId.values()]
    .map((arr) => arr[0])
    .filter((m) => isCupLikeLeague(m));
  if (!samples.length) return false;

  const results = await Promise.all(
    samples.map(async (sample) => {
      const meta = await fetchUniform(`getMatchTablesV1.qry?sportteryMatchId=${sample.id}`);
      const tables = (meta?.tables || []).map((row) => normalizeTableRow(row));
      return { id: sample.id, tables, league: meta?.tournamentShortName || "" };
    })
  );

  let changed = false;
  for (const { id, tables, league } of results) {
    if (!tables.length) continue;
    for (const m of byId.get(String(id)) || []) {
      if (applyTableRanksToMatch(m, tables, league)) changed = true;
    }
  }
  return changed;
}

function extractTotalTables(value) {
  const phases = Array.isArray(value) ? value : value ? [value] : [];
  const rows = [];
  for (const phase of phases) {
    if (!phase) continue;
    const groups = phase.totalTables || phase.groupTables || [];
    if (Array.isArray(groups) && groups.some((g) => Array.isArray(g?.tables))) {
      for (const group of groups) {
        for (const row of group.tables || []) {
          rows.push({
            ...normalizeTableRow(row),
            groupName: group.groupName || "",
          });
        }
      }
      continue;
    }
    const flat = phase.tables || phase.tableList || [];
    if (Array.isArray(flat) && flat.length && (flat[0]?.ranking != null || flat[0]?.abbCnName || flat[0]?.teamShortName)) {
      for (const row of flat) rows.push(normalizeTableRow(row));
    }
  }
  return rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

export async function fetchLeagueStandingsByMatch(matchId) {
  const meta = await fetchUniform(`getMatchTablesV1.qry?sportteryMatchId=${matchId}`);
  if (!meta?.uniformLeagueId || !meta?.seasonId) return null;

  const cacheKey = `${meta.uniformLeagueId}-${meta.seasonId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const tables = await fetchLeague(
    `getTablesV1.qry?uniformLeagueId=${meta.uniformLeagueId}&seasonId=${meta.seasonId}`
  );
  const matchTables = (meta.tables || []).map((row) => normalizeTableRow(row));
  const rows = extractTotalTables(tables);
  if (!rows.length && !matchTables.length) return null;

  const payload = {
    leagueName: meta.tournamentShortName || "",
    seasonName: meta.seasonName || "",
    uniformLeagueId: meta.uniformLeagueId,
    seasonId: meta.seasonId,
    rows,
    matchTables,
  };
  cache.set(cacheKey, payload);
  return payload;
}

export async function fetchStandingsForMatches(matches) {
  const byGroup = new Map();
  for (const match of matches) {
    if (!match?.group || !match?.id) continue;
    if (!byGroup.has(match.group)) byGroup.set(match.group, match);
  }

  const groups = await Promise.all(
    [...byGroup.entries()].map(async ([group, match]) => {
      const data = await fetchLeagueStandingsByMatch(match.id).catch(() => null);
      const labelParts = [match.groupLabel || match.league || group, data?.seasonName].filter(Boolean);
      return {
        group,
        groupLabel: labelParts.join(" · "),
        mode: data?.rows?.length ? "league" : "empty",
        anchorMatchId: match.id,
        rows: data?.rows || [],
      };
    })
  );

  return groups.filter(Boolean).sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));
}

export function clearLeagueStandingsCache() {
  cache.clear();
}
