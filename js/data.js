import { isRealTeam, teamLabel, leagueBadgeHtml } from "./teams.js";

const LOCAL_DATA_URL = new URL("../data/lottery.json", import.meta.url).href;

const UPSTREAM_URL =
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c";

const RESULT_URL = (begin, end, page = 1) =>
  `https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=${page}&pcOrWap=1&leagueId=&matchBeginDate=${begin}&matchEndDate=${end}`;

const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/mjc/jsq/zqspf/",
  Accept: "application/json, text/plain, */*",
};

const RESULT_HEADERS = {
  Referer: "https://www.sporttery.cn/jc/zqsgkj/",
  Origin: "https://www.sporttery.cn",
  Accept: "application/json, text/plain, */*",
};

const FETCH_TIMEOUT_MS = 8000;
const DAILY_UPDATE_HOUR = 11; // 北京时间 11:00

let bundledCache = null;

function parseRank(rankStr) {
  if (!rankStr) return { league: "", rank: null };
  const m = String(rankStr).match(/^\[(.+?)(\d+)\]$/);
  if (!m) return { league: rankStr, rank: null };
  return { league: m[1], rank: parseInt(m[2], 10) };
}

export function parseMatchTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    return {
      utc: null,
      beijing: "待定",
      beijingDate: dateStr || "",
      beijingDateKey: dateStr || "",
    };
  }

  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = 0] = timeStr.split(":").map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, hh - 8, mm, ss);
  const utc = new Date(utcMs);
  const beijing = formatBeijing(utc);
  return {
    utc,
    beijing: beijing.time,
    beijingDate: beijing.date,
    beijingDateKey: beijingDateKey(utc),
    beijingFull: beijing.full,
  };
}

export function formatBeijing(date) {
  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  const dateStr = `${get("month")}月${get("day")}日`;
  const timeStr = `${get("hour")}:${get("minute")}`;
  return { date: dateStr, time: timeStr, full: `${dateStr} ${timeStr}` };
}

function normalizeSelling(raw) {
  const homeRankInfo = parseRank(raw.homeRank);
  const awayRankInfo = parseRank(raw.awayRank);
  const timeInfo = parseMatchTime(raw.matchDate, raw.matchTime);
  const hhad = raw.hhad || {};
  const had = raw.had || {};

  return {
    id: raw.matchId,
    num: raw.matchNumStr || "",
    matchNum: raw.matchNum,
    round: raw.leagueAbbName || raw.leagueAllName || "",
    league: raw.leagueAllName || raw.leagueAbbName || "",
    leagueShort: raw.leagueAbbName || "",
    leagueId: raw.leagueId,
    leagueColor: raw.backColor || "",
    date: raw.matchDate,
    time: raw.matchTime,
    businessDate: raw.businessDate,
    home: raw.homeTeamAllName || raw.homeTeamAbbName,
    away: raw.awayTeamAllName || raw.awayTeamAbbName,
    homeRank: homeRankInfo.rank,
    awayRank: awayRankInfo.rank,
    rankLeague: homeRankInfo.league || awayRankInfo.league,
    homeScore: null,
    awayScore: null,
    homeHtScore: null,
    awayHtScore: null,
    finished: false,
    odds: had.h ? { h: had.h, d: had.d, a: had.a } : null,
    hhad: hhad.goalLine ? { line: hhad.goalLine, h: hhad.h, d: hhad.d, a: hhad.a } : null,
    single: Boolean(raw.poolList?.some((p) => p.single === 1)),
    status: raw.matchStatus || "Selling",
    group: raw.leagueAbbName || raw.leagueAllName || "其他",
    groupLabel: raw.leagueAllName || "",
    stage: "league",
    ground: "",
    utc: timeInfo.utc,
    beijingTime: timeInfo.beijing,
    beijingDate: timeInfo.beijingDate,
    beijingDateKey: timeInfo.beijingDateKey || raw.matchDate,
    beijingFull: timeInfo.beijingFull || `${timeInfo.beijingDate} ${timeInfo.beijing}`,
  };
}

function normalizeResult(raw) {
  const hs = parseInt(raw.homeScore ?? raw.fullHomeScore, 10);
  const as = parseInt(raw.awayScore ?? raw.fullAwayScore, 10);
  const finished = !Number.isNaN(hs) && !Number.isNaN(as);
  const timeInfo = parseMatchTime(raw.matchDate, raw.matchTime || "00:00:00");

  return {
    id: raw.matchId,
    num: raw.matchNumStr || "",
    matchNum: raw.matchNum,
    round: raw.leagueNameAbbr || raw.leagueName || "",
    league: raw.leagueName || raw.leagueNameAbbr || "",
    leagueShort: raw.leagueNameAbbr || "",
    leagueId: raw.leagueId,
    leagueColor: "",
    date: raw.matchDate,
    time: raw.matchTime || "",
    businessDate: raw.businessDate || raw.matchDate,
    home: raw.homeTeam || raw.homeTeamAbbName || raw.homeTeamAllName,
    away: raw.awayTeam || raw.awayTeamAbbName || raw.awayTeamAllName,
    homeRank: null,
    awayRank: null,
    rankLeague: raw.leagueNameAbbr || "",
    homeScore: finished ? hs : null,
    awayScore: finished ? as : null,
    homeHtScore: null,
    awayHtScore: null,
    finished,
    odds: null,
    hhad: null,
    single: false,
    status: "Finished",
    group: raw.leagueNameAbbr || raw.leagueName || "其他",
    groupLabel: raw.leagueName || "",
    stage: "league",
    ground: "",
    utc: timeInfo.utc,
    beijingTime: timeInfo.beijing,
    beijingDate: timeInfo.beijingDate,
    beijingDateKey: timeInfo.beijingDateKey || raw.matchDate,
    beijingFull: timeInfo.beijingFull,
  };
}

function isValidLotteryJson(raw) {
  return Boolean(raw?.name && Array.isArray(raw?.matches));
}

function mergeHistory(existing = [], results = [], current = []) {
  const map = new Map();
  for (const m of existing) {
    if (m?.id != null) map.set(m.id, m);
  }
  for (const m of results) {
    if (m?.id != null) map.set(m.id, m);
  }
  for (const m of current) {
    if (m?.id == null) continue;
    const prev = map.get(m.id);
    if (prev?.finished) {
      map.set(m.id, { ...m, ...prev, odds: m.odds ?? prev.odds, hhad: m.hhad ?? prev.hhad });
    } else {
      map.set(m.id, prev ? { ...prev, ...m } : m);
    }
  }
  return sortMatchesByTime([...map.values()]);
}

function packRaw(raw, source, sourceLabel) {
  const matches = raw.matches.map((m) => (m.stage ? m : normalizeSelling(m)));
  const history = mergeHistory(raw.history || [], [], matches);
  return {
    name: raw.name,
    updatedAt: raw.updatedAt,
    businessDate: raw.businessDate,
    matches,
    history,
    allMatches: mergeAllMatches(matches, history),
    source,
    sourceLabel,
    freshness: history.filter((m) => m.finished).length,
  };
}

export function mergeAllMatches(matches, history) {
  const map = new Map();
  for (const m of history) {
    if (m?.id != null) map.set(m.id, m);
  }
  for (const m of matches) {
    if (m?.id == null) continue;
    const prev = map.get(m.id);
    map.set(m.id, prev?.finished ? { ...m, ...prev } : { ...prev, ...m });
  }
  return sortMatchesByTime([...map.values()]);
}

async function loadBundledRaw() {
  if (bundledCache) return bundledCache;
  const res = await fetch(LOCAL_DATA_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`内置数据加载失败 (${res.status})`);
  const raw = await res.json();
  if (!isValidLotteryJson(raw)) throw new Error("内置数据格式无效");
  bundledCache = raw;
  return raw;
}

async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS, headers = FETCH_HEADERS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-cache", signal: controller.signal, headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstreamMatches() {
  const data = await fetchJson(UPSTREAM_URL);
  if (!data?.success || !data.value?.matchInfoList) return null;

  const matches = [];
  for (const day of data.value.matchInfoList) {
    for (const m of day.subMatchList || []) {
      matches.push(normalizeSelling(m));
    }
  }
  return {
    businessDate: data.value.matchInfoList[0]?.businessDate,
    matches,
  };
}

function shiftBeijingDate(dateKey, deltaDays) {
  const [y, mo, d] = String(dateKey).split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  utc.setUTCDate(utc.getUTCDate() + deltaDays);
  return utc.toISOString().slice(0, 10);
}

/** 拉取体彩竞彩开奖赛果（默认近 30 天，多页） */
async function fetchRecentResults(businessDate, { days = 30, maxPages = 6 } = {}) {
  const end = businessDate || beijingDateKey(new Date());
  const begin = shiftBeijingDate(end, -Math.max(1, days));
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchJson(RESULT_URL(begin, end, page), FETCH_TIMEOUT_MS, RESULT_HEADERS);
    const list = data?.success ? data.value?.matchResultList || [] : [];
    if (!list.length) break;
    for (const raw of list) {
      const m = normalizeResult(raw);
      if (m?.id == null || seen.has(m.id)) continue;
      seen.add(m.id);
      all.push(m);
    }
    // 单页不足常见页量时认为已到末页
    if (list.length < 30) break;
  }

  return all;
}

/** 导出：已完场的体彩开盘对局（时间新→旧） */
export function getFinishedLotteryMatches(allMatches = [], history = []) {
  const map = new Map();
  for (const m of [...history, ...allMatches]) {
    if (!m?.finished || m.id == null) continue;
    map.set(m.id, m);
  }
  return sortMatchesByTime([...map.values()]).reverse();
}

/** 按「距今过去 N 天」筛选已完场（用于历史赛况 Tab） */
export function filterPastDays(matches, days, fromDate = new Date()) {
  if (days === "all") return matches;
  const endMs = fromDate.getTime() + 12 * 60 * 60 * 1000;
  const startMs = fromDate.getTime() - Number(days) * 24 * 60 * 60 * 1000;
  return matches.filter((m) => {
    let t;
    if (m.utc) t = new Date(m.utc).getTime();
    else {
      const d = parseDateKey(m.beijingDateKey || m.date);
      t = d.getTime();
    }
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
}

export async function getBundledLotteryData() {
  const raw = await loadBundledRaw();
  return packRaw(raw, "bundled", "内置数据");
}

function beijingNowIso() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T") + "+08:00";
}

async function loadFallbackData() {
  let fallback = null;

  const [localRes, bundledRaw] = await Promise.all([
    fetchJson(`${LOCAL_DATA_URL}?t=${Date.now()}`),
    loadBundledRaw().catch(() => null),
  ]);

  if (bundledRaw) {
    fallback = packRaw(bundledRaw, "bundled", "内置数据");
  }
  if (localRes && isValidLotteryJson(localRes)) {
    const local = packRaw(localRes, "local", "同站数据");
    if (!fallback || (local.updatedAt || "") >= (fallback.updatedAt || "")) {
      fallback = local;
    }
  }

  return fallback;
}

/** 优先拉取体彩实时数据，失败时回退到同站/内置缓存 */
export async function fetchLatestLotteryData() {
  const [upstream, fallback] = await Promise.all([
    fetchUpstreamMatches(),
    loadFallbackData(),
  ]);

  if (upstream) {
    const results = await fetchRecentResults(upstream.businessDate);
    const raw = {
      name: "体彩竞彩足球",
      updatedAt: beijingNowIso(),
      businessDate: upstream.businessDate || fallback?.businessDate || "",
      matches: upstream.matches,
      history: mergeHistory(fallback?.history || [], results, upstream.matches),
    };
    return packRaw(raw, "live", "体彩实时");
  }

  if (fallback) return fallback;
  throw new Error("无法加载赛事数据");
}

/** 后台定时：页面可见时自动检索，并在每天 11:00 后再检查一次 */
export function startAutoDataRefresh(onUpdate) {
  let busy = false;
  let scheduledTimer = null;

  const tick = async () => {
    if (busy || document.visibilityState === "hidden") return;
    busy = true;
    try {
      const data = await fetchLatestLotteryData();
      onUpdate(data, { notify: false });
    } catch {
      /* 静默失败，保留当前数据 */
    } finally {
      busy = false;
      scheduleNextRefresh();
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };

  function scheduleNextRefresh() {
    clearTimeout(scheduledTimer);
    scheduledTimer = setTimeout(tick, msUntilNextUpdate());
  }

  scheduleNextRefresh();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearTimeout(scheduledTimer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function shouldRefreshNow() {
  const now = new Date();
  const hour = getBeijingHour(now);
  const minute = getBeijingMinute(now);
  return hour > DAILY_UPDATE_HOUR || (hour === DAILY_UPDATE_HOUR && minute >= 0);
}

function msUntilNextUpdate() {
  const now = new Date();
  const bj = getBeijingParts(now);
  let target = new Date(Date.UTC(bj.year, bj.month - 1, bj.day, DAILY_UPDATE_HOUR - 8, 0, 0));
  if (shouldRefreshNow()) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return Math.max(60_000, target.getTime() - now.getTime());
}

function getBeijingParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function getBeijingHour(date) {
  return getBeijingParts(date).hour;
}

function getBeijingMinute(date) {
  return getBeijingParts(date).minute;
}

export function isGroupMatch(match) {
  return match?.stage === "league";
}

export function isKnockoutMatch() {
  return false;
}

export function getKnockoutMatches(matches) {
  return matches;
}

export function getGroupTeams(matches, groupLetter) {
  const teams = new Set();
  matches
    .filter((m) => m.group === groupLetter && isRealTeam(m.home) && isRealTeam(m.away))
    .forEach((m) => {
      teams.add(m.home);
      teams.add(m.away);
    });
  return [...teams];
}

export function sortMatchesByTime(list) {
  return [...list].sort((a, b) => {
    if (!a.utc && !b.utc) return a.date.localeCompare(b.date);
    if (!a.utc) return 1;
    if (!b.utc) return -1;
    return new Date(a.utc) - new Date(b.utc);
  });
}

export function filterByDays(matches, days, fromDate = new Date()) {
  if (days === "all") return matches;

  const startMs = fromDate.getTime();
  const endMs = startMs + Number(days) * 24 * 60 * 60 * 1000;

  return matches.filter((m) => {
    if (!m.utc) {
      const d = parseDateKey(m.date);
      return d.getTime() + 86400000 > startMs && d.getTime() < endMs;
    }
    const t = new Date(m.utc).getTime();
    return t >= startMs && t < endMs;
  });
}

export function beijingDateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

export function formatDateSectionLabel(dateKey) {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  return `${mo}月${d}日 ${weekday}`;
}

function parseDateKey(key) {
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

export function getTeamMatches(allMatches, team) {
  return sortMatchesByTime(allMatches.filter((m) => m.home === team || m.away === team));
}

export function getGroupRoundIndex(matches, team, match) {
  const leagueMatches = getTeamMatches(matches, team).filter(
    (m) => m.group === match.group && isRealTeam(m.home) && isRealTeam(m.away)
  );
  const idx = leagueMatches.findIndex((m) => m.id === match.id);
  return idx >= 0 ? idx + 1 : null;
}

export function formatMatchupText(match) {
  if (!match.finished) return "未赛";
  return `${teamLabel(match.home)} ${match.homeScore}:${match.awayScore} ${teamLabel(match.away)}`;
}

export function formatMatchupHtml(match) {
  const scoreText = match.finished ? `${match.homeScore} : ${match.awayScore}` : "未赛";
  return `
    <div class="matchup-result${match.finished ? "" : " matchup-pending"}">
      <div class="matchup-main">
        <span class="matchup-team">${leagueBadgeHtml(match.leagueShort, match.leagueColor, 18)}<span>${teamLabel(match.home)}</span></span>
        <span class="matchup-score">${scoreText}</span>
        <span class="matchup-team"><span>${teamLabel(match.away)}</span>${leagueBadgeHtml(match.leagueShort, match.leagueColor, 18)}</span>
      </div>
    </div>`;
}

export function formatOddsShort(odds) {
  if (!odds) return "";
  return `胜 ${odds.h} / 平 ${odds.d} / 负 ${odds.a}`;
}

export function formatNextUpdateLabel() {
  const now = new Date();
  const bj = getBeijingParts(now);
  if (shouldRefreshNow()) {
    return `今日 ${DAILY_UPDATE_HOUR}:00 已更新`;
  }
  return `下次更新：今日 ${DAILY_UPDATE_HOUR}:00`;
}
