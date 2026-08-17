const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html",
  Accept: "application/json, text/plain, */*",
};

const cache = new Map();
const RECENT_MATCH_LIMIT = 10;
const H2H_MATCH_LIMIT = 3;
/** 共同对手分析：多拉一些场次以覆盖近 1 年 */
const COMMON_OPPONENT_MATCH_LIMIT = 40;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

/** 体彩战绩接口可用的 sportteryMatchId 号段 */
export function isSportteryMatchId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n >= 2000000 && n < 2100000;
}

export async function fetchTeamHistories(matchId, termLimits = RECENT_MATCH_LIMIT) {
  if (!isSportteryMatchId(matchId)) {
    return { termLimits, home: [], away: [], h2h: [] };
  }

  const cached = cache.get(matchId);
  if (cached && (cached.termLimits || RECENT_MATCH_LIMIT) >= termLimits) return cached;

  const [results, h2h] = await Promise.all([
    fetchUniform(`getMatchResultV1.qry?sportteryMatchId=${matchId}&termLimits=${termLimits}`),
    fetchUniform(`getResultHistoryV1.qry?sportteryMatchId=${matchId}&termLimits=${termLimits}`),
  ]);

  const payload = {
    termLimits,
    home: (results?.home?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
    away: (results?.away?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
    h2h: (h2h?.matchList || []).map((m) => normalizeUniformHistoryMatch(m)),
  };

  // 失败/空结果不缓存，避免偶发网络问题把近况永久置空
  if (payload.home.length || payload.away.length || payload.h2h.length) {
    cache.set(matchId, payload);
  }
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

function findBridgeMatchIds(histories, team) {
  const ids = [];
  const seen = new Set();
  for (const m of [...(histories?.home || []), ...(histories?.away || [])]) {
    const resolved = resolveTeamInMatch(m, team);
    if (resolved !== m.home && resolved !== m.away) continue;
    const id = Number(m.sportteryMatchId || m.id);
    if (!isSportteryMatchId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function findBridgeMatchId(histories, team) {
  return findBridgeMatchIds(histories, team)[0] ?? null;
}

/** 从本地赛程/历史里找该队的其它竞彩场次，优先完赛，用作战绩桥接 */
export function findLocalBridgeMatchIds(team, allMatches = [], excludeId = null) {
  const exclude = excludeId != null ? String(excludeId) : null;
  const candidates = [];
  for (const m of allMatches || []) {
    if (m?.id == null) continue;
    if (exclude != null && String(m.id) === exclude) continue;
    const id = Number(m.id);
    if (!isSportteryMatchId(id)) continue;
    const resolved = resolveTeamInMatch(m, team);
    if (resolved !== m.home && resolved !== m.away) continue;
    candidates.push(m);
  }
  candidates.sort((a, b) => {
    const af = a.finished && a.homeScore != null ? 1 : 0;
    const bf = b.finished && b.homeScore != null ? 1 : 0;
    if (bf !== af) return bf - af;
    return compareMatchTimeDesc(a, b);
  });
  return candidates.map((m) => Number(m.id));
}

export function findLocalBridgeMatchId(team, allMatches = [], excludeId = null) {
  return findLocalBridgeMatchIds(team, allMatches, excludeId)[0] ?? null;
}

function findOpponentName(team, matchId, localMatches = []) {
  if (matchId == null) return null;
  const m = (localMatches || []).find((x) => x?.id != null && String(x.id) === String(matchId));
  if (!m) return null;
  const resolved = resolveTeamInMatch(m, team);
  if (resolved === m.home) return m.away;
  if (resolved === m.away) return m.home;
  return null;
}

function preferFinishedMatches(list, limit) {
  const all = list || [];
  const finished = all.filter((m) => m?.finished && m.homeScore != null && m.awayScore != null);
  const picked = finished.length ? finished : all.filter((m) => m?.finished);
  if (picked.length) return picked.slice(0, limit);
  return all.slice(0, limit);
}

function mergeMatchLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const m of list || []) {
      if (m?.id == null) continue;
      const key = String(m.id);
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...m } : m);
    }
  }
  return [...map.values()].sort(compareMatchTimeDesc);
}

/** 当侧别不确定时，从主客两侧列表里筛出确实包含该队的场次 */
function collectMatchesInvolvingTeam(histories, team, local, limit) {
  const remote = [...(histories?.home || []), ...(histories?.away || [])].filter((m) => {
    const resolved = resolveTeamInMatch(m, team);
    return resolved === m.home || resolved === m.away;
  });
  return mergeTeamMatches(local, remote, team, null).slice(0, limit);
}

/**
 * 拉取球队近期对局：优先用相关场次 matchId，必要时经桥接场次再取。
 * @param {string} sideHint 仅对「当前这场」的 matchId 有效；桥接场次会改由队名推断主客侧
 */
export async function fetchTeamRecentForm(
  team,
  {
    matchId = null,
    bridgeMatchId = null,
    localMatches = [],
    limit = RECENT_MATCH_LIMIT,
    sideHint = null,
  } = {}
) {
  const local = collectLocalTeamMatches(localMatches, team, Math.max(limit, RECENT_MATCH_LIMIT));
  const minUseful = Math.min(5, limit);
  let best = preferFinishedMatches(local, limit);

  const takeIfBetter = (matches) => {
    const finished = preferFinishedMatches(matches, limit);
    if (finished.length > best.length) best = finished;
    return finished;
  };

  const tryMatchId = async (id, hint = null) => {
    if (!isSportteryMatchId(id)) return null;
    const histories = await fetchTeamHistories(id, Math.max(limit, RECENT_MATCH_LIMIT));
    const side = hint || historiesSideForTeam(histories, team);
    let matches = [];
    if (side) {
      matches = getTeamHistoryList(histories, side, local, team, null, Math.max(limit * 2, 20));
    }
    // 侧别为空或该侧几乎没有完赛时，两侧扫描兜底
    const finishedCount = (matches || []).filter((m) => m?.finished && m.homeScore != null).length;
    if (!matches?.length || finishedCount < minUseful) {
      const scanned = collectMatchesInvolvingTeam(histories, team, local, Math.max(limit * 2, 20));
      if ((scanned || []).filter((m) => m?.finished && m.homeScore != null).length > finishedCount) {
        matches = scanned;
      } else if (!matches?.length && scanned?.length) {
        matches = scanned;
      }
    }
    return {
      histories,
      matches: preferFinishedMatches(matches, limit),
    };
  };

  const tried = new Set();
  const queue = [];
  const enqueue = (id) => {
    if (id == null || tried.has(String(id)) || !isSportteryMatchId(id)) return;
    if (queue.some((x) => String(x) === String(id))) return;
    queue.push(id);
  };

  // 1) 当前场次：先带 sideHint，再去掉 sideHint（防止主客与接口不一致）
  if (isSportteryMatchId(matchId)) {
    enqueue(matchId);
  }

  // 2) 调用方 / 本地 / 历史中的桥接场次（桥接时不再沿用原场 sideHint）
  enqueue(bridgeMatchId);
  for (const id of findLocalBridgeMatchIds(team, localMatches, matchId)) enqueue(id);

  let firstHistories = null;
  let usedSideHintFor = matchId != null ? String(matchId) : null;

  while (queue.length && best.length < limit) {
    const id = queue.shift();
    if (tried.has(String(id))) continue;
    tried.add(String(id));

    const hint = usedSideHintFor && String(id) === usedSideHintFor ? sideHint : null;
    let result = await tryMatchId(id, hint);
    if (result?.matches?.length) takeIfBetter(result.matches);
    if (!firstHistories && result?.histories) firstHistories = result.histories;

    // 当前场次若带 hint 仍不够，再试一次不带 hint
    if (hint && best.length < minUseful) {
      result = await tryMatchId(id, null);
      if (result?.matches?.length) takeIfBetter(result.matches);
    }

    for (const nextId of findBridgeMatchIds(result?.histories, team)) enqueue(nextId);
    if (best.length >= limit) break;
  }

  // 3) 仍不足：经本场对手的战绩列表反查本队可用场次号
  if (best.length < minUseful) {
    const opponent = findOpponentName(team, matchId, localMatches);
    if (opponent) {
      for (const oppId of findLocalBridgeMatchIds(opponent, localMatches, matchId)) {
        if (tried.has(String(oppId))) continue;
        tried.add(String(oppId));
        const oppHistories = await fetchTeamHistories(oppId, Math.max(limit, RECENT_MATCH_LIMIT));
        for (const viaId of findBridgeMatchIds(oppHistories, team)) {
          if (tried.has(String(viaId))) continue;
          tried.add(String(viaId));
          const via = await tryMatchId(viaId, null);
          if (via?.matches?.length) takeIfBetter(via.matches);
          if (best.length >= limit) break;
        }
        if (best.length >= minUseful) break;
      }
    }
  }

  if (best.length < minUseful && firstHistories) {
    takeIfBetter(collectMatchesInvolvingTeam(firstHistories, team, local, Math.max(limit * 2, 20)));
  }

  return best.slice(0, limit);
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

function preferNum(...vals) {
  for (const v of vals) {
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return typeof v === "number" ? v : Number(v);
  }
  return null;
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
    // 本地未完赛常带 homeScore:null，不能覆盖远程已有比分
    const homeScore = preferNum(prev.homeScore, m.homeScore);
    const awayScore = preferNum(prev.awayScore, m.awayScore);
    map.set(String(m.id), {
      ...prev,
      ...m,
      homeScore,
      awayScore,
      homeHtScore: preferNum(prev.homeHtScore, m.homeHtScore),
      awayHtScore: preferNum(prev.awayHtScore, m.awayHtScore),
      homeEtScore: preferNum(prev.homeEtScore, m.homeEtScore),
      awayEtScore: preferNum(prev.awayEtScore, m.awayEtScore),
      homePenScore: preferNum(prev.homePenScore, m.homePenScore),
      awayPenScore: preferNum(prev.awayPenScore, m.awayPenScore),
      finished: Boolean(prev.finished || m.finished || (homeScore != null && awayScore != null)),
      teamMatchResult: m.teamMatchResult || prev.teamMatchResult || "",
      winningTeam: m.winningTeam || prev.winningTeam || "",
      time: m.time || prev.time || "",
      sportteryMatchId: preferNum(prev.sportteryMatchId, m.sportteryMatchId) || prev.sportteryMatchId || m.sportteryMatchId || null,
    });
  }
  return [...map.values()].sort(compareMatchTimeDesc);
}

export function clearMatchHistoryCache() {
  cache.clear();
}

function teamNormKey(name) {
  return String(name || "")
    .replace(/^AIK/i, "")
    .replace(/足球俱乐部|足球队|俱乐部/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 全称/简称宽松匹配（开售全称 vs 战绩简称） */
export function teamNamesLooselyEqual(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ka = teamNormKey(a);
  const kb = teamNormKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  return false;
}

export function resolveTeamInMatch(match, team) {
  if (!match || !team) return null;
  if (match.home === team) return match.home;
  if (match.away === team) return match.away;
  if (teamNamesLooselyEqual(match.home, team)) return match.home;
  if (teamNamesLooselyEqual(match.away, team)) return match.away;
  return null;
}

/** 返回 胜/平/负/未赛；优先体彩 teamMatchResult（home/draw/away），避免队名解析误差。 */
export function teamResultLabel(match, team) {
  if (!match?.finished) return "未赛";

  const resolved = resolveTeamInMatch(match, team);
  const fromApi = lotteryResultToLabel(match.teamMatchResult);
  // teamMatchResult 是该战绩所属球队视角；队名对上时采信
  if (fromApi && resolved) return fromApi;
  // 战绩列表场景：接口结果属于该条所属球队；队名短暂对不上时仍用接口结果，避免整列置灰「未赛」
  if (fromApi) return fromApi;

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

function sidePerspective(match, team) {
  const resolved = resolveTeamInMatch(match, team);
  if (!resolved) return null;
  const isHome = resolved === match.home;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  const opponent = isHome ? match.away : match.home;
  return {
    resolved,
    isHome,
    opponent,
    gf,
    ga,
    margin: gf != null && ga != null ? gf - ga : null,
    result: teamResultLabel(match, team),
    venue: isHome ? "主" : "客",
  };
}

function resultRank(result) {
  if (result === "胜") return 2;
  if (result === "平") return 1;
  if (result === "负") return 0;
  return -1;
}

/** 收集近 1 年内该队对各个对手的最近一场 */
function buildRecentOpponentMap(matches, team, { withinMs = ONE_YEAR_MS, now = Date.now() } = {}) {
  const map = new Map();
  for (const match of matches || []) {
    if (!match?.finished) continue;
    const t = matchTimeKey(match);
    if (!t || now - t > withinMs || t > now + 2 * 86400000) continue;
    const side = sidePerspective(match, team);
    if (!side?.opponent) continue;
    const key = teamNormKey(side.opponent);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || t > matchTimeKey(prev.match)) {
      map.set(key, { opponent: side.opponent, match, side });
    }
  }
  return map;
}

function formatSideCommonLine(entry) {
  if (!entry) return "近1年未交手";
  const { match, side } = entry;
  // 用该队视角进:失，避免客场 0:2 被误读成输球
  const score =
    side.gf != null && side.ga != null
      ? `${side.gf}:${side.ga}`
      : formatHistoryScoreText(match) || `${match.homeScore}:${match.awayScore}`;
  const when = formatMatchWhen(match) || match.date || "";
  return `${side.result} ${side.venue}场 ${score}${when ? `（${when}）` : ""}`;
}

/**
 * 共同对手分析：近 1 年内 A、B 都曾交手过的 C，对比各自战绩。
 */
export function buildCommonOpponentsAnalysis(homeTeam, awayTeam, homeMatches, awayMatches, options = {}) {
  const withinMs = options.withinMs ?? ONE_YEAR_MS;
  const limit = options.limit ?? 5;
  const now = options.now ?? Date.now();

  const homeMap = buildRecentOpponentMap(homeMatches, homeTeam, { withinMs, now });
  const awayMap = buildRecentOpponentMap(awayMatches, awayTeam, { withinMs, now });
  const exclude = new Set([teamNormKey(homeTeam), teamNormKey(awayTeam)]);

  const items = [];
  for (const [key, homeEntry] of homeMap) {
    if (exclude.has(key)) continue;
    const awayEntry = awayMap.get(key);
    if (!awayEntry) continue;

    const hr = resultRank(homeEntry.side.result);
    const ar = resultRank(awayEntry.side.result);
    let lean = "even";
    let note = "双方对共同对手战绩相当";
    if (hr > ar) {
      lean = "home";
      note = `${homeTeam}对该对手战绩更好（${homeEntry.side.result} vs ${awayEntry.side.result}）`;
    } else if (ar > hr) {
      lean = "away";
      note = `${awayTeam}对该对手战绩更好（${awayEntry.side.result} vs ${homeEntry.side.result}）`;
    } else if (homeEntry.side.margin != null && awayEntry.side.margin != null) {
      if (homeEntry.side.margin > awayEntry.side.margin) {
        lean = "home";
        note = `同为${homeEntry.side.result}，${homeTeam}净胜球更优（${homeEntry.side.margin > 0 ? "+" : ""}${homeEntry.side.margin} vs ${awayEntry.side.margin > 0 ? "+" : ""}${awayEntry.side.margin}）`;
      } else if (awayEntry.side.margin > homeEntry.side.margin) {
        lean = "away";
        note = `同为${awayEntry.side.result}，${awayTeam}净胜球更优（${awayEntry.side.margin > 0 ? "+" : ""}${awayEntry.side.margin} vs ${homeEntry.side.margin > 0 ? "+" : ""}${homeEntry.side.margin}）`;
      }
    }

    const homeScore =
      homeEntry.side.gf != null && homeEntry.side.ga != null
        ? `${homeEntry.side.gf}:${homeEntry.side.ga}`
        : `${homeEntry.match.homeScore}:${homeEntry.match.awayScore}`;
    const awayScore =
      awayEntry.side.gf != null && awayEntry.side.ga != null
        ? `${awayEntry.side.gf}:${awayEntry.side.ga}`
        : `${awayEntry.match.homeScore}:${awayEntry.match.awayScore}`;

    items.push({
      opponent: homeEntry.opponent || awayEntry.opponent,
      home: {
        result: homeEntry.side.result,
        venue: homeEntry.side.venue,
        score: homeScore,
        when: formatMatchWhen(homeEntry.match) || homeEntry.match.date || "",
        margin: homeEntry.side.margin,
        line: formatSideCommonLine(homeEntry),
        match: homeEntry.match,
      },
      away: {
        result: awayEntry.side.result,
        venue: awayEntry.side.venue,
        score: awayScore,
        when: formatMatchWhen(awayEntry.match) || awayEntry.match.date || "",
        margin: awayEntry.side.margin,
        line: formatSideCommonLine(awayEntry),
        match: awayEntry.match,
      },
      lean,
      note,
      latestMs: Math.max(matchTimeKey(homeEntry.match), matchTimeKey(awayEntry.match)),
    });
  }

  items.sort((a, b) => b.latestMs - a.latestMs);
  const shown = items.slice(0, limit);
  let homeBetter = 0;
  let awayBetter = 0;
  let even = 0;
  for (const it of shown) {
    if (it.lean === "home") homeBetter += 1;
    else if (it.lean === "away") awayBetter += 1;
    else even += 1;
  }

  const windowLabel =
    withinMs >= 2 * ONE_YEAR_MS - 86400000 ? "近2年" : withinMs >= ONE_YEAR_MS - 86400000 ? "近1年" : `近${Math.round(withinMs / 86400000)}天`;
  let lean = null;
  let text = `${windowLabel}暂无共同对手样本`;
  if (shown.length) {
    if (homeBetter > awayBetter) lean = "home";
    else if (awayBetter > homeBetter) lean = "away";
    else lean = "even";
    const leanText =
      lean === "home"
        ? `共同对手对比更看好 ${homeTeam}`
        : lean === "away"
          ? `共同对手对比更看好 ${awayTeam}`
          : "共同对手对比双方接近";
    text = `${windowLabel}共同对手 ${shown.length} 个：${homeTeam}更优 ${homeBetter} · ${awayTeam}更优 ${awayBetter} · 相当 ${even}。${leanText}`;
  }

  return {
    pending: false,
    withinDays: Math.round(withinMs / 86400000),
    total: items.length,
    items: shown,
    summary: {
      homeBetter,
      awayBetter,
      even,
      counted: shown.length,
      lean,
      text,
    },
  };
}

export { RECENT_MATCH_LIMIT, H2H_MATCH_LIMIT, COMMON_OPPONENT_MATCH_LIMIT };

function rankMapKey(name) {
  return String(name || "")
    .replace(/^AIK/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 从积分榜行 + 本地赛程构建队名→排名索引（便于近况区分对手实力） */
export function buildTeamRankLookup(standingsRows = [], allMatches = [], leagueHint = "") {
  const map = new Map();

  const put = (team, rank, league) => {
    if (!team || rank == null || !Number.isFinite(Number(rank))) return;
    const key = rankMapKey(team);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { team, rank: Number(rank), league: league || "" });
    }
  };

  for (const row of standingsRows || []) {
    put(row.team, row.rank, leagueHint || row.groupName || "");
  }

  // 本地在售/缓存场次上的排名作补充（同名优先保留积分榜）
  for (const m of allMatches || []) {
    const league = m.rankLeague || m.leagueShort || m.group || "";
    put(m.home, m.homeRank, league);
    put(m.away, m.awayRank, league);
  }

  return map;
}

export function lookupTeamRank(rankLookup, teamName) {
  if (!rankLookup || !teamName) return null;
  const key = rankMapKey(teamName);
  if (rankLookup.has(key)) return rankLookup.get(key);
  // 宽松包含匹配（队名简称不一致时）
  for (const [k, v] of rankLookup) {
    if (!k) continue;
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

/**
 * 取「球队视角」下对手的排名：优先场次自带 homeRank/awayRank，否则查积分榜索引。
 */
export function getOpponentRankInfo(match, team, rankLookup = null) {
  const resolved = resolveTeamInMatch(match, team);
  if (!resolved) {
    return { opponent: null, rank: null, league: "", side: null };
  }
  const isHome = resolved === match.home;
  const opponent = isHome ? match.away : match.home;
  const embedded = isHome ? match.awayRank : match.homeRank;
  const league = match.rankLeague || match.leagueShort || match.group || "";
  if (embedded != null) {
    return { opponent, rank: embedded, league, side: isHome ? "away" : "home" };
  }
  const hit = lookupTeamRank(rankLookup, opponent);
  return {
    opponent,
    rank: hit?.rank ?? null,
    league: hit?.league || league,
    side: isHome ? "away" : "home",
  };
}
