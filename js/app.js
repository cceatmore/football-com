import {
  getBundledLotteryData,
  fetchLatestLotteryData,
  startAutoDataRefresh,
  filterByDays,
  filterPastDays,
  sortMatchesByTime,
  getFinishedLotteryMatches,
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
  stakesReportHtml,
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
  buildTeamRankLookup,
  getOpponentRankInfo,
  buildCommonOpponentsAnalysis,
  COMMON_OPPONENT_MATCH_LIMIT,
} from "./matchHistory.js";
import { fetchStandingsForMatches, fetchLeagueStandingsByMatch, clearLeagueStandingsCache } from "./leagueStandings.js";

const state = {
  tab: "schedule",
  dayFilter: "all",
  historyDayFilter: "7",
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
  history: { title: "历史赛况", sub: "体彩开盘对局 · 赛果开奖" },
  standings: { title: "联赛积分", sub: "官方排名 / 赛果统计" },
  predictions: { title: "预测分析", sub: "全网机构预测 · 仅供参考" },
};

const DAY_FILTERS = [
  { id: "all", label: "全部" },
  { id: "1", label: "1 天" },
  { id: "2", label: "2 天" },
  { id: "3", label: "3 天" },
];

const HISTORY_DAY_FILTERS = [
  { id: "3", label: "3 天" },
  { id: "7", label: "7 天" },
  { id: "15", label: "15 天" },
  { id: "30", label: "30 天" },
  { id: "all", label: "全部" },
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
      if (state.tab === "schedule" || state.tab === "history") setupTeamNameMarquee(els.main);
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
  else if (state.tab === "history") renderHistory();
  else if (state.tab === "standings") renderStandings();
  else renderPredictions();
}

function renderFilterBar(current, filters = DAY_FILTERS) {
  return `
    <div class="filter-bar">
      ${filters
        .map(
          (f) =>
            `<button class="chip ${current === f.id ? "active" : ""}" data-days="${f.id}" type="button">${f.label}</button>`
        )
        .join("")}
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

function historyOutcomeMeta(match) {
  if (!match?.finished || match.homeScore == null || match.awayScore == null) {
    return { label: "待定", cls: "pending" };
  }
  if (match.homeScore > match.awayScore) return { label: "主胜", cls: "win" };
  if (match.homeScore < match.awayScore) return { label: "主负", cls: "loss" };
  return { label: "平局", cls: "draw" };
}

function historyMatchCardHtml(m) {
  const outcome = historyOutcomeMeta(m);
  const roundLabel = m.leagueShort || m.round || m.group;
  return `
    <article class="match-card finished history-result-card" data-match-id="${m.id}">
      <div class="match-card-line">
        <span class="group-badge" style="background:#${m.leagueColor || "64748b"}">${roundLabel}</span>
        ${teamInline(m.home, m.homeScore, "home", m, false)}
        <span class="match-vs">VS</span>
        ${teamInline(m.away, m.awayScore, "away", m, false)}
        <span class="match-time">${m.beijingTime || "—"}</span>
      </div>
      <div class="match-meta history-result-meta">
        ${m.num ? `<span class="match-num">${m.num}</span>` : ""}
        <span class="history-outcome history-outcome--${outcome.cls}">${outcome.label}</span>
        <span class="history-score-text">${m.homeScore}:${m.awayScore}</span>
        ${m.odds ? `<span class="match-odds">${formatOddsShort(m.odds)}</span>` : ""}
      </div>
    </article>`;
}

function renderHistory() {
  const finished = getFinishedLotteryMatches(state.allMatches, state.history);
  const filtered = filterPastDays(finished, state.historyDayFilter);
  // 日期分组保持新→旧：先按日期 key 倒序
  const groups = groupMatchesByDate(filtered).sort((a, b) => {
    const ka = a.items[0]?.beijingDateKey || a.items[0]?.date || "";
    const kb = b.items[0]?.beijingDateKey || b.items[0]?.date || "";
    return String(kb).localeCompare(String(ka));
  });

  const html = [
    `<div class="schedule-toolbar">
      ${renderFilterBar(state.historyDayFilter, HISTORY_DAY_FILTERS)}
      <p class="history-toolbar-note">中国体彩竞彩开盘场次 · 已完赛 ${filtered.length} 场</p>
    </div>`,
    filtered.length
      ? groups
          .map(
            ({ label, items }) => `
        <div class="section-label">${label}<span class="section-count">${items.length} 场</span></div>
        ${items
          .slice()
          .sort((a, b) => {
            const ta = a.utc ? new Date(a.utc).getTime() : 0;
            const tb = b.utc ? new Date(b.utc).getTime() : 0;
            return tb - ta;
          })
          .map((m) => historyMatchCardHtml(m))
          .join("")}`
          )
          .join("")
      : `<div class="empty-state"><div class="icon">📋</div><p>当前范围暂无体彩赛果</p><p class="detail-note">将展示竞彩开盘并对阵已完赛的场次</p></div>`,
    dataSourceNote(),
  ].join("");

  els.main.innerHTML = html;
  bindFilterBar(els.main, "historyDayFilter");
  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);
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

function historyMatchBodyText(match, team, rankLookup = null) {
  const resolved = resolveTeamInMatch(match, team);
  const oppInfo = getOpponentRankInfo(match, team, rankLookup);
  const opponent =
    oppInfo.opponent ||
    (resolved === match.home ? match.away : resolved === match.away ? match.home : match.away);
  const league = match.leagueShort || match.group || "";
  // 对手名后附短排名，和左侧 #N 徽章形成对照
  const oppLabel =
    oppInfo.rank != null
      ? `${teamLabel(opponent)}<span class="history-opp-rank">第${oppInfo.rank}</span>`
      : teamLabel(opponent);

  if (match.finished) {
    const score = formatHistoryScoreText(match);
    const homeIsSelf = resolved === match.home;
    const awayIsSelf = resolved === match.away;
    if (!homeIsSelf && !awayIsSelf) {
      return `${teamLabel(match.home)} ${score} ${teamLabel(match.away)}${league ? ` · ${league}` : ""}`;
    }
    const homePart = homeIsSelf ? teamLabel(match.home) : oppLabel;
    const awayPart = awayIsSelf ? teamLabel(match.away) : oppLabel;
    return `${homePart} ${score} ${awayPart}${league ? ` · ${league}` : ""}`;
  }
  return `vs ${oppLabel}（未赛）${league ? ` · ${league}` : ""}`;
}

function historyMatchItemHtml(match, team, rankLookup = null) {
  const result = teamResultLabel(match, team);
  const resultClass =
    result === "胜" ? "win" : result === "负" ? "loss" : result === "平" ? "draw" : "pending";
  const when = formatMatchWhen(match);
  const body = historyMatchBodyText(match, team, rankLookup);
  const oppInfo = getOpponentRankInfo(match, team, rankLookup);
  const leagueHint = oppInfo.league || match.leagueShort || match.group || "";
  const rankBadge =
    oppInfo.rank != null
      ? `<span class="history-opp-rank-badge" title="对手排名${leagueHint ? ` · ${leagueHint}` : ""}">#${oppInfo.rank}</span>`
      : `<span class="history-opp-rank-badge history-opp-rank-badge--empty" title="暂无对手排名">#—</span>`;

  return `
    <div class="history-match-item history-match-item--compact result-${resultClass}">
      <span class="standings-match-result ${resultClass}">${result}</span>
      ${rankBadge}
      ${when ? `<span class="history-match-when">${when}</span>` : ""}
      <span class="history-match-body">${body}</span>
    </div>`;
}

function historyTeamBlockHtml(team, matches, metaMatch = null, rankLookup = null) {
  const meta = teamLeagueMeta(team) || (metaMatch ? `${metaMatch.leagueShort || metaMatch.group}` : null);
  const displayMatch = findTeamMatchMeta(metaMatch, team) || matches[0] || metaMatch;

  return `
    <div class="history-team-block">
      <div class="history-team-header">
        ${flagHtml(team, 28, displayMatch)}
        <div class="history-team-info">
          <div class="history-team-name">${teamLabel(team)}</div>
          <div class="history-team-meta">${meta || "近期战绩"} · 最近 ${matches.length} 场 · 含对手排名</div>
        </div>
      </div>
      ${
        matches.length
          ? `<div class="history-matches-list">${matches.map((m) => historyMatchItemHtml(m, team, rankLookup)).join("")}</div>`
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
    const [histories, standings] = await Promise.all([
      fetchTeamHistories(match.id),
      fetchLeagueStandingsByMatch(match.id).catch(() => null),
    ]);
    const homeMatches = getTeamHistoryList(histories, "home", localHome, match.home, match.id);
    const awayMatches = getTeamHistoryList(histories, "away", localAway, match.away, match.id);
    const h2hMatches = getH2hList(histories);
    const rankLookup = buildTeamRankLookup(
      standings?.rows || [],
      state.allMatches,
      standings?.leagueName || match.leagueShort || match.group || ""
    );

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
      ${historyTeamBlockHtml(match.home, homeMatches, match, rankLookup)}
      ${historyTeamBlockHtml(match.away, awayMatches, match, rankLookup)}
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
    const rankLookup = buildTeamRankLookup([], state.allMatches, match.leagueShort || match.group || "");
    els.subContent.innerHTML = `
      <div class="detail-card">
        <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
        ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      </div>
      ${historyTeamBlockHtml(match.home, localHome, match, rankLookup)}
      ${historyTeamBlockHtml(match.away, localAway, match, rankLookup)}
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
    `<p class="predictions-intro">打开场次后先给出市场倾向与赛果影响（晋级/保级等），再补充 Forebet / PredictZ 等机构摘要与伤停。</p>`,
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
  const fromOdds = cached?.sources?.length && cached.sources.every((s) => s.local);
  const badge = pick
    ? `<span class="prediction-badge prediction-badge--${outcomeClass(pick.key)}">${fromOdds ? "市场倾向" : "倾向"} ${pick.short}${pick.prob != null ? ` ${Math.round(pick.prob * 100)}%` : ""}</span>`
    : `<span class="prediction-badge prediction-badge--pending">查看分析</span>`;
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

function teamGoalsStats(matches, team) {
  const rows = [];
  for (const m of matches || []) {
    if (!m?.finished || m.homeScore == null || m.awayScore == null) continue;
    const resolved = resolveTeamInMatch(m, team);
    if (!resolved) continue;
    const isHome = resolved === m.home;
    const gf = isHome ? Number(m.homeScore) : Number(m.awayScore);
    const ga = isHome ? Number(m.awayScore) : Number(m.homeScore);
    if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;
    rows.push({
      gf,
      ga,
      total: Number(m.homeScore) + Number(m.awayScore),
      margin: Math.abs(Number(m.homeScore) - Number(m.awayScore)),
      btts: Number(m.homeScore) > 0 && Number(m.awayScore) > 0,
    });
  }
  const n = rows.length;
  if (!n) return null;
  const sum = (fn) => rows.reduce((a, r) => a + fn(r), 0);
  return {
    n,
    avgFor: sum((r) => r.gf) / n,
    avgAgainst: sum((r) => r.ga) / n,
    avgTotal: sum((r) => r.total) / n,
    over25Rate: sum((r) => (r.total >= 3 ? 1 : 0)) / n,
    bigScoreRate: sum((r) => (r.total >= 4 ? 1 : 0)) / n,
    blowoutRate: sum((r) => (r.margin >= 2 ? 1 : 0)) / n,
    bttsRate: sum((r) => (r.btts ? 1 : 0)) / n,
  };
}

function blendRate(formRate, webRate, formWeight = 0.6) {
  if (formRate == null && webRate == null) return null;
  if (formRate == null) return webRate;
  if (webRate == null) return formRate;
  return formRate * formWeight + webRate * (1 - formWeight);
}

function buildScoreOutlook(match, form, webGoals = null) {
  if (!form || form.pending) return { pending: true };
  const home = teamGoalsStats(form.home, match.home);
  const away = teamGoalsStats(form.away, match.away);
  if (!home && !away && !webGoals) return null;

  const avg = (a, b) => {
    if (a == null) return b;
    if (b == null) return a;
    return (a + b) / 2;
  };

  const expected =
    webGoals?.avgGoals != null
      ? webGoals.avgGoals * 0.45 + avg(home?.avgTotal, away?.avgTotal) * 0.55
      : avg(home?.avgTotal, away?.avgTotal);

  const over25 = blendRate(avg(home?.over25Rate, away?.over25Rate), webGoals?.over25);
  const bigScore = blendRate(avg(home?.bigScoreRate, away?.bigScoreRate), webGoals?.over35);
  const btts = blendRate(avg(home?.bttsRate, away?.bttsRate), webGoals?.btts);
  const blowout = avg(home?.blowoutRate, away?.blowoutRate);

  let lean = "进球走势一般";
  if ((bigScore != null && bigScore >= 0.42) || (expected != null && expected >= 3.3)) lean = "偏大比分";
  else if ((over25 != null && over25 >= 0.58) || (expected != null && expected >= 2.7)) lean = "偏大球";
  else if ((over25 != null && over25 <= 0.42) || (expected != null && expected <= 2.2)) lean = "偏小球";

  return {
    pending: false,
    lean,
    expected,
    over25,
    bigScore,
    btts,
    blowout,
    home,
    away,
  };
}

function scoreProbRowHtml(label, value, tone = "goals") {
  if (value == null) return "";
  const pctVal = Math.round(value * 100);
  return `
    <div class="prob-row">
      <span class="prob-label prob-label--wide">${label}</span>
      <div class="prob-track"><div class="prob-fill prob-fill--${tone}" style="width:${pctVal}%"></div></div>
      <span class="prob-val">${pctVal}%</span>
    </div>`;
}

function predictionScoreCardHtml(match, outlook) {
  if (!outlook) return "";
  if (outlook.pending) {
    return `
      <div class="prediction-score-card">
        <div class="prediction-form-card-head">
          <div class="prediction-source-name">大比分 / 进球倾向</div>
          <div class="prediction-source-tag">正在根据近况估算…</div>
        </div>
      </div>`;
  }

  const homeLine = outlook.home
    ? `${teamLabel(match.home)}场均进 ${outlook.home.avgFor.toFixed(1)} / 失 ${outlook.home.avgAgainst.toFixed(1)}`
    : "";
  const awayLine = outlook.away
    ? `${teamLabel(match.away)}场均进 ${outlook.away.avgFor.toFixed(1)} / 失 ${outlook.away.avgAgainst.toFixed(1)}`
    : "";
  const expectedText =
    outlook.expected != null ? `预期总进球约 ${outlook.expected.toFixed(1)}` : "预期总进球暂缺";

  return `
    <div class="prediction-score-card">
      <div class="prediction-form-card-head">
        <div class="prediction-source-name">大比分 / 进球倾向</div>
        <div class="prediction-source-tag">近 10 场进球结构 + 机构大球观点</div>
      </div>
      <div class="score-outlook-banner">
        <span class="score-outlook-lean">${outlook.lean}</span>
        <span class="score-outlook-meta">${expectedText}</span>
      </div>
      <div class="prob-bars score-prob-bars">
        ${scoreProbRowHtml("大球≥3", outlook.over25, "over")}
        ${scoreProbRowHtml("大比分≥4", outlook.bigScore, "big")}
        ${scoreProbRowHtml("双方进球", outlook.btts, "btts")}
        ${scoreProbRowHtml("净胜2+", outlook.blowout, "blowout")}
      </div>
      <div class="score-outlook-note">
        ${[homeLine, awayLine].filter(Boolean).join(" · ") || "暂无足够进球赛果样本"}
      </div>
    </div>`;
}

async function loadPredictionForm(match) {
  const local = state.allMatches || [];
  const [home, away] = await Promise.all([
    fetchTeamRecentForm(match.home, {
      matchId: match.id,
      localMatches: local,
      limit: COMMON_OPPONENT_MATCH_LIMIT,
    }),
    fetchTeamRecentForm(match.away, {
      matchId: match.id,
      localMatches: local,
      limit: COMMON_OPPONENT_MATCH_LIMIT,
    }),
  ]);
  const homeAll = (home || []).filter((m) => m.finished);
  const awayAll = (away || []).filter((m) => m.finished);
  return {
    pending: false,
    home: homeAll.slice(0, 10),
    away: awayAll.slice(0, 10),
    commonOpponents: buildCommonOpponentsAnalysis(match.home, match.away, homeAll, awayAll),
  };
}

function commonOpponentsCardHtml(match, form) {
  const pending = !form || form.pending;
  const data = form?.commonOpponents;
  // 加载中或无共同对手时不占位显示
  if (pending || !data?.items?.length) return "";

  const items = data.items;
  const summary = data.summary;

  const leanClass =
    summary?.lean === "home" ? "win" : summary?.lean === "away" ? "loss" : "draw";
  const rows = items
    .map((it) => {
      const homeCls =
        it.home.result === "胜" ? "win" : it.home.result === "负" ? "loss" : "draw";
      const awayCls =
        it.away.result === "胜" ? "win" : it.away.result === "负" ? "loss" : "draw";
      const leanTag =
        it.lean === "home"
          ? `<span class="common-lean common-lean--home">${teamLabel(match.home)}更优</span>`
          : it.lean === "away"
            ? `<span class="common-lean common-lean--away">${teamLabel(match.away)}更优</span>`
            : `<span class="common-lean common-lean--even">相当</span>`;
      return `
        <div class="common-opp-row">
          <div class="common-opp-head">
            <span class="common-opp-name">共同对手：${teamLabel(it.opponent)}</span>
            ${leanTag}
          </div>
          <div class="common-opp-sides">
            <div class="common-opp-side">
              <span class="common-opp-team">${teamLabel(match.home)}</span>
              <span class="standings-match-result ${homeCls}">${it.home.result}</span>
              <span class="common-opp-line">${it.home.venue}场 ${it.home.score}${it.home.when ? ` · ${it.home.when}` : ""}</span>
            </div>
            <div class="common-opp-side">
              <span class="common-opp-team">${teamLabel(match.away)}</span>
              <span class="standings-match-result ${awayCls}">${it.away.result}</span>
              <span class="common-opp-line">${it.away.venue}场 ${it.away.score}${it.away.when ? ` · ${it.away.when}` : ""}</span>
            </div>
          </div>
          <div class="common-opp-note">${it.note}</div>
        </div>`;
    })
    .join("");

  const moreNote =
    data.total > items.length
      ? `<p class="common-opp-more">另有 ${data.total - items.length} 个共同对手未展开</p>`
      : "";

  return `
    <div class="prediction-common-card">
      <div class="prediction-form-card-head">
        <div class="prediction-source-name">共同对手对比</div>
        <div class="prediction-source-tag">近 1 年 · 双方都交过手的同一对手</div>
      </div>
      <div class="common-opp-summary common-opp-summary--${leanClass}">${summary?.text || ""}</div>
      <div class="common-opp-list">${rows}</div>
      ${moreNote}
    </div>`;
}

async function openPredictionDetail(match) {
  els.subTitle.textContent = "预测分析";
  els.subContent.innerHTML = `
    <div class="loading"><div class="spinner"></div><span>正在生成倾向与赛果影响…</span></div>
  `;
  showSubPage();

  let form = state.predictionCache.get(match.id)?.form || { pending: true, home: [], away: [] };
  const needFormReload = !form || form.pending || !form.commonOpponents;

  const render = (analysis) => {
    if (els.subTitle.textContent !== "预测分析") return;
    const merged = { ...analysis, form };
    els.subContent.innerHTML = predictionDetailHtml(match, merged);
    scheduleTeamNameMarquee(els.subContent);
  };

  const formPromise = needFormReload
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
          form = {
            pending: false,
            home: [],
            away: [],
            commonOpponents: buildCommonOpponentsAnalysis(match.home, match.away, [], []),
          };
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
  const scoreOutlook = buildScoreOutlook(match, analysis.form, consensus.goals);
  const onlyOdds = (analysis.sources || []).length > 0 && (analysis.sources || []).every((s) => s.local);
  const verdictLabel = onlyOdds ? "市场赔率倾向" : "综合倾向";

  return `
    <div class="detail-card prediction-summary-card">
      <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
      ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      ${
        pick
          ? `<div class="prediction-verdict">
              <div class="prediction-verdict-label">${verdictLabel}</div>
              <div class="prediction-verdict-value prediction-verdict-value--${outcomeClass(pick.key)}">${pick.label}</div>
              <div class="prediction-verdict-meta">${consensus.tagline || consensus.confidence || "全网聚合"}</div>
            </div>
            ${probBarHtml(consensus.probs)}
            ${
              consensus.bullets?.length
                ? `<ul class="prediction-bullets">${consensus.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
                : ""
            }`
          : `<p class="prediction-empty-note">未形成明确倾向，请查看下方赛果影响与各家摘要。</p>`
      }
    </div>

    <div class="prediction-section-title">赛果影响 · 谁更能接受平局</div>
    ${stakesReportHtml(analysis.stakes, { pending: !!analysis.stakesPending })}

    ${predictionFormCardHtml(match, analysis.form)}
    ${commonOpponentsCardHtml(match, analysis.form)}
    ${predictionScoreCardHtml(match, scoreOutlook)}

    <div class="prediction-section-title">各家观点摘要</div>
    ${webSourcesHtml(analysis.sources || [])}

    ${injuryReportHtml(analysis.injury, match, { pending: !!analysis.injuryPending })}

    <p class="predictions-disclaimer">倾向综合市场赔率与公开机构摘要；赛果影响依据积分榜/杯赛属性启发式推算，仅供参考，不构成投注建议。</p>
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

const STANDINGS_RECENT_LIMIT = 5;

function standingsTeamMatchesHtml(team) {
  if (state.standingsTeamLoading === team) {
    return `<div class="loading loading--inline"><div class="spinner"></div><span>加载近 ${STANDINGS_RECENT_LIMIT} 场…</span></div>`;
  }

  const cached = state.standingsTeamMatches.get(team);
  const matches = (cached || collectLocalTeamMatches(state.allMatches, team, STANDINGS_RECENT_LIMIT)).slice(
    0,
    STANDINGS_RECENT_LIMIT
  );
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
      limit: STANDINGS_RECENT_LIMIT,
    });
    state.standingsTeamMatches.set(team, (matches || []).slice(0, STANDINGS_RECENT_LIMIT));
  } catch (err) {
    console.error(err);
    if (!state.standingsTeamMatches.has(team)) {
      state.standingsTeamMatches.set(
        team,
        collectLocalTeamMatches(state.allMatches, team, STANDINGS_RECENT_LIMIT)
      );
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
                  <div class="standings-matches-title">近 ${STANDINGS_RECENT_LIMIT} 场</div>
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
