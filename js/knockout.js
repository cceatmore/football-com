import { buildTableFromResults, rankInGroup, compareRows } from "./standings.js";
import { isRealTeam, teamLabel } from "./teams.js";

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
