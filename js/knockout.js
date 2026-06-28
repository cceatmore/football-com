import { buildTableFromResults, rankInGroup, compareRows } from "./standings.js";
import { isRealTeam, teamLabel } from "./teams.js";

export const KNOCKOUT_ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Match for third place",
  "Final",
];

export const KNOCKOUT_ROUND_LABELS = {
  "Round of 32": "32 强",
  "Round of 16": "16 强",
  "Quarter-final": "8 强",
  "Semi-final": "半决赛",
  "Match for third place": "三四名",
  Final: "决赛",
};

export function formatKnockoutRoundLabel(round) {
  return KNOCKOUT_ROUND_LABELS[round] || round;
}

function formatRankSlotLabel(rank, group) {
  return `${group} 组第 ${rank} 名`;
}

function formatThirdSlotLabel(groups) {
  if (groups.length === 1) return `${groups[0]} 组第三名`;
  return `${groups.join("/")} 组最佳第三`;
}

function formatFeederSlotLabel(prefix, num) {
  return `第 ${num} 场${prefix === "W" ? "胜者" : "负者"}`;
}

export function formatSlotDisplayLabel(name) {
  if (!name) return "待定";
  if (isRealTeam(name)) return teamLabel(name);

  const rank = name.match(/^([12])([A-L])$/);
  if (rank) return formatRankSlotLabel(+rank[1], rank[2]);

  const third = name.match(/^3([A-L](?:\/[A-L])*)$/);
  if (third) return formatThirdSlotLabel(third[1].split("/"));

  const feeder = name.match(/^([WL])(\d+)$/);
  if (feeder) return formatFeederSlotLabel(feeder[1], +feeder[2]);

  return name;
}

function buildAllGroupTables(matches, assumedResults) {
  const groups = [...new Set(matches.filter((m) => m.group).map((m) => m.group))].sort();
  return Object.fromEntries(
    groups.map((g) => [g, buildTableFromResults(matches, g, assumedResults)])
  );
}

function rankThirdPlaces(thirds) {
  return [...thirds]
    .sort(compareRows)
    .map((t, i) => ({ ...t, rankAmongThird: i + 1, inTop8: i < 8 }));
}

function parseSlot(name) {
  const rank = name.match(/^([12])([A-L])$/);
  if (rank) return { type: "rank", rank: +rank[1], group: rank[2] };
  const third = name.match(/^3([A-L](?:\/[A-L])*)$/);
  if (third) return { type: "third", groups: third[1].split("/") };
  return { type: "team", team: name };
}

export function getRoundOf32Fixtures(matches) {
  return matches
    .filter((m) => m.round === "Round of 32")
    .map((m) => ({
      num: m.num,
      slot1: parseSlot(m.home),
      slot2: parseSlot(m.away),
      home: m.home,
      away: m.away,
      beijingFull: m.beijingFull,
    }));
}

function slotMatchesQualification(slot, group, rank) {
  if (rank <= 2 && slot.type === "rank") {
    return slot.rank === rank && slot.group === group;
  }
  if (rank === 3 && slot.type === "third") {
    return slot.groups.includes(group);
  }
  return false;
}

function findRoundOf32Fixture(fixtures, group, rank) {
  for (const fixture of fixtures) {
    if (slotMatchesQualification(fixture.slot1, group, rank)) {
      return { fixture, oppSlot: fixture.slot2 };
    }
    if (slotMatchesQualification(fixture.slot2, group, rank)) {
      return { fixture, oppSlot: fixture.slot1 };
    }
  }
  return null;
}

function getThirdPlaceRanking(tables) {
  const thirds = Object.entries(tables)
    .map(([group, rows]) => {
      const sorted = [...rows].sort(compareRows);
      const third = sorted[2];
      return third ? { group, team: third.team, pts: third.pts, gd: third.gd, gf: third.gf } : null;
    })
    .filter(Boolean);
  return rankThirdPlaces(thirds);
}

function resolveGroupTables(matches) {
  return buildAllGroupTables(matches, []);
}

function resolveRankSlot(name, tables) {
  const rank = name.match(/^([12])([A-L])$/);
  if (!rank) return null;
  const rows = [...(tables[rank[2]] || [])].sort(compareRows);
  const row = rows[+rank[1] - 1];
  if (!row) {
    return { team: null, label: formatRankSlotLabel(+rank[1], rank[2]) };
  }
  return { team: row.team, label: teamLabel(row.team) };
}

function resolveThirdSlot(name, tables, thirdRanking) {
  const third = name.match(/^3([A-L](?:\/[A-L])*)$/);
  if (!third) return null;
  const groups = third[1].split("/");
  const qualified = thirdRanking.filter((t) => groups.includes(t.group) && t.inTop8);
  if (qualified.length === 1) {
    return { team: qualified[0].team, label: teamLabel(qualified[0].team) };
  }
  if (qualified.length > 1) {
    const labels = qualified.map((t) => teamLabel(t.team));
    return { team: null, label: labels.join(" / ") };
  }
  return { team: null, label: formatThirdSlotLabel(groups) };
}

function matchWinner(match, homeTeam, awayTeam) {
  if (!match.finished || homeTeam == null || awayTeam == null) return null;
  if (match.homeScore > match.awayScore) return homeTeam;
  if (match.awayScore > match.homeScore) return awayTeam;
  return null;
}

function matchLoser(match, homeTeam, awayTeam) {
  if (!match.finished || homeTeam == null || awayTeam == null) return null;
  if (match.homeScore > match.awayScore) return awayTeam;
  if (match.awayScore > match.homeScore) return homeTeam;
  return null;
}

/** 解析淘汰赛占位符（组名次 / 最佳第三 / W·L 晋级链） */
export function resolveKnockoutSlot(name, matches, memo = new Map(), tables = null, thirdRanking = null) {
  if (!name) return { team: null, label: "待定" };
  if (memo.has(name)) return memo.get(name);

  if (isRealTeam(name)) {
    const result = { team: name, label: teamLabel(name) };
    memo.set(name, result);
    return result;
  }

  const tablesRef = tables ?? resolveGroupTables(matches);
  const thirdRef = thirdRanking ?? getThirdPlaceRanking(tablesRef);

  const rankResult = resolveRankSlot(name, tablesRef);
  if (rankResult) {
    memo.set(name, rankResult);
    return rankResult;
  }

  const thirdResult = resolveThirdSlot(name, tablesRef, thirdRef);
  if (thirdResult) {
    memo.set(name, thirdResult);
    return thirdResult;
  }

  const feeder = name.match(/^([WL])(\d+)$/);
  if (feeder) {
    const source = matches.find((m) => m.num === +feeder[2]);
    if (!source) {
      const pending = { team: null, label: formatFeederSlotLabel(feeder[1], +feeder[2]) };
      memo.set(name, pending);
      return pending;
    }
    const home = resolveKnockoutSlot(source.home, matches, memo, tablesRef, thirdRef);
    const away = resolveKnockoutSlot(source.away, matches, memo, tablesRef, thirdRef);
    const pick =
      feeder[1] === "W"
        ? matchWinner(source, home.team, away.team)
        : matchLoser(source, home.team, away.team);
    const result = pick
      ? { team: pick, label: teamLabel(pick) }
      : { team: null, label: formatFeederSlotLabel(feeder[1], +feeder[2]) };
    memo.set(name, result);
    return result;
  }

  const fallback = { team: null, label: formatSlotDisplayLabel(name) };
  memo.set(name, fallback);
  return fallback;
}

export function resolveMatchTeams(match, matches) {
  const memo = new Map();
  const tables = resolveGroupTables(matches);
  const thirdRanking = getThirdPlaceRanking(tables);
  const home = resolveKnockoutSlot(match.home, matches, memo, tables, thirdRanking);
  const away = resolveKnockoutSlot(match.away, matches, memo, tables, thirdRanking);
  return {
    homeRaw: match.home,
    awayRaw: match.away,
    home: home.team ?? match.home,
    away: away.team ?? match.away,
    homeLabel: home.label,
    awayLabel: away.label,
    homeResolved: Boolean(home.team),
    awayResolved: Boolean(away.team),
  };
}

export function groupKnockoutByRound(matches) {
  const knockout = matches.filter((m) => m.stage === "knockout");
  const map = new Map();
  for (const round of KNOCKOUT_ROUND_ORDER) {
    const items = knockout.filter((m) => m.round === round);
    if (items.length) map.set(round, sortKnockoutRound(items));
  }
  return map;
}

function sortKnockoutRound(items) {
  return [...items].sort((a, b) => {
    if (a.num != null && b.num != null) return a.num - b.num;
    if (!a.utc && !b.utc) return a.date.localeCompare(b.date);
    if (!a.utc) return 1;
    if (!b.utc) return -1;
    return a.utc - b.utc;
  });
}

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

function resolveSlotToLabels(slot, tables, thirdRanking) {
  if (slot.type === "team") return [teamLabel(slot.team)];

  if (slot.type === "rank") {
    const rows = [...(tables[slot.group] || [])].sort(compareRows);
    const row = rows[slot.rank - 1];
    return row ? [teamLabel(row.team)] : [`${slot.rank}${slot.group}组待定`];
  }

  if (slot.type === "third") {
    const candidates = thirdRanking
      .filter((t) => slot.groups.includes(t.group) && t.inTop8)
      .map((t) => teamLabel(t.team));
    if (candidates.length > 0) return candidates;
    return slot.groups.map((g) => `${g}组最佳第三候选`);
  }

  return ["待定"];
}

function joinLabels(labels) {
  const unique = [...new Set(labels)];
  if (unique.length === 0) return "待定";
  if (unique.length === 1) return unique[0];
  if (unique.length <= 4) return unique.join(" / ");
  return `${unique.slice(0, 3).join("、")} 等${unique.length}种可能`;
}

function resolveThirdPlaceOpponents(fixtures, tables, group, thirdRanking) {
  const labels = new Set();
  for (const fixture of fixtures) {
    const pairs = [
      [fixture.slot1, fixture.slot2],
      [fixture.slot2, fixture.slot1],
    ];
    for (const [slot, oppSlot] of pairs) {
      if (slot.type === "third" && slot.groups.includes(group)) {
        resolveSlotToLabels(oppSlot, tables, thirdRanking).forEach((l) => labels.add(l));
      }
    }
  }
  if (labels.size === 0) return "32强（对手待定）";
  return joinLabels([...labels]);
}

function resolveKnockoutLabel(fixtures, tables, group, rank, team) {
  const thirdRanking = getThirdPlaceRanking(tables);

  if (rank > 3) return "未出线";

  if (rank === 3) {
    const mine = thirdRanking.find((t) => t.team === team);
    if (!mine?.inTop8) return "未出线";
    return resolveThirdPlaceOpponents(fixtures, tables, group, thirdRanking);
  }

  const found = findRoundOf32Fixture(fixtures, group, rank);
  if (!found) return "32强对阵待定";

  const labels = resolveSlotToLabels(found.oppSlot, tables, thirdRanking);
  return joinLabels(labels);
}

function summarizeSet(set) {
  const arr = [...set];
  const qualified = arr.filter((x) => x !== "未出线");
  if (qualified.length === 0) return "未出线";

  const opponents = new Set();
  qualified.forEach((item) => {
    item.split(/\s*\/\s*/).forEach((o) => {
      const t = o.trim();
      if (t) opponents.add(t);
    });
  });

  let oppStr;
  const list = [...opponents];
  if (list.length === 1) oppStr = `32强 vs ${list[0]}`;
  else if (list.length <= 4) oppStr = `32强 vs ${list.join(" / ")}`;
  else oppStr = `32强 vs ${list.slice(0, 3).join("、")} 等`;

  if (qualified.length < arr.length) return `${oppStr}；也可能未出线`;
  return oppStr;
}

function getRemainingGroupMatches(matches, groupLetter) {
  return matches.filter(
    (m) =>
      m.group === groupLetter && !m.finished && isRealTeam(m.home) && isRealTeam(m.away)
  );
}

/** 按本场胜/平/负，枚举剩余场次后推算 32 强对手 */
export function computeKnockoutOutlook(matches, targetMatch, team) {
  if (!targetMatch.group || !isRealTeam(team)) return null;

  const group = targetMatch.group;
  const fixtures = getRoundOf32Fixtures(matches);
  const groupRemaining = getRemainingGroupMatches(matches, group);

  if (!groupRemaining.some((m) => m.id === targetMatch.id)) {
    const tables = buildAllGroupTables(matches, []);
    const rank = rankInGroup(tables[group], team);
    const label = resolveKnockoutLabel(fixtures, tables, group, rank, team);
    const base = rank <= 2 || (rank === 3 && label !== "未出线") ? label : "未出线";
    return { win: base, draw: base, loss: base, locked: true };
  }

  const otherRemaining = groupRemaining.filter((m) => m.id !== targetMatch.id);
  const combos = enumerateOutcomes(otherRemaining.length);
  const isHome = targetMatch.home === team;
  const home = targetMatch.home;
  const away = targetMatch.away;

  const types = {
    win: isHome ? [1, 0] : [0, 1],
    draw: [1, 1],
    loss: isHome ? [0, 1] : [1, 0],
  };

  const results = { win: new Set(), draw: new Set(), loss: new Set() };

  for (const [type, [hs, as]] of Object.entries(types)) {
    for (const combo of combos) {
      const assumed = otherRemaining.map((m, i) => ({
        home: m.home,
        away: m.away,
        homeScore: combo[i][0],
        awayScore: combo[i][1],
      }));
      assumed.push({ home, away, homeScore: hs, awayScore: as });

      const tables = buildAllGroupTables(matches, assumed);
      const rank = rankInGroup(tables[group], team);
      results[type].add(resolveKnockoutLabel(fixtures, tables, group, rank, team));
    }
  }

  return {
    win: summarizeSet(results.win),
    draw: summarizeSet(results.draw),
    loss: summarizeSet(results.loss),
    locked: false,
  };
}

export function formatKnockoutOutlookHtml(outlook) {
  if (!outlook) return "";
  return `
    <div class="knockout-outlook">
      <div class="knockout-row"><span class="knockout-tag win">胜</span><span>${outlook.win}</span></div>
      <div class="knockout-row"><span class="knockout-tag draw">平</span><span>${outlook.draw}</span></div>
      <div class="knockout-row"><span class="knockout-tag loss">负</span><span>${outlook.loss}</span></div>
    </div>`;
}
