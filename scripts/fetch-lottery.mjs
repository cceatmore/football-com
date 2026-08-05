/**
 * 抓取体彩竞彩足球赛程，合并历史赛果，写入 data/lottery.json
 * 用法: node scripts/fetch-lottery.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "data", "lottery.json");

const UPSTREAM =
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had,crs,ttg,hafu&channel=c";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.sporttery.cn/mjc/jsq/zqspf/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

function beijingNow() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T") + "+08:00";
}

function beijingDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function parseRank(rankStr) {
  if (!rankStr) return { league: "", rank: null };
  const m = String(rankStr).match(/^\[(.+?)(\d+)\]$/);
  if (!m) return { league: rankStr, rank: null };
  return { league: m[1], rank: parseInt(m[2], 10) };
}

function beijingParts(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    return { beijingTime: "待定", beijingDateKey: dateStr || "", beijingDate: "", utc: null };
  }
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = 0] = timeStr.split(":").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, hh - 8, mm, ss));
  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utc);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return {
    beijingTime: `${get("hour")}:${get("minute")}`,
    beijingDateKey: utc.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
    beijingDate: `${get("month")}月${get("day")}日`,
    utc: utc.toISOString(),
  };
}

function normalizeSelling(raw) {
  const homeRankInfo = parseRank(raw.homeRank);
  const awayRankInfo = parseRank(raw.awayRank);
  const timeInfo = beijingParts(raw.matchDate, raw.matchTime);
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
    finished: false,
    odds: had.h ? { h: had.h, d: had.d, a: had.a } : null,
    hhad: hhad.goalLine ? { line: hhad.goalLine, h: hhad.h, d: hhad.d, a: hhad.a } : null,
    single: Boolean(raw.poolList?.some((p) => p.single === 1)),
    status: raw.matchStatus || "Selling",
    stage: "league",
    group: raw.leagueAbbName || raw.leagueAllName || "其他",
    groupLabel: raw.leagueAllName || "",
    ground: "",
    ...timeInfo,
  };
}

function parseScorePair(value) {
  if (value == null || value === "") return [null, null];
  if (Array.isArray(value) && value.length >= 2) {
    const home = parseInt(value[0], 10);
    const away = parseInt(value[1], 10);
    if (Number.isNaN(home) || Number.isNaN(away)) return [null, null];
    return [home, away];
  }
  const m = String(value)
    .trim()
    .match(/(\d+)\s*[:：\-]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function extractScores(raw = {}) {
  let homeScore = null;
  let awayScore = null;
  let homeHtScore = null;
  let awayHtScore = null;

  [homeScore, awayScore] = parseScorePair(raw.fullCourtGoal);
  if (homeScore == null && raw.homeScore != null && raw.awayScore != null) {
    const hs = parseInt(raw.homeScore, 10);
    const as = parseInt(raw.awayScore, 10);
    if (!Number.isNaN(hs) && !Number.isNaN(as)) {
      homeScore = hs;
      awayScore = as;
    }
  }

  [homeHtScore, awayHtScore] = parseScorePair(raw.halfTimeGoal);
  const sections = raw.sectionsScore || raw.sectionScore;
  if (Array.isArray(sections)) {
    if (homeHtScore == null && sections.length >= 2) {
      [homeHtScore, awayHtScore] = parseScorePair(sections.slice(0, 2));
    }
    if (homeScore == null && sections.length >= 4) {
      [homeScore, awayScore] = parseScorePair(sections.slice(2, 4));
    }
  }

  return { homeScore, awayScore, homeHtScore, awayHtScore };
}

function preferText(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

function mergeMatchRecord(base = {}, extra = {}) {
  const homeScore = extra.homeScore ?? base.homeScore ?? null;
  const awayScore = extra.awayScore ?? base.awayScore ?? null;
  return {
    ...base,
    ...extra,
    num: preferText(extra.num, base.num),
    matchNum: extra.matchNum ?? base.matchNum ?? null,
    home: preferText(base.home, extra.home),
    away: preferText(base.away, extra.away),
    league: preferText(base.league, extra.league),
    leagueShort: preferText(base.leagueShort, extra.leagueShort),
    homeScore,
    awayScore,
    homeHtScore: extra.homeHtScore ?? base.homeHtScore ?? null,
    awayHtScore: extra.awayHtScore ?? base.awayHtScore ?? null,
    finished: Boolean(extra.finished || base.finished || (homeScore != null && awayScore != null)),
    odds: extra.odds ?? base.odds ?? null,
    hhad: extra.hhad ?? base.hhad ?? null,
    single: Boolean(extra.single || base.single),
  };
}

function normalizeResult(raw) {
  const scores = extractScores(raw);
  const finished = scores.homeScore != null && scores.awayScore != null;
  const timeInfo = beijingParts(raw.matchDate, raw.matchTime || "00:00:00");

  return {
    id: raw.matchId ?? raw.sportteryMatchId,
    num: raw.matchNumStr || "",
    matchNum: raw.matchNum,
    round: raw.leagueNameAbbr || raw.leagueName || raw.tournamentShortName || "",
    league: raw.leagueName || raw.leagueNameAbbr || raw.tournamentShortName || "",
    leagueShort: raw.leagueNameAbbr || raw.tournamentShortName || "",
    leagueId: raw.leagueId || raw.sportteryTournamentId,
    date: raw.matchDate,
    time: raw.matchTime || "",
    businessDate: raw.businessDate || raw.matchDate,
    home: raw.homeTeam || raw.homeTeamAbbName || raw.homeTeamAllName || raw.homeTeamShortName,
    away: raw.awayTeam || raw.awayTeamAbbName || raw.awayTeamAllName || raw.awayTeamShortName,
    homeRank: null,
    awayRank: null,
    rankLeague: raw.leagueNameAbbr || raw.tournamentShortName || "",
    homeScore: finished ? scores.homeScore : null,
    awayScore: finished ? scores.awayScore : null,
    homeHtScore: scores.homeHtScore,
    awayHtScore: scores.awayHtScore,
    finished,
    odds: null,
    hhad: null,
    single: false,
    status: "Finished",
    stage: "league",
    group: raw.leagueNameAbbr || raw.leagueName || raw.tournamentShortName || "其他",
    groupLabel: raw.leagueName || raw.tournamentShortName || "",
    ground: "",
    ...timeInfo,
  };
}

function normalizeUniformResult(raw) {
  const sid = Number(raw.sportteryMatchId) || 0;
  if (sid < 2000000 || sid >= 2100000) return null;
  const scores = extractScores(raw);
  if (scores.homeScore == null || scores.awayScore == null) return null;
  const timeInfo = beijingParts(raw.matchDate, raw.matchTime || "00:00:00");
  const league = raw.tournamentShortName || "";
  return {
    id: sid,
    num: raw.matchNumStr || "",
    matchNum: raw.matchNum ?? null,
    round: league,
    league,
    leagueShort: league,
    leagueId: raw.sportteryTournamentId || raw.tournamentId || null,
    date: raw.matchDate,
    time: typeof raw.matchTime === "string" ? raw.matchTime : "",
    businessDate: raw.matchDate,
    home: raw.homeTeamShortName || raw.homeTeamAllName || raw.homeTeamAbbName,
    away: raw.awayTeamShortName || raw.awayTeamAllName || raw.awayTeamAbbName,
    homeRank: null,
    awayRank: null,
    rankLeague: league,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    homeHtScore: scores.homeHtScore,
    awayHtScore: scores.awayHtScore,
    finished: true,
    odds: null,
    hhad: null,
    single: false,
    status: "Finished",
    stage: "league",
    group: league || "其他",
    groupLabel: league,
    ground: "",
    ...timeInfo,
  };
}

async function fetchUpstream() {
  const res = await fetch(UPSTREAM, { headers: HEADERS });
  if (!res.ok) throw new Error(`体彩 API 响应 ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.errorMessage || "体彩 API 返回失败");
  return data;
}

async function fetchResultsFromJc(begin, end, maxPages = 6) {
  const headers = {
    ...HEADERS,
    Referer: "https://www.sporttery.cn/jc/zqsgkj/",
    Origin: "https://www.sporttery.cn",
  };
  const all = [];
  const seen = new Set();
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = `https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=${page}&pcOrWap=1&leagueId=&matchBeginDate=${begin}&matchEndDate=${end}`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const data = await res.json();
      const list = data?.success ? data.value?.matchResultList || [] : [];
      if (!list.length) break;
      for (const raw of list) {
        const m = normalizeResult(raw);
        if (m?.id == null || !m.finished || seen.has(m.id)) continue;
        seen.add(m.id);
        all.push(m);
      }
      if (list.length < 30) break;
    }
  } catch {
    /* keep what we have */
  }
  return all;
}

async function fetchResultsFromUniform(seedMatches = [], begin) {
  const headers = {
    ...HEADERS,
    Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html",
  };
  const seedIds = [];
  const seenSeed = new Set();
  for (const m of seedMatches) {
    const id = Number(m?.id);
    if (!Number.isFinite(id) || id < 2000000 || id >= 2100000 || seenSeed.has(id)) continue;
    seenSeed.add(id);
    seedIds.push(id);
    if (seedIds.length >= 12) break;
  }
  if (!seedIds.length) return [];

  const map = new Map();
  await Promise.all(
    seedIds.map(async (id) => {
      try {
        const url = `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=20`;
        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.success) return;
        const lists = [...(data.value?.home?.matchList || []), ...(data.value?.away?.matchList || [])];
        for (const raw of lists) {
          const m = normalizeUniformResult(raw);
          if (!m?.id || !m.finished) continue;
          const dateKey = m.beijingDateKey || m.date || "";
          if (begin && dateKey && dateKey < begin) continue;
          const prev = map.get(m.id);
          map.set(m.id, prev ? mergeMatchRecord(prev, m) : m);
        }
      } catch {
        /* ignore one seed */
      }
    })
  );
  return [...map.values()];
}

async function fetchResults(begin, end, seedMatches = [], maxPages = 6) {
  const fromJc = await fetchResultsFromJc(begin, end, maxPages);
  if (fromJc.length) return fromJc;
  return fetchResultsFromUniform(seedMatches, begin);
}

function loadExisting() {
  try {
    return JSON.parse(readFileSync(OUT_PATH, "utf8"));
  } catch {
    return { matches: [], history: [] };
  }
}

function mergeHistory(existingHistory, newResults, currentMatches) {
  const map = new Map();

  for (const m of existingHistory) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of newResults) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    map.set(m.id, prev ? mergeMatchRecord(prev, m) : m);
  }
  for (const m of currentMatches) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    if (prev?.finished) {
      map.set(m.id, mergeMatchRecord(m, prev));
    } else {
      map.set(m.id, prev ? mergeMatchRecord(prev, m) : m);
    }
  }

  return [...map.values()].sort((a, b) => {
    const da = a.utc || a.date;
    const db = b.utc || b.date;
    return String(da).localeCompare(String(db));
  });
}

async function main() {
  const existing = loadExisting();
  const upstream = await fetchUpstream();

  const matches = [];
  for (const day of upstream.value.matchInfoList || []) {
    for (const m of day.subMatchList || []) {
      matches.push(normalizeSelling(m));
    }
  }

  const businessDate =
    upstream.value.matchInfoList?.[0]?.businessDate || beijingDateKey();

  const startDate = new Date(businessDate);
  startDate.setDate(startDate.getDate() - 30);
  const begin = startDate.toISOString().slice(0, 10);
  const retained = [...(existing.history || []), ...(existing.matches || [])];
  const seedMatches = [...retained, ...matches];
  const results = await fetchResults(begin, businessDate, seedMatches);

  const history = mergeHistory(retained, results, matches);

  const out = {
    name: "体彩竞彩足球",
    updatedAt: beijingNow(),
    businessDate,
    matches,
    history,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      businessDate,
      matches: matches.length,
      history: history.length,
      newResults: results.length,
      finished: history.filter((m) => m.finished).length,
    })
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
