import {
  getBundledLotteryData,
  fetchLatestLotteryData,
  startAutoDataRefresh,
  filterByDays,
  sortMatchesByTime,
  getFinishedLotteryMatches,
  getTeamMatches,
  formatMatchupHtml,
  formatDateSectionLabel,
  formatOddsShort,
  formatNextUpdateLabel,
  beijingDateKey,
} from "./data.js";
import { computeAllStandings, getTeamGroupRank } from "./standings.js";
import { leagueBadgeHtml, teamLabel, isRealTeam, formatRank, flagHtml } from "./teams.js";
import {
  fetchAndAnalyzeMatch,
  fetchInjuryAnalysis,
  clearPredictionCache,
  ANALYSIS_SCHEMA,
  buildMatchStakes,
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
  findLocalBridgeMatchId,
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
import {
  renderMatchHistoryBundleImage,
  buildPredictionsWorkbook,
  gradeImportedWorkbook,
  packExportZip,
  downloadBlob,
  matchFolderName,
  dateFolderName,
  stamp,
  loadDeps,
} from "./exportBundle.js";

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
  exportBusy: false,
  resultsLiveTimer: null,
  resultsDidScrollToday: false,
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
  results: { title: "赛果速览", sub: "完赛 · 进行中 · 未开赛" },
  standings: { title: "联赛积分", sub: "官方排名 / 赛果统计" },
  export: { title: "内容导出", sub: "竖屏战绩图 · 预测表 · 赛后核对" },
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
    const next = btn.dataset.tab;
    if (next !== "results") {
      state.resultsDidScrollToday = false;
      stopResultsLiveRefresh();
    }
    state.tab = next;
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
      if (state.tab === "schedule" || state.tab === "results") setupTeamNameMarquee(els.main);
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
  if (state.tab === "schedule") {
    stopResultsLiveRefresh();
    renderSchedule();
  } else if (state.tab === "results") {
    renderResults();
    startResultsLiveRefresh();
  } else if (state.tab === "standings") {
    stopResultsLiveRefresh();
    renderStandings();
  } else if (state.tab === "export") {
    stopResultsLiveRefresh();
    renderExport();
  } else {
    stopResultsLiveRefresh();
    renderPredictions();
  }
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

function matchKickoffMs(match) {
  if (match?.utc) {
    const ms = new Date(match.utc).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const date = String(match?.beijingDateKey || match?.date || "");
  const time = String(match?.time || match?.beijingTime || "00:00").slice(0, 5);
  if (!date) return NaN;
  const ms = Date.parse(`${date}T${time}:00+08:00`);
  return Number.isNaN(ms) ? Date.parse(`${date}T00:00:00+08:00`) : ms;
}

/** history | live | finished | upcoming */
function classifyResultsPhase(match, now = new Date(), todayKey = beijingDateKey(now)) {
  const dateKey = String(match?.beijingDateKey || match?.date || "");
  if (match?.finished) {
    return dateKey && dateKey < todayKey ? "history" : "finished";
  }
  const kick = matchKickoffMs(match);
  if (Number.isFinite(kick) && kick <= now.getTime()) return "live";
  if (dateKey && dateKey > todayKey) return "upcoming";
  if (dateKey === todayKey) return "upcoming";
  // 日期已过但尚无赛果
  return "live";
}

function collectResultsPool() {
  const map = new Map();
  for (const m of [...(state.history || []), ...(state.allMatches || []), ...(state.matches || [])]) {
    if (m?.id == null) continue;
    const prev = map.get(m.id);
    if (!prev) {
      map.set(m.id, m);
      continue;
    }
    // 完赛记录优先保留比分；开售记录优先保留赔率
    map.set(
      m.id,
      prev.finished
        ? { ...m, ...prev, odds: m.odds ?? prev.odds, hhad: m.hhad ?? prev.hhad }
        : m.finished
          ? { ...prev, ...m, odds: prev.odds ?? m.odds, hhad: prev.hhad ?? m.hhad }
          : { ...prev, ...m }
    );
  }
  return [...map.values()];
}

function buildResultsTimeline(historyDays = 14) {
  const now = new Date();
  const todayKey = beijingDateKey(now);
  const pastStart = (() => {
    const d = new Date(now.getTime());
    // 用北京日期字符串回推
    const [y, mo, da] = todayKey.split("-").map(Number);
    const utc = new Date(Date.UTC(y, mo - 1, da));
    utc.setUTCDate(utc.getUTCDate() - historyDays);
    return utc.toISOString().slice(0, 10);
  })();

  const pool = collectResultsPool();
  const history = [];
  const today = [];
  const upcoming = [];

  for (const m of pool) {
    const dateKey = String(m.beijingDateKey || m.date || "");
    if (!dateKey) continue;
    if (dateKey === todayKey) {
      today.push(m);
      continue;
    }
    if (dateKey < todayKey) {
      if (dateKey >= pastStart) history.push(m);
      continue;
    }
    upcoming.push(m);
  }

  const byKickAsc = (a, b) => {
    const da = matchKickoffMs(a);
    const db = matchKickoffMs(b);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    return String(a.num || "").localeCompare(String(b.num || ""), "zh");
  };

  history.sort(byKickAsc);
  today.sort(byKickAsc);
  upcoming.sort(byKickAsc);

  const groupAsc = (list) => {
    const map = new Map();
    for (const m of list) {
      const key = m.beijingDateKey || m.date;
      if (!map.has(key)) map.set(key, { key, label: formatDateSectionLabel(key), items: [] });
      map.get(key).items.push(m);
    }
    return [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  };

  return {
    todayKey,
    historyGroups: groupAsc(history),
    todayMatches: today,
    upcomingGroups: groupAsc(upcoming),
    liveCount: today.filter((m) => classifyResultsPhase(m, now, todayKey) === "live").length,
    finishedToday: today.filter((m) => m.finished).length,
  };
}

function resultsMatchCardHtml(m, todayKey) {
  const phase = classifyResultsPhase(m, new Date(), todayKey);
  const roundLabel = m.leagueShort || m.round || m.group;
  const showScore = m.finished && m.homeScore != null && m.awayScore != null;
  const homeScore = showScore ? m.homeScore : null;
  const awayScore = showScore ? m.awayScore : null;
  const outcome = historyOutcomeMeta(m);

  let statusHtml = "";
  if (phase === "live") {
    statusHtml = `<span class="results-status results-status--live">进行中</span>`;
  } else if (showScore) {
    statusHtml = `<span class="history-outcome history-outcome--${outcome.cls}">${outcome.label}</span>
      <span class="history-score-text">${m.homeScore}:${m.awayScore}</span>`;
  } else {
    statusHtml = `<span class="results-status results-status--upcoming">未开赛</span>`;
  }

  const phaseClass =
    phase === "live" ? "results-card--live" : showScore ? "finished results-card--done" : "results-card--upcoming";

  return `
    <article class="match-card history-result-card ${phaseClass}" data-match-id="${m.id}">
      <div class="match-card-line">
        <span class="group-badge" style="background:#${m.leagueColor || "64748b"}">${roundLabel}</span>
        ${teamInline(m.home, homeScore, "home", m, false)}
        <span class="match-vs">VS</span>
        ${teamInline(m.away, awayScore, "away", m, false)}
        <span class="match-time">${m.beijingTime || "—"}</span>
      </div>
      <div class="match-meta history-result-meta">
        ${m.num ? `<span class="match-num">${m.num}</span>` : ""}
        ${statusHtml}
        ${m.odds ? `<span class="match-odds">${formatOddsShort(m.odds)}</span>` : ""}
      </div>
    </article>`;
}

function resultsSectionHtml(label, matches, todayKey, { id = "", extraClass = "" } = {}) {
  if (!matches?.length) return "";
  return `
    <section class="results-day ${extraClass}" ${id ? `id="${id}"` : ""}>
      <div class="section-label">${label}</div>
      ${matches.map((m) => resultsMatchCardHtml(m, todayKey)).join("")}
    </section>`;
}

function stopResultsLiveRefresh() {
  if (state.resultsLiveTimer) {
    clearInterval(state.resultsLiveTimer);
    state.resultsLiveTimer = null;
  }
}

function getResultsScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || els.main.scrollTop || 0;
}

function setResultsScrollTop(top) {
  window.scrollTo(0, top);
}

function startResultsLiveRefresh() {
  stopResultsLiveRefresh();
  state.resultsLiveTimer = setInterval(async () => {
    if (state.tab !== "results") {
      stopResultsLiveRefresh();
      return;
    }
    try {
      const data = await fetchLatestLotteryData();
      applyFetchedData(data);
      // applyFetchedData → render() 会走 renderResults，并保留滚动
    } catch {
      /* 静默失败，保留当前列表 */
    }
  }, 60_000);
}

function renderResults({ preserveScroll = null } = {}) {
  const keepScroll =
    preserveScroll != null ? preserveScroll : state.resultsDidScrollToday ? getResultsScrollTop() : null;

  const timeline = buildResultsTimeline(14);
  const todayLabel = formatDateSectionLabel(timeline.todayKey);
  const hasAny =
    timeline.historyGroups.length || timeline.todayMatches.length || timeline.upcomingGroups.length;

  const historyHtml = timeline.historyGroups
    .map((g) => resultsSectionHtml(g.label, g.items, timeline.todayKey))
    .join("");

  const todayHtml = timeline.todayMatches.length
    ? resultsSectionHtml(`${todayLabel} · 今天`, timeline.todayMatches, timeline.todayKey, {
        id: "results-today-anchor",
        extraClass: "results-day--today",
      })
    : `<section class="results-day results-day--today" id="results-today-anchor">
        <div class="section-label">${todayLabel} · 今天</div>
        <div class="results-empty-today">今日暂无竞彩场次</div>
      </section>`;

  const upcomingHtml = timeline.upcomingGroups
    .map((g) => resultsSectionHtml(g.label, g.items, timeline.todayKey))
    .join("");

  const liveHint =
    timeline.liveCount > 0
      ? `进行中 ${timeline.liveCount} 场`
      : timeline.finishedToday > 0
        ? `今日已完赛 ${timeline.finishedToday} 场`
        : "暂无进行中场次";

  els.main.innerHTML = `
    <div class="results-page">
      <div class="results-toolbar">
        <div class="results-toolbar-text">上滑看历史 · 下滑看未开赛</div>
        <div class="results-toolbar-live">${liveHint} · 约每分钟刷新</div>
      </div>
      ${
        hasAny
          ? `${historyHtml}${todayHtml}${upcomingHtml}`
          : `<div class="empty-state"><div class="icon">📭</div><p>暂无赛果数据</p><p class="detail-note">可点下方「立即检索」拉取最新开售与完赛</p></div>`
      }
      ${dataSourceNote()}
    </div>
  `;

  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);

  if (keepScroll != null) {
    requestAnimationFrame(() => setResultsScrollTop(keepScroll));
    return;
  }

  state.resultsDidScrollToday = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const anchor = document.getElementById("results-today-anchor");
      if (anchor) anchor.scrollIntoView({ block: "start", behavior: "auto" });
    });
  });
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

function purchasableMatches() {
  return sortMatchesByTime(state.matches.filter((m) => !m.finished));
}

function setExportStatus(text) {
  const el = document.getElementById("export-status");
  if (el) el.textContent = text || "";
}

function renderExport() {
  const matches = purchasableMatches();
  const groups = groupMatchesByDate(matches);
  const daySummary = groups
    .map((g) => `${g.label} ${g.items.length} 场`)
    .join(" · ");

  els.main.innerHTML = `
    <div class="export-page">
      <p class="export-intro">导出当前可购买场次的竖屏综合战绩图（交手历史 + 近10场 + 共同对手）与预测 Excel。可先改表内预测再导入；核对只认导入文件里的当前内容，猜对的胜负/比分标红。</p>
      <div class="export-stat-card">
        <div class="export-stat-value">${matches.length}</div>
        <div class="export-stat-label">可购买场次</div>
        <div class="export-stat-meta">${daySummary || "暂无在售场次"}</div>
      </div>

      <button class="action-btn export-btn" id="btn-export-bundle" type="button" ${state.exportBusy ? "disabled" : ""}>
        ${state.exportBusy ? "导出进行中…" : "导出内容（图片 + Excel）"}
      </button>
      <button class="action-btn export-btn export-btn--secondary" id="btn-import-excel" type="button" ${state.exportBusy ? "disabled" : ""}>
        导入 Excel 核对赛果
      </button>
      <input id="import-excel-input" type="file" accept=".xlsx,.xls" hidden />

      <p class="export-status" id="export-status"></p>
      <ul class="export-tips">
        <li>每场一张综合图：双方交手历史、双方近10场、共同对手对比（高度随内容）</li>
        <li>共同对手最多5个（先近1年，没有再近2年；仍没有则该段不画）</li>
        <li>同一天多场会按日期分子文件夹打包 ZIP</li>
        <li>Excel：胜负最多两项、半全场（胜胜/胜负等）、比分随大小球走势；可改内容后再导入</li>
        <li>导入时只按你表里当前的胜负/比分预测核对完赛结果，猜对标红（不依赖导出时的原值）</li>
      </ul>
      ${dataSourceNote()}
    </div>
  `;

  document.getElementById("btn-export-bundle")?.addEventListener("click", () => {
    runContentExport().catch((err) => {
      console.error(err);
      state.exportBusy = false;
      renderExport();
      showToast(err?.message || "导出失败");
    });
  });

  const fileInput = document.getElementById("import-excel-input");
  document.getElementById("btn-import-excel")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    runExcelImport(file).catch((err) => {
      console.error(err);
      state.exportBusy = false;
      renderExport();
      showToast(err?.message || "导入核对失败");
    });
  });
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const TWO_YEAR_MS = 2 * ONE_YEAR_MS;

/** 导出用共同对手：先近1年最多5个；没有再近2年；仍没有则不出图 */
function buildExportCommonOpponents(match, form) {
  const homeMatches = form.scoreHome || form.home || [];
  const awayMatches = form.scoreAway || form.away || [];
  const oneYear = buildCommonOpponentsAnalysis(match.home, match.away, homeMatches, awayMatches, {
    limit: 5,
    withinMs: ONE_YEAR_MS,
  });
  if (oneYear?.items?.length) {
    return { ...oneYear, windowLabel: "近1年" };
  }
  const twoYear = buildCommonOpponentsAnalysis(match.home, match.away, homeMatches, awayMatches, {
    limit: 5,
    withinMs: TWO_YEAR_MS,
  });
  if (twoYear?.items?.length) {
    return { ...twoYear, windowLabel: "近2年" };
  }
  return null;
}

async function collectMatchExportData(match, onProgress) {
  onProgress?.("拉取近况与共同对手…");
  const [form, injury] = await Promise.all([
    loadPredictionForm(match),
    fetchInjuryAnalysis(match).catch(() => null),
  ]);
  form.commonOpponents = buildExportCommonOpponents(match, form);

  // 批量导出优先用缓存机构观点；未缓存则用近况/伤停生成，避免逐场抓网页过慢
  let analysis = state.predictionCache.get(match.id);
  if (!analysis || analysis.schema !== ANALYSIS_SCHEMA) {
    analysis = {
      schema: ANALYSIS_SCHEMA,
      sources: [],
      consensus: { pick: null, bullets: [], goals: null },
      injury,
      stakes: buildMatchStakes(match, null),
    };
  } else {
    analysis = {
      ...analysis,
      injury: analysis.injury || injury,
      stakes: analysis.stakes || buildMatchStakes(match, null),
    };
  }
  analysis = { ...analysis, form };
  const scoreOutlook = buildScoreOutlook(match, form, analysis.consensus?.goals);

  onProgress?.("绘制竖屏综合战绩图…");
  const historyPng = await renderMatchHistoryBundleImage(match, {
    homeMatches: form.home,
    awayMatches: form.away,
    h2hMatches: form.h2h || [],
    commonOpponents: form.commonOpponents,
  });

  return {
    match,
    form,
    analysis,
    scoreOutlook,
    historyPng,
    excelRow: {
      num: match.num || String(match.id),
      league: match.leagueShort || match.league || "",
      matchup: `${match.home} VS ${match.away}`,
      analysis: buildExcelBriefAnalysis(match, form, analysis, scoreOutlook),
      outcome: buildExcelOutcomeLabel(analysis, scoreOutlook, match),
      half: buildExcelHalfFullLabel(match, form, scoreOutlook),
      scores: buildExcelScoreLabel(scoreOutlook),
      matchId: match.id != null ? String(match.id) : "",
    },
  };
}

async function runContentExport() {
  const matches = purchasableMatches();
  if (!matches.length) {
    showToast("当前没有可购买场次");
    return;
  }
  if (state.exportBusy) return;
  state.exportBusy = true;
  renderExport();

  try {
    setExportStatus("准备依赖库…");
    await loadDeps();

    const excelRows = [];
    const dayMap = new Map();

    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i];
      const label = match.num || `${match.home} VS ${match.away}`;
      setExportStatus(`处理 ${i + 1}/${matches.length}：${label}`);
      const packed = await collectMatchExportData(match, (step) => {
        setExportStatus(`处理 ${i + 1}/${matches.length}：${label} · ${step}`);
      });
      excelRows.push(packed.excelRow);

      const dayKey = dateFolderName(match);
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, { name: dayKey, matches: [] });
      dayMap.get(dayKey).matches.push({
        folder: matchFolderName(match),
        historyPng: packed.historyPng,
      });
    }

    setExportStatus("生成 Excel…");
    const excelBlob = await buildPredictionsWorkbook(excelRows);

    setExportStatus("打包 ZIP…");
    const dayFolders = [...dayMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    await packExportZip({
      dayFolders,
      excelBlob,
      zipName: `${stamp().slice(0, 8)}.zip`,
    });

    setExportStatus(`已导出 ${matches.length} 场（含图片与预测表）`);
    showToast("导出完成");
  } finally {
    state.exportBusy = false;
    const status = document.getElementById("export-status")?.textContent || "";
    renderExport();
    setExportStatus(status);
  }
}

async function runExcelImport(file) {
  if (state.exportBusy) return;
  state.exportBusy = true;
  renderExport();
  try {
    setExportStatus("补拉近期赛果…");
    await loadDeps();
    try {
      const data = await fetchLatestLotteryData();
      applyFetchedData(data);
    } catch {
      /* 沿用内存数据 */
    }

    let finished = getFinishedLotteryMatches(state.allMatches, state.history);
    if (!finished.length) {
      setExportStatus("当前没有已完赛数据，无法核对。请检查网络后点「立即检索」再试");
      showToast("无完赛数据，未能核对");
      return;
    }

    setExportStatus(`读取 Excel 并核对赛果（已完赛 ${finished.length} 场）…`);
    const result = await gradeImportedWorkbook(file, finished);
    downloadBlob(result.blob, `预测核对_${stamp()}.xlsx`);
    setExportStatus(
      `已按导入表内容核对 ${result.graded} 场：胜负命中 ${result.outcomeHits} · 半全场命中 ${result.halfHits ?? 0} · 比分命中 ${result.scoreHits}${
        result.pending ? ` · 未完赛/未匹配 ${result.pending}` : ""
      }`
    );
    showToast(result.graded ? "核对完成，已下载标红表" : "未匹配到完赛场次，请确认表内场次编号/对阵");
  } finally {
    state.exportBusy = false;
    const status = document.getElementById("export-status")?.textContent || "";
    renderExport();
    setExportStatus(status);
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

/** 本年记录：去掉年份，如 2026-07-19 → 07-19；可附带时间 */
function formatHistoryDateShort(match) {
  const raw = formatMatchWhen(match) || match?.date || match?.beijingDateKey || "";
  if (!raw) return "";
  // 2026-07-19 / 2026-07-19 01:00 → 07-19 / 07-19 01:00
  return String(raw).replace(/^\d{4}-/, "");
}

function historyTeamNameWithRank(name, rank = null) {
  const label = teamLabel(name);
  if (rank == null) return label;
  return `${label}<span class="history-opp-rank">第${rank}</span>`;
}

function historyMatchBodyText(match, team, rankLookup = null) {
  const resolved = resolveTeamInMatch(match, team);
  const oppInfo = getOpponentRankInfo(match, team, rankLookup);
  const opponent =
    oppInfo.opponent ||
    (resolved === match.home ? match.away : resolved === match.away ? match.home : match.away);
  const league = match.leagueShort || match.group || "";
  const oppLabel = historyTeamNameWithRank(opponent, oppInfo.rank);

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
  const when = formatHistoryDateShort(match);
  const body = historyMatchBodyText(match, team, rankLookup);

  return `
    <div class="history-match-item history-match-item--compact result-${resultClass}">
      <span class="standings-match-result ${resultClass}">${result}</span>
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
    const homeMatches = getTeamHistoryList(histories, "home", localHome, match.home, match.id)
      .filter((m) => m.finished)
      .slice(0, 10);
    const awayMatches = getTeamHistoryList(histories, "away", localAway, match.away, match.id)
      .filter((m) => m.finished)
      .slice(0, 10);
    const h2hMatches = getH2hList(histories).filter((m) => m.finished);
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
    `<p class="predictions-intro">打开场次后先给出赛果影响（晋级/保级等），再补充 Forebet / PredictZ 等机构摘要与伤停；无机构观点时不展示体彩隐含概率。</p>`,
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
  const agencySources = (cached?.sources || []).filter((s) => !s.local);
  const pick = agencySources.length
    ? cached?.consensus?.pick || cached?.summary?.pick
    : null;
  const injuryNote = injuryBadgeText(cached?.injury);
  const badge = pick
    ? `<span class="prediction-badge prediction-badge--${outcomeClass(pick.key)}">倾向 ${pick.short}${pick.prob != null ? ` ${Math.round(pick.prob * 100)}%` : ""}</span>`
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

function teamGoalsStats(matches, team, { venue = "any" } = {}) {
  const rows = [];
  for (const m of matches || []) {
    if (!m?.finished || m.homeScore == null || m.awayScore == null) continue;
    const resolved = resolveTeamInMatch(m, team);
    if (!resolved) continue;
    const isHome = resolved === m.home;
    if (venue === "home" && !isHome) continue;
    if (venue === "away" && isHome) continue;
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

function parseTeamPerspectiveScore(text) {
  const m = String(text || "").match(/(\d+)\s*[:：]\s*(\d+)/);
  if (!m) return null;
  return { gf: Number(m[1]), ga: Number(m[2]) };
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i += 1) r *= i;
  return r;
}

function poissonPmf(k, lambda) {
  if (!(lambda > 0)) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

function mixNum(a, b, weightA = 0.5) {
  if (a == null) return b;
  if (b == null) return a;
  return a * weightA + b * (1 - weightA);
}

function clampNum(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** 取用于比分计算的比赛池：优先较长样本（主客/共同对手），否则退回近 10 场 */
function scoreMatchPool(form, side) {
  if (side === "home") return form?.scoreHome || form?.home || [];
  return form?.scoreAway || form?.away || [];
}

/**
 * 主客场近况 + 共同对手 → 双方预期进球
 * 共同对手有样本时提高权重；主客场样本不足时回退到总体近况。
 */
function buildExpectedGoals(match, form) {
  const homePool = scoreMatchPool(form, "home");
  const awayPool = scoreMatchPool(form, "away");
  const homeAll = teamGoalsStats(homePool, match.home);
  const awayAll = teamGoalsStats(awayPool, match.away);
  const homeAtHome = teamGoalsStats(homePool, match.home, { venue: "home" });
  const awayAtAway = teamGoalsStats(awayPool, match.away, { venue: "away" });

  // 主队进球：主场攻击力 vs 客队客场防守
  let lambdaHomeVenue = mixNum(
    homeAtHome?.avgFor ?? homeAll?.avgFor,
    awayAtAway?.avgAgainst ?? awayAll?.avgAgainst,
    0.55
  );
  // 客队进球：客场攻击力 vs 主队主场防守
  let lambdaAwayVenue = mixNum(
    awayAtAway?.avgFor ?? awayAll?.avgFor,
    homeAtHome?.avgAgainst ?? homeAll?.avgAgainst,
    0.55
  );

  let lambdaHomeCommon = null;
  let lambdaAwayCommon = null;
  const commonItems = form?.commonOpponents?.items || [];
  if (commonItems.length) {
    let hGf = 0;
    let hGa = 0;
    let aGf = 0;
    let aGa = 0;
    let n = 0;
    for (const it of commonItems) {
      const hs = parseTeamPerspectiveScore(it.home?.score);
      const as = parseTeamPerspectiveScore(it.away?.score);
      if (!hs || !as) continue;
      hGf += hs.gf;
      hGa += hs.ga;
      aGf += as.gf;
      aGa += as.ga;
      n += 1;
    }
    if (n) {
      // 对同一对手的进/失交叉估计本场攻防
      lambdaHomeCommon = (hGf / n + aGa / n) / 2;
      lambdaAwayCommon = (aGf / n + hGa / n) / 2;
    }
  }

  let lambdaHome;
  let lambdaAway;
  let mode = "venue";
  if (lambdaHomeVenue != null && lambdaHomeCommon != null) {
    // 有共同对手时：主客 45% + 共同对手 55%
    lambdaHome = mixNum(lambdaHomeVenue, lambdaHomeCommon, 0.45);
    lambdaAway = mixNum(lambdaAwayVenue, lambdaAwayCommon, 0.45);
    mode = "venue+common";
  } else if (lambdaHomeCommon != null) {
    lambdaHome = lambdaHomeCommon;
    lambdaAway = lambdaAwayCommon;
    mode = "common";
  } else {
    lambdaHome = lambdaHomeVenue;
    lambdaAway = lambdaAwayVenue;
    mode = "venue";
  }

  // 仍无数据时给温和默认值，保证总能出比分
  if (lambdaHome == null && lambdaAway == null) {
    if (!homeAll && !awayAll) return null;
    lambdaHome = homeAll?.avgFor ?? 1.2;
    lambdaAway = awayAll?.avgFor ?? 1.0;
    mode = "fallback";
  }

  lambdaHome = clampNum(Number(lambdaHome) || 1.1, 0.25, 3.4);
  lambdaAway = clampNum(Number(lambdaAway) || 1.0, 0.2, 3.2);

  return {
    lambdaHome,
    lambdaAway,
    homeAll,
    awayAll,
    homeAtHome,
    awayAtAway,
    commonCount: commonItems.length,
    venueHomeN: homeAtHome?.n || 0,
    venueAwayN: awayAtAway?.n || 0,
    mode,
  };
}

function buildTopScorePicks(lambdaHome, lambdaAway, maxGoals = 5, topN = 2) {
  const grid = [];
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      grid.push({
        h,
        a,
        p: poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway),
        total: h + a,
      });
    }
  }
  const mass = grid.reduce((s, x) => s + x.p, 0) || 1;
  for (const x of grid) x.p /= mass;
  grid.sort((a, b) => b.p - a.p || a.total - b.total);
  return grid.slice(0, topN).map((x) => ({
    home: x.h,
    away: x.a,
    text: `${x.h}:${x.a}`,
    prob: x.p,
    total: x.total,
  }));
}

function outcomeProbsFromLambdas(lambdaHome, lambdaAway, maxGoals = 5) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway);
      if (h > a) home += p;
      else if (h < a) away += p;
      else draw += p;
    }
  }
  const sum = home + draw + away || 1;
  return { home: home / sum, draw: draw / sum, away: away / sum };
}

function parseHandicapLine(line) {
  if (line == null || line === "") return null;
  const n = Number(String(line).trim().replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

/** 竞彩让球盘：line 为主队让球（如 -1 主让一球），按泊松估算让胜/让平/让负 */
function handicapOutcomeProbs(lambdaHome, lambdaAway, line, maxGoals = 6) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway);
      const adj = h - a + line;
      if (adj > 0) home += p;
      else if (adj < 0) away += p;
      else draw += p;
    }
  }
  const sum = home + draw + away || 1;
  return { home: home / sum, draw: draw / sum, away: away / sum };
}

function pickOutcomeLabelFromProbs(probs, { dual = true, drawLabel = "双平", awayLabel = "负" } = {}) {
  if (!probs) return null;
  const ranked = [
    { key: "home", label: "主胜", p: probs.home },
    { key: "draw", label: drawLabel, p: probs.draw },
    { key: "away", label: awayLabel, p: probs.away },
  ].sort((a, b) => b.p - a.p);
  const [first, second] = ranked;
  if (dual && second && first.p - second.p < 0.08 && second.p >= 0.22) {
    const dualMap = { home: "主胜", draw: "平", away: awayLabel === "负" ? "负" : awayLabel };
    return {
      text: `${dualMap[first.key]}、${dualMap[second.key]}`,
      key: first.key,
      soft: true,
      ranked,
    };
  }
  return { text: first.label, key: first.key, soft: false, ranked };
}

/**
 * Excel「胜负预测」：最多两个最可能项；必要时用让胜/让平/让负占第二位
 */
function buildExcelOutcomeLabel(analysis, scoreOutlook, match = null) {
  const agency = (analysis?.sources || []).filter((s) => !s.local);
  const pick = agency.length ? analysis?.consensus?.pick : null;
  const labels = [];

  if (pick?.key === "home") labels.push("主胜");
  else if (pick?.key === "away") labels.push("负");
  else if (pick?.key === "draw") labels.push("双平");
  else {
    const probs =
      scoreOutlook?.lambdaHome != null && scoreOutlook?.lambdaAway != null
        ? outcomeProbsFromLambdas(scoreOutlook.lambdaHome, scoreOutlook.lambdaAway)
        : null;
    if (!probs) return "—";
    const ranked = [
      { key: "home", label: "主胜", p: probs.home },
      { key: "draw", label: "双平", p: probs.draw },
      { key: "away", label: "负", p: probs.away },
    ].sort((a, b) => b.p - a.p);
    labels.push(ranked[0].label);
    // 第二倾向足够接近时才写上，且总数不超过 2
    if (ranked[1] && ranked[0].p - ranked[1].p < 0.1 && ranked[1].p >= 0.24) {
      const secondMap = { home: "主胜", draw: "平", away: "负" };
      labels.push(secondMap[ranked[1].key]);
    }
  }

  const line = parseHandicapLine(match?.hhad?.line);
  if (
    labels.length < 2 &&
    line != null &&
    scoreOutlook?.lambdaHome != null &&
    scoreOutlook?.lambdaAway != null
  ) {
    const hProbs = handicapOutcomeProbs(scoreOutlook.lambdaHome, scoreOutlook.lambdaAway, line);
    const hRanked = [
      { key: "home", label: "让胜", p: hProbs.home },
      { key: "draw", label: "让平", p: hProbs.draw },
      { key: "away", label: "让负", p: hProbs.away },
    ].sort((a, b) => b.p - a.p);
    const hf = hRanked[0];
    const hs = hRanked[1];
    const margin = scoreOutlook.lambdaHome - scoreOutlook.lambdaAway;
    const clearHandicap = hf.p >= 0.4 && (!hs || hf.p - hs.p >= 0.06);
    const soft = labels[0] === "双平" || labels[0] === "平";
    const aligns =
      (hf.key === "home" && margin + line >= 0.15) ||
      (hf.key === "away" && margin + line <= -0.15) ||
      (hf.key === "draw" && Math.abs(margin + line) <= 0.35);
    if (clearHandicap && (soft || aligns || hf.p >= 0.46) && !labels.includes(hf.label)) {
      labels.push(hf.label);
    }
  }

  return labels.slice(0, 2).join("、") || "—";
}

/** 最常见的「默认三件套」，挑选时刻意打散，避免比分预测总是 1-1/1-2/2-1 */
const COMMON_SCORE_KEYS = new Set(["1-1", "1-2", "2-1"]);

function scoreKey(h, a) {
  return `${h}-${a}`;
}

function scoreOutcome(h, a) {
  if (h > a) return "H";
  if (h < a) return "A";
  return "D";
}

/**
 * 比分预测：按进球走势加权，并强制多样性——不局限在 1-1/1-2/2-1，
 * 按小球/大球/一边倒走势穿插 0-0、3-1、2-2、3-0 等参考比分。
 */
function buildExcelScoreLabel(scoreOutlook) {
  if (!scoreOutlook || scoreOutlook.pending) return "—";
  const lh = scoreOutlook.lambdaHome;
  const la = scoreOutlook.lambdaAway;
  if (lh == null || la == null) {
    const fallback = (scoreOutlook.topScores || []).slice(0, 3);
    return fallback.length ? fallback.map((s) => `${s.home}-${s.away}`).join("、") : "—";
  }

  const lean = String(scoreOutlook.lean || "");
  const expected = scoreOutlook.expected ?? lh + la;
  const maxGoals = expected >= 3.2 || /大比分/.test(lean) ? 6 : expected >= 2.6 || /大球/.test(lean) ? 5 : 4;
  const marginLam = lh - la;
  const grid = [];
  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = poissonPmf(h, lh) * poissonPmf(a, la);
      const total = h + a;
      const margin = Math.abs(h - a);
      let boost = 1;
      if (/偏大比分/.test(lean)) {
        if (total >= 4 || (total >= 3 && margin >= 2)) boost = 1.55;
        else if (total <= 1) boost = 0.55;
      } else if (/偏大球/.test(lean)) {
        if (total >= 3) boost = 1.35;
        else if (total <= 1) boost = 0.65;
      } else if (/偏小球/.test(lean)) {
        if (total <= 2) boost = 1.35;
        else if (total >= 4) boost = 0.55;
      } else {
        if (expected >= 2.8 && total >= 3) boost = 1.12;
        if (expected <= 2.2 && total <= 2) boost = 1.12;
      }
      if (marginLam >= 0.55 && h > a) boost *= 1.08;
      if (marginLam <= -0.55 && a > h) boost *= 1.08;
      // 轻微压低默认三件套，给其他合理比分腾位置
      if (COMMON_SCORE_KEYS.has(scoreKey(h, a))) boost *= 0.88;
      // 按走势抬高「非常见但合理」参考分
      if (h === 0 && a === 0 && (/偏小球/.test(lean) || expected <= 2.15)) boost *= 1.28;
      if (h === a && h >= 2 && (/偏大球|偏大比分/.test(lean) || expected >= 2.75)) boost *= 1.22;
      if (margin >= 2 && total >= 3) {
        if (marginLam >= 0.4 && h > a) boost *= 1.18;
        if (marginLam <= -0.4 && a > h) boost *= 1.18;
        if (/偏大比分/.test(lean)) boost *= 1.12;
      }
      if (total >= 4 && (/偏大球|偏大比分/.test(lean) || expected >= 3.0)) boost *= 1.15;
      grid.push({ h, a, p, score: p * boost, total, margin, outcome: scoreOutcome(h, a) });
    }
  }
  grid.sort((a, b) => b.score - a.score || b.p - a.p);

  const picked = [];
  const seenKey = new Set();
  const seenTotal = new Set();
  const seenOutcome = new Set();
  const seenMarginBucket = new Set();

  const marginBucket = (g) => (g.margin === 0 ? "draw" : g.margin === 1 ? "one" : "wide");
  const isCommon = (g) => COMMON_SCORE_KEYS.has(scoreKey(g.h, g.a));

  const tryPush = (g, { relax = false } = {}) => {
    if (!g || picked.length >= 3) return false;
    const key = scoreKey(g.h, g.a);
    if (seenKey.has(key)) return false;
    if (!relax) {
      // 总进球尽量分散
      if (picked.length >= 1 && seenTotal.has(g.total) && seenTotal.size < 2) return false;
      // 胜平负方向尽量不重复占满
      if (picked.length >= 2 && seenOutcome.has(g.outcome) && seenOutcome.size === 1) return false;
      // 净胜分档分散：别三个都是一球小胜
      if (picked.length >= 1 && seenMarginBucket.has(marginBucket(g)) && seenMarginBucket.size < 2 && picked.length < 2) {
        return false;
      }
      // 已有两个默认三件套时，第三个强制换非常见分
      if (picked.filter(isCommon).length >= 2 && isCommon(g)) return false;
    }
    picked.push(g);
    seenKey.add(key);
    seenTotal.add(g.total);
    seenOutcome.add(g.outcome);
    seenMarginBucket.add(marginBucket(g));
    return true;
  };

  // 第一轮：按加权概率挑，带多样性约束
  for (const g of grid) {
    if (picked.length >= 3) break;
    tryPush(g);
  }
  // 第二轮：放宽约束补满
  for (const g of grid) {
    if (picked.length >= 3) break;
    tryPush(g, { relax: true });
  }

  // 若仍扎堆在 1-1/1-2/2-1，用走势匹配的参考分替换最后一个
  if (picked.filter(isCommon).length >= 2) {
    const ref =
      grid.find((g) => {
        if (seenKey.has(scoreKey(g.h, g.a)) || isCommon(g)) return false;
        if (/偏小球/.test(lean) || expected <= 2.2) return g.total <= 2; // 0-0 / 1-0 / 0-1
        if (/偏大比分/.test(lean) || Math.abs(marginLam) >= 0.7) return g.margin >= 2 && g.total >= 3;
        if (/偏大球/.test(lean) || expected >= 2.8) return g.total >= 3 && (g.margin >= 2 || g.h === g.a);
        // 中性：优先 0-0、2-0、0-2、2-2、3-1 一类
        return g.total !== 3 || g.margin !== 1;
      }) ||
      grid.find((g) => !seenKey.has(scoreKey(g.h, g.a)) && !isCommon(g));
    if (ref) {
      const idx = picked.findIndex(isCommon);
      if (idx >= 0) picked[idx === 0 && picked.length > 1 ? picked.length - 1 : idx] = ref;
    }
  }

  // 大球/大比分时保证至少一个总进球≥3
  if ((/偏大球|偏大比分/.test(lean) || expected >= 2.9) && picked.every((x) => x.total < 3)) {
    const big = grid.find((g) => g.total >= 3 && !COMMON_SCORE_KEYS.has(scoreKey(g.h, g.a))) || grid.find((g) => g.total >= 3);
    if (big) picked[picked.length - 1] = big;
  }
  // 小球时偶尔给出 0-0 参考
  if ((/偏小球/.test(lean) || expected <= 2.1) && !picked.some((x) => x.h === 0 && x.a === 0)) {
    const zz = grid.find((g) => g.h === 0 && g.a === 0);
    if (zz && zz.p >= (picked[picked.length - 1]?.p || 0) * 0.45) {
      picked[picked.length - 1] = zz;
    }
  }

  // 中性场次若仍全是 0/1 球小分，换一个 2-0 / 0-2 / 2-2 作参考
  const onlyTiny = picked.every((x) => x.total <= 2 && x.margin <= 1);
  if (onlyTiny && expected >= 2.2 && !/偏小球/.test(lean)) {
    const nowKeys = new Set(picked.map((x) => scoreKey(x.h, x.a)));
    const alt = grid.find((g) => {
      if (nowKeys.has(scoreKey(g.h, g.a))) return false;
      if (marginLam >= 0.25) return (g.h === 2 && g.a === 0) || (g.h === 3 && g.a === 1);
      if (marginLam <= -0.25) return (g.h === 0 && g.a === 2) || (g.h === 1 && g.a === 3);
      return (g.h === 2 && g.a === 2) || (g.h === 2 && g.a === 0) || (g.h === 0 && g.a === 2);
    });
    if (alt && alt.p >= (picked[picked.length - 1]?.p || 0) * 0.35) {
      picked[picked.length - 1] = alt;
    }
  }

  return picked.map((s) => `${s.h}-${s.a}`).join("、") || "—";
}

/** 半场进球期望：主队主场上半 / 客队客场上半，辅以近况半场失球 */
function buildHalfTimeLambdas(match, form) {
  const homePool = form?.home || form?.scoreHome || [];
  const awayPool = form?.away || form?.scoreAway || [];
  const homeRows = extractHalfSplits(homePool, match.home);
  const awayRows = extractHalfSplits(awayPool, match.away);
  if (homeRows.length + awayRows.length < 4) return null;

  const homeAtHome = extractHalfSplits(
    homePool.filter((m) => resolveTeamInMatch(m, match.home) === m.home),
    match.home
  );
  const awayAtAway = extractHalfSplits(
    awayPool.filter((m) => resolveTeamInMatch(m, match.away) === m.away),
    match.away
  );

  const avg = (rows, key) => {
    if (!rows?.length) return null;
    return rows.reduce((s, r) => s + r[key], 0) / rows.length;
  };

  const homeAttack = avg(homeAtHome, "fhFor") ?? avg(homeRows, "fhFor");
  const homeDefend = avg(homeAtHome, "fhAgainst") ?? avg(homeRows, "fhAgainst");
  const awayAttack = avg(awayAtAway, "fhFor") ?? avg(awayRows, "fhFor");
  const awayDefend = avg(awayAtAway, "fhAgainst") ?? avg(awayRows, "fhAgainst");

  let lambdaHome = mixNum(homeAttack, awayDefend, 0.55);
  let lambdaAway = mixNum(awayAttack, homeDefend, 0.55);
  if (lambdaHome == null && lambdaAway == null) return null;
  lambdaHome = clampNum(Number(lambdaHome) || 0.45, 0.12, 1.7);
  lambdaAway = clampNum(Number(lambdaAway) || 0.35, 0.1, 1.5);

  return {
    lambdaHome,
    lambdaAway,
    homeN: homeAtHome.length || homeRows.length,
    awayN: awayAtAway.length || awayRows.length,
  };
}

const HTFT_CHAR = { home: "胜", draw: "平", away: "负" };

/**
 * Excel「半全场」：仅结果组合（胜胜/胜负/平胜…），无比分；最多两个最可能
 */
function buildExcelHalfFullLabel(match, form, scoreOutlook = null) {
  const ht = buildHalfTimeLambdas(match, form);
  const ftProbs =
    scoreOutlook?.lambdaHome != null && scoreOutlook?.lambdaAway != null
      ? outcomeProbsFromLambdas(scoreOutlook.lambdaHome, scoreOutlook.lambdaAway)
      : null;
  const htProbs = ht
    ? outcomeProbsFromLambdas(ht.lambdaHome, ht.lambdaAway, 4)
    : ftProbs
      ? {
          // 无半场样本时，半场略向平局倾斜的弱先验
          home: ftProbs.home * 0.7,
          draw: Math.min(0.45, ftProbs.draw * 1.25 + 0.08),
          away: ftProbs.away * 0.7,
        }
      : null;
  if (!htProbs || !ftProbs) return "—";
  // 归一弱先验
  const hs = htProbs.home + htProbs.draw + htProbs.away || 1;
  const htN = {
    home: htProbs.home / hs,
    draw: htProbs.draw / hs,
    away: htProbs.away / hs,
  };

  const combos = [];
  for (const hk of ["home", "draw", "away"]) {
    for (const fk of ["home", "draw", "away"]) {
      let p = htN[hk] * ftProbs[fk];
      if (hk === fk) p *= 1.18; // 半全场一致更常见
      if (hk === "home" && fk === "away") p *= 0.78; // 半场领先终场翻盘较少
      if (hk === "away" && fk === "home") p *= 0.78;
      combos.push({
        label: `${HTFT_CHAR[hk]}${HTFT_CHAR[fk]}`,
        p,
      });
    }
  }
  combos.sort((a, b) => b.p - a.p);
  const top = [combos[0]];
  if (combos[1] && combos[0].p - combos[1].p < 0.12 && combos[1].p >= 0.08) {
    top.push(combos[1]);
  }
  return top.map((c) => c.label).join("、");
}

/** 近况胜平负快照，供简要分析转译成定性表述 */
function formRecordSnapshot(matches, team) {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const m of matches || []) {
    const result = teamResultLabel(m, team);
    if (result === "胜") w += 1;
    else if (result === "平") d += 1;
    else if (result === "负") l += 1;
  }
  const n = w + d + l;
  if (!n) return null;
  return { w, d, l, n, winRate: w / n, pointsRate: (w * 3 + d) / (n * 3) };
}

function qualitativeFormPhrase(team, snap, { venue = "" } = {}) {
  if (!snap) return "";
  const prefix = venue ? `${team}${venue}` : team;
  if (snap.winRate >= 0.7 || snap.pointsRate >= 0.72) return `${prefix}近况火热`;
  if (snap.winRate <= 0.25 || snap.pointsRate <= 0.3) return `${prefix}近况低迷`;
  if (snap.l >= snap.w + 2) return `${prefix}近期起伏偏大、输球偏多`;
  if (snap.d >= Math.ceil(snap.n * 0.4)) return `${prefix}近期平局偏多、打开局面困难`;
  return `${prefix}近况中规中矩`;
}

/** 把伤停转成战术影响，而不是“伤停N人”清单 */
function injuryImpactPhrase(side, team) {
  if (!side?.total) return "";
  const byPos = side.byPos || {};
  const defN = Number(byPos["后卫"] || 0);
  const midN = Number(byPos["中场"] || 0);
  const fwdN = Number(byPos["前锋"] || 0);
  const gkN = Number(byPos["门将"] || 0);
  if (defN >= 3 || (defN >= 2 && side.total >= 4)) {
    return `${team}防线伤病较重，只能用替补甚至年轻人顶上`;
  }
  if (fwdN >= 2 || (fwdN >= 1 && side.total >= 3 && fwdN >= midN && fwdN >= defN)) {
    return `${team}锋线主力缺阵，进球效率可能下滑`;
  }
  if (midN >= 2 && midN >= defN) {
    return `${team}中场轮转吃紧，组织和控场会受影响`;
  }
  if (gkN >= 1 && side.total <= 2) {
    return `${team}门将位置有变动，后防稳定性存疑`;
  }
  if (side.total >= 4) return `${team}主力伤停偏多，阵容完整度吃亏`;
  if (side.total >= 2) return `${team}有主力伤停，临场完整度略逊`;
  return `${team}有个别主力缺阵`;
}

function venueStrengthPhrase(team, stats, role) {
  if (!stats?.n || stats.n < 3) return "";
  const solid = stats.avgAgainst <= 0.95 && stats.avgFor >= 1.15;
  const leaky = stats.avgAgainst >= 1.55;
  const blunt = stats.avgFor <= 0.85;
  const open = stats.avgTotal >= 2.9 || (stats.over25Rate != null && stats.over25Rate >= 0.58);
  const tight = stats.avgTotal <= 2.05 || (stats.over25Rate != null && stats.over25Rate <= 0.38);
  if (role === "home") {
    if (solid && !blunt) return `${team}主场防守扎实、压制力在`;
    if (leaky && open) return `${team}主场攻防都偏开放，容易打出对攻`;
    if (blunt && tight) return `${team}主场进攻偏钝、场面偏胶着`;
    if (solid) return `${team}主场防守硬度不错`;
    if (leaky) return `${team}主场后防并不稳`;
  } else {
    if (blunt && leaky) return `${team}客场攻防两端都吃力`;
    if (blunt) return `${team}客场进球困难`;
    if (solid) return `${team}客场防守仍能站住`;
    if (leaky && open) return `${team}客场防守偏软、比赛容易进球`;
    if (tight) return `${team}客场偏谨慎、少进球`;
  }
  return "";
}

/**
 * Excel「简要分析」：叙事博弈文风（赛程优先级 / 伤停影响 / 主客因素 / 比赛进程）
 * 避免堆场均、大球率等原始数字。
 */
function buildExcelBriefAnalysis(match, form, analysis, scoreOutlook = null) {
  const home = match.home;
  const away = match.away;
  const league = match.leagueShort || match.league || "";
  const stakes = analysis?.stakes;
  const isCup = !!(stakes?.isCup || /杯|cup|资格|knockout|copa/i.test(league));
  const clauses = [];

  // 1) 赛事语境与积分压力
  const hz = stakes?.home?.zone;
  const az = stakes?.away?.zone;
  const bothRelegate = /降级/.test(hz || "") && /降级/.test(az || "");
  const bothTitle = /争冠|欧战/.test(hz || "") && /争冠|欧战/.test(az || "");
  if (isCup && bothRelegate) {
    clauses.push(
      `${league || "杯赛"}对阵，双方联赛都在保级区，杯赛投入度存疑，更可能以防守和稳妥为主`
    );
  } else if (isCup && bothTitle) {
    clauses.push(`${league || "杯赛"}焦点战，双方都有欧战经验与班底厚度，谁都不想早早丢掉主动`);
  } else if (isCup) {
    clauses.push(`${league || "杯赛"}属性，赢球偏晋级、输球风险更大，临场或有轮换，开局通常偏谨慎`);
  } else if (bothRelegate) {
    clauses.push("联赛保级区对决，双方都输不起，场面容易谨慎胶着");
  } else if (hz && az && hz !== "中游" && az !== "中游") {
    clauses.push(`${home}处${hz}、${away}处${az}，本场赛果对积分形势都有实质影响`);
  } else if (hz && /降级|争冠|欧战/.test(hz)) {
    clauses.push(`${home}身在${hz}，主场求分意愿更强`);
  } else if (az && /降级|争冠|欧战/.test(az)) {
    clauses.push(`${away}身在${az}，客场也会把拿分放在前面`);
  } else if (league) {
    clauses.push(`${league}对阵`);
  }

  // 2) 近况状态（定性）
  const homeSnap = formRecordSnapshot(form?.home, home);
  const awaySnap = formRecordSnapshot(form?.away, away);
  const homeForm = qualitativeFormPhrase(home, homeSnap);
  const awayForm = qualitativeFormPhrase(away, awaySnap);
  if (homeForm && awayForm) {
    if (homeSnap.winRate - awaySnap.winRate >= 0.25) {
      clauses.push(`${homeForm}，相较之下${away}近况更弱`);
    } else if (awaySnap.winRate - homeSnap.winRate >= 0.25) {
      clauses.push(`${awayForm}，主队近况相对更逊`);
    } else if (/火热/.test(homeForm) && /火热/.test(awayForm)) {
      clauses.push("双方近况都不错，更看谁能把状态带到本场");
    } else if (/低迷/.test(homeForm) && /低迷/.test(awayForm)) {
      clauses.push("双方近况都一般，谁先找到破局点谁占优");
    } else {
      clauses.push(`${homeForm}，${awayForm}`);
    }
  } else if (homeForm) clauses.push(homeForm);
  else if (awayForm) clauses.push(awayForm);

  // 3) 主客场因素（定性，不写场均数字）
  const homeVenue =
    scoreOutlook?.homeAtHome ||
    teamGoalsStats(form?.scoreHome || form?.home || [], home, { venue: "home" });
  const awayVenue =
    scoreOutlook?.awayAtAway ||
    teamGoalsStats(form?.scoreAway || form?.away || [], away, { venue: "away" });
  const homeVenuePhrase = venueStrengthPhrase(home, homeVenue, "home");
  const awayVenuePhrase = venueStrengthPhrase(away, awayVenue, "away");
  if (homeVenuePhrase && awayVenuePhrase) clauses.push(`${homeVenuePhrase}，${awayVenuePhrase}`);
  else if (homeVenuePhrase) clauses.push(homeVenuePhrase);
  else if (awayVenuePhrase) clauses.push(awayVenuePhrase);

  // 4) 伤停影响
  const inj = analysis?.injury;
  const homeInj = injuryImpactPhrase(inj?.home, home);
  const awayInj = injuryImpactPhrase(inj?.away, away);
  if (homeInj && awayInj) clauses.push(`${homeInj}，${awayInj}`);
  else if (homeInj) clauses.push(homeInj);
  else if (awayInj) clauses.push(awayInj);
  else if (inj && !inj.home?.total && !inj.away?.total) {
    clauses.push("双方主力阵容相对齐整");
  }

  // 5) 可接受平局 / 博弈心理
  if (stakes?.home?.acceptDraw && stakes?.away?.acceptDraw) {
    clauses.push("双方都能接受平局，首开纪录前大概率谨慎试探");
  } else if (stakes?.home?.acceptDraw && !stakes?.away?.acceptDraw) {
    clauses.push(`${home}更能接受平局，${away}相对更需要拿分`);
  } else if (!stakes?.home?.acceptDraw && stakes?.away?.acceptDraw) {
    clauses.push(`${away}更能接受平局，主队主场求胜动机更强`);
  }

  // 6) 共同对手只取一句定性结论
  const common = form?.commonOpponents;
  if (common?.summary?.edge === "home") {
    clauses.push(`参照共同对手，${home}略占上风`);
  } else if (common?.summary?.edge === "away") {
    clauses.push(`参照共同对手，${away}略占上风`);
  }

  // 7) 进球格局（定性）+ 比赛进程预演
  const lean = String(scoreOutlook?.lean || "");
  const tempo = form?.tempoStyle;
  const lh = scoreOutlook?.lambdaHome;
  const la = scoreOutlook?.lambdaAway;
  const margin = lh != null && la != null ? lh - la : null;

  if (/偏小球/.test(lean)) clauses.push("进球空间有限，更偏向小比分");
  else if (/偏大比分/.test(lean)) clauses.push("场面一旦打开，大比分并不意外");
  else if (/偏大球/.test(lean)) clauses.push("双方都有进球能力，比赛更容易打出进球");

  let flow = "";
  const hk = tempo?.home?.key || "";
  const ak = tempo?.away?.key || "";
  if (margin != null && margin >= 0.55 && /early-attack|solid-attack/.test(hk)) {
    flow = "主队主场压制力更强，更可能早早取得领先";
  } else if (margin != null && margin <= -0.45) {
    flow = "客队质量占优，但客场会先稳住，半场僵持后再图掌控";
  } else if (hk === "early-attack" && ak === "late-surge") {
    flow = `${home}更可能上半场施压，${away}更可能下半场发力`;
  } else if (hk === "late-surge" && ak === "early-attack") {
    flow = `${away}开局威胁更大，${home}需熬过上半场再图反扑`;
  } else if (hk === "low-block" || ak === "low-block") {
    flow = "上半场谨慎试探，下半场才可能打开局面";
  } else if (hk === "late-surge" || ak === "late-surge") {
    flow = "上半场僵持概率大，下半场比分变化更关键";
  } else if (hk === "open-game" && ak === "open-game") {
    flow = "双方都偏开放，开局就可能互有威胁";
  } else if (hk === "early-attack" && ak === "early-attack") {
    flow = "双方都偏上半场进球，开局阶段威胁更大";
  } else if (hk === "absorb-counter" || ak === "absorb-counter") {
    flow = "比赛可能先抑后扬，下半场反击更关键";
  } else if (stakes?.home?.acceptDraw && stakes?.away?.acceptDraw) {
    flow = "上半场互摸底，下半场才可能分出胜负";
  } else if (isCup) {
    flow = "杯赛心态下，上半场多半谨慎，下半场再发力";
  } else {
    flow = "上半场试探为主，下半场再决定比赛走势";
  }
  clauses.push(flow);

  // 去噪、去重，压成一段连贯短文
  const uniq = [];
  const seen = new Set();
  for (const raw of clauses) {
    const p = String(raw || "")
      .replace(/\s+/g, "")
      .replace(/[。；;]+$/g, "")
      .trim();
    if (!p || p.length < 4) continue;
    const key = p.slice(0, 18);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  if (!uniq.length) return "情报样本不足，请结合临场伤停与首发再判断。";
  return `${uniq.slice(0, 7).join("，")}。`;
}

function blendRate(formRate, webRate, formWeight = 0.6) {
  if (formRate == null && webRate == null) return null;
  if (formRate == null) return webRate;
  if (webRate == null) return formRate;
  return formRate * formWeight + webRate * (1 - formWeight);
}

/** 大小球期望：只看近况进球结构（+机构），不跟预测比分挂钩 */
function buildGoalsMarketOutlook(homeStats, awayStats, webGoals = null) {
  const avg = (a, b) => {
    if (a == null) return b;
    if (b == null) return a;
    return (a + b) / 2;
  };

  const formExpected = avg(homeStats?.avgTotal, awayStats?.avgTotal);
  const expected =
    webGoals?.avgGoals != null && formExpected != null
      ? webGoals.avgGoals * 0.35 + formExpected * 0.65
      : webGoals?.avgGoals ?? formExpected;

  const over25 = blendRate(avg(homeStats?.over25Rate, awayStats?.over25Rate), webGoals?.over25);
  const bigScore = blendRate(avg(homeStats?.bigScoreRate, awayStats?.bigScoreRate), webGoals?.over35);
  const btts = blendRate(avg(homeStats?.bttsRate, awayStats?.bttsRate), webGoals?.btts);
  const blowout = avg(homeStats?.blowoutRate, awayStats?.blowoutRate);

  let lean = "进球走势一般";
  if ((bigScore != null && bigScore >= 0.42) || (expected != null && expected >= 3.3)) lean = "偏大比分";
  else if ((over25 != null && over25 >= 0.58) || (expected != null && expected >= 2.7)) lean = "偏大球";
  else if ((over25 != null && over25 <= 0.42) || (expected != null && expected <= 2.2)) lean = "偏小球";

  return { lean, expected, over25, bigScore, btts, blowout };
}

function buildScoreOutlook(match, form, webGoals = null) {
  if (!form || form.pending) return { pending: true };
  const eg = buildExpectedGoals(match, form);
  const home = eg?.homeAll || teamGoalsStats(scoreMatchPool(form, "home"), match.home);
  const away = eg?.awayAll || teamGoalsStats(scoreMatchPool(form, "away"), match.away);
  if (!eg && !home && !away && !webGoals) return null;

  // 比分：主客场 + 共同对手 → 泊松（保证有 eg 就有两个比分）
  const topScores = eg
    ? buildTopScorePicks(eg.lambdaHome, eg.lambdaAway)
    : home || away
      ? buildTopScorePicks(home?.avgFor ?? 1.2, away?.avgFor ?? 1.0)
      : [];
  // 大小球：近况结构独立计算，不随预测比分改动
  const market = buildGoalsMarketOutlook(home, away, webGoals);

  const sources = [];
  if (eg?.mode === "venue+common") {
    sources.push(`主客场(${eg.venueHomeN}/${eg.venueAwayN})`);
    sources.push(`共同对手×${eg.commonCount}`);
  } else if (eg?.mode === "common") {
    sources.push(`共同对手×${eg.commonCount}`);
  } else if (eg?.homeAtHome || eg?.awayAtAway) {
    sources.push(`主客场(${eg.venueHomeN}/${eg.venueAwayN})`);
  } else if (eg) {
    sources.push("近况进球");
  }

  return {
    pending: false,
    lean: market.lean,
    expected: market.expected,
    lambdaHome: eg?.lambdaHome ?? (topScores.length ? home?.avgFor ?? 1.2 : null),
    lambdaAway: eg?.lambdaAway ?? (topScores.length ? away?.avgFor ?? 1.0 : null),
    topScores,
    over25: market.over25,
    bigScore: market.bigScore,
    btts: market.btts,
    blowout: market.blowout,
    home,
    away,
    homeAtHome: eg?.homeAtHome || null,
    awayAtAway: eg?.awayAtAway || null,
    sourceTag: sources.join(" + ") || "近况进球",
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
          <div class="prediction-source-name">预测比分</div>
          <div class="prediction-source-tag">正在按主客场与共同对手计算…</div>
        </div>
        <div class="score-picks score-picks--pending">
          <div class="score-pick score-pick--primary"><div class="score-pick-label">最可能</div><div class="score-pick-value">—:—</div></div>
          <div class="score-pick"><div class="score-pick-label">次选</div><div class="score-pick-value">—:—</div></div>
        </div>
      </div>`;
  }

  const top = outlook.topScores || [];
  const topHtml = (top.length
    ? top
    : [
        { text: "—:—", prob: 0 },
        { text: "—:—", prob: 0 },
      ]
  )
    .slice(0, 2)
    .map(
      (s, i) => `
      <div class="score-pick score-pick--${i === 0 ? "primary" : "secondary"}">
        <div class="score-pick-label">${i === 0 ? "最可能" : "次选"}</div>
        <div class="score-pick-value">${s.text}</div>
        <div class="score-pick-prob">${s.prob ? `${Math.round(s.prob * 100)}%` : "样本不足"}</div>
      </div>`
    )
    .join("");

  const homeVenue = outlook.homeAtHome
    ? `${teamLabel(match.home)}主场${outlook.homeAtHome.n}场 进${outlook.homeAtHome.avgFor.toFixed(1)}/失${outlook.homeAtHome.avgAgainst.toFixed(1)}`
    : outlook.home
      ? `${teamLabel(match.home)}近况 进${outlook.home.avgFor.toFixed(1)}/失${outlook.home.avgAgainst.toFixed(1)}`
      : "";
  const awayVenue = outlook.awayAtAway
    ? `${teamLabel(match.away)}客场${outlook.awayAtAway.n}场 进${outlook.awayAtAway.avgFor.toFixed(1)}/失${outlook.awayAtAway.avgAgainst.toFixed(1)}`
    : outlook.away
      ? `${teamLabel(match.away)}近况 进${outlook.away.avgFor.toFixed(1)}/失${outlook.away.avgAgainst.toFixed(1)}`
      : "";

  return `
    <div class="prediction-score-card">
      <div class="prediction-form-card-head">
        <div class="prediction-source-name">预测比分</div>
        <div class="prediction-source-tag">${outlook.sourceTag || "主客场 + 共同对手"}</div>
      </div>
      <div class="score-picks">${topHtml}</div>
      ${
        outlook.lambdaHome != null && outlook.lambdaAway != null
          ? `<div class="score-outlook-meta score-outlook-meta--block">期望进球 ${teamLabel(match.home)} ${outlook.lambdaHome.toFixed(1)} : ${teamLabel(match.away)} ${outlook.lambdaAway.toFixed(1)}</div>`
          : ""
      }
      <div class="score-outlook-banner">
        <span class="score-outlook-lean">${outlook.lean}</span>
        <span class="score-outlook-meta">${
          outlook.expected != null ? `大小球期望总进球约 ${outlook.expected.toFixed(1)}` : "大小球期望暂缺"
        }</span>
      </div>
      <div class="prob-bars score-prob-bars">
        ${scoreProbRowHtml("大球≥3", outlook.over25, "over")}
        ${scoreProbRowHtml("大比分≥4", outlook.bigScore, "big")}
        ${scoreProbRowHtml("双方进球", outlook.btts, "btts")}
        ${scoreProbRowHtml("净胜2+", outlook.blowout, "blowout")}
      </div>
      <div class="score-outlook-note">
        ${[homeVenue, awayVenue].filter(Boolean).join(" · ") || "暂无足够进球赛果样本"}
        <br>预测比分仅依据主客场与共同对手；大小球另按近况进球结构，互不影响。
      </div>
    </div>`;
}

/** 从半场/全场拆出上半场、下半场进失球 */
function extractHalfSplits(matches, team) {
  const rows = [];
  for (const m of matches || []) {
    if (!m?.finished || m.homeScore == null || m.awayScore == null) continue;
    if (m.homeHtScore == null || m.awayHtScore == null) continue;
    const resolved = resolveTeamInMatch(m, team);
    if (!resolved) continue;
    const isHome = resolved === m.home;
    const fhFor = Number(isHome ? m.homeHtScore : m.awayHtScore);
    const fhAgainst = Number(isHome ? m.awayHtScore : m.homeHtScore);
    const ftFor = Number(isHome ? m.homeScore : m.awayScore);
    const ftAgainst = Number(isHome ? m.awayScore : m.homeScore);
    if (![fhFor, fhAgainst, ftFor, ftAgainst].every(Number.isFinite)) continue;
    const shFor = Math.max(0, ftFor - fhFor);
    const shAgainst = Math.max(0, ftAgainst - fhAgainst);
    rows.push({
      fhFor,
      fhAgainst,
      shFor,
      shAgainst,
      scoredFh: fhFor > 0,
      scoredSh: shFor > 0,
      concededFh: fhAgainst > 0,
      concededSh: shAgainst > 0,
      zeroZeroHt: fhFor === 0 && fhAgainst === 0,
    });
  }
  return rows;
}

function classifyTeamTempoStyle(rows) {
  const n = rows.length;
  if (n < 3) return null;

  const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / n;
  const avgFhFor = avg("fhFor");
  const avgShFor = avg("shFor");
  const avgFhAgainst = avg("fhAgainst");
  const avgShAgainst = avg("shAgainst");
  const totalFor = avgFhFor + avgShFor;
  const totalAgainst = avgFhAgainst + avgShAgainst;
  const fhShare = totalFor > 0.05 ? avgFhFor / totalFor : 0.5;
  const shShare = 1 - fhShare;
  const lateBloomRate = rows.filter((r) => r.zeroZeroHt && r.scoredSh).length / n;
  const earlyLeadRate = rows.filter((r) => r.fhFor > r.fhAgainst).length / n;
  const fhCleanRate = rows.filter((r) => !r.concededFh).length / n;
  const shCleanRate = rows.filter((r) => !r.concededSh).length / n;

  let key = "balanced";
  let label = "攻守相对均衡";
  let desc = "上下半场进失球分布较均匀，没有明显的时段偏科。";

  if (totalFor <= 0.95 && totalAgainst <= 1.15) {
    key = "low-block";
    label = "全场防守 / 小球";
    desc = "进球与失球都偏少，倾向控场防守、节奏偏慢。";
  } else if (avgFhFor >= avgShFor + 0.3 && avgShAgainst <= avgFhAgainst + 0.2 && fhShare >= 0.55) {
    key = "early-attack";
    label = "上半场进球 · 下半场收缩";
    desc = "进球集中在上半场，下半场更偏守成，常见早进球后控节奏。";
  } else if (avgShFor >= avgFhFor + 0.3 || shShare >= 0.58 || lateBloomRate >= 0.35) {
    key = "late-surge";
    label = "上半场试探 · 下半场发力";
    desc = "上半场进球偏少，威胁更多出现在下半场，偏慢热/后程发力。";
  } else if (avgFhFor + 0.15 < avgFhAgainst && avgShFor >= avgFhFor + 0.15 && fhCleanRate < 0.45) {
    key = "absorb-counter";
    label = "上半场防守 · 下半场反击";
    desc = "上半场相对被动，下半场反击或追分意愿更强。";
  } else if (totalFor >= 1.7 && totalAgainst >= 1.45) {
    key = "open-game";
    label = "全场对攻开放";
    desc = "攻防两端都活跃，比赛容易打得开放、进球偏多。";
  } else if (totalAgainst <= 1.0 && totalFor >= 1.15) {
    key = "solid-attack";
    label = "稳守推进";
    desc = "失球控制较好，同时保持一定进球效率，攻守节奏稳健。";
  } else if (fhShare >= 0.58) {
    key = "early-attack";
    label = "偏上半场进球";
    desc = "本队进球更多出现在上半场，开局威胁更明显。";
  } else if (shShare >= 0.58) {
    key = "late-surge";
    label = "偏下半场进球";
    desc = "本队进球更多出现在下半场，后半段进攻权重更高。";
  }

  return {
    key,
    label,
    desc,
    n,
    avgFhFor,
    avgShFor,
    avgFhAgainst,
    avgShAgainst,
    fhShare,
    shShare,
    lateBloomRate,
    earlyLeadRate,
    fhCleanRate,
    shCleanRate,
    totalFor,
    totalAgainst,
  };
}

function buildMatchTempoAnalysis(homeTeam, awayTeam, homeMatches, awayMatches) {
  const home = classifyTeamTempoStyle(extractHalfSplits(homeMatches, homeTeam));
  const away = classifyTeamTempoStyle(extractHalfSplits(awayMatches, awayTeam));
  if (!home && !away) return null;

  const tips = [];
  if (home) tips.push(`${homeTeam}：${home.label}`);
  if (away) tips.push(`${awayTeam}：${away.label}`);

  let matchup = "";
  if (home && away) {
    if (home.key === "early-attack" && away.key === "late-surge") {
      matchup = `${homeTeam}更可能上半场施压，${awayTeam}更可能下半场追分/发力。`;
    } else if (home.key === "late-surge" && away.key === "early-attack") {
      matchup = `${awayTeam}开局威胁更大，${homeTeam}需熬过上半场再图下半场反扑。`;
    } else if (home.key === "low-block" || away.key === "low-block") {
      matchup = "至少一方偏防守小球，全场可能节奏偏慢，注意半场小球。";
    } else if (home.key === "open-game" && away.key === "open-game") {
      matchup = "双方都偏开放对攻，大球与多时段进球概率上升。";
    } else if (home.key === "early-attack" && away.key === "early-attack") {
      matchup = "双方都偏上半场进球，开局阶段进球概率更高。";
    } else if (home.key === "late-surge" && away.key === "late-surge") {
      matchup = "双方都偏下半场发力，关注下半场进球与比分变化。";
    } else if (home.key === "absorb-counter" || away.key === "absorb-counter") {
      matchup = "存在上半场防守、下半场反击的一侧，比赛可能先抑后扬。";
    } else {
      matchup = "双方节奏标签不同，可结合上半场走势判断谁先掌握主动。";
    }
  }

  return { home, away, tips, matchup };
}

function tempoStyleCardHtml(match, form) {
  if (!form || form.pending) return "";
  const data = form.tempoStyle;
  if (!data?.home && !data?.away) return "";

  const sideBlock = (team, style) => {
    if (!style) {
      return `
        <div class="tempo-side">
          <div class="tempo-side-name">${teamLabel(team)}</div>
          <p class="tempo-side-empty">半场样本不足，暂无风格判断</p>
        </div>`;
    }
    const fhPct = Math.round(style.fhShare * 100);
    const shPct = Math.round(style.shShare * 100);
    return `
      <div class="tempo-side">
        <div class="tempo-side-name">${teamLabel(team)}</div>
        <div class="tempo-style-label tempo-style-label--${style.key}">${style.label}</div>
        <p class="tempo-style-desc">${style.desc}</p>
        <div class="tempo-stat-grid">
          <div class="tempo-stat">
            <span class="tempo-stat-k">上半场</span>
            <span class="tempo-stat-v">场均进 ${style.avgFhFor.toFixed(1)} / 失 ${style.avgFhAgainst.toFixed(1)}</span>
          </div>
          <div class="tempo-stat">
            <span class="tempo-stat-k">下半场</span>
            <span class="tempo-stat-v">场均进 ${style.avgShFor.toFixed(1)} / 失 ${style.avgShAgainst.toFixed(1)}</span>
          </div>
          <div class="tempo-stat">
            <span class="tempo-stat-k">进球时段</span>
            <span class="tempo-stat-v">上半 ${fhPct}% · 下半 ${shPct}%</span>
          </div>
          <div class="tempo-stat">
            <span class="tempo-stat-k">样本</span>
            <span class="tempo-stat-v">近 ${style.n} 场含半场比分</span>
          </div>
        </div>
        <div class="tempo-share-bar" aria-hidden="true">
          <span class="tempo-share-fh" style="width:${fhPct}%"></span>
          <span class="tempo-share-sh" style="width:${shPct}%"></span>
        </div>
      </div>`;
  };

  return `
    <div class="prediction-tempo-card">
      <div class="prediction-form-card-head">
        <div class="prediction-source-name">比赛节奏 · 进球时段风格</div>
        <div class="prediction-source-tag">基于近况半场/全场拆解 · 上半场 vs 下半场</div>
      </div>
      ${data.matchup ? `<div class="tempo-matchup">${data.matchup}</div>` : ""}
      <div class="tempo-sides">
        ${sideBlock(match.home, data.home)}
        ${sideBlock(match.away, data.away)}
      </div>
    </div>`;
}

async function loadPredictionForm(match) {
  const local = state.allMatches || [];
  const homeBridge = findLocalBridgeMatchId(match.home, local, match.id);
  const awayBridge = findLocalBridgeMatchId(match.away, local, match.id);
  const [home, away, histories] = await Promise.all([
    fetchTeamRecentForm(match.home, {
      matchId: match.id,
      bridgeMatchId: homeBridge,
      localMatches: local,
      limit: COMMON_OPPONENT_MATCH_LIMIT,
      sideHint: "home",
    }),
    fetchTeamRecentForm(match.away, {
      matchId: match.id,
      bridgeMatchId: awayBridge,
      localMatches: local,
      limit: COMMON_OPPONENT_MATCH_LIMIT,
      sideHint: "away",
    }),
    fetchTeamHistories(match.id, COMMON_OPPONENT_MATCH_LIMIT).catch(() => null),
  ]);
  // fetchTeamRecentForm 已优先完赛；这里再兜底筛一次
  const homeAll = (home || []).filter((m) => m.finished && m.homeScore != null);
  const awayAll = (away || []).filter((m) => m.finished && m.homeScore != null);
  const homeForm = homeAll.slice(0, 10);
  const awayForm = awayAll.slice(0, 10);
  return {
    pending: false,
    home: homeForm,
    away: awayForm,
    // 比分/主客场分析用更长样本，便于拆出主场/客场场次
    scoreHome: homeAll,
    scoreAway: awayAll,
    h2h: getH2hList(histories, 10),
    commonOpponents: buildCommonOpponentsAnalysis(match.home, match.away, homeAll, awayAll),
    // 半场风格用近 10 场（与近况条一致），样本更贴合近期状态
    tempoStyle: buildMatchTempoAnalysis(match.home, match.away, homeForm, awayForm),
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
  const needFormReload =
    !form ||
    form.pending ||
    !form.commonOpponents ||
    !("tempoStyle" in form) ||
    !("h2h" in form) ||
    !form.scoreHome ||
    !form.scoreAway;

  const render = (analysis) => {
    if (els.subTitle.textContent !== "预测分析") return;
    const merged = { ...(analysis || {}), form };
    state.predictionCache.set(match.id, merged);
    els.subContent.innerHTML = predictionDetailHtml(match, merged);
    scheduleTeamNameMarquee(els.subContent);
  };

  const formPromise = needFormReload
    ? loadPredictionForm(match)
        .then((data) => {
          form = data;
          const cached = state.predictionCache.get(match.id) || { schema: ANALYSIS_SCHEMA, complete: false };
          render({ ...cached, form });
        })
        .catch(() => {
          form = {
            pending: false,
            home: [],
            away: [],
            scoreHome: [],
            scoreAway: [],
            h2h: [],
            commonOpponents: buildCommonOpponentsAnalysis(match.home, match.away, [], []),
            tempoStyle: null,
          };
          const cached = state.predictionCache.get(match.id);
          if (cached) render({ ...cached, form });
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
  const agencySources = (analysis.sources || []).filter((s) => !s.local);
  const consensus = analysis.consensus || analysis.summary || {};
  // 仅在有真实机构源时展示综合倾向；不用体彩隐含概率顶替
  const pick = agencySources.length ? consensus.pick : null;
  const scoreOutlook = buildScoreOutlook(match, analysis.form, consensus.goals);
  const webPending = !!analysis.webPending;
  const emptyNote = webPending
    ? "机构观点加载中…"
    : "暂无机构观点摘要。";

  return `
    <div class="detail-card prediction-summary-card">
      <h3>⚽ ${match.league || match.group}${match.num ? ` · ${match.num}` : ""}</h3>
      ${matchCardHtml(match, { static: true, hideMeta: true, hideRound: true })}
      ${
        pick
          ? `<div class="prediction-verdict">
              <div class="prediction-verdict-label">综合倾向</div>
              <div class="prediction-verdict-value prediction-verdict-value--${outcomeClass(pick.key)}">${pick.label}</div>
              <div class="prediction-verdict-meta">${consensus.tagline || consensus.confidence || "全网聚合"}</div>
            </div>
            ${probBarHtml(consensus.probs)}
            ${
              consensus.bullets?.length
                ? `<ul class="prediction-bullets">${consensus.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
                : ""
            }`
          : `<p class="prediction-empty-note">${emptyNote}</p>`
      }
    </div>

    <div class="prediction-section-title">赛果影响 · 谁更能接受平局</div>
    ${stakesReportHtml(analysis.stakes, { pending: !!analysis.stakesPending })}

    ${predictionFormCardHtml(match, analysis.form)}
    ${predictionScoreCardHtml(match, scoreOutlook)}
    ${tempoStyleCardHtml(match, analysis.form)}
    ${commonOpponentsCardHtml(match, analysis.form)}

    <div class="prediction-section-title">各家观点摘要</div>
    ${webSourcesHtml(analysis.sources || [], { pending: webPending })}

    ${injuryReportHtml(analysis.injury, match, { pending: !!analysis.injuryPending })}

    <p class="predictions-disclaimer">综合倾向仅来自公开机构摘要；精确比分由主客近况与共同对手泊松推算，大小球期望另按近况进球结构估算（互不改写）；赛果影响为启发式，仅供参考，不构成投注建议。</p>
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
      bridgeMatchId:
        findStandingsAnchorMatchId(group) || findLocalBridgeMatchId(team, state.allMatches, metaMatch?.id),
      localMatches: state.allMatches,
      limit: STANDINGS_RECENT_LIMIT,
      sideHint: metaMatch
        ? resolveTeamInMatch(metaMatch, team) === metaMatch.home
          ? "home"
          : resolveTeamInMatch(metaMatch, team) === metaMatch.away
            ? "away"
            : null
        : null,
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
