const UNIFORM_BASE = "https://webapi.sporttery.cn/gateway/uniform/football";
const FETCH_HEADERS = {
  Referer: "https://m.sporttery.cn/mjc/zqszsc/",
  Accept: "application/json, text/plain, */*",
};

const OUTCOMES = [
  { key: "home", label: "主胜", short: "胜" },
  { key: "draw", label: "平局", short: "平" },
  { key: "away", label: "主负", short: "负" },
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

export async function fetchMatchIntel(matchId) {
  const [feature, head, tables, injuries, players] = await Promise.all([
    fetchUniform(`getMatchFeatureV1.qry?sportteryMatchId=${matchId}&termLimits=10`),
    fetchUniform(`getMatchHeadV1.qry?sportteryMatchId=${matchId}&termLimits=10`),
    fetchUniform(`getMatchTablesV1.qry?sportteryMatchId=${matchId}`),
    fetchUniform(`getInjurySuspensionV1.qry?sportteryMatchId=${matchId}`),
    fetchUniform(`getMatchPlayerV1.qry?sportteryMatchId=${matchId}&termLimits=5`),
  ]);
  return { feature, head, tables, injuries, players };
}

function parseNum(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i += 1) r *= i;
  return r;
}

function poissonP(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/** Forebet 类泊松比分矩阵 */
function poissonOutcomeProbs(homeLambda, awayLambda, maxGoals = 5) {
  const matrix = [];
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h += 1) {
    matrix[h] = [];
    const pH = poissonP(h, homeLambda);
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = pH * poissonP(a, awayLambda);
      matrix[h][a] = p;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const norm = homeWin + draw + awayWin || 1;
  return {
    home: homeWin / norm,
    draw: draw / norm,
    away: awayWin / norm,
    topScores: topScoreLines(matrix, maxGoals).slice(0, 3),
  };
}

function topScoreLines(matrix, maxGoals) {
  const lines = [];
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      lines.push({ score: `${h}:${a}`, prob: matrix[h][a] });
    }
  }
  return lines.sort((a, b) => b.prob - a.prob);
}

function oddsImpliedProbs(odds) {
  if (!odds?.h || !odds?.d || !odds?.a) return null;
  const inv = [1 / parseNum(odds.h, 0), 1 / parseNum(odds.d, 0), 1 / parseNum(odds.a, 0)];
  const sum = inv.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  const margin = 1 - 1 / sum;
  return {
    home: inv[0] / sum,
    draw: inv[1] / sum,
    away: inv[2] / sum,
    returnRate: 1 / sum,
    margin,
  };
}

function formProbs(feature) {
  if (!feature?.last) return null;
  const { last } = feature;
  const homeStrength =
    parseNum(last.homeWinGoalMatchCnt) * 3 +
    parseNum(last.homeDrawMatchCnt) +
    parseNum(last.homeScoreRatio) * 0.05;
  const awayStrength =
    parseNum(last.awayWinGoalMatchCnt) * 3 +
    parseNum(last.awayDrawMatchCnt) +
    parseNum(last.awayScoreRatio) * 0.05;
  const total = homeStrength + awayStrength + 20;
  const drawBase = (parseNum(last.homeDrawMatchCnt) + parseNum(last.awayDrawMatchCnt)) / 20;
  const home = homeStrength / total + 0.1;
  const away = awayStrength / total + 0.1;
  const draw = Math.min(0.35, Math.max(0.15, drawBase + 0.15));
  const norm = home + draw + away;
  return { home: home / norm, draw: draw / norm, away: away / norm };
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

function blendProbs(items) {
  const totals = { home: 0, draw: 0, away: 0 };
  let weightSum = 0;
  for (const { probs, weight } of items) {
    if (!probs) continue;
    weightSum += weight;
    totals.home += probs.home * weight;
    totals.draw += probs.draw * weight;
    totals.away += probs.away * weight;
  }
  if (!weightSum) return null;
  return {
    home: totals.home / weightSum,
    draw: totals.draw / weightSum,
    away: totals.away / weightSum,
  };
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

function buildSportteryAnalysis(match, intel) {
  const { feature, tables } = intel;
  const bullets = [];
  const homeTable =
    tables?.tables?.find(
      (t) =>
        t.teamShortName === match.home ||
        t.sportteryTeamId === feature?.sportteryHomeTeamId
    ) || tables?.tables?.[0];
  const awayTable =
    tables?.tables?.find(
      (t) =>
        t.teamShortName === match.away ||
        t.sportteryTeamId === feature?.sportteryAwayTeamId
    ) || tables?.tables?.[1];

  if (homeTable && awayTable) {
    bullets.push(
      `积分榜：${match.home} 第 ${homeTable.ranking}（${homeTable.points} 分）vs ${match.away} 第 ${awayTable.ranking}（${awayTable.points} 分）`
    );
    bullets.push(
      `赛季胜率：主队 ${homeTable.winProbability || "—"}，客队 ${awayTable.winProbability || "—"}`
    );
  }

  if (feature?.goalAvg) {
    bullets.push(
      `近 ${feature.goalAvg.totalLegCnt} 场场均进球：${feature.homeTeamShortName || match.home} ${feature.goalAvg.homeGoalAvgCnt}，${feature.awayTeamShortName || match.away} ${feature.goalAvg.awayGoalAvgCnt}`
    );
  }

  if (feature?.last) {
    bullets.push(
      `近 ${feature.last.totalLegCnt} 场战绩：主队 ${feature.last.homeWinGoalMatchCnt} 胜 ${feature.last.homeDrawMatchCnt} 平 ${feature.last.homeLossGoalMatchCnt} 负；客队 ${feature.last.awayWinGoalMatchCnt} 胜 ${feature.last.awayDrawMatchCnt} 平 ${feature.last.awayLossGoalMatchCnt} 负`
    );
  }

  if (feature?.sameHomeAway) {
    bullets.push(
      `同主客近 ${feature.sameHomeAway.totalLegCnt} 场：主队主场胜率 ${feature.sameHomeAway.homeScoreRatio}%，客队客场胜率 ${feature.sameHomeAway.awayScoreRatio}%`
    );
  }

  return {
    source: "sporttery",
    name: "中国体彩",
    tagline: "官方赛事数据",
    url: "https://www.sporttery.cn/",
    bullets: bullets.length ? bullets : ["暂无官方统计数据"],
  };
}

function buildOddsAnalysis(match, oddsProbs) {
  if (!oddsProbs || !match.odds) {
    return {
      source: "market",
      name: "市场赔率",
      tagline: "隐含概率（竞彩官方 SP）",
      url: "https://www.sporttery.cn/",
      bullets: ["暂无胜平负赔率数据"],
      probs: null,
      pick: null,
    };
  }

  const pick = pickOutcome(oddsProbs);
  return {
    source: "market",
    name: "市场赔率",
    tagline: "隐含概率 · 全球庄家共识方法论",
    url: "https://www.sporttery.cn/",
    probs: oddsProbs,
    pick,
    bullets: [
      `SP 赔率：胜 ${match.odds.h} / 平 ${match.odds.d} / 负 ${match.odds.a}`,
      `去水后概率：主胜 ${pct(oddsProbs.home)} · 平 ${pct(oddsProbs.draw)} · 主负 ${pct(oddsProbs.away)}`,
      `返还率 ${pct(oddsProbs.returnRate)}，庄家抽水约 ${pct(oddsProbs.margin)}`,
      `市场倾向：${pick.label}（${pct(pick.prob)}）`,
    ],
  };
}

function buildPoissonAnalysis(match, feature, poisson) {
  if (!poisson) {
    return {
      source: "poisson",
      name: "Forebet 方法论",
      tagline: "泊松比分矩阵 · 数理预测",
      url: "https://www.forebet.com/",
      bullets: ["进球数据不足，无法建立泊松模型"],
      probs: null,
      pick: null,
    };
  }

  const pick = pickOutcome(poisson);
  const scoreText = poisson.topScores.map((s) => `${s.score}(${pct(s.prob)})`).join("、");
  return {
    source: "poisson",
    name: "Forebet 方法论",
    tagline: "泊松比分矩阵 · 数理预测",
    url: "https://www.forebet.com/",
    probs: poisson,
    pick,
    bullets: [
      `预期进球：${match.home} ${parseNum(feature?.goalAvg?.homeGoalAvgCnt).toFixed(1)} · ${match.away} ${parseNum(feature?.goalAvg?.awayGoalAvgCnt).toFixed(1)}`,
      `模型概率：主胜 ${pct(poisson.home)} · 平 ${pct(poisson.draw)} · 主负 ${pct(poisson.away)}`,
      `热门比分：${scoreText}`,
      `模型倾向：${pick.label}（${pct(pick.prob)}）`,
    ],
  };
}

function buildFormAnalysis(feature, form) {
  if (!form) {
    return {
      source: "form",
      name: "近期状态",
      tagline: "体彩官方 · 近 10 场走势",
      url: "https://www.sporttery.cn/",
      bullets: ["暂无近期战绩数据"],
      probs: null,
      pick: null,
    };
  }

  const pick = pickOutcome(form);
  return {
    source: "form",
    name: "近期状态",
    tagline: "体彩官方 · 近 10 场走势",
    url: "https://www.sporttery.cn/",
    probs: form,
    pick,
    bullets: [
      `走势概率：主胜 ${pct(form.home)} · 平 ${pct(form.draw)} · 主负 ${pct(form.away)}`,
      `状态倾向：${pick.label}（${pct(pick.prob)}）`,
    ],
  };
}

function playerStatus(raw) {
  const injured = Number(raw.injuryFlag) === 1;
  const suspended = Number(raw.suspensionFlag) === 1;
  if (injured && suspended) return { label: "伤病+停赛", type: "out" };
  if (injured) return { label: "伤病", type: "out" };
  if (suspended) return { label: "停赛", type: "out" };
  return { label: "可出战", type: "ok" };
}

function formatPlayerLine(p) {
  const parts = [`${p.number || "—"}号 ${p.name}`, p.position];
  if (p.goals != null) parts.push(`${p.goals}球`);
  if (p.starts != null) parts.push(`${p.starts}首发`);
  parts.push(p.status.label);
  return parts.filter(Boolean).join(" · ");
}

function buildTeamInjuryReport(teamLabel, sideData, playerSide) {
  const unavailableList = sideData?.injuriesAndSuspensionsList || [];
  const keyPlayers = playerSide?.playerList || [];

  const keyReports = keyPlayers.map((p) => ({
    id: p.personId,
    name: p.personName,
    number: p.uniformNo,
    position: p.playerPositionDesc,
    goals: parseNum(p.goalCnt, null),
    starts: parseNum(p.startedMatchCnt, null),
    status: playerStatus(p),
    isKey: true,
  }));

  const keyIds = new Set(keyPlayers.map((p) => p.personId));
  const extraUnavailable = unavailableList
    .filter((p) => !keyIds.has(p.personId))
    .map((p) => ({
      id: p.personId,
      name: p.personName,
      number: p.uniformNo,
      position: p.playerPositionDesc,
      status: playerStatus(p),
      isKey: false,
    }));

  const outKeys = keyReports.filter((p) => p.status.type === "out");

  return {
    team: teamLabel,
    teamShort: sideData?.teamShortName || teamLabel,
    keyPlayers: keyReports,
    extraUnavailable,
    outKeys,
    unavailableCount: outKeys.length + extraUnavailable.length,
  };
}

function buildInjuryAnalysis(match, intel) {
  const { injuries, players } = intel;
  if (!injuries && !players) return null;

  const home = buildTeamInjuryReport(match.home, injuries?.home, players?.home);
  const away = buildTeamInjuryReport(match.away, injuries?.away, players?.away);
  const bullets = [];
  const impact = [];

  for (const side of [home, away]) {
    if (side.outKeys.length) {
      bullets.push(
        `${side.team} 主力缺阵：${side.outKeys.map((p) => formatPlayerLine(p)).join("；")}`
      );
      const topScorerOut = side.outKeys.some(
        (p) => p.goals != null && p.goals >= Math.max(...side.keyPlayers.map((k) => k.goals || 0), 0)
      );
      if (topScorerOut) {
        impact.push(`${side.team} 主力射手缺阵，进攻端实力可能下滑`);
      }
    }
    if (side.extraUnavailable.length) {
      bullets.push(
        `${side.team} 其他伤停：${side.extraUnavailable.map((p) => formatPlayerLine(p)).join("；")}`
      );
    }
    if (!side.outKeys.length && !side.extraUnavailable.length) {
      bullets.push(`${side.team} 暂无官方伤停记录`);
    }
  }

  if (home.unavailableCount > away.unavailableCount) {
    impact.push("主队缺阵人数更多，阵容厚度可能受影响");
  } else if (away.unavailableCount > home.unavailableCount) {
    impact.push("客队缺阵人数更多，阵容厚度可能受影响");
  }

  if (!bullets.length) {
    bullets.push("暂无伤停情报");
  }

  return {
    source: "injury",
    name: "伤停情报",
    tagline: "体彩官方 · 主力球员与缺阵",
    url: "https://www.sporttery.cn/",
    home,
    away,
    bullets,
    impact,
  };
}

function buildSummary(match, blended, sources, poisson, injury) {
  const pick = pickOutcome(blended);
  const confidence = pick.prob >= 0.5 ? "较高" : pick.prob >= 0.4 ? "中等" : "偏低";
  const scorePick = poisson?.topScores?.[0]?.score || "—";
  const dissent = sources.filter((s) => s.pick && s.pick.key !== pick.key);

  const bullets = [
    `综合倾向：${pick.label}（置信 ${pct(pick.prob)}，${confidence}）`,
    `推荐关注比分：${scorePick}`,
    `融合 4 路信号：体彩数据、市场赔率、泊松模型、近期状态`,
  ];

  if (dissent.length) {
    bullets.push(`分歧提示：${dissent.map((s) => `${s.name}看${s.pick.short}`).join("、")}，需谨慎`);
  }

  if (injury?.impact?.length) {
    bullets.push(...injury.impact.slice(0, 2));
  }

  if (match.hhad?.line) {
    const line = parseNum(match.hhad.line);
    if (line < 0 && pick.key === "home") bullets.push(`让球 ${match.hhad.line}：主队让球后仍被看好`);
    if (line > 0 && pick.key === "away") bullets.push(`让球 ${match.hhad.line}：客队受让仍被看好`);
  }

  return {
    source: "summary",
    name: "综合研判",
    tagline: "多源融合 · 仅供查阅",
    probs: blended,
    pick,
    confidence,
    scorePick,
    bullets,
  };
}

export function buildMatchAnalysis(match, intel) {
  const oddsProbs = oddsImpliedProbs(match.odds);
  const homeLambda = parseNum(intel.feature?.goalAvg?.homeGoalAvgCnt, 1.2);
  const awayLambda = parseNum(intel.feature?.goalAvg?.awayGoalAvgCnt, 1.0);
  const poisson = poissonOutcomeProbs(homeLambda, awayLambda);
  const form = formProbs(intel.feature);

  const sporttery = buildSportteryAnalysis(match, intel);
  const market = buildOddsAnalysis(match, oddsProbs);
  const poissonSrc = buildPoissonAnalysis(match, intel.feature, poisson);
  const formSrc = buildFormAnalysis(intel.feature, form);
  const injury = buildInjuryAnalysis(match, intel);

  const blended = blendProbs([
    { probs: oddsProbs, weight: 0.4 },
    { probs: poisson, weight: 0.35 },
    { probs: form, weight: 0.25 },
  ]);

  const summary = buildSummary(match, blended, [market, poissonSrc, formSrc], poisson, injury);

  return {
    matchId: match.id,
    updatedAt: new Date().toISOString(),
    summary,
    injury,
    sources: [sporttery, market, poissonSrc, formSrc],
    probs: blended,
  };
}

export async function fetchAndAnalyzeMatch(match) {
  if (cache.has(match.id)) return cache.get(match.id);

  const intel = await fetchMatchIntel(match.id);
  const analysis = buildMatchAnalysis(match, intel);
  cache.set(match.id, analysis);
  return analysis;
}

export function injuryReportHtml(injury, match) {
  if (!injury) {
    return `<div class="prediction-injury-card"><p class="injury-empty">暂无伤停数据</p></div>`;
  }

  const renderTeam = (side, label) => {
    const outKeys = side.outKeys || [];
    const healthyKeys = (side.keyPlayers || []).filter((p) => p.status.type === "ok");
    return `
      <div class="injury-team-block">
        <div class="injury-team-header">
          <span class="injury-team-name">${label}</span>
          <span class="injury-team-count">${side.unavailableCount ? `${side.unavailableCount} 人缺阵` : "全员可战"}</span>
        </div>
        ${
          side.keyPlayers?.length
            ? `<div class="injury-section">
                <div class="injury-section-title">主力球员 (${side.keyPlayers.length})</div>
                <ul class="injury-player-list">
                  ${side.keyPlayers
                    .map(
                      (p) => `
                    <li class="injury-player injury-player--${p.status.type}">
                      <span class="injury-player-no">${p.number || "—"}</span>
                      <span class="injury-player-name">${p.name}</span>
                      <span class="injury-player-meta">${p.position}${p.goals != null ? ` · ${p.goals}球` : ""}${p.starts != null ? ` · ${p.starts}首发` : ""}</span>
                      <span class="injury-player-status">${p.status.label}</span>
                    </li>`
                    )
                    .join("")}
                </ul>
              </div>`
            : ""
        }
        ${
          side.extraUnavailable?.length
            ? `<div class="injury-section">
                <div class="injury-section-title">其他伤停</div>
                <ul class="injury-player-list injury-player-list--compact">
                  ${side.extraUnavailable
                    .map(
                      (p) => `
                    <li class="injury-player injury-player--out">
                      <span class="injury-player-no">${p.number || "—"}</span>
                      <span class="injury-player-name">${p.name}</span>
                      <span class="injury-player-meta">${p.position}</span>
                      <span class="injury-player-status">${p.status.label}</span>
                    </li>`
                    )
                    .join("")}
                </ul>
              </div>`
            : ""
        }
        ${
          !outKeys.length && !side.extraUnavailable?.length && !healthyKeys.length
            ? `<p class="injury-empty">暂无球员数据</p>`
            : ""
        }
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
      ${renderTeam(injury.home, `${match.home}（主）`)}
      ${renderTeam(injury.away, `${match.away}（客）`)}
      ${
        injury.impact?.length
          ? `<ul class="prediction-bullets injury-impact-list">
              ${injury.impact.map((b) => `<li>${b}</li>`).join("")}
            </ul>`
          : ""
      }
      <a class="prediction-source-link" href="${injury.url}" target="_blank" rel="noopener noreferrer">数据来源：中国体彩 →</a>
    </div>`;
}

export function injuryBadgeText(injury) {
  if (!injury) return null;
  const total = (injury.home?.unavailableCount || 0) + (injury.away?.unavailableCount || 0);
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
