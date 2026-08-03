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
  天狼星: ["Sirius", "IK Sirius"],
  哥德堡: ["Goteborg", "IFK Göteborg"],
  佐加顿斯: ["Djurgarden", "Djurgården"],
  埃夫斯堡: ["Elfsborg"],
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

  const byPos = {};
  for (const item of out) {
    byPos[item.position] = (byPos[item.position] || 0) + 1;
  }

  return {
    team: teamLabel,
    total: out.length,
    byPos,
    lines: Object.entries(byPos).map(([pos, n]) => `${pos} ${n}`),
  };
}

function buildInjuryAnalysis(match, intel) {
  const { injuries, players } = intel || {};
  if (!injuries && !players) return null;

  const home = buildSideInjurySummary(match.home, injuries?.home, players?.home);
  const away = buildSideInjurySummary(match.away, injuries?.away, players?.away);

  return {
    source: "injury",
    name: "伤停情报",
    tagline: "仅统计伤停位置与人数",
    home,
    away,
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

  if (!results.length) {
    const urls = [...markdown.matchAll(/https?:\/\/[^\s)\]"'<>]+/g)]
      .map((x) => unwrapDuckUrl(x[0]))
      .filter((u) => !/duckduckgo|jina\.ai|gstatic|bing\.com/i.test(u));
    for (const url of [...new Set(urls)].slice(0, 12)) {
      results.push({ title: sourceLabel(url), url, snippet: "" });
    }
  }

  return results;
}

function scoreResult(item, homeNames, awayNames) {
  const hay = `${item.title} ${item.snippet} ${item.url}`.toLowerCase();
  let score = 0;
  if (isTrustedHost(item.url)) score += 8;
  if (/predict|tip|preview|分析|预测|竞彩/.test(hay)) score += 4;
  if (homeNames.some((n) => hay.includes(String(n).toLowerCase()))) score += 3;
  if (awayNames.some((n) => hay.includes(String(n).toLowerCase()))) score += 3;
  if (/h2h|stats|lineup|odds/.test(hay)) score += 1;
  return score;
}

function detectPickFromText(text, homeNames, awayNames) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const homeRe = homeNames.map(escapeRegExp).join("|");
  const awayRe = awayNames.map(escapeRegExp).join("|");

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

  // 概率最高项
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

function isUsefulTipLine(line) {
  if (!line) return false;
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

  const preferred = lines.find((l) =>
    /best bet|verdict|推荐|倾向|we think|double chance|tip\s*[:：]|predicted outcome/i.test(l)
  );
  if (preferred) return preferred;

  const named = lines.find((l) => {
    const low = l.toLowerCase();
    return (
      /win|draw|predict|tip|胜|平|负/.test(low) &&
      (homeNames.some((n) => low.includes(String(n).toLowerCase())) ||
        awayNames.some((n) => low.includes(String(n).toLowerCase())))
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
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

async function enrichTipPage(item, homeNames, awayNames) {
  const page = await fetchViaJina(item.url, 12000);
  const corpus = `${item.title}\n${item.snippet}\n${page || ""}`;
  const pickKey = detectPickFromText(corpus, homeNames, awayNames);
  const pageTip = extractTipSnippet(page || "", homeNames, awayNames);
  const fallbackTip = [item.snippet, item.title]
    .map((s) => String(s || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .find((s) => isUsefulTipLine(s) || (s && s.length > 12));
  const tipText = pageTip || fallbackTip || "暂无明确观点摘要";

  const pick = pickKey ? OUTCOMES.find((o) => o.key === pickKey) : null;
  return {
    name: sourceLabel(item.url),
    url: item.url,
    title: item.title.replace(/\*\*/g, "").trim(),
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
  const sources = enriched.filter(Boolean);
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

export async function fetchAndAnalyzeMatch(match) {
  if (cache.has(match.id)) return cache.get(match.id);

  const [intel, web] = await Promise.all([fetchMatchIntel(match.id), fetchWebPredictions(match)]);
  const injury = buildInjuryAnalysis(match, intel);
  const analysis = {
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
