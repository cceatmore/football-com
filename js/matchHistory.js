const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html",
  Accept: "application/json, text/plain, */*",
};

const cache = new Map();
const RECENT_MATCH_LIMIT = 10;
const H2H_MATCH_LIMIT = 3;

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

function parsePair(value) {
  if (value == null || value === "") return [null, null];
  if (Array.isArray(value) && value.length >= 2) {
    const home = parseInt(value[0], 10);
    const away = parseInt(value[1], 10);
    if (Number.isNaN(home) || Number.isNaN(away)) return [null, null];
    return [home, away];
  }
  const text = String(value).trim();
  const m = text.match(/(\d+)\s*[:：\-]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/** 解析常规/半场/加时/点球。默认 fullCourtGoal 为常规时间比分。 */
function parseMatchScores(raw = {}) {
  let [homeScore, awayScore] = parsePair(raw.fullCourtGoal);
  let [homeHtScore, awayHtScore] = parsePair(raw.halfTimeGoal);
  let [homeEtScore, awayEtScore] = parsePair(
    raw.extraTimeGoal || raw.aetGoal || raw.overtimeGoal || raw.extraGoal || ""
  );
  let [homePenScore, awayPenScore] = parsePair(
    raw.penaltyGoal || raw.shootOutGoal || raw.penaltyScore || raw.penaltiesGoal || ""
  );

  const fullText = String(raw.fullCourtGoal || "");
  // 形如 1:1(2:1) / 1:1(5:4) / 1:1(4:3点)
  const composite = fullText.match(/^(\d+)\s*[:：]\s*(\d+)\s*\((\d+)\s*[:：\-]\s*(\d+)\s*([^\)]*)\)/);
  if (composite) {
    homeScore = parseInt(composite[1], 10);
    awayScore = parseInt(composite[2], 10);
    const innerHome = parseInt(composite[3], 10);
    const innerAway = parseInt(composite[4], 10);
    const tag = String(composite[5] || "");
    if (/点|pen|pk/i.test(tag) || /点|pen|pk/i.test(fullText)) {
      homePenScore = innerHome;
      awayPenScore = innerAway;
    } else if (/加|aet|et|extra/i.test(tag) || /加|aet|et|extra/i.test(fullText)) {
      homeEtScore = innerHome;
      awayEtScore = innerAway;
    } else if (homeScore === awayScore) {
      // 常规打平后的括号分：小球偏点球，否则按加时终局
      if (innerHome >= 3 || innerAway >= 3) {
        homePenScore = innerHome;
        awayPenScore = innerAway;
      } else {
        homeEtScore = innerHome;
        awayEtScore = innerAway;
      }
    }
  }

  const sections = raw.sectionsScore || raw.sectionScore;
  if (Array.isArray(sections)) {
    if (homeHtScore == null && sections.length >= 2) {
      const ht = parsePair(sections.slice(0, 2));
      homeHtScore = ht[0];
      awayHtScore = ht[1];
    }
    if (homeScore == null && sections.length >= 4) {
      const ft = parsePair(sections.slice(2, 4));
      homeScore = ft[0];
      awayScore = ft[1];
    }
    if (homeEtScore == null && sections.length >= 6) {
      const et = parsePair(sections.slice(4, 6));
      homeEtScore = et[0];
      awayEtScore = et[1];
    }
    if (homePenScore == null && sections.length >= 8) {
      const pen = parsePair(sections.slice(6, 8));
      homePenScore = pen[0];
      awayPenScore = pen[1];
    }
  }

  return {
    homeScore,
    awayScore,
    homeHtScore,
    awayHtScore,
    homeEtScore,
    awayEtScore,
    homePenScore,
    awayPenScore,
  };
}

function lotteryResultToLabel(code) {
  if (code === "home") return "胜";
  if (code === "away") return "负";
  if (code === "draw") return "平";
  return "";
}

export function normalizeUniformHistoryMatch(raw, context = {}) {
  const scores = parseMatchScores(raw);
  const finished = scores.homeScore != null && scores.awayScore != null;
  const time = raw.matchTime || raw.kickoffTime || raw.matchHour || "";
  const date = raw.matchDate || "";

  const sportteryMatchId = Number(raw.sportteryMatchId) || 0;
  const rawMatchId = raw.matchId != null ? Number(raw.matchId) || raw.matchId : null;

  return {
    id: sportteryMatchId || rawMatchId || `${date}-${raw.homeTeamShortName}-${raw.awayTeamShortName}`,
    sportteryMatchId: sportteryMatchId || null,
    home: raw.homeTeamShortName,
    away: raw.awayTeamShortName,
    ...scores,
    finished,
    date,
    time: typeof time === "string" ? time.slice(0, 5) : "",
    leagueShort: raw.tournamentShortName || context.leagueShort || "",
    league: raw.tournamentShortName || context.league || "",
    group: raw.tournamentShortName || context.group || "",
    round: raw.tournamentShortName || "",
    stage: "league",
    status: "Finished",
    leagueColor: context.leagueColor || "",
    // 体彩视角：home=胜 draw=平 away=负（针对该战绩所属球队）
    teamMatchResult: raw.teamMatchResult || "",
    winningTeam: raw.winningTeam || "",
    homeMatchResult: raw.homeMatchResult || "",
  };
}

export async function fetchTeamHistories(matchId, termLimits = RECENT_MATCH_LIMIT) {
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

export function getTeamHistoryList(histories, side, localMatches, team, excludeMatchId = null, limit = RECENT_MATCH_LIMIT) {
  const remote = side === "home" ? histories?.home || [] : histories?.away || [];
  const merged = mergeTeamMatches(localMatches, remote, team, excludeMatchId);
  const list = merged.length ? merged : remote.filter((m) => excludeMatchId == null || m.id !== excludeMatchId);
  return list.slice(0, limit);
}

export function collectLocalTeamMatches(allMatches, team, limit = RECENT_MATCH_LIMIT) {
  const list = (allMatches || [])
    .filter((m) => {
      const resolved = resolveTeamInMatch(m, team);
      return resolved === m.home || resolved === m.away;
    })
    .sort(compareMatchTimeDesc);
  return list.slice(0, limit);
}

function inferHistorySideTeam(matches) {
  const counts = new Map();
  for (const m of matches || []) {
    if (m.home) counts.set(m.home, (counts.get(m.home) || 0) + 1);
    if (m.away) counts.set(m.away, (counts.get(m.away) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function historiesSideForTeam(histories, team) {
  const homeTeam = inferHistorySideTeam(histories?.home);
  const awayTeam = inferHistorySideTeam(histories?.away);
  if (homeTeam && resolveTeamInMatch({ home: homeTeam, away: awayTeam || "—" }, team) === homeTeam) {
    return "home";
  }
  if (awayTeam && resolveTeamInMatch({ home: homeTeam || "—", away: awayTeam }, team) === awayTeam) {
    return "away";
  }
  return null;
}

function findBridgeMatchId(histories, team) {
  const pools = [...(histories?.home || []), ...(histories?.away || [])];
  for (const m of pools) {
    const resolved = resolveTeamInMatch(m, team);
    if (resolved !== m.home && resolved !== m.away) continue;
    const id = Number(m.sportteryMatchId || m.id);
    // 仅使用有效竞彩场次号；内部 matchId 调 getMatchResultV1 常无数据
    if (Number.isFinite(id) && id >= 2000000 && id < 2100000) return id;
  }
  return null;
}

/**
 * 拉取球队近期对局：优先用相关场次 matchId，必要时经桥接场次再取。
 */
export async function fetchTeamRecentForm(team, { matchId = null, bridgeMatchId = null, localMatches = [] } = {}) {
  const local = collectLocalTeamMatches(localMatches, team);

  const tryMatchId = async (id) => {
    if (id == null) return null;
    const histories = await fetchTeamHistories(id);
    const side = historiesSideForTeam(histories, team);
    if (!side) return { histories, matches: null };
    return {
      histories,
      matches: getTeamHistoryList(histories, side, local, team),
    };
  };

  let result = await tryMatchId(matchId);
  if (result?.matches?.length) return result.matches;

  if (bridgeMatchId && bridgeMatchId !== matchId) {
    result = await tryMatchId(bridgeMatchId);
    if (result?.matches?.length) return result.matches;

    const bridgedId = findBridgeMatchId(result?.histories, team);
    if (bridgedId && bridgedId !== bridgeMatchId && bridgedId !== matchId) {
      const bridged = await tryMatchId(bridgedId);
      if (bridged?.matches?.length) return bridged.matches;
    }
  } else if (result?.histories) {
    const bridgedId = findBridgeMatchId(result.histories, team);
    if (bridgedId && bridgedId !== matchId) {
      const bridged = await tryMatchId(bridgedId);
      if (bridged?.matches?.length) return bridged.matches;
    }
  }

  return local;
}

export function getH2hList(histories, limit = H2H_MATCH_LIMIT) {
  const list = [...(histories?.h2h || [])].sort((a, b) => compareMatchTimeDesc(a, b));
  return list.slice(0, limit);
}

function matchTimeKey(match) {
  if (match?.utc) return new Date(match.utc).getTime();
  const date = String(match?.date || match?.beijingDateKey || "");
  const time = String(match?.time || match?.beijingTime || "00:00").slice(0, 5);
  if (!date) return 0;
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isNaN(ms) ? Date.parse(`${date}T00:00:00`) || 0 : ms;
}

function compareMatchTimeDesc(a, b) {
  return matchTimeKey(b) - matchTimeKey(a);
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
    const prev = map.get(String(m.id));
    if (!prev) {
      map.set(String(m.id), m);
      continue;
    }
    map.set(String(m.id), {
      ...prev,
      ...m,
      homeHtScore: m.homeHtScore ?? prev.homeHtScore ?? null,
      awayHtScore: m.awayHtScore ?? prev.awayHtScore ?? null,
      homeEtScore: m.homeEtScore ?? prev.homeEtScore ?? null,
      awayEtScore: m.awayEtScore ?? prev.awayEtScore ?? null,
      homePenScore: m.homePenScore ?? prev.homePenScore ?? null,
      awayPenScore: m.awayPenScore ?? prev.awayPenScore ?? null,
      teamMatchResult: m.teamMatchResult || prev.teamMatchResult || "",
      winningTeam: m.winningTeam || prev.winningTeam || "",
      time: m.time || prev.time || "",
    });
  }
  return [...map.values()].sort(compareMatchTimeDesc);
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
  return null;
}

/** 返回 胜/平/负/未赛；优先体彩 teamMatchResult（home/draw/away），避免队名解析误差。 */
export function teamResultLabel(match, team) {
  if (!match?.finished) return "未赛";

  const resolved = resolveTeamInMatch(match, team);
  const fromApi = lotteryResultToLabel(match.teamMatchResult);
  // teamMatchResult 是该战绩所属球队视角；仅在队名能对上时采信
  if (fromApi && resolved) return fromApi;

  if (!resolved) return "未赛";

  const isHome = resolved === match.home;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  if (gf == null || ga == null) return "未赛";
  if (gf > ga) return "胜";
  if (gf < ga) return "负";
  return "平";
}

export function formatHistoryScoreText(match) {
  if (!match?.finished || match.homeScore == null || match.awayScore == null) return "";
  let text = `${match.homeScore}:${match.awayScore}`;
  if (match.homeHtScore != null && match.awayHtScore != null) {
    text += `（半场 ${match.homeHtScore}:${match.awayHtScore}）`;
  }
  if (match.homeEtScore != null && match.awayEtScore != null) {
    text += ` 加时 ${match.homeEtScore}:${match.awayEtScore}`;
  }
  if (match.homePenScore != null && match.awayPenScore != null) {
    text += ` 点球 ${match.homePenScore}:${match.awayPenScore}`;
  }
  return text;
}

export function formatMatchWhen(match) {
  const date = match?.date || match?.beijingDateKey || "";
  const time = String(match?.time || match?.beijingTime || "").slice(0, 5);
  if (date && time && time !== "00:00") return `${date} ${time}`;
  return date || time || "";
}

export function findTeamMatchMeta(match, team) {
  if (!match) return null;
  if (match.home === team || match.away === team) return match;
  const resolved = resolveTeamInMatch(match, team);
  if (resolved === match.home || resolved === match.away) return match;
  return null;
}

export { RECENT_MATCH_LIMIT, H2H_MATCH_LIMIT };
