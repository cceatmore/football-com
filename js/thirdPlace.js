import { computeAllStandings, buildTableFromResults, compareRows } from "./standings.js";
import { isRealTeam } from "./teams.js";

const THIRD_PLACE_SLOTS = 8;

function enumerateOutcomes(count) {
  const outcomes = [[3, 0], [1, 1], [0, 3]];
  if (count === 0) return [[]];
  const rest = enumerateOutcomes(count - 1);
  const result = [];
  for (const o of outcomes) {
    for (const r of rest) result.push([o, ...r]);
  }
  return result;
}

function thirdFromTable(tableRows) {
  const sorted = [...tableRows].sort(compareRows);
  const third = sorted[2];
  if (!third) return null;
  return {
    team: third.team,
    pts: third.pts,
    gd: third.gd,
    gf: third.gf,
    ga: third.ga,
    mp: third.mp,
  };
}

function rankThirdPlaces(thirds) {
  return [...thirds]
    .sort(compareRows)
    .map((t, i) => ({
      ...t,
      rankAmongThird: i + 1,
      inTop8: i < THIRD_PLACE_SLOTS,
    }));
}

export function getCurrentThirdPlaceRanking(matches) {
  const groups = computeAllStandings(matches);
  const thirds = groups
    .map(({ group, rows }) => {
      const row = rows[2];
      if (!row) return null;
      return { group, ...row };
    })
    .filter(Boolean);

  return rankThirdPlaces(thirds);
}

function thirdPlaceRangeForGroup(matches, groupLetter) {
  const current = computeAllStandings(matches).find((g) => g.group === groupLetter);
  const currentThird = current?.rows[2];
  if (!currentThird) return null;

  const remaining = matches.filter(
    (m) => m.group === groupLetter && !m.finished && isRealTeam(m.home) && isRealTeam(m.away)
  );

  if (remaining.length === 0) {
    return {
      group: groupLetter,
      team: currentThird.team,
      min: { pts: currentThird.pts, gd: currentThird.gd, gf: currentThird.gf },
      max: { pts: currentThird.pts, gd: currentThird.gd, gf: currentThird.gf },
      locked: true,
    };
  }

  const outcomes = enumerateOutcomes(remaining.length);
  let min = null;
  let max = null;
  let thirdTeam = currentThird.team;

  for (const combo of outcomes) {
    const assumed = remaining.map((m, i) => ({
      home: m.home,
      away: m.away,
      homeScore: combo[i][0],
      awayScore: combo[i][1],
    }));
    const table = buildTableFromResults(matches, groupLetter, assumed);
    const third = thirdFromTable(table);
    if (!third) continue;

    if (third.team !== currentThird.team) {
      thirdTeam = null;
    }

    if (!min || compareRows(third, min) < 0) min = third;
    if (!max || compareRows(max, third) < 0) max = third;
  }

  return {
    group: groupLetter,
    team: thirdTeam || currentThird.team,
    min: min || currentThird,
    max: max || currentThird,
    locked: false,
  };
}

function rankWithOthers(fixedThirds, candidate) {
  const ranked = rankThirdPlaces([...fixedThirds, candidate]);
  return ranked.find((t) => t.team === candidate.team)?.rankAmongThird;
}

export function analyzeThirdPlaceRace(matches) {
  const current = getCurrentThirdPlaceRanking(matches);
  const cutoff = current[THIRD_PLACE_SLOTS - 1] || null;
  const groups = [...new Set(matches.filter((m) => m.group).map((m) => m.group))].sort();

  const ranges = groups.map((g) => thirdPlaceRangeForGroup(matches, g)).filter(Boolean);

  const teamAnalysis = current.map((row) => {
    const range = ranges.find((r) => r.group === row.group);
    const others = current.filter((t) => t.group !== row.group);

    let bestRank = row.rankAmongThird;
    let worstRank = row.rankAmongThird;

    if (range && !range.locked && range.team === row.team) {
      const bestRankCalc = rankWithOthers(others, { ...row, ...range.max });
      const worstRankCalc = rankWithOthers(others, { ...row, ...range.min });
      if (bestRankCalc) bestRank = Math.min(bestRank, bestRankCalc);
      if (worstRankCalc) worstRank = Math.max(worstRank, worstRankCalc);
    }

    let status = "in";
    let statusLabel = "晋级区";
    let desc = "按当前第三名战绩，可排进八个最佳第三名之列。";

    if (row.rankAmongThird > THIRD_PLACE_SLOTS) {
      status = "out";
      statusLabel = "淘汰区";
      desc = cutoff
        ? `当前未进前八，需超越第 8 名（${cutoff.pts} 分 · 净胜 ${formatGd(cutoff.gd)}）。`
        : "当前未进前八。";
    } else if (worstRank > THIRD_PLACE_SLOTS) {
      status = "bubble";
      statusLabel = "边缘";
      desc = `目前在晋级区，但最差情况可能跌至第 ${worstRank} 名。`;
    } else if (bestRank < row.rankAmongThird) {
      status = "rising";
      statusLabel = "有望提升";
      desc = `最好情况可升至第 ${bestRank} 名。`;
    }

    if (range && !range.locked && range.team !== row.team) {
      desc += " 本组第三名仍可能换人，需持续关注。";
    }

    return { ...row, bestRank, worstRank, status, statusLabel, desc, range };
  });

  const possibleTop8 = teamAnalysis.filter((t) => t.bestRank <= THIRD_PLACE_SLOTS);

  return {
    current,
    cutoff,
    teamAnalysis,
    possibleTop8,
    qualifyingCount: possibleTop8.length,
  };
}

function formatGd(gd) {
  return gd > 0 ? `+${gd}` : String(gd);
}

export { formatGd as formatThirdGd, THIRD_PLACE_SLOTS };
