import { isRealTeam } from "./teams.js";
import bundledData from "../data/worldcup.json" with { type: "json" };

const GITHUB_RAW =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** 多源检索：并行请求，取完赛场次最多的一份 */
const DATA_SOURCES = [
  { id: "local", url: "./data/worldcup.json", label: "同站缓存" },
  {
    id: "jsdmirror",
    url: "https://cdn.jsdmirror.com/gh/openfootball/worldcup.json@master/2026/worldcup.json",
    label: "jsDelivr 国内镜像",
  },
  {
    id: "jsdelivr",
    url: "https://cdn.jsdelivr.net/gh/openfootball/worldcup.json@master/2026/worldcup.json",
    label: "jsDelivr",
  },
  {
    id: "statically",
    url: "https://cdn.statically.io/gh/openfootball/worldcup.json/master/2026/worldcup.json",
    label: "Statically CDN",
  },
  { id: "ghproxy", url: `https://ghproxy.net/${GITHUB_RAW}`, label: "GitHub 镜像" },
  { id: "ghproxy2", url: `https://gh-proxy.com/${GITHUB_RAW}`, label: "GitHub 加速" },
  { id: "github", url: GITHUB_RAW, label: "GitHub 原始" },
];

const FETCH_TIMEOUT_MS = 6000;
const AUTO_REFRESH_MS = 3 * 60 * 1000;

/** 解析 openfootball 时间格式，返回 Date（UTC）与北京时间的展示字符串 */
export function parseMatchTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { utc: null, beijing: "待定", beijingDate: dateStr || "", beijingDateKey: dateStr || "" };

  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*UTC([+-]?\d+)/i);
  if (!m) return { utc: null, beijing: timeStr, beijingDate: dateStr, beijingDateKey: dateStr };

  const hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const tzOffset = parseInt(m[3], 10);
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hours - tzOffset, mins, 0);
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

export function normalizeMatch(raw, index) {
  const finished = Boolean(raw.score?.ft);
  const [homeScore, awayScore] = raw.score?.ft || [null, null];
  const [homeHtScore, awayHtScore] = raw.score?.ht || [null, null];
  const groupLetter = (raw.group || "").replace("Group ", "").trim();
  const timeInfo = parseMatchTime(raw.date, raw.time);

  return {
    id: index,
    round: raw.round,
    date: raw.date,
    time: raw.time,
    home: raw.team1,
    away: raw.team2,
    homeScore,
    awayScore,
    homeHtScore,
    awayHtScore,
    finished,
    group: groupLetter,
    groupLabel: raw.group || "",
    stage: groupLetter ? "group" : "knockout",
    ground: raw.ground || "",
    utc: timeInfo.utc,
    beijingTime: timeInfo.beijing,
    beijingDate: timeInfo.beijingDate,
    beijingDateKey: timeInfo.beijingDateKey || raw.date,
    beijingFull: timeInfo.beijingFull || `${timeInfo.beijingDate} ${timeInfo.beijing}`,
  };
}

function isValidWorldCupJson(raw) {
  return Boolean(raw?.matches?.length >= 50 && raw?.name);
}

function freshnessScore(raw) {
  return raw.matches.filter((m) => m.score?.ft).length;
}

function packRaw(raw, source, sourceLabel) {
  return {
    name: raw.name,
    matches: raw.matches.map(normalizeMatch),
    source,
    sourceLabel,
    freshness: freshnessScore(raw),
  };
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, { cache: "no-cache", signal: controller.signal });
    if (!res.ok) return null;
    const raw = await res.json();
    if (!isValidWorldCupJson(raw)) return null;
    return {
      raw,
      source: source.id,
      sourceLabel: source.label,
      freshness: freshnessScore(raw),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllSources() {
  const results = await Promise.all(DATA_SOURCES.map((source) => fetchSource(source)));
  return results.filter(Boolean);
}

/** 内置数据，打开页面立即可用 */
export function getBundledWorldCupData() {
  return packRaw(bundledData, "bundled", "内置数据");
}

/** 并行检索全部数据源，自动选取最新的一份 */
export async function fetchLatestWorldCupData() {
  const bundled = getBundledWorldCupData();
  const results = await fetchAllSources();
  if (results.length === 0) return bundled;

  const best = results.sort((a, b) => b.freshness - a.freshness)[0];
  if (best.freshness >= bundled.freshness) {
    return packRaw(best.raw, best.source, best.sourceLabel);
  }
  return bundled;
}

/** @deprecated 使用 fetchLatestWorldCupData */
export async function loadWorldCupData() {
  return fetchLatestWorldCupData();
}

/** 后台定时自动检索；onUpdate 在拿到更优数据时回调 */
export function startAutoDataRefresh(onUpdate, intervalMs = AUTO_REFRESH_MS) {
  let busy = false;

  const tick = async () => {
    if (busy || document.visibilityState === "hidden") return;
    busy = true;
    try {
      const data = await fetchLatestWorldCupData();
      onUpdate(data);
    } catch {
      /* 静默失败，保留当前数据 */
    } finally {
      busy = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
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
    return a.utc - b.utc;
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
    const t = m.utc.getTime();
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

export function getTeamMatches(matches, team) {
  return sortMatchesByTime(
    matches.filter((m) => m.home === team || m.away === team)
  );
}

export function getPreviousMatch(matches, team, beforeMatch) {
  const teamMatches = getTeamMatches(matches, team);
  const finished = teamMatches.filter((m) => m.finished);
  if (beforeMatch?.utc) {
    return finished.filter((m) => m.utc && m.utc < beforeMatch.utc).pop();
  }
  return finished.filter((m) => m.date < beforeMatch.date).pop();
}

export function getNextMatch(matches, team, afterMatch) {
  const teamMatches = getTeamMatches(matches, team);
  const upcoming = teamMatches.filter((m) => !m.finished);
  if (afterMatch?.utc) {
    return upcoming.find((m) => m.utc && m.utc > afterMatch.utc);
  }
  return upcoming.find((m) => m.date > afterMatch.date);
}

export function matchResultText(match, team) {
  if (!match.finished) return "未赛";
  const isHome = match.home === team;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  const opponent = isHome ? match.away : match.home;
  let outcome = "平";
  if (gf > ga) outcome = "胜";
  if (gf < ga) outcome = "负";
  return `${outcome} ${gf}-${ga}（vs ${opponent}）`;
}

/** 详情页赛果：如（半场：1：0） 2：0 */
export function matchScoreDetail(match) {
  if (!match.finished) return "—";
  const ft = `${match.homeScore}：${match.awayScore}`;
  if (match.homeHtScore != null && match.awayHtScore != null) {
    return `（半场：${match.homeHtScore}：${match.awayHtScore}） ${ft}`;
  }
  return ft;
}
