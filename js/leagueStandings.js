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
    uniformTeamId: raw.uniformTeamId || null,
    sportteryTeamId: raw.sportteryTeamId || null,
  };
}

function extractTotalTables(value) {
  const phase = Array.isArray(value) ? value[0] : value;
  if (!phase) return [];
  const groups = phase.totalTables || [];
  const rows = [];
  for (const group of groups) {
    for (const row of group.tables || []) {
      rows.push({
        ...normalizeTableRow(row),
        groupName: group.groupName || "",
      });
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
  const rows = extractTotalTables(tables);
  if (!rows.length) return null;

  const payload = {
    leagueName: meta.tournamentShortName || "",
    seasonName: meta.seasonName || "",
    uniformLeagueId: meta.uniformLeagueId,
    seasonId: meta.seasonId,
    rows,
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
      const data = await fetchLeagueStandingsByMatch(match.id);
      if (!data) return null;
      const labelParts = [match.groupLabel || match.league || group, data.seasonName].filter(Boolean);
      return {
        group,
        groupLabel: labelParts.join(" · "),
        mode: "league",
        anchorMatchId: match.id,
        rows: data.rows,
      };
    })
  );

  return groups.filter(Boolean).sort((a, b) => a.group.localeCompare(b.group, "zh-CN"));
}

export function clearLeagueStandingsCache() {
  cache.clear();
}
