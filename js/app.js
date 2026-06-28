import {
  getBundledWorldCupData,
  fetchLatestWorldCupData,
  startAutoDataRefresh,
  filterByDays,
  sortMatchesByTime,
  getTeamMatches,
  formatMatchupHtml,
  formatMatchupText,
  formatDateSectionLabel,
  getKnockoutMatches,
  isKnockoutMatch,
  getGroupRoundIndex,
} from "./data.js";
import { computeAllStandings, getTeamPoints, getTeamGroupRank } from "./standings.js";
import {
  formatKnockoutRoundLabel,
  resolveMatchTeams,
  formatSlotDisplayLabel,
} from "./knockout.js";
import {
  flagHtml,
  teamLabel,
  teamInlineHtml,
  getFifaRank,
  formatFifaRank,
  isRealTeam,
} from "./teams.js";

const state = {
  tab: "schedule",
  dayFilter: "all",
  showFifaRank: localStorage.getItem("showFifaRank") !== "false",
  standingsExpandedTeam: null,
  historyTeamA: localStorage.getItem("historyTeamA") || "",
  historyTeamB: localStorage.getItem("historyTeamB") || "",
  matches: [],
  dataSource: "bundled",
  sourceLabel: "内置数据",
};

const els = {
  main: document.getElementById("main-content"),
  subPage: document.getElementById("sub-page"),
  subContent: document.getElementById("sub-content"),
  subTitle: document.getElementById("sub-title"),
  pageTitle: document.getElementById("page-title"),
  pageSubtitle: document.getElementById("page-subtitle"),
  backBtn: document.getElementById("back-btn"),
  tabBar: document.getElementById("tab-bar"),
  toast: document.getElementById("toast"),
};

const TAB_TITLES = {
  schedule: { title: "淘汰赛", sub: "2026 FIFA 世界杯 · 北京时间" },
  standings: { title: "积分榜", sub: "小组最终排名 · 积分" },
  history: { title: "对局历史", sub: "选择两支球队 · 查看本届全部场次" },
};

const DAY_FILTERS = [
  { id: "all", label: "全部" },
  { id: "1", label: "1 天" },
  { id: "2", label: "2 天" },
  { id: "3", label: "3 天" },
];

init();

async function init() {
  bindEvents();
  renderLoading();

  try {
    const bundled = await getBundledWorldCupData();
    state.matches = bundled.matches;
    state.dataSource = bundled.source;
    state.sourceLabel = bundled.sourceLabel;
    render();
    startAutoDataRefresh(applyFetchedData);
    fetchLatestWorldCupData()
      .then((data) => applyFetchedData(data))
      .catch(() => {});
  } catch (err) {
    els.main.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>数据加载失败，请刷新重试</p><p class="detail-note">若持续失败，请确认通过完整地址访问：<br><code>/football-com/</code></p></div>`;
    console.error(err);
  }
}

function applyFetchedData(data, { notify = false } = {}) {
  const prevFresh = countFinished(state.matches);
  const nextFresh = data.freshness ?? countFinished(data.matches);
  const shouldUpdate =
    nextFresh > prevFresh ||
    (nextFresh === prevFresh && data.source !== "bundled" && state.dataSource === "bundled");

  if (!shouldUpdate) return false;

  state.matches = data.matches;
  state.dataSource = data.source;
  state.sourceLabel = data.sourceLabel;
  render();
  if (notify) showToast(`已更新（${data.sourceLabel}）`);
  return true;
}

function countFinished(matches) {
  return matches.filter((m) => m.finished).length;
}

function bindEvents() {
  els.tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-item");
    if (!btn) return;
    state.tab = btn.dataset.tab;
    updateTabs();
    render();
  });

  els.backBtn.addEventListener("click", closeSubPage);

  document.addEventListener("click", async (e) => {
    if (e.target.id !== "refresh-btn") return;
    showToast("正在检索最新数据…");
    try {
      const data = await fetchLatestWorldCupData();
      const updated = applyFetchedData(data, { notify: true });
      if (!updated) showToast("已是最新数据");
    } catch {
      showToast("检索失败，仍使用当前数据");
    }
  });

  let marqueeResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(marqueeResizeTimer);
    marqueeResizeTimer = setTimeout(() => {
      if (state.tab === "schedule" || state.tab === "history") {
        setupTeamNameMarquee(els.main);
      }
    }, 150);
  });
}

function updateTabs() {
  els.tabBar.querySelectorAll(".tab-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.tab);
  });
  const meta = TAB_TITLES[state.tab];
  els.pageTitle.textContent = meta.title;
  els.pageSubtitle.textContent = meta.sub;
}

function renderLoading() {
  els.main.innerHTML = `<div class="loading"><div class="spinner"></div><span>加载赛事数据…</span></div>`;
}

function render() {
  updateTabs();
  if (state.tab === "schedule") renderSchedule();
  else if (state.tab === "standings") renderStandings();
  else renderHistory();
}

function renderFilterBar(current) {
  return `
    <div class="filter-bar">
      ${DAY_FILTERS.map(
        (f) =>
          `<button class="chip ${current === f.id ? "active" : ""}" data-days="${f.id}" type="button">${f.label}</button>`
      ).join("")}
    </div>
  `;
}

function bindFilterBar(container, stateKey) {
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state[stateKey] = chip.dataset.days;
      render();
    });
  });
}

function upcomingKnockoutMatches(dayFilter) {
  const now = new Date();
  const upcoming = sortMatchesByTime(getKnockoutMatches(state.matches).filter((m) => !m.finished));
  return filterByDays(upcoming, dayFilter, now);
}

function renderSchedule() {
  const matches = upcomingKnockoutMatches(state.dayFilter);
  const html = [
    renderScheduleToolbar(state.dayFilter),
    matches.length
      ? groupMatchesByDate(matches)
          .map(({ label, items }) => sectionMatches(label, items, "schedule"))
          .join("")
      : `<div class="empty-state"><div class="icon">📭</div><p>该时间段暂无淘汰赛</p></div>`,
    dataSourceNote(),
  ].join("");

  els.main.innerHTML = html;
  bindFilterBar(els.main, "dayFilter");
  bindScheduleSwitches(els.main);
  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);
}

function renderScheduleToolbar(currentFilter) {
  return `
    <div class="schedule-toolbar">
      ${renderFilterBar(currentFilter)}
      <div class="schedule-switches">
        <label class="switch-wrap" title="显示 FIFA 世界排名">
          <span class="switch-label">排名</span>
          <input type="checkbox" id="show-fifa-switch" ${state.showFifaRank ? "checked" : ""}>
          <span class="switch-track" aria-hidden="true"></span>
        </label>
      </div>
    </div>
  `;
}

function bindScheduleSwitches(container) {
  const fifaInput = container.querySelector("#show-fifa-switch");
  if (fifaInput) {
    fifaInput.addEventListener("change", () => {
      state.showFifaRank = fifaInput.checked;
      localStorage.setItem("showFifaRank", String(state.showFifaRank));
      renderSchedule();
    });
  }
}

function groupMatchesByDate(matches) {
  const map = new Map();
  matches.forEach((m) => {
    const key = m.beijingDateKey || m.date;
    if (!map.has(key)) {
      map.set(key, { label: formatDateSectionLabel(key), items: [] });
    }
    map.get(key).items.push(m);
  });
  return [...map.values()];
}

function sectionMatches(label, matches, mode) {
  return `
    <div class="section-label">${label}</div>
    ${matches.map((m) => matchCardHtml(m, mode)).join("")}
  `;
}

function formatPtsInline(points, rank) {
  if (rank) return `(${points}·第${rank}名)`;
  return `(${points})`;
}

function matchCardHtml(m, mode = "schedule", opts = {}) {
  const showFifaRank = opts.showFifaRank ?? state.showFifaRank;
  const staticCard = opts.static === true;
  const isKnockout = isKnockoutMatch(m);
  const resolved = isKnockout ? resolveMatchTeams(m, state.matches) : null;

  let homeName = m.home;
  let awayName = m.away;
  let homePts = null;
  let awayPts = null;
  let homeRank = null;
  let awayRank = null;

  if (isKnockout && resolved) {
    homeName = resolved.home;
    awayName = resolved.away;
  } else if (m.group) {
    homePts = isRealTeam(m.home) ? getTeamPoints(state.matches, m.home, m.group) : null;
    awayPts = isRealTeam(m.away) ? getTeamPoints(state.matches, m.away, m.group) : null;
    if (opts.showRank) {
      homeRank = getTeamGroupRank(state.matches, m.home, m.group);
      awayRank = getTeamGroupRank(state.matches, m.away, m.group);
    }
  }

  const roundLabel = isKnockout ? formatKnockoutRoundLabel(m.round) : m.group ? `${m.group} 组` : m.round;
  const homeDisplay = isKnockout && resolved ? resolved.homeLabel : null;
  const awayDisplay = isKnockout && resolved ? resolved.awayLabel : null;
  const homeScore = m.finished ? m.homeScore : null;
  const awayScore = m.finished ? m.awayScore : null;

  return `
    <article class="match-card ${m.finished ? "finished" : ""}${staticCard ? " match-card--static" : ""}"${staticCard ? "" : ` data-match-id="${m.id}" data-mode="${mode}"`}>
      <div class="match-card-line">
        <span class="group-badge">${roundLabel}</span>
        ${teamInline(homeName, homePts, false, homeScore, "home", homeRank, showFifaRank, homeDisplay)}
        <span class="match-vs">VS</span>
        ${teamInline(awayName, awayPts, false, awayScore, "away", awayRank, showFifaRank, awayDisplay)}
        <span class="match-time">${m.beijingTime || "待定"}</span>
      </div>
      ${m.ground ? `<div class="match-ground">${m.ground}</div>` : ""}
    </article>
  `;
}

function teamInline(name, points, showPoints, score, side, rank = null, showFifa = false, displayName = null) {
  const label = displayName || teamLabel(name);
  const pts =
    showPoints && points !== null
      ? `<span class="team-pts">${formatPtsInline(points, rank)}</span>`
      : "";
  const scoreHtml =
    score !== null ? `<span class="team-score-inline">${score}</span>` : "";
  const fifaHtml =
    showFifa && isRealTeam(name) && getFifaRank(name)
      ? `<span class="team-fifa">FIFA ${getFifaRank(name)}</span>`
      : "";
  const nameBlock = `
    <span class="team-name-stack">
      <span class="team-name-scroll">
        <span class="team-name-track">${label}${pts}${scoreHtml}</span>
      </span>
      ${fifaHtml}
    </span>`;
  const flag = isRealTeam(name) ? flagHtml(name, 22) : `<span class="team-flag team-flag-emoji" style="width:22px;height:17px;font-size:16px" aria-hidden="true">⚽</span>`;

  if (side === "home") {
    return `<span class="team-inline home">${nameBlock}${flag}</span>`;
  }
  return `<span class="team-inline away">${flag}${nameBlock}</span>`;
}

function scheduleTeamNameMarquee(container) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => setupTeamNameMarquee(container));
  });
}

function setupTeamNameMarquee(container) {
  if (!container) return;
  container.querySelectorAll(".team-name-scroll").forEach((box) => {
    const track = box.querySelector(".team-name-track");
    if (!track) return;

    box.classList.remove("is-marquee");
    track.style.removeProperty("--scroll-distance");
    track.style.removeProperty("--marquee-duration");

    const overflow = Math.ceil(track.scrollWidth - box.clientWidth);
    if (overflow > 2) {
      box.classList.add("is-marquee");
      track.style.setProperty("--scroll-distance", `${overflow}px`);
      const duration = Math.min(9, Math.max(3.5, overflow / 10 + 2.5));
      track.style.setProperty("--marquee-duration", `${duration}s`);
    }
  });
}

function bindMatchCards(container) {
  container.querySelectorAll(".match-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.matchId);
      const match = state.matches.find((m) => m.id === id);
      if (!match) return;
      openMatchDetail(match);
    });
  });
}

function getAllTournamentTeams() {
  const teams = new Set();
  state.matches.forEach((m) => {
    if (isRealTeam(m.home)) teams.add(m.home);
    if (isRealTeam(m.away)) teams.add(m.away);
  });
  return [...teams].sort((a, b) => teamLabel(a).localeCompare(teamLabel(b), "zh-CN"));
}

function ensureHistoryTeams(teams) {
  if (teams.length === 0) return { a: "", b: "" };

  const valid = (name) => name && teams.includes(name);
  if (valid(state.historyTeamA) && valid(state.historyTeamB) && state.historyTeamA !== state.historyTeamB) {
    return { a: state.historyTeamA, b: state.historyTeamB };
  }

  const upcoming = upcomingKnockoutMatches("all")[0];
  if (upcoming) {
    const resolved = resolveMatchTeams(upcoming, state.matches);
    const a = isRealTeam(resolved.home) ? resolved.home : teams[0];
    const b = isRealTeam(resolved.away) ? resolved.away : teams.find((t) => t !== a) || teams[0];
    if (a !== b) return { a, b };
  }

  return { a: teams[0], b: teams[1] || teams[0] };
}

function fifaRankHtml(name) {
  const text = formatFifaRank(name);
  return text ? `<span class="fifa-rank">${text}</span>` : "";
}

function teamPickerLabel(team) {
  const rank = getFifaRank(team);
  return rank ? `${teamLabel(team)} · FIFA ${rank}` : teamLabel(team);
}

function historyMatchItemHtml(match, team) {
  const roundLabel = match.group
    ? `小组赛 · 第 ${getGroupRoundIndex(state.matches, team, match) ?? "-"} 轮`
    : formatKnockoutRoundLabel(match.round);
  const result = teamMatchResultLabel(match, team);
  const resultClass =
    result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
  const opponent = match.home === team ? match.away : match.home;
  const opponentHtml = isRealTeam(opponent)
    ? teamInlineHtml(opponent, 18)
    : `<span class="history-slot">${formatSlotDisplayLabel(opponent)}</span>`;
  const body = match.finished
    ? formatMatchupHtml(match, team)
    : `<span class="history-vs">vs ${opponentHtml}</span><span class="history-pending">（未赛）</span>`;
  const homeRank = isRealTeam(match.home) ? fifaRankHtml(match.home) : "";
  const awayRank = isRealTeam(match.away) ? fifaRankHtml(match.away) : "";
  const ranksRow =
    homeRank || awayRank
      ? `<div class="history-match-ranks">${homeRank}<span class="history-match-ranks-vs">vs</span>${awayRank}</div>`
      : "";

  return `
    <div class="history-match-item">
      <div class="history-match-meta">
        <span class="history-match-round">${roundLabel}</span>
        <span class="history-match-time">${match.beijingFull || match.beijingDate || "待定"}</span>
        <span class="standings-match-result ${resultClass}">${result}</span>
      </div>
      ${ranksRow}
      <div class="history-match-body">${body}</div>
      ${match.ground ? `<div class="history-match-ground">${match.ground}</div>` : ""}
    </div>`;
}

function historyTeamBlockHtml(team) {
  const matches = getTeamMatches(state.matches, team);
  const meta = teamGroupMeta(team);

  return `
    <div class="history-team-block">
      <div class="history-team-header">
        ${flagHtml(team, 28)}
        <div class="history-team-info">
          <div class="history-team-name">${teamLabel(team)}</div>
          ${fifaRankHtml(team)}
          <div class="history-team-meta">${meta || "本届世界杯"} · 共 ${matches.length} 场</div>
        </div>
      </div>
      ${
        matches.length
          ? `<div class="history-matches-list">${matches.map((m) => historyMatchItemHtml(m, team)).join("")}</div>`
          : '<p class="history-empty">暂无比赛记录</p>'
      }
    </div>`;
}

function renderHistory() {
  const teams = getAllTournamentTeams();
  const { a, b } = ensureHistoryTeams(teams);
  state.historyTeamA = a;
  state.historyTeamB = b;

  els.main.innerHTML = [
    `
      <div class="history-picker">
        <div class="select-row">
          <label for="history-team-a">球队 A</label>
          <select id="history-team-a">
            ${teams.map((t) => `<option value="${t}" ${t === a ? "selected" : ""}>${teamPickerLabel(t)}</option>`).join("")}
          </select>
        </div>
        <div class="history-vs-badge">VS</div>
        <div class="select-row">
          <label for="history-team-b">球队 B</label>
          <select id="history-team-b">
            ${teams.map((t) => `<option value="${t}" ${t === b ? "selected" : ""}>${teamPickerLabel(t)}</option>`).join("")}
          </select>
        </div>
      </div>
    `,
    a && b && a !== b
      ? `${historyTeamBlockHtml(a)}${historyTeamBlockHtml(b)}`
      : `<div class="empty-state"><div class="icon">📋</div><p>请选择两支不同的球队</p></div>`,
    dataSourceNote(),
  ].join("");

  bindHistoryPickers(els.main);
}

function bindHistoryPickers(container) {
  const selectA = container.querySelector("#history-team-a");
  const selectB = container.querySelector("#history-team-b");

  selectA?.addEventListener("change", () => {
    state.historyTeamA = selectA.value;
    localStorage.setItem("historyTeamA", state.historyTeamA);
    renderHistory();
  });

  selectB?.addEventListener("change", () => {
    state.historyTeamB = selectB.value;
    localStorage.setItem("historyTeamB", state.historyTeamB);
    renderHistory();
  });
}

function renderStandings() {
  const groups = computeAllStandings(state.matches);
  els.main.innerHTML = [
    groups.map((g) => standingsGroupHtml(g)).join(""),
    dataSourceNote(),
  ].join("");
  bindStandingsRows(els.main);
}

function teamMatchResultLabel(match, team) {
  if (!match.finished) return "未赛";
  const isHome = match.home === team;
  const gf = isHome ? match.homeScore : match.awayScore;
  const ga = isHome ? match.awayScore : match.homeScore;
  if (gf > ga) return "胜";
  if (gf < ga) return "负";
  return "平";
}

function standingsMatchItemHtml(match, team) {
  const roundLabel = match.group
    ? `小组赛 · 第${getGroupRoundIndex(state.matches, team, match) ?? "-"}轮`
    : formatKnockoutRoundLabel(match.round);
  const result = teamMatchResultLabel(match, team);
  const resultClass =
    result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
  const body = match.finished
    ? formatMatchupText(match)
    : `${teamLabel(match.home)} vs ${teamLabel(match.away)}（未赛）`;

  return `
    <div class="standings-match-item">
      <div class="standings-match-meta">
        <span class="standings-match-round">${roundLabel}</span>
        <span class="standings-match-result ${resultClass}">${result}</span>
      </div>
      <div class="standings-match-body">${body}</div>
    </div>`;
}

function standingsTeamMatchesHtml(team) {
  const matches = getTeamMatches(state.matches, team);
  if (matches.length === 0) {
    return '<p class="standings-matches-empty">暂无比赛记录</p>';
  }
  return `<div class="standings-matches-list">${matches.map((m) => standingsMatchItemHtml(m, team)).join("")}</div>`;
}

function bindStandingsRows(container) {
  container.querySelectorAll(".standings-team-row").forEach((row) => {
    row.addEventListener("click", () => {
      const team = row.dataset.team;
      if (!team) return;
      if (state.standingsExpandedTeam === team) {
        state.standingsExpandedTeam = null;
      } else {
        state.standingsExpandedTeam = team;
      }
      renderStandings();
    });
  });
}

function standingsGroupHtml({ group, rows }) {
  return `
    <div class="group-card">
      <div class="group-header">${group} 组</div>
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>球队</th>
            <th>赛</th>
            <th>胜</th>
            <th>平</th>
            <th>负</th>
            <th>进</th>
            <th>失</th>
            <th>净</th>
            <th>分</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const expanded = state.standingsExpandedTeam === r.team;
              return `
            <tr class="standings-team-row ${i < 2 ? "qualified" : i === 2 ? "possible" : ""}${expanded ? " expanded" : ""}" data-team="${r.team}" aria-expanded="${expanded}">
              <td class="rank">${i + 1}</td>
              <td>
                <div class="team-cell">
                  ${flagHtml(r.team, 20)}
                  <span class="team-cell-name">${teamLabel(r.team)}</span>
                  <span class="standings-expand-icon" aria-hidden="true"></span>
                </div>
              </td>
              <td>${r.mp}</td>
              <td>${r.w}</td>
              <td>${r.d}</td>
              <td>${r.l}</td>
              <td>${r.gf}</td>
              <td>${r.ga}</td>
              <td>${r.gd > 0 ? "+" + r.gd : r.gd}</td>
              <td class="pts">${r.pts}</td>
            </tr>
            <tr class="standings-detail-row${expanded ? "" : " hidden"}" data-team="${r.team}">
              <td colspan="10">
                <div class="standings-matches-panel">
                  <div class="standings-matches-title">本届世界杯战绩</div>
                  ${standingsTeamMatchesHtml(r.team)}
                </div>
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function teamGroupMeta(team) {
  const groupMatch = state.matches.find(
    (m) => m.group && m.finished && (m.home === team || m.away === team)
  );
  if (!groupMatch?.group) return null;
  const pts = getTeamPoints(state.matches, team, groupMatch.group);
  const rank = getTeamGroupRank(state.matches, team, groupMatch.group);
  const rankText = rank ? `第 ${rank} 名 · ` : "";
  return `${groupMatch.group} 组 · ${rankText}${pts} 分`;
}

function renderTeamPathHtml(team) {
  if (!isRealTeam(team)) return "";
  const groupMatches = getTeamMatches(state.matches, team).filter((m) => m.group);
  if (groupMatches.length === 0) return "";
  const meta = teamGroupMeta(team);
  const items = groupMatches
    .map((m) => {
      const round = getGroupRoundIndex(state.matches, team, m);
      const title = round ? `小组赛第 ${round} 轮` : "小组赛";
      const body = m.finished ? formatMatchupText(m) : `${teamLabel(m.home)} vs ${teamLabel(m.away)}（未赛）`;
      return `
        <div class="detail-round-block">
          <div class="detail-row detail-row--matchup">
            <span class="label">${title}</span>
            <span class="value">${body}</span>
          </div>
        </div>`;
    })
    .join("");
  return `
    <div class="detail-card">
      <h3>${teamInlineHtml(team, 22)}</h3>
      ${meta ? `<p class="detail-note">${meta}</p>` : ""}
      ${items}
    </div>`;
}

function openMatchDetail(match) {
  const resolved = isKnockoutMatch(match) ? resolveMatchTeams(match, state.matches) : null;
  const roundLabel = isKnockoutMatch(match)
    ? formatKnockoutRoundLabel(match.round)
    : match.group
      ? `${match.group} 组`
      : match.round;

  els.subTitle.textContent = "比赛详情";
  els.subContent.innerHTML = `
    <div class="detail-card">
      <h3>⚽ ${roundLabel}${match.num ? ` · 第 ${match.num} 场` : ""}</h3>
      ${matchCardHtml(match, "detail", { static: true, showFifaRank: state.showFifaRank })}
      <div class="detail-row"><span class="label">北京时间</span><span class="value">${match.beijingFull || "待定"}</span></div>
      ${match.ground ? `<div class="detail-row"><span class="label">球场</span><span class="value">${match.ground}</span></div>` : ""}
      ${
        match.finished
          ? `<div class="detail-row"><span class="label">比分</span><span class="value">${formatMatchupHtml(match)}</span></div>`
          : ""
      }
      ${
        resolved && (!resolved.homeResolved || !resolved.awayResolved)
          ? `<p class="detail-note">对阵将根据小组赛最终排名及前序场次结果确定。</p>`
          : ""
      }
    </div>

    ${resolved && isRealTeam(resolved.home) ? renderTeamPathHtml(resolved.home) : ""}
    ${resolved && isRealTeam(resolved.away) ? renderTeamPathHtml(resolved.away) : ""}
  `;

  showSubPage();
  scheduleTeamNameMarquee(els.subContent);
}

function showSubPage() {
  els.subPage.classList.remove("hidden");
  els.subPage.setAttribute("aria-hidden", "false");
}

function closeSubPage() {
  els.subPage.classList.add("hidden");
  els.subPage.setAttribute("aria-hidden", "true");
}

function dataSourceNote() {
  return `
    <p class="data-source">数据来源：openfootball · ${state.sourceLabel} · 每 3 分钟自动检索</p>
    <button class="refresh-btn" type="button" id="refresh-btn">立即检索</button>
  `;
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2000);
}
