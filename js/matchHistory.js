const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html",
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

function parseScore(fullCourtGoal) {
  if (!fullCourtGoal || !String(fullCourtGoal).includes(":")) return [null, null];
  const [homeScore, awayScore] = String(fullCourtGoal).split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return [null, null];
  return [homeScore, awayScore];
}

function parseHalfScore(halfTimeGoal) {
  if (!halfTimeGoal || !String(halfTimeGoal).includes(":")) return [null, null];
  const [homeHtScore, awayHtScore] = String(halfTimeGoal).split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(homeHtScore) || Number.isNaN(awayHtScore)) return [null, null];
  return [homeHtScore, awayHtScore];
}

export function normalizeUniformHistoryMatch(raw, context = {}) {
  const [homeScore, awayScore] = parseScore(raw.fullCourtGoal);
  const [homeHtScore, awayHtScore] = parseHalfScore(raw.halfTimeGoal);
  const finished = homeScore != null && awayScore != null;

  return {
    id: raw.sportteryMatchId || raw.matchId || `${raw.matchDate}-${raw.homeTeamShortName}-${raw.awayTeamShortName}`,
    home: raw.homeTeamShortName,
    away: raw.awayTeamShortName,
    homeScore,
    awayScore,
    homeHtScore,
    awayHtScore,
    finished,
    date: raw.matchDate,
    leagueShort: raw.tournamentShortName || context.leagueShort || "",
    league: raw.tournamentShortName || context.league || "",
    group: raw.tournamentShortName || context.group || "",
    round: raw.tournamentShortName || "",
    stage: "league",
    status: "Finished",
    leagueColor: context.leagueColor || "",
  };
}

export async function fetchTeamHistories(matchId, termLimits = 10) {
  if (cache.has(matchId)) return cache.get(matchId);

  const [results, h2h] = await Promise.all([
    fetchUniform(`getMatchResultV1.qry?sportteryMatchId=${matchId}&termLimits=${termLimits}`),
    fetchUniform(`getResultHistoryV1.qry?sportteryMatchId=${matchId}&termLimits=${termLimits}`),
  ]);

  const payload = {
    home: (results?.home?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
    away: (results?.away?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
    h2h: (h2h?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
  };

  cache.set(matchId, payload);
  return payload;
}

export function getTeamHistoryList(histories, side, localMatches, team, excludeMatchId = null) {
  const remote = side === "home" ? histories?.home || [] : histories?.away || [];
  const merged = mergeTeamMatches(localMatches, remote, team, excludeMatchId);
  return merged.length ? merged : remote.filter((m) => excludeMatchId == null || m.id !== excludeMatchId);
}

function mergeTeamMatches(localMatches, remoteMatches, team, excludeMatchId) {
  const map = new Map();
  for (const m of remoteMatches) {
    if (excludeMatchId != null && m.id === excludeMatchId) continue;
    map.set(String(m.id), m);
  }
  for (const m of localMatches) {
    if (excludeMatchId != null && m.id === excludeMatchId) continue;
    const resolved = resolveTeamInMatch(m, team);
    if (resolved !== m.home && resolved !== m.away) continue;
    map.set(String(m.id), m.finished ? m : { ...map.get(String(m.id)), ...m });
  }
  return [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function clearMatchHistoryCache() {
  cache.clear();
}

export function resolveTeamInMatch(match, team) {
  if (!match || !team) return team;
  if (match.home === team || match.away === team) return team;
  const normalize = (name) => String(name || "").replace(/^AIK/i, "").trim();
  const target = normalize(team);
  if (normalize(match.home) === target) return match.home;
  if (normalize(match.away) === target) return match.away;
  if (match.home.includes(team) || team.includes(match.home)) return match.home;
  if (match.away.includes(team) || team.includes(match.away)) return match.away;
  return team;
}

export function findTeamMatchMeta(match, team) {
  if (!match) return null;
  if (match.home === team || match.away === team) return match;
  if (resolveTeamInMatch(match, team) === match.home || resolveTeamInMatch(match, team) === match.away) {
    return match;
  }
  return null;
}
