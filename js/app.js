import {
  getBundledWorldCupData,
  fetchLatestWorldCupData,
  startAutoDataRefresh,
  filterByDays,
  sortMatchesByTime,
  getPreviousMatch,
  getNextMatch,
  matchScoreDetail,
  formatDateSectionLabel,
} from "./data.js";
import { computeAllStandings, getTeamPoints, getTeamGroupRank } from "./standings.js";
import { analyzeMatchScenario, STATUS_META } from "./scenarios.js";
import { analyzeThirdPlaceRace, THIRD_PLACE_SLOTS } from "./thirdPlace.js";
import {
  flagHtml,
  teamLabel,
  teamInlineHtml,
  enrichTextWithTeamFlags,
  isRealTeam,
} from "./teams.js";

const state = {
  tab: "schedule",
  dayFilter: "all",
  scenarioDayFilter: "all",
  selectedScenarioMatchId: "all",
  showPoints: localStorage.getItem("showPoints") !== "false",
  matches: [],
  dataSource: "bundled",
  sourceLabel: "内置数据",
  subPage: null,
  subPageParent: null,
  scenarioContextMatch: null,
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
  schedule: { title: "赛程", sub: "2026 FIFA 世界杯 · 北京时间" },
  standings: { title: "积分榜", sub: "小组排名 · 实时计算" },
  scenarios: { title: "出线分析", sub: "小组前两名出线形势" },
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

  const bundled = getBundledWorldCupData();
  state.matches = bundled.matches;
  state.dataSource = bundled.source;
  state.sourceLabel = bundled.sourceLabel;
  render();

  startAutoDataRefresh(applyFetchedData);
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

  els.backBtn.addEventListener("click", () => {
    if (state.subPageParent?.type === "scenario") {
      openScenarioDetail(state.subPageParent.match, true);
      state.subPageParent = null;
      return;
    }
    closeSubPage();
  });

  document.addEventListener("click", async (e) => {
    if (e.target.id === "open-third-place-btn") {
      state.subPageParent = { type: "scenario", match: state.scenarioContextMatch };
      openThirdPlaceCompare();
      return;
    }
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
      if (state.tab === "schedule" || state.tab === "scenarios") {
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
  els.main.innerHTML = `<div class="loading"><div class="spinner"></div><span>加载赛程数据…</span></div>`;
}

function render() {
  updateTabs();
  if (state.tab === "schedule") renderSchedule();
  else if (state.tab === "standings") renderStandings();
  else renderScenarios();
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
  return filterByDays(upcoming, dayFilter, now);
}

function renderSchedule() {
  const matches = upcomingMatches(state.dayFilter);
  const html = [
    renderScheduleToolbar(state.dayFilter),
    matches.length
      ? groupMatchesByDate(matches)
          .map(({ label, items }) => sectionMatches(label, items, "schedule"))
          .join("")
      : `<div class="empty-state"><div class="icon">📭</div><p>该时间段暂无比赛</p></div>`,
    dataSourceNote(),
  ].join("");

  els.main.innerHTML = html;
  bindFilterBar(els.main, "dayFilter");
  bindPointsSwitch(els.main);
  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);
}

function renderScheduleToolbar(currentFilter) {
  return `
    <div class="schedule-toolbar">
      ${renderFilterBar(currentFilter)}
      <label class="switch-wrap" title="显示球队积分">
        <span class="switch-label">积分</span>
        <input type="checkbox" id="show-points-switch" ${state.showPoints ? "checked" : ""}>
        <span class="switch-track" aria-hidden="true"></span>
      </label>
    </div>
  `;
}

function bindPointsSwitch(container) {
  const input = container.querySelector("#show-points-switch");
  if (!input) return;
  input.addEventListener("change", () => {
    state.showPoints = input.checked;
    localStorage.setItem("showPoints", String(state.showPoints));
    renderSchedule();
  });
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

function formatPtsLabel(points, rank) {
  if (rank) return `${points} 分 · 第 ${rank} 名`;
  return `${points} 分`;
}

function formatPtsInline(points, rank) {
  if (rank) return `(${points}·第${rank}名)`;
  return `(${points})`;
}

function matchCardHtml(m, mode = "schedule", opts = {}) {
  const showPoints = mode === "schedule" ? state.showPoints : true;
  const showRank = opts.showRank === true;
  const homePts =
    m.group && isRealTeam(m.home)
      ? getTeamPoints(state.matches, m.home, m.group)
      : null;
  const awayPts =
    m.group && isRealTeam(m.away)
      ? getTeamPoints(state.matches, m.away, m.group)
      : null;
  const homeRank =
    showRank && m.group ? getTeamGroupRank(state.matches, m.home, m.group) : null;
  const awayRank =
    showRank && m.group ? getTeamGroupRank(state.matches, m.away, m.group) : null;

  const scenario =
    mode === "scenarios" ? analyzeMatchScenario(state.matches, m) : null;
  const scenarioTags = scenario
    ? [scenario.home, scenario.away]
        .flatMap((s) => {
          const tags = [];
          if (s.showOnCard) tags.push(statusTag(s.label, s.status));
          if (s.showGdOnCard && s.gdLabel) tags.push(gdTag(s.gdLabel));
          return tags;
        })
        .join("")
    : "";

  const groupLabel = m.group ? `${m.group} 组` : m.round;
  const staticCard = opts.static === true;
  const hideGroup = opts.hideGroup === true;

  return `
    <article class="match-card ${m.finished ? "finished" : ""}${staticCard ? " match-card--static" : ""}"${staticCard ? "" : ` data-match-id="${m.id}" data-mode="${mode}"`}>
      <div class="match-card-line${hideGroup ? " match-card-line--no-group" : ""}">
        ${hideGroup ? "" : `<span class="group-badge">${groupLabel}</span>`}
        ${teamInline(m.home, homePts, showPoints, m.finished ? m.homeScore : null, "home", homeRank)}
        <span class="match-vs">VS</span>
        ${teamInline(m.away, awayPts, showPoints, m.finished ? m.awayScore : null, "away", awayRank)}
        <span class="match-time">${m.beijingTime || "待定"}</span>
      </div>
      ${scenarioTags ? `<div class="scenario-summary">${scenarioTags}</div>` : ""}
    </article>
  `;
}

function teamInline(name, points, showPoints, score, side, rank = null) {
  const pts =
    showPoints && points !== null
      ? `<span class="team-pts">${formatPtsInline(points, rank)}</span>`
      : "";
  const scoreHtml =
    score !== null ? `<span class="team-score-inline">${score}</span>` : "";
  const nameBlock = `
    <span class="team-name-scroll">
      <span class="team-name-track">${teamLabel(name)}${pts}${scoreHtml}</span>
    </span>`;
  const flag = flagHtml(name, 22);

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

function statusTag(label, status) {
  const meta = STATUS_META[status] || STATUS_META.complex;
  return `<span class="status-tag ${meta.className}">${meta.icon} ${label}</span>`;
}

function gdTag(label) {
  const meta = STATUS_META.gd;
  return `<span class="status-tag ${meta.className}">${meta.icon} ${label}</span>`;
}

function bindMatchCards(container) {
  container.querySelectorAll(".match-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.matchId);
      const mode = card.dataset.mode;
      const match = state.matches.find((m) => m.id === id);
      if (!match) return;
      if (mode === "scenarios") openScenarioDetail(match);
      else openMatchDetail(match);
    });
  });
}

function renderStandings() {
  const groups = computeAllStandings(state.matches);
  els.main.innerHTML = [
    groups.map((g) => standingsGroupHtml(g)).join(""),
    dataSourceNote(),
  ].join("");
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
            .map(
              (r, i) => `
            <tr class="${i < 2 ? "qualified" : i === 2 ? "possible" : ""}">
              <td class="rank">${i + 1}</td>
              <td><div class="team-cell">${flagHtml(r.team, 20)}${teamLabel(r.team)}</div></td>
              <td>${r.mp}</td>
              <td>${r.w}</td>
              <td>${r.d}</td>
              <td>${r.l}</td>
              <td>${r.gf}</td>
              <td>${r.ga}</td>
              <td>${r.gd > 0 ? "+" + r.gd : r.gd}</td>
              <td class="pts">${r.pts}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderScenarios() {
  let matches = upcomingMatches(state.scenarioDayFilter).filter(
    (m) => m.group && !m.finished && isRealTeam(m.home) && isRealTeam(m.away)
  );

  if (state.selectedScenarioMatchId !== "all") {
    const id = Number(state.selectedScenarioMatchId);
    matches = matches.filter((m) => m.id === id);
  }

  const allGroupMatches = sortMatchesByTime(
    state.matches.filter(
      (m) => m.group && !m.finished && isRealTeam(m.home) && isRealTeam(m.away)
    )
  );

  els.main.innerHTML = [
    renderFilterBar(state.scenarioDayFilter),
    `
      <div class="select-row">
        <label for="match-select">筛选比赛</label>
        <select id="match-select">
          <option value="all">全部未赛小组赛</option>
          ${allGroupMatches
            .map(
              (m) =>
                `<option value="${m.id}" ${state.selectedScenarioMatchId === String(m.id) ? "selected" : ""}>${m.beijingFull} · ${teamLabel(m.home)} vs ${teamLabel(m.away)}</option>`
            )
            .join("")}
        </select>
      </div>
    `,
    matches.length
      ? groupMatchesByDate(matches)
          .map(({ label, items }) => sectionMatches(label, items, "scenarios"))
          .join("")
      : `<div class="empty-state"><div class="icon">🎯</div><p>暂无符合条件的比赛</p></div>`,
    dataSourceNote(),
  ].join("");

  bindFilterBar(els.main, "scenarioDayFilter");
  bindMatchCards(els.main);
  scheduleTeamNameMarquee(els.main);

  const select = document.getElementById("match-select");
  select?.addEventListener("change", () => {
    state.selectedScenarioMatchId = select.value;
    render();
  });
}

function openMatchDetail(match) {
  const team = match.home;
  const prev = getPreviousMatch(state.matches, team, match);
  const next = getNextMatch(state.matches, team, match);
  const pts = match.group ? getTeamPoints(state.matches, team, match.group) : 0;
  const rank = match.group ? getTeamGroupRank(state.matches, team, match.group) : null;
  const prevScore = prev ? matchScoreDetail(prev) : null;

  els.subTitle.textContent = "球队详情";
  els.subContent.innerHTML = `
    <div class="hero-team">
      ${flagHtml(team, 40)}
      <div>
        <div class="name">${teamLabel(team)}</div>
        <div class="meta">${match.group ? `${match.group} 组 · 当前 ${formatPtsLabel(pts, rank)}` : match.round}</div>
      </div>
    </div>

    <div class="detail-card detail-card--prev">
      <h3>⏮ 上一轮战绩</h3>
      ${
        prev
          ? `
        <div class="detail-row"><span class="label">对手</span><span class="value">${flagHtml(prev.home === team ? prev.away : prev.home, 20)} ${teamLabel(prev.home === team ? prev.away : prev.home)}</span></div>
        <div class="detail-row"><span class="label">北京时间</span><span class="value">${prev.beijingFull}</span></div>
        <div class="detail-row"><span class="label">比分</span><span class="value">${prevScore}</span></div>
      `
          : `<p class="detail-empty">暂无已完成的上轮比赛</p>`
      }
    </div>

    <div class="detail-match-current">
      <h3>📋 当前比赛</h3>
      ${matchCardHtml(match, "schedule", { static: true, showRank: true, hideGroup: true })}
    </div>

    <div class="detail-card detail-card--next">
      <h3>⏭ 下一轮比赛</h3>
      ${
        next
          ? `
        <div class="detail-row"><span class="label">对手</span><span class="value">${flagHtml(next.home === team ? next.away : next.home, 20)} ${teamLabel(next.home === team ? next.away : next.home)}</span></div>
        <div class="detail-row"><span class="label">北京时间</span><span class="value">${next.beijingFull}</span></div>
        ${next.ground ? `<div class="detail-row"><span class="label">球场</span><span class="value">${next.ground}</span></div>` : ""}
      `
          : `<p class="detail-empty">该队暂无后续小组赛程</p>`
      }
    </div>
  `;

  showSubPage();
  scheduleTeamNameMarquee(els.subContent);
}

function openScenarioDetail(match, fromChild = false) {
  if (!fromChild) state.subPageParent = null;
  state.scenarioContextMatch = match;
  const analysis = analyzeMatchScenario(state.matches, match);
  if (!analysis) return;

  els.subTitle.textContent = "出线形势";
  els.subContent.innerHTML = `
    <div class="detail-card">
      <h3>⚽ 比赛信息</h3>
      <div class="detail-row"><span class="label">对阵</span><span class="value">${teamInlineHtml(match.home, 20)} vs ${teamInlineHtml(match.away, 20)}</span></div>
      <div class="detail-row"><span class="label">北京时间</span><span class="value">${match.beijingFull}</span></div>
      <div class="detail-row"><span class="label">小组</span><span class="value">${match.group} 组</span></div>
    </div>

    ${scenarioTeamBlock(match.home, analysis.home, match)}
    ${scenarioTeamBlock(match.away, analysis.away, match)}

    <div class="detail-card">
      <h3>ℹ️ 说明</h3>
      <p class="detail-note">
        分析基于当前积分榜与小组剩余场次，枚举所有可能赛果组合，判断各队能否进入<strong>小组前两名</strong>。
        2026 世界杯另有 8 个「最佳第三名」出线名额，需跨组比较后确定。
      </p>
      <button class="action-btn" id="open-third-place-btn" type="button">查看跨组比较 · 分析最佳第三名</button>
    </div>
  `;

  showSubPage();
}

function openThirdPlaceCompare() {
  const data = analyzeThirdPlaceRace(state.matches);
  els.subTitle.textContent = "最佳第三名比较";

  const cutoffText = data.cutoff
    ? `第 8 名门槛：${data.cutoff.pts} 分 · 净胜 ${data.cutoff.gd > 0 ? "+" + data.cutoff.gd : data.cutoff.gd} · 进球 ${data.cutoff.gf}`
    : "暂无完整第三名数据";

  const possibleNames = data.possibleTop8
    .map((t) => teamLabel(t.team))
    .join("、");

  els.subContent.innerHTML = `
    <div class="detail-card third-summary">
      <h3>🌐 跨组出线概况</h3>
      <p class="detail-note">12 个小组第三名按积分、净胜球、进球数排序，<strong>前 ${THIRD_PLACE_SLOTS} 名</strong>额外出线。</p>
      <div class="third-cutoff">${cutoffText}</div>
      <div class="third-possible">
        <strong>有望出线（${data.possibleTop8.length} 支）</strong>
        <p>${possibleNames || "暂无"}</p>
      </div>
    </div>

    <div class="third-table-wrap">
      <table class="third-table">
        <thead>
          <tr>
            <th>#</th>
            <th>球队</th>
            <th>组</th>
            <th>分</th>
            <th>净</th>
            <th>进</th>
            <th>形势</th>
          </tr>
        </thead>
        <tbody>
          ${data.teamAnalysis
            .map(
              (row) => `
            <tr class="${row.inTop8 ? "third-in" : "third-out"} third-${row.status}">
              <td>${row.rankAmongThird}</td>
              <td><div class="team-cell">${flagHtml(row.team, 20)}${teamLabel(row.team)}</div></td>
              <td>${row.group}</td>
              <td>${row.pts}</td>
              <td>${row.gd > 0 ? "+" + row.gd : row.gd}</td>
              <td>${row.gf}</td>
              <td><span class="third-tag ${row.status}">${row.statusLabel}</span></td>
            </tr>
            <tr class="third-desc-row ${row.inTop8 ? "third-in" : "third-out"}">
              <td colspan="7">${row.desc}${row.bestRank !== row.worstRank ? `（排名区间：第 ${row.bestRank}–${row.worstRank} 名）` : ""}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="detail-card">
      <h3>ℹ️ 说明</h3>
      <p class="detail-note">
        各组仅模拟本组剩余比赛，其他组第三名按<strong>当前战绩</strong>固定计算，用于估算排名区间。
        实际出线需 12 组全部结束后综合比较；若某组第三名可能易主，结论会有偏差。
      </p>
    </div>
  `;

  showSubPage();
}

function scenarioTeamBlock(team, analysis, match) {
  const meta = STATUS_META[analysis.status] || STATUS_META.complex;
  const ctx = analysis.context || {};
  const pts = ctx.pts ?? getTeamPoints(state.matches, team, match.group);
  const rankText = ctx.rank ? `第 ${ctx.rank} 名 · ` : "";
  const gdText =
    analysis.currentGd > 0 ? `+${analysis.currentGd}` : String(analysis.currentGd ?? 0);
  const outcomes = [
    analysis.winOk !== undefined && `取胜：${analysis.winOk ? "可出线" : "无法出线"}`,
    analysis.drawOk !== undefined && `平局：${analysis.drawOk ? "可出线" : "无法出线"}`,
    analysis.lossOk !== undefined && `失利：${analysis.lossOk ? "可出线" : "无法出线"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const contextLines = [ctx.prevSummary, ctx.nextSummary]
    .filter(Boolean)
    .map((line) => enrichTextWithTeamFlags(line, 18))
    .join("<br>");

  const gdRivalsText =
    analysis.gdRivals?.length > 0
      ? `<br>同分竞争对手：${analysis.gdRivals.map((r) => teamInlineHtml(r, 18)).join("、")}`
      : "";

  const gdDetail = analysis.gdNeeded
    ? `<div class="gd-detail"><strong>📐 净胜球</strong>：${enrichTextWithTeamFlags(analysis.gdDesc || analysis.gdLabel, 18)}${gdRivalsText}</div>`
    : "";

  return `
    <div class="scenario-block ${meta.className}${analysis.gdNeeded ? " has-gd" : ""}">
      <h4>${teamInlineHtml(team, 22)} · ${analysis.label}${analysis.gdNeeded && analysis.gdLabel ? ` · ${analysis.gdLabel}` : ""}</h4>
      ${contextLines ? `<div class="scenario-context">${contextLines}</div>` : ""}
      <p>${enrichTextWithTeamFlags(analysis.desc, 18)}</p>
      <div class="hint">${rankText}${pts} 分 · 净胜球 ${gdText}（${match.group} 组）${outcomes ? "<br>" + outcomes : ""}</div>
      ${gdDetail}
    </div>
  `;
}

function showSubPage() {
  els.subPage.classList.remove("hidden");
  els.subPage.setAttribute("aria-hidden", "false");
}

function closeSubPage() {
  state.subPageParent = null;
  state.scenarioContextMatch = null;
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
