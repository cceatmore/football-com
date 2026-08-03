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
  巴竞技: ["Athletico Paranaense", "Athletico/PR", "Athletico", "Atletico Paranaense"],
  维多利亚: ["Vitória/BA", "Vitoria/BA", "EC Vitoria", "Vitória", "Vitoria"],
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

const TRUSTED_HOSTS = [
  "forebet.com",
  "predictz.com",
  "windrawwin.com",
  "betimate.com",
  "tips.gg",
  "sportsgambler.com",
  "freesupertips.com",
  "betclan.com",
  "soccervista.com",
  "sportsmole.co.uk",
  "footballpredictions.net",
  "predictapp.com",
  "bettingtips.today",
  "betonvalue.com",
  "varim.net",
  "olbg.com",
  "soccerway.com",
  "whoscored.com",
  "forebet",
];

const cache = new Map();
/** 预测结果结构版本；变更后自动丢弃旧缓存（避免串场摘要残留） */
export const ANALYSIS_SCHEMA = 5;

/** 赔率/资讯站，不做预测摘要 */
const BLOCKED_HOSTS = [
  "odds.500.com",
  "500.com",
  "sporttery.cn",
  "sina.com.cn",
  "zhibo8.cc",
  "dongqiudi.com",
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

async function fetchText(url, timeoutMs = 12000) {
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

async function fetchViaJina(url, timeoutMs = 14000) {
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
  if (!host) return "外部来源";
  const map = {
    "forebet.com": "Forebet",
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
    "bettingtips.today": "BettingTips.Today",
    "betonvalue.com": "BetOnValue",
    "olbg.com": "OLBG",
  };
  return map[host] || host;
}

function isTrustedHost(url) {
  const host = hostOf(url);
  return TRUSTED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h));
}

function isBlockedHost(url) {
  const host = hostOf(url);
  return BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
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
  if (!item?.url || isBlockedHost(item.url) || isGenericListingUrl(item.url)) return false;
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
  const unavailableList = sideData?.injuriesAndSuspensionsList || [];
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

  const keyIds = new Set(keyPlayers.map((p) => p.personId));
  for (const p of unavailableList) {
    if (keyIds.has(p.personId)) continue;
    const status = playerOutStatus(p) || "伤停";
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
    players.push({ position: parseIasPositionToken(token), status });
  }
  // 无括号时按逗号人数兜底（位置未知）
  if (
    !players.length &&
    /(?:doubtful|out\s*\(|suspended:)/i.test(text) &&
    !/:\s*[-–—]\s*$/i.test(text)
  ) {
    const body = text.split(":").slice(1).join(":").trim();
    if (body && body !== "-" && body !== "–") {
      const n = body.split(",").map((x) => x.trim()).filter(Boolean).length;
      for (let i = 0; i < n; i += 1) players.push({ position: "未知位置", status });
    }
  }
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

function isIasArticleUrl(url, leagueSlug) {
  if (!/injuriesandsuspensions\.com\//i.test(url)) return false;
  if (/\/(subscription|contact|api-injuries|hot-info|all-news|about|checkout|privacy)\/?/i.test(url)) {
    return false;
  }
  if (!/injuries-suspensions-\d+/i.test(url)) return false;
  if (leagueSlug && !url.includes(leagueSlug)) return false;
  return true;
}

async function collectTeamIasPages(teamNames, leagueSlug) {
  // 优先用更完整的英文队名做站内搜索（如 Djurgårdens IF > Djurgarden）
  const en =
    [...teamNames]
      .filter((n) => /[A-Za-zÄÖÅäöå]/.test(n))
      .sort((a, b) => String(b).length - String(a).length)[0] || teamNames[0];
  if (!en) return [];

  const seedUrls = [];
  if (leagueSlug) seedUrls.push(`https://injuriesandsuspensions.com/${leagueSlug}/`);
  seedUrls.push(`https://injuriesandsuspensions.com/?s=${encodeURIComponent(en)}`);

  const pages = [];
  const seen = new Set();

  const pushPage = async (url, timeoutMs = 14000) => {
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    const body = await fetchViaJina(url, timeoutMs);
    if (body) pages.push({ url, body });
  };

  for (const seed of seedUrls) {
    await pushPage(seed);
    if (pages.length >= 6) break;
    const last = pages[pages.length - 1];
    if (!last) continue;

    const articleLinks = [
      ...new Set(
        [...last.body.matchAll(/https?:\/\/injuriesandsuspensions\.com\/[^\s)\]"'<>]+/gi)].map((m) =>
          m[0].replace(/[.,)>]+$/, "")
        )
      ),
    ]
      // 站内搜索已按队名筛选；不强制联赛 slug（巴西杯常落在巴西甲文章里）
      .filter((u) => isIasArticleUrl(u, ""))
      .slice(0, 4);

    for (const link of articleLinks) {
      await pushPage(link, 12000);
      if (pages.length >= 6) break;
    }
  }

  // DDG 兜底：栏目/搜索未命中时再试
  if (pages.length < 2) {
    const q = leagueSlug
      ? `site:injuriesandsuspensions.com ${leagueSlug.replace(/-/g, " ")} "${en}"`
      : `site:injuriesandsuspensions.com "${en}"`;
    const md = await fetchViaJina(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const links = [
      ...new Set(
        [...(md || "").matchAll(/https?:\/\/[^\s)\]"'<>]+/g)]
          .map((x) => unwrapDuckUrl(x[0]))
          .filter((u) => isIasArticleUrl(u, leagueSlug) || isIasArticleUrl(u, ""))
      ),
    ].slice(0, 3);
    for (const link of links) {
      await pushPage(link, 12000);
      if (pages.length >= 6) break;
    }
  }

  return pages;
}

async function fetchTeamWebInjuryPlayers(teamNames, leagueSlug) {
  const pages = await collectTeamIasPages(teamNames, leagueSlug);
  let best = { players: [], dateMs: -1 };
  for (const page of pages) {
    const got = extractLatestTeamIasPlayers(page.body, teamNames);
    if (got.dateMs < 0) continue;
    if (got.dateMs > best.dateMs || (got.dateMs === best.dateMs && got.players.length > best.players.length)) {
      best = got;
    }
  }
  return best.players;
}

async function fetchWebInjuries(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const leagueSlug = LEAGUE_IAS_SLUGS[match.leagueShort || match.group] || "";

  const [homePlayers, awayPlayers] = await Promise.all([
    fetchTeamWebInjuryPlayers(homeNames, leagueSlug),
    fetchTeamWebInjuryPlayers(awayNames, leagueSlug),
  ]);

  if (!homePlayers.length && !awayPlayers.length) return null;

  return {
    source: "injury-web",
    name: "伤停情报",
    tagline: "Injuries&Suspensions 公开源 · 位置人数",
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
      tagline: webInjury.tagline || "公开伤停源 · 位置人数",
      home: webInjury.home.total ? webInjury.home : officialHome || emptyInjurySide(match.home),
      away: webInjury.away.total ? webInjury.away : officialAway || emptyInjurySide(match.away),
    };
  }

  if (!injuries && !players && !webInjury) return null;

  return {
    source: "injury",
    name: "伤停情报",
    tagline: officialTotal ? "体彩官方 · 位置人数" : "暂无公开伤停记录",
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
    .toLowerCase();
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
  if (isTrustedHost(item.url)) score += 5;
  if (/predict|tip|preview|分析|预测/i.test(hay)) score += 4;
  if (/h2h|stats|lineup/i.test(hay)) score += 1;
  if (/odds\.|赔率|投注|数据分析-500|彩票网/i.test(hay)) score -= 6;
  return score;
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
  if (teamHitCount(t, homeNames, awayNames) < 1) return null;

  const homeRe = homeNames.map(escapeRegExp).filter(Boolean).join("|");
  const awayRe = awayNames.map(escapeRegExp).filter(Boolean).join("|");
  if (!homeRe || !awayRe) return null;

  const patterns = [
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

  const homeP = matchPct(t, [/home(?:\s*win)?[^%]{0,16}?(\d{1,3})\s*%/i, /(\d{1,3})\s*%[^.]{0,12}home(?:\s*win)?/i]);
  const drawP = matchPct(t, [/draw[^%]{0,16}?(\d{1,3})\s*%/i, /(\d{1,3})\s*%[^.]{0,12}draw/i]);
  const awayP = matchPct(t, [/away(?:\s*win)?[^%]{0,16}?(\d{1,3})\s*%/i, /(\d{1,3})\s*%[^.]{0,12}away(?:\s*win)?/i]);
  if (homeP != null || drawP != null || awayP != null) {
    const vals = [
      { key: "home", v: homeP ?? -1 },
      { key: "draw", v: drawP ?? -1 },
      { key: "away", v: awayP ?? -1 },
    ].sort((a, b) => b.v - a.v);
    if (vals[0].v >= 0) return vals[0].key;
  }

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

async function searchWebTips(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const homeEn = homeNames.find((n) => /[A-Za-z]/.test(n)) || homeNames[0];
  const awayEn = awayNames.find((n) => /[A-Za-z]/.test(n)) || awayNames[0];

  const queries = [
    `${homeEn} vs ${awayEn} prediction tip`,
    `${homeEn} ${awayEn} forebet predictz`,
    `${match.home} ${match.away} 预测 分析`,
  ];

  const collected = [];
  for (const q of queries) {
    const md = await fetchViaJina(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    const items = extractSearchResults(md);
    collected.push(...items);
  }

  const dedup = new Map();
  for (const item of collected) {
    const key = item.url.replace(/\/$/, "").toLowerCase();
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return [...dedup.values()]
    .map((item) => ({ ...item, score: scoreResult(item, homeNames, awayNames) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

async function enrichTipPage(item, homeNames, awayNames) {
  // 先按标题/URL 校验本场，禁止靠列表页正文“碰巧出现队名”蒙混过关
  if (!isMatchSpecificResult(item, homeNames, awayNames)) return null;

  const page = await fetchViaJina(item.url, 12000);
  const title = item.title.replace(/\*\*/g, "").trim();
  const head = `${title}\n${item.snippet || ""}`;
  const corpus = `${head}\n${page || ""}`;

  const pickKey = detectPickFromText(corpus, homeNames, awayNames);
  const pick = pickKey ? OUTCOMES.find((o) => o.key === pickKey) : null;
  const pageTip = extractTipSnippet(page || "", homeNames, awayNames);
  const fallbackTip = [item.snippet]
    .map((s) => String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .find((s) => isUsefulTipLine(s) && !isUselessTip(s, title));

  let tipText = pageTip || fallbackTip || "";
  if (isUselessTip(tipText, title)) {
    if (pick) tipText = `倾向 ${pick.label}`;
    else return null; // 无有效摘要也无倾向，直接丢弃（避免首页标题/时间戳）
  }

  return {
    name: sourceLabel(item.url),
    url: item.url,
    title,
    tipText: tipText.slice(0, 180),
    pick: pick ? { ...pick, prob: null } : null,
    trusted: isTrustedHost(item.url),
  };
}

function buildConsensus(sources) {
  const votes = { home: 0, draw: 0, away: 0 };
  let counted = 0;
  for (const s of sources) {
    if (!s.pick?.key) continue;
    votes[s.pick.key] += 1;
    counted += 1;
  }
  if (!counted) {
    return {
      name: "全网机构观点",
      tagline: "权威/网红预测站点聚合",
      pick: null,
      probs: null,
      counted: 0,
      bullets: ["暂未解析到明确倾向，请查看下方各机构摘要"],
    };
  }

  const probs = {
    home: votes.home / counted,
    draw: votes.draw / counted,
    away: votes.away / counted,
  };
  const pick = pickOutcome(probs);
  return {
    name: "全网机构观点",
    tagline: `已聚合 ${counted} 家有效倾向`,
    pick,
    probs,
    counted,
    bullets: [
      `多数倾向：${pick.label}（${votes[pick.key]}/${counted} 家）`,
      `分布：主胜 ${votes.home} · 平局 ${votes.draw} · 主负 ${votes.away}`,
    ],
  };
}

export async function fetchWebPredictions(match) {
  const homeNames = teamSearchNames(match.home);
  const awayNames = teamSearchNames(match.away);
  const results = await searchWebTips(match);
  if (!results.length) {
    return {
      consensus: buildConsensus([]),
      sources: [],
    };
  }

  // 同站点只保留一条，优先可信源
  const byHost = new Map();
  for (const item of results) {
    const host = hostOf(item.url) || item.url;
    if (!byHost.has(host)) byHost.set(host, item);
  }
  const top = [...byHost.values()].slice(0, 5);
  const enriched = await Promise.all(top.map((item) => enrichTipPage(item, homeNames, awayNames)));
  const sources = enriched.filter(
    (s) =>
      s &&
      s.tipText &&
      !isUselessTip(s.tipText, s.title) &&
      !/体育书|必胜\s*\|/.test(s.tipText) &&
      (s.pick || teamHitCount(`${s.title} ${s.tipText}`, homeNames, awayNames) >= 1)
  );
  return {
    consensus: buildConsensus(sources),
    sources,
  };
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

export async function fetchAndAnalyzeMatch(match) {
  const cached = cache.get(match.id);
  if (cached?.schema === ANALYSIS_SCHEMA) return cached;

  const [intel, web, webInjury] = await Promise.all([
    fetchMatchIntel(match.id),
    fetchWebPredictions(match),
    fetchWebInjuries(match),
  ]);
  const injury = buildInjuryAnalysis(match, intel, webInjury);
  const analysis = {
    schema: ANALYSIS_SCHEMA,
    matchId: match.id,
    updatedAt: new Date().toISOString(),
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

  cache.set(match.id, analysis);
  return analysis;
}

export function injuryReportHtml(injury, match) {
  if (!injury) {
    return `<div class="prediction-injury-card"><p class="injury-empty">暂无伤停数据</p></div>`;
  }

  const renderSide = (side, label) => {
    if (!side?.total) {
      return `
        <div class="injury-team-block injury-team-block--compact">
          <div class="injury-team-header">
            <span class="injury-team-name">${label}</span>
            <span class="injury-team-count">无伤停</span>
          </div>
        </div>`;
    }
    return `
      <div class="injury-team-block injury-team-block--compact">
        <div class="injury-team-header">
          <span class="injury-team-name">${label}</span>
          <span class="injury-team-count">${side.total} 人伤停</span>
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
  return `${total} 人伤停`;
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
  if (!sources.length) {
    return `<div class="prediction-source-card"><p class="injury-empty">未检索到可用的机构预测摘要，请稍后重试。</p></div>`;
  }

  return sources
    .map((src) => {
      const pickBadge = src.pick
        ? `<span class="prediction-source-pick prediction-source-pick--${outcomeClass(src.pick.key)}">${src.pick.short}</span>`
        : `<span class="prediction-source-pick prediction-source-pick--pending">观点</span>`;
      return `
      <div class="prediction-source-card">
        <div class="prediction-source-header">
          <div>
            <div class="prediction-source-name">${src.name}</div>
            <div class="prediction-source-tag">${src.title || "机构预测摘要"}</div>
          </div>
          ${pickBadge}
        </div>
        <p class="prediction-tip-text">${src.tipText || "暂无明确观点摘要"}</p>
      </div>`;
    })
    .join("");
}
