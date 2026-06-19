import {
  buildTableFromResults,
  computeStandings,
  rankInGroup,
} from "./standings.js";
import {
  getPreviousMatch,
  getNextMatch,
  matchScoreDetail,
} from "./data.js";
import { isRealTeam, teamLabel } from "./teams.js";

const SHOW_ON_CARD = new Set([
  "confirmed",
  "eliminated",
  "must_win",
  "must_draw",
  "draw_ok",
]);

function enumerateOutcomes(count) {
  const outcomes = [
    [3, 0],
    [1, 1],
    [0, 3],
  ];
  if (count === 0) return [[]];
  const rest = enumerateOutcomes(count - 1);
  const result = [];
  for (const o of outcomes) {
    for (const r of rest) result.push([o, ...r]);
  }
  return result;
}

function winScorelines(isHome, minMargin = 1, maxMargin = 5) {
  const lines = [];
  for (let margin = minMargin; margin <= maxMargin; margin++) {
    lines.push(isHome ? [margin, 0] : [0, margin]);
    for (let conceded = 1; conceded <= 3; conceded++) {
      lines.push(isHome ? [margin + conceded, conceded] : [conceded, margin + conceded]);
    }
  }
  const seen = new Set();
  return lines.filter(([hs, as]) => {
    const margin = isHome ? hs - as : as - hs;
    if (margin < minMargin) return false;
    const key = `${hs}-${as}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatGd(gd) {
  return gd > 0 ? `+${gd}` : String(gd);
}

function finalizeResult(base, gdInfo, context) {
  return {
    ...base,
    ...gdInfo,
    context,
    showOnCard: SHOW_ON_CARD.has(base.status),
    showGdOnCard: Boolean(gdInfo.gdNeeded && gdInfo.minWinMargin > 1),
  };
}

function buildMatchContext(matches, team, targetMatch) {
  const group = targetMatch.group;
  const prev = getPreviousMatch(matches, team, targetMatch);
  const next = getNextMatch(matches, team, targetMatch);
  const rows = computeStandings(matches, group);
  const rank = rankInGroup(rows, team);
  const row = rows.find((r) => r.team === team);
  const opponent = targetMatch.home === team ? targetMatch.away : targetMatch.home;

  const prevSummary = prev
    ? `上轮 ${matchScoreDetail(prev)}，对手 ${teamLabel(prev.home === team ? prev.away : prev.home)}`
    : "首轮出战，暂无上轮战绩";

  const nextSummary =
    next && next.id !== targetMatch.id
      ? `末轮对阵 ${teamLabel(next.home === team ? next.away : next.home)}（${next.beijingFull}）`
      : next && next.id === targetMatch.id
        ? "本场为小组末轮"
        : "暂无后续小组赛";

  const rivalForSecond = rows
    .filter((r) => r.team !== team)
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    })
    .find((r) => Math.abs(r.pts - (row?.pts ?? 0)) <= 3);

  return {
    prev,
    next,
    rank,
    pts: row?.pts ?? 0,
    gd: row?.gd ?? 0,
    opponent,
    opponentLabel: teamLabel(opponent),
    isHome: targetMatch.home === team,
    prevSummary,
    nextSummary,
    rivalLabel: rivalForSecond ? teamLabel(rivalForSecond.team) : null,
    rivalPts: rivalForSecond?.pts,
    rivalGd: rivalForSecond?.gd,
  };
}

function analyzeGoalDifferenceStrict(
  matches,
  group,
  team,
  targetHome,
  targetAway,
  isHome,
  otherRemaining,
  qualifiesWith,
  canWin,
  status,
  context
) {
  const emptyGd = {
    gdNeeded: false,
    gdLabel: null,
    gdDesc: null,
    currentGd: context.gd,
    minWinMargin: null,
    gdRivals: [],
  };

  if (
    !canWin ||
    status === "confirmed" ||
    status === "eliminated" ||
    status === "n_a" ||
    status === "complex"
  ) {
    return emptyGd;
  }

  let minWinMargin = null;
  for (let margin = 1; margin <= 5; margin++) {
    const lines = winScorelines(isHome, margin, margin);
    const canWithMargin = lines.some(([hs, as]) =>
      qualifiesWith(targetHome, targetAway, hs, as, false)
    );
    if (canWithMargin) {
      minWinMargin = margin;
      break;
    }
  }

  if (minWinMargin !== null && minWinMargin > 1) {
    return {
      gdNeeded: true,
      gdLabel: `需净胜≥${minWinMargin}球`,
      gdDesc: `取胜需至少净胜 ${minWinMargin} 球才能力保小组前二（当前净胜 ${formatGd(context.gd)}）。`,
      currentGd: context.gd,
      minWinMargin,
      gdRivals: [],
    };
  }

  const minWin = isHome ? [1, 0] : [0, 1];
  let qualWithMinWin = 0;
  let qualWithMinWinButWorseGd = 0;
  const gdRivals = new Set();

  for (const combo of enumerateOutcomes(otherRemaining.length)) {
    const assumed = otherRemaining.map((m, i) => ({
      home: m.home,
      away: m.away,
      homeScore: combo[i][0],
      awayScore: combo[i][1],
    }));
    assumed.push({
      home: targetHome,
      away: targetAway,
      homeScore: minWin[0],
      awayScore: minWin[1],
    });
    const table = buildTableFromResults(matches, group, assumed);
    const rank = rankInGroup(table, team);
    if (rank > 2) continue;

    qualWithMinWin++;
    const myRow = table.find((r) => r.team === team);
    const tied = table.filter(
      (r) => r.team !== team && r.pts === myRow.pts && rankInGroup(table, r.team) <= 3
    );
    const beatenOnGd = tied.some((r) => r.gd > myRow.gd);
    if (beatenOnGd) {
      qualWithMinWinButWorseGd++;
      tied.filter((r) => r.gd > myRow.gd).forEach((r) => gdRivals.add(r.team));
    }
  }

  if (
    qualWithMinWin > 0 &&
    qualWithMinWinButWorseGd === qualWithMinWin &&
    gdRivals.size > 0
  ) {
    const rivals = [...gdRivals].map(teamLabel);
    return {
      gdNeeded: true,
      gdLabel: "净胜球落后",
      gdDesc: `取胜后仍可能在净胜球上落后于 ${rivals.join("、")}，需尽量多进球（当前 ${formatGd(context.gd)}）。`,
      currentGd: context.gd,
      minWinMargin: 1,
      gdRivals: [...gdRivals],
    };
  }

  return emptyGd;
}

function outcomeSummary(winOk, drawOk, lossOk) {
  const parts = [];
  if (winOk) parts.push("取胜可出线");
  if (drawOk) parts.push("平局可出线");
  if (lossOk) parts.push("输球仍可能出线");
  return parts.join("；") || "暂无出线路径";
}

export function analyzeTeamScenario(matches, targetMatch, team) {
  const emptyContext = {
    prevSummary: "",
    nextSummary: "",
    rank: null,
    pts: 0,
    gd: 0,
  };

  if (!targetMatch.group || !isRealTeam(team)) {
    return finalizeResult(
      { status: "n_a", label: "不适用", desc: "淘汰赛或占位球队暂无小组出线分析。" },
      { gdNeeded: false, gdLabel: null, gdDesc: null, currentGd: 0, minWinMargin: null, gdRivals: [] },
      emptyContext
    );
  }

  const group = targetMatch.group;
  const context = buildMatchContext(matches, team, targetMatch);
  const remaining = matches.filter(
    (m) =>
      m.group === group &&
      !m.finished &&
      isRealTeam(m.home) &&
      isRealTeam(m.away)
  );

  const contextPrefix = `${context.prevSummary}。本场${context.isHome ? "主场" : "客场"}对阵 ${context.opponentLabel}。${context.nextSummary}。`;

  if (!remaining.some((m) => m.home === team || m.away === team)) {
    const rank = rankInGroup(computeStandings(matches, group), team);
    const gdBase = {
      gdNeeded: false,
      gdLabel: null,
      gdDesc: null,
      currentGd: context.gd,
      minWinMargin: null,
      gdRivals: [],
    };
    if (rank <= 2) {
      return finalizeResult(
        {
          status: "confirmed",
          label: "已确认出线",
          desc: `${contextPrefix}已锁定小组前两名。`,
        },
        gdBase,
        context
      );
    }
    return finalizeResult(
      {
        status: "eliminated",
        label: "已出局",
        desc: `${contextPrefix}已无法进入小组前两名。`,
      },
      gdBase,
      context
    );
  }

  const otherRemaining = remaining.filter((m) => m.id !== targetMatch.id);
  const outcomes = enumerateOutcomes(otherRemaining.length);

  const qualifiesWith = (selfHome, selfAway, selfHs, selfAs, requireAll) => {
    let any = false;
    for (const combo of outcomes) {
      const assumed = otherRemaining.map((m, i) => ({
        home: m.home,
        away: m.away,
        homeScore: combo[i][0],
        awayScore: combo[i][1],
      }));
      assumed.push({
        home: selfHome,
        away: selfAway,
        homeScore: selfHs,
        awayScore: selfAs,
      });
      const table = buildTableFromResults(matches, group, assumed);
      const rank = rankInGroup(table, team);
      if (rank <= 2) {
        any = true;
        if (!requireAll) return true;
      } else if (requireAll) {
        return false;
      }
    }
    return requireAll ? any : false;
  };

  const isHome = targetMatch.home === team;
  const home = targetMatch.home;
  const away = targetMatch.away;

  const win = isHome ? [1, 0] : [0, 1];
  const draw = [1, 1];
  const loss = isHome ? [0, 1] : [1, 0];

  const canWin = qualifiesWith(home, away, win[0], win[1], false);
  const canDraw = qualifiesWith(home, away, draw[0], draw[1], false);
  const canLoss = qualifiesWith(home, away, loss[0], loss[1], false);
  const alwaysLoss = qualifiesWith(home, away, loss[0], loss[1], true);
  const alwaysDraw = qualifiesWith(home, away, draw[0], draw[1], true);

  const winOk = canWin;
  const drawOk = canDraw;
  const lossOk = canLoss;

  let base;

  if (alwaysLoss) {
    base = {
      status: "confirmed",
      label: "已确认出线",
      desc: `${contextPrefix}即使本场失利仍可确保小组前二。`,
      winOk,
      drawOk,
      lossOk,
    };
  } else if (!canWin && !canDraw && !canLoss) {
    base = {
      status: "eliminated",
      label: "已出局",
      desc: `${contextPrefix}无论本场结果如何，均已无法进入小组前二。`,
      winOk,
      drawOk,
      lossOk,
    };
  } else if (canWin && !canDraw && !canLoss) {
    base = {
      status: "must_win",
      label: "必须取胜",
      desc: `${contextPrefix}本场必须全取三分，平局或失利均无法出线。`,
      winOk,
      drawOk,
      lossOk,
    };
  } else if (!canWin && canDraw && !canLoss) {
    base = {
      status: "must_draw",
      label: "只能求平",
      desc: `${contextPrefix}只有平局才能保留出线可能，输球即出局。`,
      winOk,
      drawOk,
      lossOk,
    };
  } else if (alwaysDraw) {
    base = {
      status: "draw_ok",
      label: "可接受平局",
      desc: `${contextPrefix}本场拿一分即可确保小组前二。`,
      winOk,
      drawOk,
      lossOk,
    };
  } else if (canDraw && !canLoss) {
    base = {
      status: "draw_ok",
      label: "可接受平局",
      desc: `${contextPrefix}至少拿一分仍有望出线；若失利则出局。${canWin ? "取胜更稳。" : ""}`,
      winOk,
      drawOk,
      lossOk,
    };
  } else {
    base = {
      status: "complex",
      label: "形势复杂",
      desc: `${contextPrefix}出线取决于本场与其他场次组合：${outcomeSummary(winOk, drawOk, lossOk)}。`,
      winOk,
      drawOk,
      lossOk,
    };
  }

  const gdInfo = analyzeGoalDifferenceStrict(
    matches,
    group,
    team,
    home,
    away,
    isHome,
    otherRemaining,
    qualifiesWith,
    canWin,
    base.status,
    context
  );

  if (gdInfo.gdNeeded && gdInfo.gdDesc && base.status !== "complex") {
    base.desc = `${base.desc} ${gdInfo.gdDesc}`;
  }

  return finalizeResult(base, gdInfo, context);
}

export function analyzeMatchScenario(matches, match) {
  if (!match.group || match.finished) return null;
  const home = analyzeTeamScenario(matches, match, match.home);
  const away = analyzeTeamScenario(matches, match, match.away);
  return { home, away };
}

export const STATUS_META = {
  confirmed: { className: "confirmed", icon: "✅" },
  draw_ok: { className: "draw-ok", icon: "🤝" },
  must_win: { className: "must-win", icon: "🔥" },
  must_draw: { className: "draw-ok", icon: "🤝" },
  complex: { className: "fighting", icon: "📋" },
  eliminated: { className: "eliminated", icon: "❌" },
  n_a: { className: "eliminated", icon: "—" },
  gd: { className: "gd", icon: "📐" },
};
