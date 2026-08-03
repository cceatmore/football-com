import {
  getBundledLotteryData,
  fetchLatestLotteryData,
  startAutoDataRefresh,
  filterByDays,
  sortMatchesByTime,
  getTeamMatches,
  formatMatchupHtml,
  formatDateSectionLabel,
  formatOddsShort,
  formatNextUpdateLabel,
} from "./data.js";
import { computeAllStandings, getTeamGroupRank } from "./standings.js";
import { leagueBadgeHtml, teamLabel, isRealTeam, formatRank, flagHtml } from "./teams.js";
import {
  fetchAndAnalyzeMatch,
  clearPredictionCache,
  ANALYSIS_SCHEMA,
  probBarHtml,
  outcomeClass,
  injuryReportHtml,
  injuryBadgeText,
  webSourcesHtml,
} from "./predictions.js";
import {
  fetchTeamHistories,
  getTeamHistoryList,
  getH2hList,
  fetchTeamRecentForm,
  collectLocalTeamMatches,
  clearMatchHistoryCache,
  findTeamMatchMeta,
  resolveTeamInMatch,
  teamResultLabel,
  formatHistoryScoreText,
  formatMatchWhen,
} from "./matchHistory.js";
import { fetchStandingsForMatches, clearLeagueStandingsCache } from "./leagueStandings.js";

const state = {
  tab: "schedule",
  dayFilter: "all",
  standingsExpandedTeam: null,
  standingsLeagueTab: null,
  standingsGroups: null,
  standingsLoading: false,
  standingsTeamMatches: new Map(),
  standingsTeamLoading: null,
  matches: [],
  history: [],
  allMatches: [],
  businessDate: "",
  updatedAt: "",
  dataSource: "bundled",
  sourceLabel: "内置数据",
  predictionCache: new Map(),
  predictionLoadingId: null,
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
  schedule: { title: "今日赛程", sub: "体彩竞彩足球 · 北京时间" },
  standings: { title: "联赛积分", sub: "官方排名 / 赛果统计" },
  predictions: { title: "预测分析", sub: "全网机构预测 · 仅供参考" },
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
    const data = await fetchLatestLotteryData();
    applyData(data);
    render();
    startAutoDataRefresh(applyFetchedData);
  } catch (err) {
    try {
      const bundled = await getBundledLotteryData();
      applyData(bundled);
      render();
      startAutoDataRefresh(applyFetchedData);
      showToast("实时数据不可用，已使用缓存");
    } catch {
      els.main.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>数据加载失败，请刷新重试</p></div>`;
      console.error(err);
    }
  }
}

function applyData(data) {
  state.matches = data.matches;
  state.history = data.history || [];
  state.allMatches = data.allMatches || data.matches;
  state.businessDate = data.businessDate || "";
  state.updatedAt = data.updatedAt || "";
  state.dataSource = data.source;
  state.sourceLabel = data.sourceLabel;
  clearPredictionCache();
  state.predictionCache.clear();
  clearMatchHistoryCache();
  clearLeagueStandingsCache();
  state.standingsGroups = null;
  state.standingsTeamMatches = new Map();
  state.standingsTeamLoading = null;
  state.standingsExpandedTeam = null;
}

function applyFetchedData(data, { notify = false } = {}) {
  const prevFresh = countFinished(state.allMatches);
  const nextFresh = data.freshness ?? countFinished(data.allMatches || data.matches);
  const shouldUpdate =
    data.source === "live" ||
    nextFresh > prevFresh ||
    data.updatedAt !== state.updatedAt ||
    data.matches.length !== state.matches.length ||
    data.businessDate !== state.businessDate ||
    (data.source !== "bundled" && state.dataSource === "bundled");

  if (!shouldUpdate) return false;

  applyData(data);
  render();
  if (notify) showToast(`已更新（${data.sourceLabel}）`);
  return true;
}

function countFinished(matches) {
  return matches.filter((m) => m.finished).length;
}

function bindEvents() {
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

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
      const data = await fetchLatestLotteryData();
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
      if (state.tab === "schedule") setupTeamNameMarquee(els.main);
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
  else renderPredictions();
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

function upcomingMatches(dayFilter) {
  const now = new Date();
  const upcoming = sortMatchesByTime(state.matches.filter((m) => !m.finished));
  return filterByDays(upcoming.length ? upcoming : state.matches, dayFilter, now);
}

function renderSchedule() {
  const matches = upcomingMatches(state.dayFilter);
  const html = [
    renderScheduleToolbar(state.dayFilter),
    matches.length
      ? groupMatchesByDate(matches)
          .map(({ label, items }) => sectionMatches(label, items))
          .join("")
      : `<div class="empty-state"><div class="icon">📭</div><p>当前暂无开售场次</p><p class="detail-note">体彩通常每天 11:00 左右更新</p></div>`,
    dataSourceNote(),
  ].join("");

  els.main.innerHTML = html;
  bindFilterBar(els.main, "dayFilter");
  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);
}

function renderScheduleToolbar(currentFilter) {
  return `<div class="schedule-toolbar">${renderFilterBar(currentFilter)}</div>`;
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

function sectionMatches(label, matches) {
  return `
    <div class="section-label">${label}</div>
    ${matches.map((m) => matchCardHtml(m)).join("")}
  `;
}

function matchCardHtml(m, opts = {}) {
  const staticCard = opts.static === true;
  const roundLabel = m.leagueShort || m.round || m.group;
  const homeScore = m.finished ? m.homeScore : null;
  const awayScore = m.finished ? m.awayScore : null;
  const showRank = opts.showRank !== false;

  const inner = `
      <div class="match-card-line${opts.hideRound ? " match-card-line--no-group" : ""}">
        ${opts.hideRound ? "" : `<span class="group-badge" style="background:#${m.leagueColor || "64748b"}">${roundLabel}</span>`}
        ${teamInline(m.home, homeScore, "home", m, showRank, m.homeRank)}
        <span class="match-vs">VS</span>
        ${teamInline(m.away, awayScore, "away", m, showRank, m.awayRank)}
        <span class="match-time">${m.beijingTime || "待定"}</span>
      </div>
      ${!opts.hideMeta && (m.odds || m.num) ? `<div class="match-meta">${m.num ? `<span class="match-num">${m.num}${m.single ? " · 单关" : ""}</span>` : ""}${m.odds ? `<span class="match-odds">${formatOddsShort(m.odds)}</span>` : ""}</div>` : ""}`;

  if (opts.asInner) return inner;

  return `
    <article class="match-card ${m.finished ? "finished" : ""}${staticCard ? " match-card--static" : ""}"${staticCard ? "" : ` data-match-id="${m.id}"`}>${inner}
    </article>
  `;
}

function teamInline(name, score, side, match, showRank = true, rank = null) {
  const label = teamLabel(name);
  const scoreHtml = score !== null ? `<span class="team-score-inline">${score}</span>` : "";
  const rankHtml =
    showRank && rank != null
      ? `<span class="team-rank">${formatRank(rank, match.rankLeague || match.leagueShort)}</span>`
      : "";
  const nameBlock = `
    <span class="team-name-stack">
      <span class="team-name-scroll">
        <span class="team-name-track">${label}${scoreHtml}</span>
      </span>
      ${rankHtml}
    </span>`;
  const badge = leagueBadgeHtml(match.leagueShort, match.leagueColor, 22);

  if (side === "home") {
    return `<span class="team-inline home">${nameBlock}${badge}</span>`;
  }
  return `<span class="team-inline away">${badge}${nameBlock}</span>`;
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

function bindMatchCards(container, onClick) {
  container.querySelectorAll(".match-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.matchId);
      const match = state.matches.find((m) => m.id === id) || state.allMatches.find((m) => m.id === id);
      if (!match) return;
      if (onClick) onClick(match);
      else openMatchDetail(match);
    });
  });
}

function historyMatchBodyText(match, team) {
  const resolved = resolveTeamInMatch(match, team);
  const opponent =
    resolved === match.home ? match.away : resolved === match.away ? match.home : match.away;
  const league = match.leagueShort || match.group || "";
  if (match.finished) {
    const score = formatHistoryScoreText(match);
    return `${teamLabel(match.home)} ${score} ${teamLabel(match.away)}${league ? ` · ${league}` : ""}`;
  }
  return `vs ${teamLabel(opponent)}（未赛）${league ? ` · ${league}` : ""}`;
}

function historyMatchItemHtml(match, team) {
  const result = teamResultLabel(match, team);
  const resultClass =
    result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
  const when = formatMatchWhen(match);
  const body = historyMatchBodyText(match, team);

  return `
    <div class="history-match-item history-match-item--compact result-${resultClass}">
      <span class="standings-match-result ${resultClass}">${result}</span>
      ${when ? `<span class="history-match-when">${when}</span>` : ""}
      <span class="history-match-body">${body}</span>
    </div>`;
}

function historyTeamBlockHtml(team, matches, metaMatch = null) {
  const meta = teamLeagueMeta(team) || (metaMatch ? `${metaMatch.leagueShort || metaMatch.group}` : null);
  const displayMatch = findTeamMatchMeta(metaMatch, team) || matches[0] || metaMatch;

  return `
    <div class="history-team-block">
      <div class="history-team-header">
        ${flagHtml(team, 28, displayMatch)}
        <div class="history-team-info">
          <div class="history-team-name">${teamLabel(team)}</div>
          <div class="history-team-meta">${meta || "近期战绩"} · 最近 ${matches.length} 场</div>
        </div>
      </div>
      ${
        matches.length
          ? `<div class="history-matches-list">${matches.map((m) => historyMatchItemHtml(m, team)).join("")}</div>`
          : '<p class="history-empty">暂无比赛记录</p>'
      }
    </div>`;
}

function h2hBlockHtml(h2hMatches, perspectiveTeam) {
  if (!h2hMatches.length) return "";
  const rows = h2hMatches
    .map((m) => {
      const when = formatMatchWhen(m) || m.date || "";
      const score = formatHistoryScoreText(m) || `${m.homeScore}:${m.awayScore}`;
      const result = teamResultLabel(m, perspectiveTeam);
      const resultClass =
        result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
      return `
        <div class="h2h-match-item result-${resultClass}">
          <span class="standings-match-result ${resultClass}">${result}</span>
          <span class="h2h-match-body">${when} ${teamLabel(m.home)} ${score} ${teamLabel(m.away)}</span>
        </div>`;
    })
    .join("");
  return `<div class="detail-row detail-row--stack"><span class="label">历史交锋<span class="h2h-perspective">（${teamLabel(perspectiveTeam)}）</span></span><span class="value h2h-list">${rows}</span></div>`;
}

function historyTeamBlockLoadingHtml(team, metaMatch = null) {
  return `
    <div class="history-team-block">
      <div class="history-team-header">
        ${flagHtml(team, 28, metaMatch)}
        <div class="history-team-info">
          <div class="history-team-name">${teamLabel(team)}</div>
          <div class="history-team-meta">正在加载近期战绩…</div>
        </div>
      </div>
      <div class="loading loading--inline"><div class="spinner"></div><span>检索比赛记录</span></div>
    </div>`;
}

async function openMatchDetail(match) {
  els.subTitle.textContent = "比赛详情";
  els.subContent.innerHTML = `
    <div class="detail-card">
      <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
      ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      ${match.finished ? `<div class="detail-row"><span class="label">比分</span><span class="value">${formatMatchupHtml(match)}</span></div>` : ""}
      ${match.odds ? `<div class="detail-row"><span class="label">胜平负</span><span class="value">${formatOddsShort(match.odds)}</span></div>` : ""}
      ${match.hhad?.line ? `<div class="detail-row"><span class="label">让球(${match.hhad.line})</span><span class="value">胜 ${match.hhad.h} / 平 ${match.hhad.d} / 负 ${match.hhad.a}</span></div>` : ""}
      ${match.homeRank != null || match.awayRank != null ? `<div class="detail-row"><span class="label">联赛排名</span><span class="value">${teamLabel(match.home)} ${formatRank(match.homeRank, match.rankLeague) || "—"} · ${teamLabel(match.away)} ${formatRank(match.awayRank, match.rankLeague) || "—"}</span></div>` : ""}
    </div>
    ${historyTeamBlockLoadingHtml(match.home, match)}
    ${historyTeamBlockLoadingHtml(match.away, match)}
  `;
  showSubPage();
  scheduleTeamNameMarquee(els.subContent);

  try {
    const localHome = getTeamMatches(state.allMatches, match.home).filter((m) => m.id !== match.id);
    const localAway = getTeamMatches(state.allMatches, match.away).filter((m) => m.id !== match.id);
    const histories = await fetchTeamHistories(match.id);
    const homeMatches = getTeamHistoryList(histories, "home", localHome, match.home, match.id);
    const awayMatches = getTeamHistoryList(histories, "away", localAway, match.away, match.id);
    const h2hMatches = getH2hList(histories);

    els.subContent.innerHTML = `
      <div class="detail-card">
        <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
        ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
        ${match.finished ? `<div class="detail-row"><span class="label">比分</span><span class="value">${formatMatchupHtml(match)}</span></div>` : ""}
        ${match.odds ? `<div class="detail-row"><span class="label">胜平负</span><span class="value">${formatOddsShort(match.odds)}</span></div>` : ""}
        ${match.hhad?.line ? `<div class="detail-row"><span class="label">让球(${match.hhad.line})</span><span class="value">胜 ${match.hhad.h} / 平 ${match.hhad.d} / 负 ${match.hhad.a}</span></div>` : ""}
        ${match.homeRank != null || match.awayRank != null ? `<div class="detail-row"><span class="label">联赛排名</span><span class="value">${teamLabel(match.home)} ${formatRank(match.homeRank, match.rankLeague) || "—"} · ${teamLabel(match.away)} ${formatRank(match.awayRank, match.rankLeague) || "—"}</span></div>` : ""}
        ${h2hBlockHtml(h2hMatches, match.home)}
      </div>
      ${historyTeamBlockHtml(match.home, homeMatches, match)}
      ${historyTeamBlockHtml(match.away, awayMatches, match)}
    `;
    scheduleTeamNameMarquee(els.subContent);
  } catch (err) {
    const localHome = getTeamMatches(state.allMatches, match.home)
      .filter((m) => m.id !== match.id)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 10);
    const localAway = getTeamMatches(state.allMatches, match.away)
      .filter((m) => m.id !== match.id)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 10);
    els.subContent.innerHTML = `
      <div class="detail-card">
        <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
        ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      </div>
      ${historyTeamBlockHtml(match.home, localHome, match)}
      ${historyTeamBlockHtml(match.away, localAway, match)}
      <p class="detail-note">远程战绩加载失败，已显示本地缓存数据。</p>
    `;
    console.error(err);
  }
}

function getTodayStandingsGroups() {
  if (state.standingsGroups?.length) return state.standingsGroups;
  const groups = computeAllStandings(state.allMatches, state.matches);
  const todayGroups = new Set(state.matches.map((m) => m.group).filter(Boolean));
  if (todayGroups.size === 0) return groups;
  const filtered = groups.filter((g) => todayGroups.has(g.group));
  return filtered.length ? filtered : groups;
}

function ensureStandingsLeagueTab(groups) {
  if (!groups.length) {
    state.standingsLeagueTab = null;
    return null;
  }
  if (!state.standingsLeagueTab || !groups.some((g) => g.group === state.standingsLeagueTab)) {
    state.standingsLeagueTab = groups[0].group;
  }
  return groups.find((g) => g.group === state.standingsLeagueTab) || groups[0];
}

function renderStandingsSubTabs(groups, activeGroup) {
  if (groups.length <= 1) return "";
  return `
    <div class="standings-subtabs filter-bar">
      ${groups
        .map(
          (g) =>
            `<button class="chip ${g.group === activeGroup ? "active" : ""}" data-league="${g.group}" type="button">${g.groupLabel || g.group}</button>`
        )
        .join("")}
    </div>
  `;
}

function bindStandingsSubTabs(container) {
  container.querySelectorAll(".standings-subtabs .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const league = chip.dataset.league;
      if (!league || league === state.standingsLeagueTab) return;
      state.standingsLeagueTab = league;
      state.standingsExpandedTeam = null;
      renderStandings();
    });
  });
}

function renderStandingsContent(groups) {
  if (!groups.length) {
    els.main.innerHTML = [
      `<div class="empty-state"><div class="icon">📊</div><p>暂无积分榜数据</p></div>`,
      dataSourceNote(),
    ].join("");
    return;
  }

  const activeGroup = ensureStandingsLeagueTab(groups);
  const showSubTabs = groups.length > 1;

  els.main.innerHTML = [
    showSubTabs ? renderStandingsSubTabs(groups, activeGroup.group) : "",
    standingsGroupHtml(activeGroup, { hideHeader: showSubTabs }),
    dataSourceNote(),
  ].join("");

  if (showSubTabs) bindStandingsSubTabs(els.main);
  bindStandingsRows(els.main);
  if (state.standingsExpandedTeam) {
    loadStandingsTeamMatches(state.standingsExpandedTeam, activeGroup.group);
  }
}

async function renderStandings() {
  if (!state.matches.length) {
    renderStandingsContent([]);
    return;
  }

  if (!state.standingsGroups && !state.standingsLoading) {
    state.standingsLoading = true;
    els.main.innerHTML = [
      `<div class="loading"><div class="spinner"></div><span>加载联赛积分榜…</span></div>`,
      dataSourceNote(),
    ].join("");

    try {
      const remoteGroups = await fetchStandingsForMatches(state.matches);
      if (remoteGroups.length) {
        state.standingsGroups = remoteGroups;
      }
    } catch (err) {
      console.error(err);
    } finally {
      state.standingsLoading = false;
    }
  }

  renderStandingsContent(getTodayStandingsGroups());
}

function renderPredictions() {
  const matches = sortMatchesByTime(state.matches.filter((m) => !m.finished));
  els.main.innerHTML = [
    `<p class="predictions-intro">打开场次后自动检索 Forebet / PredictZ / Tips.GG 等机构与网红预测，并附带伤停位置统计。</p>`,
    matches.length
      ? matches.map((m) => predictionCardHtml(m)).join("")
      : `<div class="empty-state"><div class="icon">🔮</div><p>当前暂无待预测场次</p></div>`,
    `<p class="predictions-disclaimer">⚠️ 外部预测仅供参考，不构成投注建议。请理性看球，未成年人不得购彩。</p>`,
    dataSourceNote(),
  ].join("");

  bindMatchCards(els.main, openPredictionDetail);
  scheduleTeamNameMarquee(els.main);
}

function predictionCardHtml(m) {
  const cached = state.predictionCache.get(m.id);
  const pick = cached?.consensus?.pick || cached?.summary?.pick;
  const injuryNote = injuryBadgeText(cached?.injury);
  const badge = pick
    ? `<span class="prediction-badge prediction-badge--${outcomeClass(pick.key)}">机构倾向 ${pick.short}${pick.prob != null ? ` ${Math.round(pick.prob * 100)}%` : ""}</span>`
    : `<span class="prediction-badge prediction-badge--pending">检索预测</span>`;
  const injuryBadge = injuryNote
    ? `<span class="prediction-badge prediction-badge--injury">${injuryNote}</span>`
    : "";

  return `
    <article class="match-card prediction-card" data-match-id="${m.id}">
      ${matchCardHtml(m, { asInner: true, hideMeta: true, showRank: true })}
      <div class="prediction-card-footer">${badge}${injuryBadge}</div>
    </article>`;
}

function formResultClass(result) {
  if (result === "胜") return "win";
  if (result === "负") return "loss";
  if (result === "平") return "draw";
  return "pending";
}

function formStatText(matches, team) {
  let w = 0;
  let d = 0;
  let l = 0;
  let homeN = 0;
  let awayN = 0;
  for (const m of matches || []) {
    const result = teamResultLabel(m, team);
    if (result === "胜") w += 1;
    else if (result === "平") d += 1;
    else if (result === "负") l += 1;
    const resolved = resolveTeamInMatch(m, team);
    if (resolved === m.home) homeN += 1;
    else if (resolved === m.away) awayN += 1;
  }
  return `${w}胜${d}平${l}负 · 主${homeN}客${awayN}`;
}

function formMatchTimeMs(match) {
  if (match?.utc) {
    const ms = new Date(match.utc).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const date = String(match?.date || match?.beijingDateKey || "");
  const time = String(match?.time || match?.beijingTime || "00:00").slice(0, 5);
  if (!date) return 0;
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isNaN(ms) ? Date.parse(`${date}T00:00:00`) || 0 : ms;
}

/** 近 10 场横向色条：左侧最久，右侧最近；格内标注主/客 */
function predictionFormBarHtml(team, matches, { pending = false } = {}) {
  // 先取最近 10 场（时间新→旧），再按时间正序排成 左旧 → 右新
  const recent = (matches || [])
    .filter((m) => m.finished)
    .sort((a, b) => formMatchTimeMs(b) - formMatchTimeMs(a))
    .slice(0, 10);
  const ordered = [...recent].sort((a, b) => formMatchTimeMs(a) - formMatchTimeMs(b));
  const segs = ordered
    .map((m) => {
      const result = teamResultLabel(m, team);
      const cls = formResultClass(result);
      const resolved = resolveTeamInMatch(m, team);
      const venue = resolved === m.home ? "主" : resolved === m.away ? "客" : "—";
      const when = formatMatchWhen(m) || "";
      const tip = `${venue}场 ${result}${when ? ` · ${when}` : ""}`;
      return `<span class="form-seg form-seg--${cls}" title="${tip}">${venue}</span>`;
    })
    .join("");

  return `
    <div class="form-team-row">
      <div class="form-team-head">
        <span class="form-team-name">${teamLabel(team)}</span>
        <span class="form-team-stat">${pending ? "加载中…" : recent.length ? formStatText(recent, team) : "暂无赛果"}</span>
      </div>
      <div class="form-bar${pending ? " form-bar--pending" : ""}" aria-label="${teamLabel(team)}近10场主客赛况，左旧右新">
        ${
          pending
            ? `<span class="form-seg form-seg--pending">…</span>`.repeat(10)
            : segs || `<span class="form-bar-empty">暂无最近赛果</span>`
        }
      </div>
    </div>`;
}

function predictionFormCardHtml(match, form) {
  const pending = !form || form.pending;
  return `
    <div class="prediction-form-card">
      <div class="prediction-form-card-head">
        <div class="prediction-source-name">近期主客赛况</div>
        <div class="prediction-source-tag">近 10 场 · 左最久 / 右最近 · 绿胜 / 蓝平 / 红负</div>
      </div>
      ${predictionFormBarHtml(match.home, form?.home, { pending })}
      ${predictionFormBarHtml(match.away, form?.away, { pending })}
    </div>`;
}

async function loadPredictionForm(match) {
  const local = state.allMatches || [];
  const [home, away] = await Promise.all([
    fetchTeamRecentForm(match.home, { matchId: match.id, localMatches: local }),
    fetchTeamRecentForm(match.away, { matchId: match.id, localMatches: local }),
  ]);
  return {
    pending: false,
    home: (home || []).filter((m) => m.finished).slice(0, 10),
    away: (away || []).filter((m) => m.finished).slice(0, 10),
  };
}

async function openPredictionDetail(match) {
  els.subTitle.textContent = "预测分析";
  els.subContent.innerHTML = `
    <div class="loading"><div class="spinner"></div><span>正在检索机构预测…</span></div>
  `;
  showSubPage();

  let form = state.predictionCache.get(match.id)?.form || { pending: true, home: [], away: [] };

  const render = (analysis) => {
    if (els.subTitle.textContent !== "预测分析") return;
    const merged = { ...analysis, form };
    els.subContent.innerHTML = predictionDetailHtml(match, merged);
    scheduleTeamNameMarquee(els.subContent);
  };

  const formPromise = form.pending
    ? loadPredictionForm(match)
        .then((data) => {
          form = data;
          const cached = state.predictionCache.get(match.id);
          if (cached) {
            const merged = { ...cached, form };
            state.predictionCache.set(match.id, merged);
            render(merged);
          }
        })
        .catch(() => {
          form = { pending: false, home: [], away: [] };
        })
    : Promise.resolve(form);

  try {
    let analysis = state.predictionCache.get(match.id);
    if (!analysis || analysis.schema !== ANALYSIS_SCHEMA || !analysis.complete) {
      state.predictionLoadingId = match.id;
      analysis = await fetchAndAnalyzeMatch(match, {
        onUpdate: (partial) => {
          const merged = { ...partial, form };
          state.predictionCache.set(match.id, merged);
          render(merged);
          if (state.tab === "predictions") renderPredictions();
        },
      });
      analysis = { ...analysis, form };
      state.predictionCache.set(match.id, analysis);
      state.predictionLoadingId = null;
      if (state.tab === "predictions") renderPredictions();
    }
    await formPromise;
    analysis = { ...analysis, form };
    state.predictionCache.set(match.id, analysis);
    render(analysis);
  } catch (err) {
    els.subContent.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>预测检索失败，请稍后重试</p></div>`;
    console.error(err);
  }
}

function predictionDetailHtml(match, analysis) {
  const consensus = analysis.consensus || analysis.summary || {};
  const pick = consensus.pick;

  return `
    <div class="detail-card prediction-summary-card">
      <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
      ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      ${
        pick
          ? `<div class="prediction-verdict">
              <div class="prediction-verdict-label">机构多数倾向</div>
              <div class="prediction-verdict-value prediction-verdict-value--${outcomeClass(pick.key)}">${pick.label}</div>
              <div class="prediction-verdict-meta">${consensus.tagline || consensus.confidence || "全网聚合"}</div>
            </div>
            ${probBarHtml(consensus.probs)}
            ${
              consensus.bullets?.length
                ? `<ul class="prediction-bullets">${consensus.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
                : ""
            }`
          : `<p class="prediction-empty-note">未形成明确多数倾向，请查看下方各机构摘要。</p>`
      }
    </div>

    ${predictionFormCardHtml(match, analysis.form)}

    <div class="prediction-section-title">各家观点摘要</div>
    ${webSourcesHtml(analysis.sources || [])}

    ${injuryReportHtml(analysis.injury, match, { pending: !!analysis.injuryPending })}

    <p class="predictions-disclaimer">预测为公开网页检索后的机构观点摘要，伤停仅统计缺阵位置与人数。内容仅供参考，请理性看球。</p>
  `;
}

function standingsMatchItemHtml(match, team) {
  const roundLabel = match.leagueShort || match.group || match.round;
  const result = teamResultLabel(match, team);
  const resultClass =
    result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
  const when = formatMatchWhen(match);
  const body = match.finished
    ? `${teamLabel(match.home)} ${formatHistoryScoreText(match) || `${match.homeScore}:${match.awayScore}`} ${teamLabel(match.away)}`
    : `${teamLabel(match.home)} vs ${teamLabel(match.away)}（未赛）`;

  return `
    <div class="standings-match-item result-${resultClass}">
      <div class="standings-match-meta">
        <span class="standings-match-round">${roundLabel}</span>
        ${when ? `<span class="history-match-when">${when}</span>` : ""}
        <span class="standings-match-result ${resultClass}">${result}</span>
      </div>
      <div class="standings-match-body">${body}</div>
    </div>`;
}

function standingsTeamMatchesHtml(team) {
  if (state.standingsTeamLoading === team) {
    return `<div class="loading loading--inline"><div class="spinner"></div><span>加载对局记录…</span></div>`;
  }

  const cached = state.standingsTeamMatches.get(team);
  const matches = cached || collectLocalTeamMatches(state.allMatches, team);
  if (!matches.length) {
    return '<p class="standings-matches-empty">暂无比赛记录</p>';
  }
  return `<div class="standings-matches-list">${matches.map((m) => standingsMatchItemHtml(m, team)).join("")}</div>`;
}

function findStandingsMatchMeta(group, team) {
  const pools = [state.matches, state.allMatches];
  for (const list of pools) {
    const hit = (list || []).find((m) => {
      if (group && m.group && m.group !== group) return false;
      const resolved = resolveTeamInMatch(m, team);
      return resolved === m.home || resolved === m.away;
    });
    if (hit) return hit;
  }
  return null;
}

function findStandingsAnchorMatchId(group) {
  const groupData = (state.standingsGroups || []).find((g) => g.group === group);
  if (groupData?.anchorMatchId) return groupData.anchorMatchId;
  const sample = (state.matches || []).find((m) => m.group === group);
  return sample?.id ?? null;
}

async function loadStandingsTeamMatches(team, group) {
  if (!team || state.standingsTeamMatches.has(team) || state.standingsTeamLoading === team) return;

  state.standingsTeamLoading = team;
  renderStandingsContent(getTodayStandingsGroups());

  try {
    const metaMatch = findStandingsMatchMeta(group, team);
    const matches = await fetchTeamRecentForm(team, {
      matchId: metaMatch?.id ?? null,
      bridgeMatchId: findStandingsAnchorMatchId(group),
      localMatches: state.allMatches,
    });
    state.standingsTeamMatches.set(team, matches || []);
  } catch (err) {
    console.error(err);
    if (!state.standingsTeamMatches.has(team)) {
      state.standingsTeamMatches.set(team, collectLocalTeamMatches(state.allMatches, team));
    }
  } finally {
    if (state.standingsTeamLoading === team) state.standingsTeamLoading = null;
    if (state.tab === "standings" && state.standingsExpandedTeam === team) {
      renderStandingsContent(getTodayStandingsGroups());
    }
  }
}

function bindStandingsRows(container) {
  container.querySelectorAll(".standings-team-row").forEach((row) => {
    row.addEventListener("click", () => {
      const team = row.dataset.team;
      if (!team) return;
      state.standingsExpandedTeam = state.standingsExpandedTeam === team ? null : team;
      renderStandingsContent(getTodayStandingsGroups());
    });
  });
}

function standingsGroupHtml({ group, groupLabel, mode, rows }, opts = {}) {
  const isOfficial = mode === "official";
  const isLeague = mode === "league";
  const header = opts.hideHeader
    ? `<div class="group-header group-header--compact">${isOfficial ? "官方排名" : isLeague ? "官方积分榜" : "赛果统计"}</div>`
    : `<div class="group-header">${groupLabel || group}${isOfficial ? " · 官方排名" : isLeague ? " · 官方积分榜" : ""}</div>`;
  return `
    <div class="group-card">
      ${header}
      <table class="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>球队</th>
            ${isOfficial ? "<th>排名</th>" : "<th>赛</th><th>胜</th><th>平</th><th>负</th><th>进</th><th>失</th><th>净</th><th>分</th>"}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const expanded = state.standingsExpandedTeam === r.team;
              const rankCell = isOfficial
                ? `<td>${r.rankLabel || r.rank || "—"}</td>`
                : `<td>${r.mp}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? "+" + r.gd : r.gd}</td><td>${r.pts}</td>`;
              const colspan = isOfficial ? 3 : 10;
              const metaMatch = findStandingsMatchMeta(group, r.team);
              return `
            <tr class="standings-team-row${expanded ? " expanded" : ""}" data-team="${r.team}" aria-expanded="${expanded}">
              <td class="rank">${isOfficial ? r.rank : r.rank ?? i + 1}</td>
              <td>
                <div class="team-cell">
                  ${flagHtml(r.team, 20, metaMatch)}
                  <span class="team-cell-name">${teamLabel(r.team)}</span>
                  <span class="standings-expand-icon" aria-hidden="true"></span>
                </div>
              </td>
              ${rankCell}
            </tr>
            <tr class="standings-detail-row${expanded ? "" : " hidden"}" data-team="${r.team}">
              <td colspan="${colspan}">
                <div class="standings-matches-panel">
                  <div class="standings-matches-title">对局记录</div>
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

function teamLeagueMeta(team) {
  const match = state.matches.find((m) => m.home === team || m.away === team);
  if (!match) return null;
  const rank = match.home === team ? match.homeRank : match.awayRank;
  const rankText = formatRank(rank, match.rankLeague || match.leagueShort);
  return rankText ? `${match.leagueShort || match.group} · ${rankText}` : match.leagueShort || match.group;
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
  const dateInfo = state.businessDate ? `销售日 ${state.businessDate}` : "";
  const updateInfo = state.updatedAt ? `更新 ${state.updatedAt.replace("T", " ").replace("+08:00", "")}` : "";
  return `
    <p class="data-source">数据来源：中国体彩 · ${state.sourceLabel}${dateInfo ? ` · ${dateInfo}` : ""}${updateInfo ? ` · ${updateInfo}` : ""} · ${formatNextUpdateLabel()}</p>
    <button class="refresh-btn" type="button" id="refresh-btn">立即检索</button>
  `;
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2000);
}
