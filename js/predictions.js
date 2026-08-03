import { fetchLeagueStandingsByMatch } from "./leagueStandings.js";

const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/mjc/zqszsc/",
  Accept: "application/json, text/plain, */*",
};

const JINA_PREFIX = "https://r.jina.ai/";
const OUTCOMES = [
  { key: "home", label: "主胜", short: "胜" },
  { key: "draw", label: "平局", short: "平" },
  { key: "away", label: "主负", short: "负" },
];

/** 体彩中文队名 → 英文检索别名 */
const TEAM_EN = {
  赫根: ["Hacken", "BK Hacken", "BK Häcken"],
  索尔纳: ["AIK", "AIK Solna"],
  AIK索尔纳: ["AIK", "AIK Solna"],
  罗森博格: ["Rosenborg"],
  腓特烈斯塔: ["Fredrikstad"],
  马尔默: ["Malmo", "Malmö"],
  哈马比: ["Hammarby"],
  天狼星: ["Sirius", "IK Sirius", "Sirius IK"],
  哥德堡: ["Goteborg", "IFK Göteborg"],
  佐加顿斯: ["Djurgarden", "Djurgårdens", "Djurgårdens IF", "Djurgardens IF"],
  埃夫斯堡: ["Elfsborg", "IF Elfsborg"],
  米亚尔比: ["Mjallby", "Mjällby"],
  盖斯: ["GAIS"],
  卡尔马: ["Kalmar"],
  诺尔雪平: ["Norrkoping", "Norrköping"],
  瓦勒伦加: ["Valerenga", "Vålerenga"],
  博德闪耀: ["Bodo Glimt", "Bodø/Glimt"],
  莫尔德: ["Molde"],
  布兰: ["Brann"],
  维京: ["Viking"],
  特罗姆瑟: ["Tromso", "Tromsø"],
  哈尔姆斯: ["Halmstad", "Halmstads", "Halmstads BK"],
  韦斯特罗: ["Vasteras", "Västerås", "Västerås SK", "Västerås SK FK"],
  塞伊奈: ["SJK", "SJK Seinajoki", "Seinajoen JK", "Seinäjoen JK"],
  赫尔辛基: ["HJK", "HJK Helsinki"],
  巴竞技: [
    "Athletico Paranaense",
    "Athletico/PR",
    "Athletico PR",
    "Atletico PR",
    "Atlético PR",
    "Athletico",
    "Atletico Paranaense",
    "巴拉纳竞技",
    "巴拉那竞技",
  ],
  维多利亚: ["Vitória/BA", "Vitoria/BA", "Vitória BA", "Vitoria BA", "EC Vitoria", "Vitória", "Vitoria"],
};

/** 联赛 → Injuries&Suspensions 栏目 slug（优先抓栏目首页 + 站内搜索） */
const LEAGUE_IAS_SLUGS = {
  瑞超: "sweden-allsvenskan",
  挪超: "norway-eliteserien",
  芬超: "finland-veikkausliiga",
  巴甲: "brazil-serie-a",
  巴西杯: "brazil-serie-a",
  英超: "england-premier-league",
  西甲: "spain-la-liga",
  德甲: "germany-bundesliga",
  意甲: "italy-serie-a",
  法甲: "france-ligue-1",
};

/** 联赛 → 预测站栏目直链（绕过搜索引擎，显著更快） */
const LEAGUE_TIP_PAGES = {
  瑞超: [
    "https://www.predictz.com/predictions/sweden/allsvenskan/",
    "https://www.forebet.com/en/football/predictions/sweden/allsvenskan",
    "https://www.windrawwin.com/football-predictions/sweden-allsvenskan/",
  ],
  挪超: [
    "https://www.predictz.com/predictions/norway/eliteserien/",
    "https://www.forebet.com/en/football/predictions/norway/eliteserien",
    "https://www.windrawwin.com/football-predictions/norway-eliteserien/",
  ],
  芬超: [
    "https://www.predictz.com/predictions/finland/veikkausliiga/",
    "https://www.forebet.com/en/football/predictions/finland/veikkausliiga",
  ],
  巴甲: [
    "https://www.predictz.com/predictions/brazil/serie-a/",
    "https://www.forebet.com/en/football/predictions/brazil/serie-a",
    "https://www.windrawwin.com/football-predictions/brazil-serie-a/",
  ],
  巴西杯: [
    "https://www.predictz.com/predictions/brazil/copa-do-brasil/",
    "https://www.forebet.com/en/football/predictions/brazil/copa-do-brasil",
  ],
  英超: [
    "https://www.predictz.com/predictions/england/premier-league/",
    "https://www.forebet.com/en/football/predictions/england/premier-league",
    "https://www.windrawwin.com/football-predictions/england-premier-league/",
  ],
  西甲: [
    "https://www.predictz.com/predictions/spain/la-liga/",
    "https://www.forebet.com/en/football/predictions/spain/la-liga",
  ],
  德甲: [
    "https://www.predictz.com/predictions/germany/bundesliga/",
    "https://www.forebet.com/en/football/predictions/germany/bundesliga",
  ],
  意甲: [
    "https://www.predictz.com/predictions/italy/serie-a/",
    "https://www.forebet.com/en/football/predictions/italy/serie-a",
  ],
  法甲: [
    "https://www.predictz.com/predictions/france/ligue-1/",
    "https://www.forebet.com/en/football/predictions/france/ligue-1",
  ],
};

/** 联赛升降级 / 欧战区启发式（用于赛果影响文案） */
const LEAGUE_STAKE_RULES = {
  英超: { teams: 20, champion: 1, europeTop: 4, europeLabel: "欧冠区", midEurope: [5, 6], midLabel: "欧战区", relegateFrom: 18 },
  西甲: { teams: 20, champion: 1, europeTop: 4, europeLabel: "欧冠区", midEurope: [5, 6], midLabel: "欧战区", relegateFrom: 18 },
  德甲: { teams: 18, champion: 1, europeTop: 4, europeLabel: "欧冠区", midEurope: [5, 6], midLabel: "欧战区", relegateFrom: 16, playoffRank: 16 },
  意甲: { teams: 20, champion: 1, europeTop: 4, europeLabel: "欧冠区", midEurope: [5, 6], midLabel: "欧战区", relegateFrom: 18 },
  法甲: { teams: 18, champion: 1, europeTop: 3, europeLabel: "欧冠区", midEurope: [4, 5], midLabel: "欧战区", relegateFrom: 16, playoffRank: 16 },
  瑞超: { teams: 16, champion: 1, europeTop: 3, europeLabel: "欧战区", relegateFrom: 14, playoffRank: 14 },
  挪超: { teams: 16, champion: 1, europeTop: 3, europeLabel: "欧战区", relegateFrom: 14, playoffRank: 14 },
  芬超: { teams: 12, champion: 1, europeTop: 2, europeLabel: "欧战区", relegateFrom: 11 },
  巴甲: { teams: 20, champion: 1, europeTop: 4, europeLabel: "解放者杯区", midEurope: [5, 6], midLabel: "南美杯区", relegateFrom: 17 },
};

const TRUSTED_HOSTS = [
  "predictz.com",
  "forebet.com",
  "windrawwin.com",
  "betimate.com",
  "betclan.com",
  "sportsgambler.com",
  "freesupertips.com",
  "soccervista.com",
  "sportsmole.co.uk",
  "footballpredictions.net",
  "bettingtips.today",
  "betonvalue.com",
  "olbg.com",
];

/** 优先定向检索的机构（比泛搜更稳） */
const PRIORITY_TIP_SITES = [
  "predictz.com",
  "windrawwin.com",
  "betimate.com",
  "betclan.com",
  "forebet.com",
  "sportsgambler.com",
];

const cache = new Map();
/** 预测结果结构版本；变更后自动丢弃旧缓存（避免串场摘要残留） */
export const ANALYSIS_SCHEMA = 10;

/** 赔率/资讯站，不做预测摘要 */
const BLOCKED_HOSTS = [
  "odds.500.com",
  "500.com",
  "sporttery.cn",
  "sina.com.cn",
  "zhibo8.cc",
  "dongqiudi.com",
  "zgzcw.com",
  "okooo.com",
];

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

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/plain, text/html, */*" },
      cache: "no-cache",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaJina(url, timeoutMs = 8000) {
  return fetchText(`${JINA_PREFIX}${url}`, timeoutMs);
}

function teamSearchNames(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const aliases = TEAM_EN[raw] || TEAM_EN[raw.replace(/^AIK/i, "")] || [];
  const stripped = raw.replace(/^AIK/i, "").trim();
  return [...new Set([raw, stripped, ...aliases].filter(Boolean))];
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceLabel(url) {
  const host = hostOf(url);
  if (!host) return "外部机构";
  const map = {
    "forebet.com": "Forebet 数学模型",
    "predictz.com": "PredictZ",
    "windrawwin.com": "WinDrawWin",
    "betimate.com": "Betimate",
    "tips.gg": "Tips.GG",
    "sportsgambler.com": "SportsGambler",
    "freesupertips.com": "FreeSuperTips",
    "betclan.com": "BetClan",
    "soccervista.com": "SoccerVista",
    "sportsmole.co.uk": "SportsMole",
    "footballpredictions.net": "FootballPredictions",
    "bettingtips.today": "BettingTips",
    "betonvalue.com": "BetOnValue",
    "olbg.com": "OLBG",
  };
  return map[host] || host.replace(/^www\./, "");
}

function isTrustedHost(url) {
  const host = hostOf(url);
  return TRUSTED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h));
}

function isBlockedHost(url) {
  const host = hostOf(url);
  if (/500\.com|sporttery|zhibo8|dongqiudi|zgzcw|okooo/i.test(host)) return true;
  return BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function isBlockedResult(item) {
  if (!item?.url || isBlockedHost(item.url)) return true;
  const hay = `${item.title || ""} ${item.url} ${item.snippet || ""}`;
  if (/500彩票|数据分析-500|竞彩官方|澳客网|即时赔率表/i.test(hay)) return true;
  // Tips.GG 赔率页噪音极大，直接跳过
  if (/tips\.gg/i.test(item.url) && /赔率|odds|投注线|sportsbook|moneyline|实时赔率/i.test(hay)) {
    return true;
  }
  return false;
}

/** 首页/栏目列表页，不是单场预测 */
function isGenericListingUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return true;
    const path = `/${parts.join("/")}`.toLowerCase();
    // 仅栏目根路径，如 /en/football/predictions、/predictions/
    if (parts.length <= 3 && /\/(predictions?|tips?|previews?|football|soccer)\/?$/i.test(path)) {
      // 无队名式 slug（通常含 vs 或较长连字符）
      if (!/vs|v-|预测|分析/i.test(path) && !parts.some((p) => (p.match(/-/g) || []).length >= 2)) {
        return true;
      }
    }
    if (parts.length === 1 && /^(en|zh|cn|predictions?|tips?)$/i.test(parts[0])) return true;
    return false;
  } catch {
    return true;
  }
}

/** 标题或 URL 必须同时出现双方，避免靠列表页正文误命中 */
function isMatchSpecificResult(item, homeNames, awayNames) {
  if (!item?.url || isBlockedResult(item) || isGenericListingUrl(item.url)) return false;
  const titleUrl = `${item.title || ""} ${item.url}`;
  return teamHitCount(titleUrl, homeNames, awayNames) >= 2;
}

function unwrapDuckUrl(url) {
  try {
    const u = new URL(url);
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url;
  } catch {
    return url;
  }
}

function pickOutcome(probs) {
  if (!probs) return null;
  let best = OUTCOMES[0];
  let bestVal = -1;
  for (const o of OUTCOMES) {
    if (probs[o.key] > bestVal) {
      bestVal = probs[o.key];
      best = o;
    }
  }
  return { ...best, prob: bestVal };
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

/** 体彩胜平负赔率 → 去水后隐含概率 */
function oddsToImpliedProbs(odds) {
  if (!odds?.h || !odds?.d || !odds?.a) return null;
  const ih = 1 / Number(odds.h);
  const id = 1 / Number(odds.d);
  const ia = 1 / Number(odds.a);
  if (![ih, id, ia].every((n) => Number.isFinite(n) && n > 0)) return null;
  const sum = ih + id + ia;
  return { home: ih / sum, draw: id / sum, away: ia / sum };
}

function buildOddsSource(match) {
  const probs = oddsToImpliedProbs(match?.odds);
  if (!probs) return null;
  const pick = pickOutcome(probs);
  const line = match.hhad?.line;
  const extras = [];
  if (line) extras.push(`让球 ${line}`);
  const tipText = formatChineseTip(pick.key, probs, extras);
  const favoredTeam = pick.key === "home" ? match.home : pick.key === "away" ? match.away : null;
  const leanNote = favoredTeam
    ? `市场更看好${favoredTeam}（隐含概率约 ${pct(pick.prob)}）`
    : `市场倾向平局（隐含概率约 ${pct(pick.prob)}）`;
  return {
    name: "体彩市场赔率",
    url: "",
    title: `${match.home}对阵${match.away} · 赔率隐含倾向`,
    tipText: `${leanNote}。${tipText}`,
    pick: { ...pick },
    probs,
    goals: null,
    trusted: true,
    local: true,
    sourceKind: "odds",
  };
}

function isCupCompetition(match) {
  const hay = `${match?.league || ""} ${match?.leagueShort || ""} ${match?.group || ""} ${match?.groupLabel || ""}`;
  return /杯|cup|knockout|淘汰|决赛|半决赛|四分之一|附加赛|play.?offs?|copa\b/i.test(hay);
}

function findStandingRow(rows, teamName) {
  if (!rows?.length || !teamName) return null;
  const exact = rows.find((r) => r.team === teamName);
  if (exact) return exact;
  const names = teamSearchNames(teamName).map((n) => foldAscii(n));
  return (
    rows.find((r) => {
      const t = foldAscii(r.team);
      return names.some((n) => n && (t === n || t.includes(n) || n.includes(t)));
    }) || null
  );
}

function zoneLabelForRank(rank, rules) {
  if (!rank || !rules) return "中游";
  if (rank === 1) return "争冠区";
  if (rank <= (rules.europeTop || 0)) return rules.europeLabel || "欧战区";
  if (rules.midEurope?.length) {
    const [lo, hi] = [Math.min(...rules.midEurope), Math.max(...rules.midEurope)];
    if (rank >= lo && rank <= hi) return rules.midLabel || "欧战区";
  }
  if (rules.playoffRank && rank === rules.playoffRank) return "降级附加赛区";
  if (rules.relegateFrom && rank >= rules.relegateFrom) return "降级区";
  return "中游";
}

function describeLeagueOutcome(team, sideLabel, result, row, rivalRow, rules, isCup) {
  if (isCup) {
    if (result === "win") return `${team}（${sideLabel}）赢球：晋级下一轮 / 锁定出线优势`;
    if (result === "lose") return `${team}（${sideLabel}）输球：面临被淘汰风险`;
    return `${team}（${sideLabel}）平局：可能进入加时/点球，或把悬念留到次回合`;
  }

  const rank = row?.rank;
  const zone = zoneLabelForRank(rank, rules);
  const pts = row?.pts;
  const gap = rivalRow?.pts != null && pts != null ? pts - rivalRow.pts : null;

  if (result === "win") {
    if (zone === "争冠区" || zone === (rules?.europeLabel || "欧战区") || (rank && rank <= 4)) {
      return `${team}赢球：巩固${zone === "中游" ? "上游排名" : zone}，争冠/欧战席位更稳`;
    }
    if (zone === "降级区" || zone === "降级附加赛区") {
      return `${team}赢球：拿到 3 分，有望跳出${zone}、缓解保级压力`;
    }
    return `${team}赢球：积 3 分，有望提升排名${rank ? `（当前第 ${rank}）` : ""}`;
  }

  if (result === "lose") {
    if (zone === "降级区" || zone === "降级附加赛区") {
      return `${team}输球：积 0 分，更深陷入降级/附加赛危机`;
    }
    if (zone === "争冠区" || (rank && rank <= 3)) {
      return `${team}输球：争冠节奏受挫，可能被身后球队追近`;
    }
    if (rules?.relegateFrom && rank != null && rank >= rules.relegateFrom - 3) {
      return `${team}输球：与保级线距离被拉近，需警惕滑向降级区`;
    }
    return `${team}输球：积 0 分${rank ? `，排名（第 ${rank}）可能下滑` : ""}`;
  }

  // draw
  if (zone === "降级区" || zone === "降级附加赛区") {
    return `${team}平局：拿到 1 分，对保级仍有帮助（可接受）`;
  }
  if (zone === "争冠区" || (rank && rank === 1)) {
    const note = gap != null && gap > 0 ? `仍领先身后 ${gap} 分` : "可能被追近";
    return `${team}平局：拿到 1 分，争冠不至于崩盘（${note}）`;
  }
  if (rules?.relegateFrom && rank != null && rank >= rules.relegateFrom - 2) {
    return `${team}平局：拿到 1 分，有助于稳住保级形势（可接受）`;
  }
  return `${team}平局：双方各得 1 分，排名变动通常有限`;
}

function teamAcceptsDraw(row, rules, isCup, probs, sideKey) {
  if (isCup) {
    return {
      accept: true,
      note: "杯赛平局常不意味着出局，可能加时/点球或次回合再决胜",
    };
  }
  const zone = zoneLabelForRank(row?.rank, rules);
  if (zone === "降级区" || zone === "降级附加赛区") {
    return { accept: true, note: "保级阶段拿 1 分往往可接受，总比输球强" };
  }
  if (rules?.relegateFrom && row?.rank != null && row.rank >= rules.relegateFrom - 2) {
    return { accept: true, note: "靠近保级线时，平局有助于拉开与降级区的距离" };
  }
  if (row?.rank === 1 && probs?.draw >= 0.22) {
    return { accept: true, note: "榜首球队客场/硬仗拿 1 分通常可接受" };
  }
  // 市场上平局概率接近首选时，提示双方都能接受平
  if (probs?.draw != null && probs.draw >= 0.28 && sideKey !== "draw") {
    return { accept: true, note: "本场平局概率不低，对该队也是可接受结果" };
  }
  return { accept: false, note: "" };
}

/**
 * 赛果影响：哪边更被看好、赢/平/输意味着什么、谁更能接受平局
 */
function buildMatchStakes(match, standingRows = null) {
  const leagueKey = match.leagueShort || match.group || "";
  const rules = LEAGUE_STAKE_RULES[leagueKey] || null;
  const isCup = isCupCompetition(match);
  const probs = oddsToImpliedProbs(match.odds);
  const pick = probs ? pickOutcome(probs) : null;

  const homeRow =
    findStandingRow(standingRows, match.home) ||
    (match.homeRank != null ? { team: match.home, rank: match.homeRank, pts: null } : null);
  const awayRow =
    findStandingRow(standingRows, match.away) ||
    (match.awayRank != null ? { team: match.away, rank: match.awayRank, pts: null } : null);

  const favoredTeam =
    pick?.key === "home" ? match.home : pick?.key === "away" ? match.away : pick?.key === "draw" ? null : null;
  const favoredLabel = pick
    ? pick.key === "draw"
      ? "双方实力接近，平局概率突出"
      : `更看好 ${favoredTeam}（${pick.label}约 ${pct(pick.prob)}）`
    : match.homeRank != null && match.awayRank != null
      ? match.homeRank < match.awayRank
        ? `排名更看好主队 ${match.home}（第 ${match.homeRank} vs 第 ${match.awayRank}）`
        : match.awayRank < match.homeRank
          ? `排名更看好客队 ${match.away}（第 ${match.awayRank} vs 第 ${match.homeRank}）`
          : "双方排名接近"
      : "暂无明确市场倾向";

  const homeWin = describeLeagueOutcome(match.home, "主", "win", homeRow, awayRow, rules, isCup);
  const homeDraw = describeLeagueOutcome(match.home, "主", "draw", homeRow, awayRow, rules, isCup);
  const homeLose = describeLeagueOutcome(match.home, "主", "lose", homeRow, awayRow, rules, isCup);
  const awayWin = describeLeagueOutcome(match.away, "客", "win", awayRow, homeRow, rules, isCup);
  const awayDraw = describeLeagueOutcome(match.away, "客", "draw", awayRow, homeRow, rules, isCup);
  const awayLose = describeLeagueOutcome(match.away, "客", "lose", awayRow, homeRow, rules, isCup);

  const homeAccept = teamAcceptsDraw(homeRow, rules, isCup, probs, "home");
  const awayAccept = teamAcceptsDraw(awayRow, rules, isCup, probs, "away");

  const bullets = [favoredLabel];
  if (isCup) {
    bullets.push("杯赛属性：赢球偏晋级，输球偏淘汰，平局未必出局");
  } else if (homeRow?.rank || awayRow?.rank) {
    const hz = zoneLabelForRank(homeRow?.rank, rules);
    const az = zoneLabelForRank(awayRow?.rank, rules);
    bullets.push(
      `积分形势：${match.home} 第 ${homeRow?.rank ?? "?"}（${hz}）· ${match.away} 第 ${awayRow?.rank ?? "?"}（${az}）`
    );
  }
  if (homeAccept.accept) bullets.push(`${match.home}：${homeAccept.note}`);
  if (awayAccept.accept) bullets.push(`${match.away}：${awayAccept.note}`);

  return {
    isCup,
    favored: pick
      ? {
          key: pick.key,
          label: pick.label,
          team: favoredTeam,
          prob: pick.prob,
          text: favoredLabel,
        }
      : null,
    home: {
      team: match.home,
      rank: homeRow?.rank ?? null,
      zone: zoneLabelForRank(homeRow?.rank, rules),
      win: homeWin,
      draw: homeDraw,
      lose: homeLose,
      acceptDraw: homeAccept.accept,
      acceptDrawNote: homeAccept.note,
    },
    away: {
      team: match.away,
      rank: awayRow?.rank ?? null,
      zone: zoneLabelForRank(awayRow?.rank, rules),
      win: awayWin,
      draw: awayDraw,
      lose: awayLose,
      acceptDraw: awayAccept.accept,
      acceptDrawNote: awayAccept.note,
    },
    bullets,
    scenarios: [
      { result: "主胜", home: homeWin, away: awayLose },
      { result: "平局", home: homeDraw, away: awayDraw },
      { result: "主负", home: homeLose, away: awayWin },
    ],
  };
}

function normalizePosition(pos) {
  const p = String(pos || "").toLowerCase();
  if (/门|goal|gk|keeper/.test(p)) return "门将";
  if (/后|def|back|cb|lb|rb/.test(p)) return "后卫";
  if (/中|mid|cm|dm|am/.test(p)) return "中场";
  if (/前|攻|锋|att|fwd|st|cf|wing/.test(p)) return "前锋";
  return pos || "未知位置";
}

function playerOutStatus(raw) {
  const injured = Number(raw.injuryFlag) === 1;
  const suspended = Number(raw.suspensionFlag) === 1;
  if (injured || suspended) {
    return injured && suspended ? "伤病+停赛" : injured ? "伤病" : "停赛";
  }
  return null;
}

function emptyInjurySide(team) {
  return { team, total: 0, byPos: {}, lines: [] };
}

function summarizeInjuryPlayers(team, players) {
  const byPos = {};
  for (const p of players || []) {
    const pos = p.position || "未知位置";
    byPos[pos] = (byPos[pos] || 0) + 1;
  }
  return {
    team,
    total: (players || []).length,
    byPos,
    lines: Object.entries(byPos).map(([pos, n]) => `${pos} ${n}`),
  };
}

function buildSideInjurySummary(teamLabel, sideData, playerSide) {
  // 仅统计体彩关键球员伤停，忽略大名单里的替补伤停
  const keyPlayers = playerSide?.playerList || [];
  const out = [];

  for (const p of keyPlayers) {
    const status = playerOutStatus(p);
    if (!status) continue;
    out.push({
      position: normalizePosition(p.playerPositionDesc || p.playerPositionCode),
      status,
    });
  }

  return summarizeInjuryPlayers(teamLabel, out);
}

function parseIasPositionToken(token) {
  const t = String(token || "").toLowerCase();
  if (/goalkeeper|\bg\b/.test(t)) return "门将";
  if (/\bd\b|defenc|defens/.test(t)) return "后卫";
  if (/\bm\b|midfield/.test(t)) return "中场";
  if (/\bf\b|forward|attack|scorer|striker|winger/.test(t)) return "前锋";
  return "未知位置";
}

/** IAS 统计括号：出场少的视为替补/边缘，不展示 */
function isIasKeyPlayerToken(token) {
  const t = String(token || "").toLowerCase();
  if (/left the club|newcomer|loan from/i.test(t)) return false;
  // 主力门将 / 核心即使赛季出场为 0 也保留
  if (/first\s+goalkeeper|top scorer|captain/i.test(t)) return true;
  const m = t.match(/(\d+)\s*\/\s*\d+/);
  if (!m) return false;
  return Number(m[1]) >= 3;
}

function parseIasOutLine(line, status) {
  const text = String(line || "");
  if (!text || /^[-–—]$/.test(text.trim())) return [];
  if (/(?:doubtful|suspended|out\s*\([^)]*\))\s*:\s*[-–—]/i.test(text)) return [];
  if (/\bno info\b/i.test(text)) return [];
  const players = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const token = m[1];
    // 跳过 Out (injuries/other) 这类标题括号，只保留球员统计括号
    if (!/\d+\s*\/\s*\d+/.test(token) && !/^(?:first\s+)?(?:goalkeeper|[gdmf])\b/i.test(token)) {
      continue;
    }
    if (!isIasKeyPlayerToken(token)) continue;
    players.push({ position: parseIasPositionToken(token), status });
  }
  // 无可靠出场统计时不按逗号兜底（易把替补算进去）
  return players;
}

function correctIasDateMs(ms) {
  if (!ms) return 0;
  const now = Date.now();
  // 站点偶发写错年份（如把 2026 写成 2024），拉近到当前赛季
  if (now - ms > 150 * 86400000) {
    const d = new Date(ms);
    const y = new Date(now).getFullYear();
    for (const yy of [y, y + 1, y - 1]) {
      const t = new Date(d);
      t.setFullYear(yy);
      if (Math.abs(t.getTime() - now) <= 180 * 86400000) return t.getTime();
    }
  }
  return ms;
}

function parseIasDateMs(text) {
  const raw = String(text || "");
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})T[\d:+-]+/);
  if (iso) {
    const ms = Date.parse(iso[1]);
    return Number.isFinite(ms) ? correctIasDateMs(ms) : 0;
  }
  const m = raw.match(/Date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (!m) return 0;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? correctIasDateMs(ms) : 0;
}

function extractIasGroupsFromChunk(chunk) {
  const groups = [];
  let cur = null;
  // 注意：lookahead 必须写成 Out (...): 完整形式，否则会跳过 Out 行直接命中 Suspended
  const re =
    /(Doubtful|Out\s*\([^)]*\)|Suspended)\s*:\s*([\s\S]*?)(?=(?:Doubtful|Out\s*\([^)]*\)|Suspended)\s*:|Latest league games|$)/gi;
  let m;
  while ((m = re.exec(chunk))) {
    const kind = m[1];
    const body = String(m[2] || "")
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean)[0] || "";
    const line = `${kind}: ${body}`;
    if (/^doubtful/i.test(kind)) {
      cur = [...parseIasOutLine(line, "伤疑")];
      continue;
    }
    if (/^out\s*\(/i.test(kind)) {
      if (!cur) cur = [];
      cur.push(...parseIasOutLine(line, "伤病"));
      continue;
    }
    if (!cur) cur = [];
    cur.push(...parseIasOutLine(line, "停赛"));
    groups.push(cur);
    cur = null;
    if (groups.length >= 2) break;
  }
  return groups;
}

function splitIasMatchChunks(plain) {
  const text = String(plain || "");
  // 站内搜索结果常把多场挤在一行：按「队名 vs 队名」切开
  const stamped = text.split(
    /(?=[A-ZÄÖÅ][\wÄÖÅäöå .'’()/-]{1,48}\s+vs\s+[A-ZÄÖÅ][\wÄÖÅäöå .'’()/-]{1,48}\s+(?:\d{4}-\d{2}-\d{2}T|[A-ZÄÖÅ/][\wÄÖÅäöå .'’()/-]{0,40}\s+Doubtful))/
  );
  if (stamped.length > 1) return stamped.map((x) => x.trim()).filter(Boolean);

  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\bvs\b/i.test(lines[i])) continue;
    const buf = [lines[i]];
    for (let j = i + 1; j < Math.min(lines.length, i + 90); j += 1) {
      if (/\bvs\b/i.test(lines[j]) && /[A-Za-zÄÖÅäöå]/.test(lines[j])) break;
      buf.push(lines[j]);
    }
    chunks.push(buf.join("\n"));
  }
  return chunks;
}

/** 从 IAS 页面提取某队最近一场伤停（不要求对阵双方同页） */
function extractLatestTeamIasPlayers(markdown, teamNames) {
  if (!markdown) return { players: [], dateMs: 0 };
  const plain = String(markdown).replace(/\*\*/g, "");
  let best = { players: [], dateMs: -1 };

  for (const chunk of splitIasMatchChunks(plain)) {
    if (!/\bvs\b/i.test(chunk) || !textMentionsAny(chunk, teamNames)) continue;
    const header = chunk.split(/\n/).find((l) => /\bvs\b/i.test(l)) || chunk.slice(0, 160);
    const parts = header.split(/\bvs\b/i);
    const left = parts[0] || "";
    const right = parts.slice(1).join(" vs ");
    const teamIsHome = textMentionsAny(left, teamNames);
    const teamIsAway = textMentionsAny(right, teamNames);
    if (!teamIsHome && !teamIsAway) continue;

    const dateMs = parseIasDateMs(chunk) || parseIasDateMs(header);
    const groups = extractIasGroupsFromChunk(chunk);
    // 客队需要解析到第二段；截断摘要只有主队段时跳过，避免“较新但空”覆盖旧完整数据
    const needGroups = teamIsHome ? 1 : 2;
    if (groups.length < needGroups) continue;
    const players = (teamIsHome ? groups[0] : groups[1]) || [];
    if (dateMs > best.dateMs || (dateMs === best.dateMs && players.length > best.players.length)) {
      best = { players, dateMs };
    }
  }

  return best;
}

function bestEnglishName(names) {
  return (
    [...(names || [])]
      .filter((n) => /[A-Za-zÄÖÅäöå]/.test(n))
      .sort((a, b) => String(b).length - String(a).length)[0] || names?.[0] || ""
  );
}

function pickBestIasPlayers(pages, teamNames) {
  let best = { players: [], dateMs: -1 };
  for (const page of pages) {
    if (!page) continue;
    const got = extractLatestTeamIasPlayers(page, teamNames);
    if (got.dateMs < 0) continue;
    if (got.dateMs > best.dateMs || (got.dateMs === best.dateMs && got.players.length > best.players.length)) {
      best = got;
    }
  }
  return best.players;
}

/** 伤停快路径：联赛首页 + 双方站内搜索，最多 3 个并行请求 */
async function fetchWebInjuries(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const leagueSlug = LEAGUE_IAS_SLUGS[match.leagueShort || match.group] || "";
  const homeEn = bestEnglishName(homeNames);
  const awayEn = bestEnglishName(awayNames);

  const urls = [];
  if (leagueSlug) urls.push(`https://injuriesandsuspensions.com/${leagueSlug}/`);
  if (homeEn) urls.push(`https://injuriesandsuspensions.com/?s=${encodeURIComponent(homeEn)}`);
  if (awayEn && awayEn !== homeEn) {
    urls.push(`https://injuriesandsuspensions.com/?s=${encodeURIComponent(awayEn)}`);
  }

  const bodies = await Promise.all(urls.map((u) => fetchViaJina(u, 7000)));
  const homePlayers = pickBestIasPlayers(bodies, homeNames);
  const awayPlayers = pickBestIasPlayers(bodies, awayNames);

  if (!homePlayers.length && !awayPlayers.length) return null;

  return {
    source: "injury-web",
    name: "伤停情报",
    tagline: "Injuries&Suspensions · 仅主力",
    home: summarizeInjuryPlayers(match.home, homePlayers),
    away: summarizeInjuryPlayers(match.away, awayPlayers),
    provider: "injuriesandsuspensions.com",
  };
}

function buildInjuryAnalysis(match, intel, webInjury = null) {
  const { injuries, players } = intel || {};
  const officialHome = buildSideInjurySummary(match.home, injuries?.home, players?.home);
  const officialAway = buildSideInjurySummary(match.away, injuries?.away, players?.away);
  const officialTotal = (officialHome?.total || 0) + (officialAway?.total || 0);
  const webTotal = (webInjury?.home?.total || 0) + (webInjury?.away?.total || 0);

  if (webTotal > 0) {
    return {
      source: "injury",
      name: "伤停情报",
      tagline: webInjury.tagline || "公开伤停源 · 仅主力",
      home: webInjury.home.total ? webInjury.home : officialHome || emptyInjurySide(match.home),
      away: webInjury.away.total ? webInjury.away : officialAway || emptyInjurySide(match.away),
    };
  }

  if (!injuries && !players && !webInjury) return null;

  return {
    source: "injury",
    name: "伤停情报",
    tagline: officialTotal ? "体彩官方 · 仅主力关键" : "暂无主力伤停记录",
    home: officialHome || emptyInjurySide(match.home),
    away: officialAway || emptyInjurySide(match.away),
  };
}

function extractSearchResults(markdown) {
  if (!markdown) return [];
  const results = [];
  const re = /##\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)([\s\S]*?)(?=\n##\s*\[|\n##\s+[^\[]|$)/g;
  let m;
  while ((m = re.exec(markdown))) {
    const title = m[1].replace(/\*\*/g, "").trim();
    const url = unwrapDuckUrl(m[2]);
    const block = m[3] || "";
    const snippet = block
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    if (!url || /duckduckgo\.com\/html/i.test(url)) continue;
    results.push({ title, url, snippet });
  }

  // 不再回退收录无标题的裸链接（易把 Forebet/PredictZ 首页塞进来）
  return results;
}

function foldAscii(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[/_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMentionsAny(text, names) {
  const hay = foldAscii(text);
  return (names || []).some((n) => {
    const key = foldAscii(n).trim();
    if (!key) return false;
    if (key.length <= 3) {
      return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(key)}(?:[^a-z0-9]|$)`, "i").test(hay);
    }
    return hay.includes(key);
  });
}

function teamHitCount(text, homeNames, awayNames) {
  return (textMentionsAny(text, homeNames) ? 1 : 0) + (textMentionsAny(text, awayNames) ? 1 : 0);
}

function scoreResult(item, homeNames, awayNames) {
  if (!isMatchSpecificResult(item, homeNames, awayNames)) return -1;

  const hay = `${item.title} ${item.snippet} ${item.url}`;
  let score = 10;
  if (isTrustedHost(item.url)) score += 6;
  if (PRIORITY_TIP_SITES.some((h) => hostOf(item.url).includes(h))) score += 4;
  if (/predict|tip|preview|分析|预测|palpite|pronostic/i.test(hay)) score += 4;
  if (/h2h|stats|lineup/i.test(hay)) score += 1;
  if (/odds\.|赔率|投注|sportsbook|moneyline|彩票网|数据分析-500/i.test(hay)) score -= 8;
  if (/tips\.gg/i.test(item.url)) score -= 5;
  return score;
}

function normalizeProbTriplet(h, d, a) {
  const home = Number(h);
  const draw = Number(d);
  const away = Number(a);
  if (![home, draw, away].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return null;
  if (home + draw + away < 50) return null;
  return {
    home: home / 100,
    draw: draw / 100,
    away: away / 100,
  };
}

/** 从机构页提取 1X2 概率 */
function extractMatchProbs(text) {
  if (!text) return null;
  const t = String(text);

  const homeWin = matchPct(t, [/Home\s*win\s*(\d{1,2}(?:\.\d+)?)\s*%/i]);
  const awayWin = matchPct(t, [/Away\s*win\s*(\d{1,2}(?:\.\d+)?)\s*%/i]);
  const drawWin = matchPct(t, [/\bDraw\s*(\d{1,2}(?:\.\d+)?)\s*%/i]);
  if (homeWin != null && drawWin != null && awayWin != null) {
    return normalizeProbTriplet(homeWin, drawWin, awayWin);
  }

  // WinDrawWin / BetClan: "66% Draw 23% Away 11%"（首位为主胜）
  const m1 = t.match(
    /(\d{1,2}(?:\.\d+)?)\s*%\s*Draw\s*(\d{1,2}(?:\.\d+)?)\s*%\s*Away\s*(\d{1,2}(?:\.\d+)?)\s*%/i
  );
  if (m1) return normalizeProbTriplet(m1[1], m1[2], m1[3]);

  const m2 = t.match(
    /Home(?:\s*win)?\s*(\d{1,2}(?:\.\d+)?)\s*%[^\d]{0,24}Draw\s*(\d{1,2}(?:\.\d+)?)\s*%[^\d]{0,24}Away(?:\s*win)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i
  );
  if (m2) return normalizeProbTriplet(m2[1], m2[2], m2[3]);

  // Forebet: Prob. % … 48% / 26% / 18%（中间可能夹标题或换行）
  const m3 = t.match(
    /Prob\.?\s*%[\s\S]{0,500}?(\d{1,2})\s*%[^\d%]{0,60}(\d{1,2})\s*%[^\d%]{0,60}(\d{1,2})\s*%/i
  );
  if (m3) return normalizeProbTriplet(m3[1], m3[2], m3[3]);

  const m4 = t.match(/(\d{1,2})\s*%\s+(\d{1,2})\s*%\s+(\d{1,2})\s*%\s*(?:[A-Z][a-z]+|[1-3]\s*[-–]\s*[0-3])/);
  if (m4) return normalizeProbTriplet(m4[1], m4[2], m4[3]);

  return null;
}

function extractPredictZExtras(text) {
  const block = String(text).match(/PREDICTZ TIP([\s\S]{0,280})/i)?.[1] || "";
  if (!block) return [];
  const extras = [];
  if (/Both Teams To Score\s*[-–:]\s*Yes/i.test(block)) extras.push("双方都有进球");
  if (/Both Teams To Score\s*[-–:]\s*No/i.test(block)) extras.push("不会都进球");
  if (/Over\s*2\.5\s*Goals/i.test(block)) extras.push("大 2.5 球");
  if (/Under\s*2\.5\s*Goals/i.test(block)) extras.push("小 2.5 球");
  return extras;
}

/** 从机构页提取大球/双方进球等进球盘倾向 */
function extractGoalsMarkets(text) {
  const t = String(text || "");
  if (!t) return null;
  const goals = {};

  const over25 = matchPct(t, [
    /Over\s*2\.5(?:\s*Goals?)?[^%]{0,28}(\d{1,2}(?:\.\d+)?)\s*%/i,
    /(\d{1,2}(?:\.\d+)?)\s*%[^.\n]{0,36}Over\s*2\.5/i,
  ]);
  const under25 = matchPct(t, [
    /Under\s*2\.5(?:\s*Goals?)?[^%]{0,28}(\d{1,2}(?:\.\d+)?)\s*%/i,
    /(\d{1,2}(?:\.\d+)?)\s*%[^.\n]{0,36}Under\s*2\.5/i,
  ]);
  if (over25 != null) goals.over25 = over25 / 100;
  if (under25 != null) goals.under25 = under25 / 100;

  const over35 = matchPct(t, [
    /Over\s*3\.5(?:\s*Goals?)?[^%]{0,28}(\d{1,2}(?:\.\d+)?)\s*%/i,
    /(\d{1,2}(?:\.\d+)?)\s*%[^.\n]{0,36}Over\s*3\.5/i,
  ]);
  if (over35 != null) goals.over35 = over35 / 100;

  if (/PREDICTZ TIP[\s\S]{0,220}Over\s*2\.5\s*Goals/i.test(t) || /\bTip\s*[:：].{0,40}Over\s*2\.5/i.test(t)) {
    goals.over25Lean = true;
  }
  if (/PREDICTZ TIP[\s\S]{0,220}Under\s*2\.5\s*Goals/i.test(t) || /\bTip\s*[:：].{0,40}Under\s*2\.5/i.test(t)) {
    goals.under25Lean = true;
  }
  if (/Both Teams To Score\s*[-–:]\s*Yes|BTTS\s*Yes/i.test(t)) goals.bttsYes = true;
  if (/Both Teams To Score\s*[-–:]\s*No|BTTS\s*No/i.test(t)) goals.bttsNo = true;

  const avg = t.match(/Average goals?\s*[:：]?\s*(\d+(?:\.\d+)?)/i);
  if (avg) {
    const n = Number(avg[1]);
    if (Number.isFinite(n) && n > 0 && n < 8) goals.avgGoals = n;
  }

  return Object.keys(goals).length ? goals : null;
}

function goalsExtrasFromMarkets(goals) {
  if (!goals) return [];
  const extras = [];
  if (goals.over25 != null) extras.push(`大球约 ${Math.round(goals.over25 * 100)}%`);
  else if (goals.over25Lean) extras.push("倾向大球");
  if (goals.under25Lean && !goals.over25Lean) extras.push("倾向小球");
  if (goals.over35 != null) extras.push(`大比分(3.5)约 ${Math.round(goals.over35 * 100)}%`);
  if (goals.bttsYes) extras.push("双方都有进球");
  if (goals.bttsNo) extras.push("不会都进球");
  return extras;
}

function formatChineseTip(pickKey, probs, extras = []) {
  const outcome = OUTCOMES.find((o) => o.key === pickKey);
  if (!outcome && !probs) return "";
  const parts = [];
  if (outcome && probs?.[pickKey] != null) {
    parts.push(`倾向${outcome.label}（约 ${Math.round(probs[pickKey] * 100)}%）`);
  } else if (outcome) {
    parts.push(`倾向${outcome.label}`);
  }
  if (probs) {
    parts.push(
      `概率：主胜 ${Math.round(probs.home * 100)}% / 平局 ${Math.round(probs.draw * 100)}% / 主负 ${Math.round(probs.away * 100)}%`
    );
  }
  if (extras.length) parts.push(extras.slice(0, 3).join("，"));
  return parts.join("。");
}

function detectPickFromText(text, homeNames, awayNames) {
  if (!text) return null;
  // 去掉赔率表格噪音，避免把「XX必胜 | 平局 | YY必胜」当成观点
  const cleaned = String(text)
    .split(/\n/)
    .filter((l) => !isNoiseTipLine(l))
    .join("\n")
    .replace(/\s+/g, " ");
  const t = cleaned;
  if (teamHitCount(t, homeNames, awayNames) < 1 && !/PREDICTZ TIP|Home win\s*\d/i.test(t)) return null;

  const homeRe = homeNames.map(escapeRegExp).filter(Boolean).join("|");
  const awayRe = awayNames.map(escapeRegExp).filter(Boolean).join("|");
  if (!homeRe || !awayRe) return null;

  const patterns = [
    { key: "home", re: /PREDICTZ TIP[\s\S]{0,60}HOME WIN/i },
    { key: "away", re: /PREDICTZ TIP[\s\S]{0,60}AWAY WIN/i },
    { key: "draw", re: /PREDICTZ TIP[\s\S]{0,60}\bDRAW\b/i },
    { key: "home", re: new RegExp(`(?:best\\s*bet|prediction|verdict|tip|pick)\\s*[:：-]\\s*(?:home(?:\\s*win)?|1\\b|主胜|主队)`, "i") },
    { key: "away", re: new RegExp(`(?:best\\s*bet|prediction|verdict|tip|pick)\\s*[:：-]\\s*(?:away(?:\\s*win)?|2\\b|客胜|客队)`, "i") },
    { key: "draw", re: new RegExp(`(?:best\\s*bet|prediction|verdict|tip|pick)\\s*[:：-]\\s*(?:draw|x\\b|平局|平手)`, "i") },
    { key: "home", re: new RegExp(`(?:best\\s*bet|prediction|verdict|tip)\\s*[:：-]\\s*(?:${homeRe})(?:\\s*to)?\\s*win`, "i") },
    { key: "away", re: new RegExp(`(?:best\\s*bet|prediction|verdict|tip)\\s*[:：-]\\s*(?:${awayRe})(?:\\s*to)?\\s*win`, "i") },
    { key: "away", re: new RegExp(`(?:${awayRe}).{0,12}(?:win or draw|or draw|double chance)`, "i") },
    { key: "home", re: new RegExp(`(?:${homeRe}).{0,12}(?:win or draw|or draw|double chance)`, "i") },
    { key: "away", re: /we think .{0,40}away(?:\s*win)?|lean(?:ing)? .{0,20}away/i },
    { key: "home", re: /we think .{0,40}home(?:\s*win)?|lean(?:ing)? .{0,20}home/i },
    { key: "draw", re: /we think .{0,40}draw|预测[:：]\s*平/i },
    { key: "home", re: /推荐[:：]\s*主胜|倾向[:：]\s*主胜/ },
    { key: "away", re: /推荐[:：]\s*客胜|倾向[:：]\s*客胜|推荐[:：]\s*主负/ },
    { key: "draw", re: /推荐[:：]\s*平局|倾向[:：]\s*平/ },
  ];

  for (const p of patterns) {
    try {
      if (p.re.test(t)) return p.key;
    } catch {
      /* ignore bad regex */
    }
  }

  const probs = extractMatchProbs(t);
  if (probs) return pickOutcome(probs)?.key || null;

  return null;
}

function matchPct(text, regexList) {
  for (const re of regexList) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNoiseTipLine(line) {
  if (!line) return true;
  const t = String(line).trim();
  // 赔率表头 / 盘口列，如：| 体育书 | 巴拉纳竞技必胜 | 平局 | 维多利亚队必胜 |
  if ((t.match(/\|/g) || []).length >= 2) return true;
  if (/体育书|sportsbook|moneyline|bookmaker|实时赔率|投注线/i.test(t)) return true;
  if (/必胜\s*\|\s*平局\s*\|\s*.*必胜/.test(t)) return true;
  if (/^\|/.test(t) && /必胜|平局|draw|home|away/i.test(t)) return true;
  // 时间戳 / 站点宣传语
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+)?/.test(t)) return true;
  if (/mathematical football predictions|free soccer picks|free bet bonuses/i.test(t)) return true;
  if (/^forebet\b|^predictz\b|^tips\.gg\b/i.test(t) && t.length < 90) return true;
  return false;
}

function isUselessTip(tip, title = "") {
  const t = String(tip || "").trim();
  if (!t || isNoiseTipLine(t)) return true;
  if (t === "暂无明确观点摘要") return true;
  if (title && t.replace(/\s+/g, "") === String(title).replace(/\s+/g, "")) return true;
  if (/mathematical football predictions|free soccer picks|stats and scores/i.test(t)) return true;
  return false;
}

function isUsefulTipLine(line) {
  if (!line) return false;
  if (isNoiseTipLine(line)) return false;
  if (line.length < 28 || line.length > 220) return false;
  if (/^(title|url source|published time|markdown content):/i.test(line)) return false;
  if (/^https?:\/\//i.test(line)) return false;
  if (/\[[^\]]+\]\(https?:\/\//.test(line)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(line)) return false;
  return true;
}

function extractTipSnippet(text, homeNames, awayNames) {
  if (!text) return "";
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[*#>\-\s]+/, "").trim())
    .filter(isUsefulTipLine);

  const preferred = lines.find(
    (l) =>
      /best bet|verdict|推荐|倾向|we think|double chance|tip\s*[:：]|predicted outcome/i.test(l) &&
      teamHitCount(l, homeNames, awayNames) >= 1
  );
  if (preferred) return preferred;

  const named = lines.find((l) => {
    const low = l.toLowerCase();
    return (
      /win|draw|predict|tip|胜|平|负/.test(low) &&
      teamHitCount(low, homeNames, awayNames) >= 1 &&
      !isNoiseTipLine(l)
    );
  });
  return named || "";
}

/** 从预测站联赛列表页直接抠出本场链接（比搜引擎快且稳） */
function extractMatchLinksFromTipPage(markdown, homeNames, awayNames) {
  if (!markdown) return [];
  const items = [];
  const re = /\[([^\]]{4,120})\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = re.exec(markdown))) {
    const title = m[1].replace(/\*\*/g, "").trim();
    const url = m[2].split(/[?\s]/)[0];
    if (!url || isBlockedHost(url) || isGenericListingUrl(url)) continue;
    if (!isTrustedHost(url) && !PRIORITY_TIP_SITES.some((h) => hostOf(url).includes(h))) continue;
    const hay = `${title} ${url}`;
    if (teamHitCount(hay, homeNames, awayNames) < 2) continue;
    // 截一段附近文本当 snippet
    const around = markdown.slice(Math.max(0, m.index - 40), Math.min(markdown.length, m.index + 420));
    items.push({
      title,
      url,
      snippet: around.replace(/\s+/g, " ").trim().slice(0, 240),
    });
  }
  return items;
}

async function fetchDirectTipCandidates(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const leagueKey = match.leagueShort || match.group || "";
  const pages = LEAGUE_TIP_PAGES[leagueKey] || [];
  if (!pages.length) return [];

  const bodies = await Promise.all(pages.slice(0, 3).map((u) => fetchViaJina(u, 5500)));
  const dedup = new Map();
  for (const md of bodies) {
    for (const item of extractMatchLinksFromTipPage(md, homeNames, awayNames)) {
      const key = item.url.replace(/\/$/, "").toLowerCase();
      if (!dedup.has(key)) dedup.set(key, item);
    }
  }
  return [...dedup.values()]
    .map((item) => ({ ...item, score: scoreResult(item, homeNames, awayNames) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function searchWebTips(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const homeEn = bestEnglishName(homeNames);
  const awayEn = bestEnglishName(awayNames);
  if (!homeEn || !awayEn) return [];

  // 仅 1 路兜底搜索（直链失败时才用）
  const q = `site:predictz.com OR site:forebet.com OR site:windrawwin.com ${homeEn} ${awayEn} prediction`;
  const md = await fetchViaJina(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    5000
  );

  const dedup = new Map();
  for (const item of extractSearchResults(md)) {
    if (isBlockedResult(item)) continue;
    const key = item.url.replace(/\/$/, "").toLowerCase();
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return [...dedup.values()]
    .map((item) => ({ ...item, score: scoreResult(item, homeNames, awayNames) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function buildTipFromCorpus(corpus, homeNames, awayNames, match, url, rawTitle) {
  const host = hostOf(url);
  let probs = extractMatchProbs(corpus);
  let pickKey = detectPickFromText(corpus, homeNames, awayNames);
  if (!pickKey && probs) pickKey = pickOutcome(probs)?.key || null;

  const goals = extractGoalsMarkets(corpus);
  const extras = [
    ...(host.includes("predictz.com") ? extractPredictZExtras(corpus) : []),
    ...goalsExtrasFromMarkets(goals),
  ];
  // 去重
  const uniqExtras = [...new Set(extras)];
  let tipText = formatChineseTip(pickKey, probs, uniqExtras);

  if (!tipText && pickKey) {
    tipText = `倾向${OUTCOMES.find((o) => o.key === pickKey)?.label || "参考"}`;
  }

  if (!tipText || !pickKey) return null;
  const pick = OUTCOMES.find((o) => o.key === pickKey);
  return {
    name: sourceLabel(url),
    url,
    title: `${match.home}对阵${match.away} · 预测观点`,
    tipText: tipText.slice(0, 220),
    pick: pick ? { ...pick, prob: probs?.[pickKey] ?? null } : null,
    probs,
    goals,
    trusted: isTrustedHost(url),
  };
}

async function enrichTipPage(item, homeNames, awayNames, match) {
  if (!isMatchSpecificResult(item, homeNames, awayNames)) return null;

  const rawTitle = item.title.replace(/\*\*/g, "").trim();
  const head = `${rawTitle}\n${item.snippet || ""}`;

  // 搜索摘要里已有概率/倾向时，跳过正文抓取
  const quick = buildTipFromCorpus(head, homeNames, awayNames, match, item.url, rawTitle);
  if (quick?.probs || (quick?.pick && /PREDICTZ TIP|Home win|倾向/i.test(head))) {
    return quick;
  }

  const page = await fetchViaJina(item.url, 5500);
  return buildTipFromCorpus(`${head}\n${page || ""}`, homeNames, awayNames, match, item.url, rawTitle);
}

function buildGoalsConsensus(sources) {
  let overLean = 0;
  let underLean = 0;
  let bttsYes = 0;
  let bttsNo = 0;
  let overSum = 0;
  let overN = 0;
  let over35Sum = 0;
  let over35N = 0;
  let avgSum = 0;
  let avgN = 0;

  for (const s of sources || []) {
    const g = s.goals;
    if (!g) continue;
    if (g.over25 != null) {
      overSum += g.over25;
      overN += 1;
      if (g.over25 >= 0.5) overLean += 1;
      else underLean += 1;
    } else if (g.over25Lean) overLean += 1;
    else if (g.under25Lean) underLean += 1;

    if (g.over35 != null) {
      over35Sum += g.over35;
      over35N += 1;
    }
    if (g.bttsYes) bttsYes += 1;
    if (g.bttsNo) bttsNo += 1;
    if (g.avgGoals != null) {
      avgSum += g.avgGoals;
      avgN += 1;
    }
  }

  const leanTotal = overLean + underLean;
  const bttsTotal = bttsYes + bttsNo;
  if (!leanTotal && !overN && !over35N && !bttsTotal && !avgN) return null;

  return {
    over25: overN ? overSum / overN : leanTotal ? overLean / leanTotal : null,
    over35: over35N ? over35Sum / over35N : null,
    btts: bttsTotal ? bttsYes / bttsTotal : null,
    avgGoals: avgN ? avgSum / avgN : null,
    overLean,
    underLean,
    counted: Math.max(leanTotal, overN, over35N, bttsTotal, avgN),
  };
}

function buildConsensus(sources) {
  const votes = { home: 0, draw: 0, away: 0 };
  let counted = 0;
  let probSum = { home: 0, draw: 0, away: 0 };
  let probN = 0;
  for (const s of sources) {
    if (!s.pick?.key) continue;
    votes[s.pick.key] += 1;
    counted += 1;
    if (s.probs) {
      probSum.home += s.probs.home;
      probSum.draw += s.probs.draw;
      probSum.away += s.probs.away;
      probN += 1;
    }
  }
  const goals = buildGoalsConsensus(sources);

  if (!counted) {
    return {
      name: "全网机构观点",
      tagline: "权威/网红预测站点聚合",
      pick: null,
      probs: null,
      counted: 0,
      goals,
      bullets: ["暂未解析到明确倾向，请查看下方各机构摘要"],
    };
  }

  // 有真实概率则取平均；否则退回投票占比
  const probs = probN
    ? {
        home: probSum.home / probN,
        draw: probSum.draw / probN,
        away: probSum.away / probN,
      }
    : {
        home: votes.home / counted,
        draw: votes.draw / counted,
        away: votes.away / counted,
      };
  const pick = pickOutcome(probs);
  const bullets = [
    counted > 1
      ? `多数倾向：${pick.label}（${votes[pick.key]}/${counted} 家）`
      : `倾向：${pick.label}（约 ${pct(pick.prob)}）`,
    probN
      ? `概率：主胜 ${pct(probs.home)} · 平局 ${pct(probs.draw)} · 主负 ${pct(probs.away)}`
      : `分布：主胜 ${votes.home} · 平局 ${votes.draw} · 主负 ${votes.away}`,
  ];
  if (goals?.over25 != null) {
    bullets.push(`机构大球倾向约 ${Math.round(goals.over25 * 100)}%`);
  } else if (goals?.overLean || goals?.underLean) {
    bullets.push(`进球盘：大球 ${goals.overLean} · 小球 ${goals.underLean}`);
  }

  return {
    name: "全网机构观点",
    tagline: `已聚合 ${counted} 家有效倾向`,
    pick,
    probs,
    counted,
    goals,
    bullets,
  };
}

function isValidTipSource(s) {
  return (
    s &&
    s.pick &&
    s.tipText &&
    !isUselessTip(s.tipText, s.title) &&
    !/体育书|必胜\s*\||^\d{4}-\d{2}-\d{2}/.test(s.tipText)
  );
}

export async function fetchWebPredictions(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const oddsSource = buildOddsSource(match);

  // 1) 优先直连预测站联赛页（通常数秒内出结果）
  let results = await fetchDirectTipCandidates(match);

  // 2) 直连不足再走 1 次搜索兜底
  if (results.length < 2) {
    const searched = await searchWebTips(match);
    const seen = new Set(results.map((r) => r.url.replace(/\/$/, "").toLowerCase()));
    for (const item of searched) {
      const key = item.url.replace(/\/$/, "").toLowerCase();
      if (!seen.has(key)) {
        results.push(item);
        seen.add(key);
      }
    }
  }

  // 同站点只保留一条
  const byHost = new Map();
  for (const item of results.sort((a, b) => b.score - a.score)) {
    const host = hostOf(item.url) || item.url;
    if (!byHost.has(host)) byHost.set(host, item);
  }
  const preferred = PRIORITY_TIP_SITES.map((h) =>
    [...byHost.entries()].find(([host]) => host.includes(h))?.[1]
  ).filter(Boolean);
  const rest = [...byHost.values()].filter((item) => !preferred.includes(item));
  const top = [...preferred, ...rest].slice(0, 4);

  const sources = [];
  // 只抓前 3 条详情，超时更短
  if (top.length) {
    const enriched = await Promise.all(
      top.slice(0, 3).map((item) => enrichTipPage(item, homeNames, awayNames, match))
    );
    for (const s of enriched) {
      if (isValidTipSource(s)) sources.push(s);
    }
  }

  // 机构观点在前，赔率本地源垫底（保证永不空）
  const merged = [...sources];
  if (oddsSource) merged.push(oddsSource);
  const finalSources = merged.slice(0, 5);
  const agencyOnly = finalSources.filter((s) => !s.local);
  const consensus = buildConsensus(agencyOnly.length ? agencyOnly : finalSources);
  if (!agencyOnly.length && oddsSource) {
    consensus.name = "市场赔率倾向";
    consensus.tagline = "机构页暂不可用，已用体彩隐含概率";
    consensus.bullets = [
      oddsSource.tipText.split("。")[0],
      `分布：主胜 ${pct(oddsSource.probs.home)} · 平局 ${pct(oddsSource.probs.draw)} · 主负 ${pct(oddsSource.probs.away)}`,
      "可稍后重试以补充外部机构摘要",
    ];
  }

  return { consensus, sources: finalSources };
}

export async function fetchMatchIntel(matchId) {
  const [injuries, players] = await Promise.all([
    fetchUniform(`getInjurySuspensionV1.qry?sportteryMatchId=${matchId}`),
    fetchUniform(`getMatchPlayerV1.qry?sportteryMatchId=${matchId}&termLimits=5`),
  ]);
  return { injuries, players };
}

export async function fetchInjuryAnalysis(match) {
  const [intel, webInjury] = await Promise.all([
    fetchMatchIntel(match.id),
    fetchWebInjuries(match),
  ]);
  return buildInjuryAnalysis(match, intel, webInjury);
}

function buildAnalysisPayload(
  match,
  web,
  injury,
  { complete = true, injuryPending = false, stakesPending = false, stakes = null } = {}
) {
  return {
    schema: ANALYSIS_SCHEMA,
    matchId: match.id,
    updatedAt: new Date().toISOString(),
    complete,
    injuryPending,
    stakesPending,
    stakes: stakes || buildMatchStakes(match, null),
    consensus: web.consensus,
    sources: web.sources,
    injury,
    summary: {
      pick: web.consensus.pick,
      probs: web.consensus.probs,
      confidence: web.consensus.counted >= 3 ? "参考多家" : web.consensus.counted ? "样本偏少" : "暂无",
      scorePick: "—",
      name: web.consensus.name,
      bullets: web.consensus.bullets,
    },
  };
}

function buildLocalOddsWeb(match) {
  const oddsSource = buildOddsSource(match);
  const sources = oddsSource ? [oddsSource] : [];
  const consensus = buildConsensus(sources);
  if (oddsSource) {
    consensus.name = "市场赔率倾向";
    consensus.tagline = "先给出体彩隐含概率，机构摘要加载中…";
    consensus.bullets = [
      oddsSource.tipText.split("。")[0],
      `分布：主胜 ${pct(oddsSource.probs.home)} · 平局 ${pct(oddsSource.probs.draw)} · 主负 ${pct(oddsSource.probs.away)}`,
    ];
  }
  return { consensus, sources };
}

/**
 * 先秒出赔率倾向 + 赛果影响骨架，再补机构摘要 / 积分形势 / 伤停。
 * @param {{ onUpdate?: (analysis: object) => void }} [options]
 */
export async function fetchAndAnalyzeMatch(match, options = {}) {
  const { onUpdate } = options;
  const cached = cache.get(match.id);
  if (cached?.schema === ANALYSIS_SCHEMA && cached.complete) return cached;

  // 首屏：赔率秒出（无网络等待）
  let web = buildLocalOddsWeb(match);
  let stakes = buildMatchStakes(match, null);
  let analysis = buildAnalysisPayload(match, web, null, {
    complete: false,
    injuryPending: true,
    stakesPending: true,
    stakes,
  });
  cache.set(match.id, analysis);
  onUpdate?.(analysis);

  const intelP = fetchMatchIntel(match.id);
  const webP = fetchWebPredictions(match);
  const injuryP = fetchWebInjuries(match);
  const standingsP = fetchLeagueStandingsByMatch(match.id).catch(() => null);

  // 机构预测 + 官方伤停 + 积分榜并行
  const [intel, webFull, standings] = await Promise.all([intelP, webP, standingsP]);
  web = webFull;
  stakes = buildMatchStakes(match, standings?.rows || null);
  analysis = buildAnalysisPayload(match, web, buildInjuryAnalysis(match, intel, null), {
    complete: false,
    injuryPending: true,
    stakesPending: false,
    stakes,
  });
  cache.set(match.id, analysis);
  onUpdate?.(analysis);

  try {
    const webInjury = await injuryP;
    analysis = buildAnalysisPayload(match, web, buildInjuryAnalysis(match, intel, webInjury), {
      complete: true,
      injuryPending: false,
      stakesPending: false,
      stakes,
    });
  } catch {
    analysis = { ...analysis, complete: true, injuryPending: false, stakesPending: false };
  }
  cache.set(match.id, analysis);
  onUpdate?.(analysis);
  return analysis;
}

export function injuryReportHtml(injury, match, { pending = false } = {}) {
  if (pending && !injury?.home?.total && !injury?.away?.total) {
    return `<div class="prediction-injury-card"><p class="injury-empty">伤停情报加载中…</p></div>`;
  }
  if (!injury) {
    return `<div class="prediction-injury-card"><p class="injury-empty">暂无伤停数据</p></div>`;
  }

  const renderSide = (side, label) => {
    if (!side?.total) {
      return `
        <div class="injury-team-block injury-team-block--compact">
          <div class="injury-team-header">
            <span class="injury-team-name">${label}</span>
            <span class="injury-team-count">无主力伤停</span>
          </div>
        </div>`;
    }
    return `
      <div class="injury-team-block injury-team-block--compact">
        <div class="injury-team-header">
          <span class="injury-team-name">${label}</span>
          <span class="injury-team-count">${side.total} 名主力伤停</span>
        </div>
        <div class="injury-pos-chips">
          ${side.lines.map((line) => `<span class="injury-pos-chip">${line}</span>`).join("")}
        </div>
      </div>`;
  };

  return `
    <div class="prediction-injury-card">
      <div class="prediction-source-header">
        <div>
          <div class="prediction-source-name">${injury.name}</div>
          <div class="prediction-source-tag">${injury.tagline}</div>
        </div>
      </div>
      ${renderSide(injury.home, `${match.home}（主）`)}
      ${renderSide(injury.away, `${match.away}（客）`)}
    </div>`;
}

export function injuryBadgeText(injury) {
  if (!injury) return null;
  const total = (injury.home?.total || 0) + (injury.away?.total || 0);
  if (!total) return null;
  return `${total} 名主力伤停`;
}

export function clearPredictionCache() {
  cache.clear();
}

export function probBarHtml(probs) {
  if (!probs) return "";
  return `
    <div class="prob-bars">
      ${OUTCOMES.map(
        (o) => `
        <div class="prob-row">
          <span class="prob-label">${o.short}</span>
          <div class="prob-track"><div class="prob-fill prob-fill--${o.key}" style="width:${Math.round(probs[o.key] * 100)}%"></div></div>
          <span class="prob-val">${pct(probs[o.key])}</span>
        </div>`
      ).join("")}
    </div>`;
}

export function outcomeClass(key) {
  if (key === "home") return "win";
  if (key === "away") return "loss";
  return "draw";
}

export function webSourcesHtml(sources = []) {
  const list = sources || [];
  const agency = list.filter((s) => !s.local);
  if (!agency.length && !list.length) {
    return `<div class="prediction-source-card"><p class="injury-empty">暂无外部机构摘要；上方已展示市场赔率倾向，可稍后重试。</p></div>`;
  }

  return list
    .map((src) => {
      const pickBadge = src.pick
        ? `<span class="prediction-source-pick prediction-source-pick--${outcomeClass(src.pick.key)}">${src.pick.label || src.pick.short}</span>`
        : `<span class="prediction-source-pick prediction-source-pick--pending">待定</span>`;
      return `
      <div class="prediction-source-card">
        <div class="prediction-source-header">
          <div>
            <div class="prediction-source-name">${src.name}</div>
            <div class="prediction-source-tag">${src.title || (src.local ? "本地市场推算" : "机构预测观点")}</div>
          </div>
          ${pickBadge}
        </div>
        <p class="prediction-tip-text">${src.tipText || "暂无明确中文观点"}</p>
      </div>`;
    })
    .join("");
}

export function stakesReportHtml(stakes, { pending = false } = {}) {
  if (!stakes) {
    return pending
      ? `<div class="prediction-stakes-card"><p class="injury-empty">赛果影响分析加载中…</p></div>`
      : "";
  }

  const favored = stakes.favored;
  const favoredHtml = favored
    ? `<div class="stakes-favored stakes-favored--${outcomeClass(favored.key)}">
        <div class="stakes-favored-label">本场输赢倾向</div>
        <div class="stakes-favored-value">${favored.text}</div>
      </div>`
    : `<div class="stakes-favored"><div class="stakes-favored-value">${stakes.bullets?.[0] || "倾向待定"}</div></div>`;

  const acceptNotes = [stakes.home, stakes.away]
    .filter((s) => s.acceptDraw && s.acceptDrawNote)
    .map((s) => `<li><strong>${s.team}</strong>可接受平局：${s.acceptDrawNote}</li>`);

  const scenarioRows = (stakes.scenarios || [])
    .map(
      (sc) => `
      <div class="stakes-scenario">
        <div class="stakes-scenario-result">${sc.result}</div>
        <ul class="stakes-scenario-list">
          <li>${sc.home}</li>
          <li>${sc.away}</li>
        </ul>
      </div>`
    )
    .join("");

  return `
    <div class="prediction-stakes-card">
      <div class="prediction-source-header">
        <div>
          <div class="prediction-source-name">赛果影响</div>
          <div class="prediction-source-tag">${
            stakes.isCup ? "杯赛/淘汰语境 · 晋级与出局" : "联赛积分语境 · 争冠/欧战/保级"
          }${pending ? " · 积分榜补齐中" : ""}</div>
        </div>
      </div>
      ${favoredHtml}
      ${scenarioRows}
      ${
        acceptNotes.length
          ? `<ul class="stakes-accept-list">${acceptNotes.join("")}</ul>`
          : ""
      }
    </div>`;
}
