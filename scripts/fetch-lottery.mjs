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

function normalizeResult(raw) {
  const hs = parseInt(raw.homeScore ?? raw.fullHomeScore ?? raw.sectionsScore?.[0], 10);
  const as = parseInt(raw.awayScore ?? raw.fullAwayScore ?? raw.sectionsScore?.[1], 10);
  const finished = !Number.isNaN(hs) && !Number.isNaN(as);
  const timeInfo = beijingParts(raw.matchDate, raw.matchTime || "00:00:00");

  return {
    id: raw.matchId,
    num: raw.matchNumStr || "",
    matchNum: raw.matchNum,
    round: raw.leagueNameAbbr || raw.leagueName || "",
    league: raw.leagueName || raw.leagueNameAbbr || "",
    leagueShort: raw.leagueNameAbbr || "",
    leagueId: raw.leagueId,
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
    finished,
    odds: null,
    hhad: null,
    single: false,
    status: "Finished",
    stage: "league",
    group: raw.leagueNameAbbr || raw.leagueName || "其他",
    groupLabel: raw.leagueName || "",
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

async function fetchResults(begin, end, maxPages = 6) {
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
        if (m?.id == null || seen.has(m.id)) continue;
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
    if (m?.id) map.set(m.id, m);
  }
  for (const m of currentMatches) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    if (prev?.finished) {
      map.set(m.id, { ...m, ...prev, odds: m.odds ?? prev.odds, hhad: m.hhad ?? prev.hhad });
    } else {
      map.set(m.id, { ...prev, ...m, finished: prev?.finished ?? m.finished });
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
  const results = await fetchResults(begin, businessDate);

  const history = mergeHistory(existing.history || [], results, matches);

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
    })
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
