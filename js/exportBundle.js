/**
 * 内容导出 / 导入：竖屏近况图、共同对手图、预测 Excel、赛后核对标红
 */

import {
  teamResultLabel,
  formatHistoryScoreText,
  formatMatchWhen,
  resolveTeamInMatch,
} from "./matchHistory.js";
import { teamLabel } from "./teams.js";

const PHONE_W = 1080;
const PAD = 48;
const FONT =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

const RESULT_COLOR = {
  胜: "#059669",
  平: "#d97706",
  负: "#dc2626",
  未赛: "#9ca3af",
};

/** 近况每一场对局的区分底色（循环使用） */
const MATCH_ROW_COLORS = [
  "#E8F1FF",
  "#EAF8F0",
  "#FFF6E5",
  "#F3E8FF",
  "#E7F8F8",
  "#FFECEF",
  "#EEF2FF",
  "#F0FDF4",
  "#FEF3C7",
  "#FCE7F3",
];

let depsPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existed = document.querySelector(`script[data-export-dep="${src}"]`);
    if (existed) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.exportDep = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`依赖加载失败：${src}`));
    document.head.appendChild(s);
  });
}

async function loadDeps() {
  if (!depsPromise) {
    depsPromise = (async () => {
      if (!window.ExcelJS) {
        await loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
      }
      if (!window.JSZip) {
        await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
      }
      const ExcelJS = window.ExcelJS;
      const JSZip = window.JSZip;
      if (!ExcelJS || !JSZip) throw new Error("Excel / ZIP 库未就绪，请检查网络后重试");
      return { ExcelJS, JSZip };
    })();
  }
  return depsPromise;
}

function sanitizeName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "")
    .slice(0, 40);
}

function matchFolderName(match) {
  const num = sanitizeName(match.num || match.id || "场次");
  const home = sanitizeName(match.home);
  const away = sanitizeName(match.away);
  return `${num}_${home}_VS_${away}`;
}

function dateFolderName(match) {
  return match.beijingDateKey || match.date || "未分日期";
}

function wrapLines(ctx, text, maxWidth) {
  const chars = String(text || "");
  const lines = [];
  let line = "";
  for (const ch of chars) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillBackground(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f4f7fb");
  g.addColorStop(1, "#e8eef6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawHeader(ctx, match, title, y0) {
  let y = y0;
  ctx.fillStyle = "#1a1a2e";
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(title, PAD, y);
  y += 64;

  const meta = [match.num, match.leagueShort || match.league, match.beijingTime || match.time]
    .filter(Boolean)
    .join(" · ");
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText(meta, PAD, y);
  y += 52;

  ctx.fillStyle = "#111827";
  ctx.font = `700 40px ${FONT}`;
  const matchup = `${teamLabel(match.home)}  VS  ${teamLabel(match.away)}`;
  for (const line of wrapLines(ctx, matchup, PHONE_W - PAD * 2)) {
    ctx.fillText(line, PAD, y);
    y += 52;
  }
  y += 12;

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PHONE_W - PAD, y);
  ctx.stroke();
  return y + 36;
}

function scoreDetail(match) {
  if (!match?.finished || match.homeScore == null || match.awayScore == null) {
    return "未赛";
  }
  const parts = [`全场 ${match.homeScore}:${match.awayScore}`];
  if (match.homeHtScore != null && match.awayHtScore != null) {
    parts.unshift(`半场 ${match.homeHtScore}:${match.awayHtScore}`);
  }
  if (match.homeEtScore != null && match.awayEtScore != null) {
    parts.push(`加时 ${match.homeEtScore}:${match.awayEtScore}`);
  }
  if (match.homePenScore != null && match.awayPenScore != null) {
    parts.push(`点球 ${match.homePenScore}:${match.awayPenScore}`);
  }
  return parts.join(" · ");
}

function formatRecentLine(match, team) {
  const when = formatMatchWhen(match) || match.date || "";
  const home = teamLabel(match.home);
  const away = teamLabel(match.away);
  const result = teamResultLabel(match, team);
  const resolved = resolveTeamInMatch(match, team);
  const venue = resolved === match.home ? "主" : resolved === match.away ? "客" : "";
  const score = scoreDetail(match);
  return { when, home, away, result, venue, score };
}

function measureMatchRow(ctx, teamName, match, maxW) {
  const line = formatRecentLine(match, teamName);
  ctx.font = `600 26px ${FONT}`;
  let h = wrapLines(ctx, `${line.when}  ${line.home} VS ${line.away}`, maxW).length * 34;
  ctx.font = `400 24px ${FONT}`;
  const detail = `${line.venue ? `[${line.venue}] ` : ""}${line.score}`;
  h += wrapLines(ctx, detail, maxW - 80).length * 30;
  return h + 28; // 上下内边距
}

function measureRecentBlock(ctx, teamName, matches) {
  const maxW = PHONE_W - PAD * 2 - 40;
  let h = 52; // 标题
  if (!matches.length) return h + 56;
  for (const m of matches) {
    h += measureMatchRow(ctx, teamName, m, maxW) + 12; // 行间距
  }
  return h + 8;
}

function drawMatchRow(ctx, teamName, match, index, x, y, w) {
  const maxW = w - 40;
  const rowH = measureMatchRow(ctx, teamName, match, maxW);
  const bg = MATCH_ROW_COLORS[index % MATCH_ROW_COLORS.length];

  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.stroke();

  const line = formatRecentLine(match, teamName);
  let ty = y + 32;

  // 序号小标
  ctx.fillStyle = "rgba(17, 24, 39, 0.45)";
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`${index + 1}`, x + 14, ty - 8);

  ctx.fillStyle = "#111827";
  ctx.font = `600 26px ${FONT}`;
  for (const t of wrapLines(ctx, `${line.when}  ${line.home} VS ${line.away}`, maxW - 24)) {
    ctx.fillText(t, x + 36, ty);
    ty += 34;
  }

  ctx.fillStyle = "#4b5563";
  ctx.font = `400 24px ${FONT}`;
  const detail = `${line.venue ? `[${line.venue}] ` : ""}${line.score}`;
  for (const t of wrapLines(ctx, detail, maxW - 80)) {
    ctx.fillText(t, x + 36, ty);
    ty += 30;
  }

  // 右侧赛果
  ctx.fillStyle = RESULT_COLOR[line.result] || "#6b7280";
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(line.result, x + w - 56, y + 36);

  return y + rowH + 12;
}

function drawRecentBlock(ctx, teamName, matches, y0) {
  const boxX = PAD;
  const boxW = PHONE_W - PAD * 2;
  let y = y0;

  ctx.fillStyle = "#111827";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`${teamLabel(teamName)} · 近10场`, boxX, y);
  y += 44;

  if (!matches.length) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, boxX, y, boxW, 64, 14);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText("暂无近况数据", boxX + 24, y + 40);
    return y + 80;
  }

  matches.forEach((m, i) => {
    y = drawMatchRow(ctx, teamName, m, i, boxX, y, boxW);
  });
  return y + 16;
}

function measureH2hRow(ctx, match, maxW) {
  const when = formatMatchWhen(match) || match.date || "";
  const score = scoreDetail(match);
  ctx.font = `600 26px ${FONT}`;
  let h = wrapLines(ctx, `${when}  ${teamLabel(match.home)} VS ${teamLabel(match.away)}`, maxW).length * 34;
  ctx.font = `400 24px ${FONT}`;
  h += wrapLines(ctx, score, maxW - 80).length * 30;
  return h + 28;
}

function measureH2hBlock(ctx, matches) {
  const maxW = PHONE_W - PAD * 2 - 40;
  let h = 52;
  if (!matches.length) return h + 56;
  for (const m of matches) h += measureH2hRow(ctx, m, maxW) + 12;
  return h + 8;
}

function drawH2hRow(ctx, match, index, homeTeam, x, y, w) {
  const maxW = w - 40;
  const rowH = measureH2hRow(ctx, match, maxW);
  const bg = MATCH_ROW_COLORS[index % MATCH_ROW_COLORS.length];
  const result = teamResultLabel(match, homeTeam);

  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.stroke();

  const when = formatMatchWhen(match) || match.date || "";
  let ty = y + 32;
  ctx.fillStyle = "rgba(17, 24, 39, 0.45)";
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`${index + 1}`, x + 14, ty - 8);

  ctx.fillStyle = "#111827";
  ctx.font = `600 26px ${FONT}`;
  for (const t of wrapLines(ctx, `${when}  ${teamLabel(match.home)} VS ${teamLabel(match.away)}`, maxW - 24)) {
    ctx.fillText(t, x + 36, ty);
    ty += 34;
  }
  ctx.fillStyle = "#4b5563";
  ctx.font = `400 24px ${FONT}`;
  for (const t of wrapLines(ctx, scoreDetail(match), maxW - 80)) {
    ctx.fillText(t, x + 36, ty);
    ty += 30;
  }

  ctx.fillStyle = RESULT_COLOR[result] || "#6b7280";
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(result, x + w - 56, y + 36);
  return y + rowH + 12;
}

function drawH2hBlock(ctx, matches, homeTeam, y0) {
  const boxX = PAD;
  const boxW = PHONE_W - PAD * 2;
  let y = y0;

  ctx.fillStyle = "#111827";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`双方交手历史（${teamLabel(homeTeam)}视角）`, boxX, y);
  y += 44;

  if (!matches.length) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, boxX, y, boxW, 64, 14);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText("暂无交手记录", boxX + 24, y + 40);
    return y + 80;
  }

  matches.forEach((m, i) => {
    y = drawH2hRow(ctx, m, i, homeTeam, boxX, y, boxW);
  });
  return y + 16;
}

function drawSectionDivider(ctx, y) {
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PHONE_W - PAD, y);
  ctx.stroke();
  return y + 28;
}

function cropCanvasToY(canvas, y) {
  const finalH = Math.max(Math.ceil(y + 24), 400);
  if (finalH < canvas.height) {
    const cropped = document.createElement("canvas");
    cropped.width = PHONE_W;
    cropped.height = finalH;
    cropped.getContext("2d").drawImage(canvas, 0, 0);
    return cropped;
  }
  return canvas;
}

/**
 * 单场综合竖屏图：交手历史 + 双方近10场 + 共同对手对比
 */
export async function renderMatchHistoryBundleImage(match, {
  homeMatches = [],
  awayMatches = [],
  h2hMatches = [],
  commonOpponents = null,
} = {}) {
  const home = (homeMatches || []).filter((m) => m.finished).slice(0, 10);
  const away = (awayMatches || []).filter((m) => m.finished).slice(0, 10);
  const h2h = (h2hMatches || []).filter((m) => m.finished).slice(0, 10);
  const commonItems = (commonOpponents?.items || []).slice(0, 5);
  const windowLabel = commonOpponents?.windowLabel || "近1年";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `400 26px ${FONT}`;

  let height = 220;
  height += measureH2hBlock(ctx, h2h) + 24;
  height += measureRecentBlock(ctx, match.home, home) + 24;
  height += measureRecentBlock(ctx, match.away, away) + 24;
  if (commonItems.length) {
    if (commonOpponents?.summary?.text) {
      height += wrapLines(ctx, commonOpponents.summary.text, PHONE_W - PAD * 2).length * 36 + 16;
    }
    height += measureCommonBlock(ctx, commonItems, match.home, match.away) + 24;
  }
  height += 96;

  canvas.width = PHONE_W;
  canvas.height = Math.ceil(height);
  fillBackground(ctx, PHONE_W, canvas.height);

  let y = 72;
  y = drawHeader(ctx, match, "综合战绩", y);

  y = drawH2hBlock(ctx, h2h, match.home, y);
  y = drawSectionDivider(ctx, y);

  y = drawRecentBlock(ctx, match.home, home, y);
  y = drawRecentBlock(ctx, match.away, away, y);

  if (commonItems.length) {
    y = drawSectionDivider(ctx, y);
    if (commonOpponents?.summary?.text) {
      ctx.fillStyle = "#4b5563";
      ctx.font = `400 26px ${FONT}`;
      for (const line of wrapLines(ctx, commonOpponents.summary.text, PHONE_W - PAD * 2)) {
        ctx.fillText(line, PAD, y);
        y += 36;
      }
      y += 12;
    }
    y = drawCommonBlock(ctx, commonItems, match.home, match.away, y, windowLabel);
  }

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText("交手 + 近10场 + 共同对手同图 · 仅供娱乐参考", PAD, y + 8);
  y += 48;

  return canvasToPngBlob(cropCanvasToY(canvas, y));
}

/** 双方近 10 场竖屏图（同图，每场不同底色；高度随内容） */
export async function renderRecentFormImage(match, homeMatches, awayMatches) {
  return renderMatchHistoryBundleImage(match, {
    homeMatches,
    awayMatches,
    h2hMatches: [],
    commonOpponents: null,
  });
}

function measureCommonItem(ctx, it, homeName, awayName, maxW) {
  let h = 36;
  ctx.font = `400 24px ${FONT}`;
  h += wrapLines(ctx, formatCommonSide(it.home, homeName, it.opponent), maxW).length * 30;
  h += wrapLines(ctx, formatCommonSide(it.away, awayName, it.opponent), maxW).length * 30;
  return h + 28;
}

function measureCommonBlock(ctx, items, homeName, awayName) {
  const maxW = PHONE_W - PAD * 2 - 40;
  let h = 52;
  if (!items.length) return h + 56;
  for (const it of items) {
    h += measureCommonItem(ctx, it, homeName, awayName, maxW) + 12;
  }
  return h + 8;
}

function formatCommonSide(side, teamName, opponent) {
  if (!side?.match) return `${teamLabel(teamName)}：近1年未交手`;
  const m = side.match;
  const when = side.when || formatMatchWhen(m) || "";
  const score = scoreDetail(m);
  const full = formatHistoryScoreText(m) || `${m.homeScore}:${m.awayScore}`;
  return `${teamLabel(teamName)} ${side.venue || ""}场 ${side.result} · ${teamLabel(m.home)} VS ${teamLabel(m.away)} · ${score || full}${when ? ` · ${when}` : ""}`;
}

function drawCommonItem(ctx, it, index, homeName, awayName, x, y, w) {
  const maxW = w - 40;
  const rowH = measureCommonItem(ctx, it, homeName, awayName, maxW);
  const bg = MATCH_ROW_COLORS[index % MATCH_ROW_COLORS.length];

  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, rowH, 14);
  ctx.stroke();

  let ty = y + 32;
  ctx.fillStyle = "#1d4ed8";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(`${index + 1}. 共同对手：${teamLabel(it.opponent)}`, x + 18, ty);
  ty += 36;

  ctx.fillStyle = "#374151";
  ctx.font = `400 24px ${FONT}`;
  for (const t of wrapLines(ctx, formatCommonSide(it.home, homeName, it.opponent), maxW)) {
    ctx.fillText(t, x + 18, ty);
    ty += 30;
  }
  for (const t of wrapLines(ctx, formatCommonSide(it.away, awayName, it.opponent), maxW)) {
    ctx.fillText(t, x + 18, ty);
    ty += 30;
  }
  return y + rowH + 12;
}

function drawCommonBlock(ctx, items, homeName, awayName, y0, windowLabel = "近1年") {
  const boxX = PAD;
  const boxW = PHONE_W - PAD * 2;
  let y = y0;

  ctx.fillStyle = "#111827";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`${windowLabel}共同对手（最多5个）`, boxX, y);
  y += 44;

  if (!items.length) return y;

  items.forEach((it, i) => {
    y = drawCommonItem(ctx, it, i, homeName, awayName, boxX, y, boxW);
  });
  return y + 16;
}

/**
 * 共同对手竖屏图（最多 5 个）。
 * 无有效共同对手时返回 null，不输出图片。
 * 高度按内容自适应，不强制拉长。
 */
export async function renderCommonOpponentsImage(match, commonOpponents) {
  const items = (commonOpponents?.items || []).slice(0, 5);
  if (!items.length) return null;

  const windowLabel = commonOpponents?.windowLabel || "近1年";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `400 24px ${FONT}`;

  // 先量内容高度，再按内容出图
  let height = 72 + 180; // 顶距 + 标题区约估，绘制后裁切到实际
  if (commonOpponents?.summary?.text) {
    ctx.font = `400 26px ${FONT}`;
    height += wrapLines(ctx, commonOpponents.summary.text, PHONE_W - PAD * 2).length * 36 + 16;
  }
  height += measureCommonBlock(ctx, items, match.home, match.away) + 72;

  canvas.width = PHONE_W;
  canvas.height = Math.ceil(height);
  fillBackground(ctx, PHONE_W, canvas.height);

  let y = 72;
  y = drawHeader(ctx, match, "共同对手", y);

  if (commonOpponents?.summary?.text) {
    ctx.fillStyle = "#4b5563";
    ctx.font = `400 26px ${FONT}`;
    for (const line of wrapLines(ctx, commonOpponents.summary.text, PHONE_W - PAD * 2)) {
      ctx.fillText(line, PAD, y);
      y += 36;
    }
    y += 16;
  }

  y = drawCommonBlock(ctx, items, match.home, match.away, y, windowLabel);

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(`${windowLabel}共同对手最多5个 · 仅供参考`, PAD, y + 8);
  y += 48;

  // 按实际绘制高度裁切，去掉多余空白
  const finalH = Math.max(Math.ceil(y + 24), 400);
  if (finalH < canvas.height) {
    const cropped = document.createElement("canvas");
    cropped.width = PHONE_W;
    cropped.height = finalH;
    cropped.getContext("2d").drawImage(canvas, 0, 0);
    return canvasToPngBlob(cropped);
  }

  return canvasToPngBlob(canvas);
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片生成失败"));
    }, "image/png");
  });
}

const EXCEL_HEADERS = ["场次编号", "联赛信息", "对战队伍", "简要分析", "胜负预测", "半全场", "比分预测", "场次ID"];
const EXCEL_AVATAR_URL = new URL("../assets/excel-avatar.png", import.meta.url).href;
const EXCEL_COL_COUNT = 8;
const EXCEL_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

async function loadAvatarBuffer() {
  const res = await fetch(EXCEL_AVATAR_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error("标题头像加载失败");
  return res.arrayBuffer();
}

/**
 * 生成单个倾斜粉色水印（透明底）。
 * 用作工作表背景：在单元格之下，双击可直接编辑，不会点到图片。
 * 画布按表格像素尺寸生成，尽量让首个平铺块覆盖表格区域。
 */
async function createWatermarkBuffer(pixelW = 1200, pixelH = 1600) {
  const w = Math.max(800, Math.round(pixelW));
  const h = Math.max(900, Math.round(pixelH));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.max(52, Math.min(88, Math.floor(Math.min(w, h) / 12)));
  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.fillStyle = "rgba(244, 114, 182, 0.24)";
  ctx.fillText("cc体育预测", 0, 0);
  ctx.restore();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("水印生成失败"))), "image/png");
  });
  return blob.arrayBuffer();
}

function applyRowBorders(row, colCount = EXCEL_COL_COUNT) {
  for (let c = 1; c <= colCount; c += 1) {
    row.getCell(c).border = EXCEL_BORDER;
  }
}

/**
 * 按列宽估算中文自动换行行数（偏紧，减少行高虚高）
 * 列宽单位约半角字符数；中文约 2 宽，但微软雅黑 10 号实际略密。
 */
function estimateWrappedLines(text, colWidth) {
  const raw = String(text || "").trim();
  if (!raw) return 1;
  const charsPerLine = Math.max(10, Math.floor(colWidth * 0.72));
  const len = [...raw.replace(/\n+/g, "")].length || 1;
  return Math.max(1, Math.ceil(len / charsPerLine));
}

/** 简要分析紧凑展示：不强制一句一行，减少空白 */
function formatAnalysisForExcel(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/\n+/g, "")
    .trim();
}

/** 行高紧贴简要分析内容，压掉上下留白 */
function fitRowHeight(rowData, widths) {
  const analysis = formatAnalysisForExcel(rowData.analysis);
  const lines = Math.max(estimateWrappedLines(analysis, widths[3]), 1);
  // 字号 10：约 10.5pt/行，几乎不额外加边距
  return Math.min(110, Math.max(14, Math.ceil(lines * 10.5)));
}

export async function buildPredictionsWorkbook(rows) {
  const { ExcelJS } = await loadDeps();
  const wb = new ExcelJS.Workbook();
  wb.creator = "cc体育";
  const ws = wb.addWorksheet("预测导出", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // 简要分析列适当放宽；场次ID 列收窄供核对匹配
  const widths = [11, 10, 20, 72, 11, 12, 16, 10];
  // 垂直靠上，避免行高略大时上下对称留白显眼
  const centerMid = {
    horizontal: "center",
    vertical: "top",
    wrapText: true,
    shrinkToFit: false,
  };
  const centerMidShort = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
    shrinkToFit: false,
  };
  const colKeys = ["num", "league", "matchup", "analysis", "outcome", "half", "scores", "matchId"];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
    ws.getColumn(i + 1).key = colKeys[i];
    ws.getColumn(i + 1).alignment = centerMid;
  });

  // 第 1 行：标题区（合并居中 + 左侧头像）
  const TITLE_ROW_PT = 64;
  ws.mergeCells(1, 1, 1, EXCEL_COL_COUNT);
  const titleRow = ws.getRow(1);
  titleRow.height = TITLE_ROW_PT;
  const titleCell = titleRow.getCell(1);
  titleCell.value = {
    richText: [
      {
        font: { name: "微软雅黑", size: 18, bold: true, color: { argb: "FFFF0000" } },
        text: "cc体育每日分析",
      },
      {
        font: { name: "微软雅黑", size: 10, bold: false, color: { argb: "FFFF0000" } },
        text: "\n推荐仅供娱乐参考",
      },
    ],
  };
  titleCell.alignment = centerMidShort;
  applyRowBorders(titleRow);

  // 第 2 行：表头
  const header = ws.getRow(2);
  EXCEL_HEADERS.forEach((text, i) => {
    const cell = header.getCell(i + 1);
    cell.value = text;
    cell.font = { name: "微软雅黑", bold: true, size: 11, color: { argb: "FF000000" } };
    cell.alignment = centerMidShort;
  });
  header.height = 20;
  applyRowBorders(header);

  // 数据行：水平垂直居中；行高按完整内容估算，避免折叠截断
  for (const row of rows) {
    const analysis = formatAnalysisForExcel(row.analysis);
    const r = ws.addRow([
      row.num,
      row.league,
      row.matchup,
      analysis,
      row.outcome,
      row.half,
      row.scores,
      row.matchId || "",
    ]);
    r.height = fitRowHeight({ ...row, analysis }, widths);
    r.eachCell((cell, colNumber) => {
      cell.font = { name: "微软雅黑", size: 10, color: { argb: "FF111827" } };
      // 简要分析靠上贴内容；其余列垂直居中
      cell.alignment = colNumber === 4 ? centerMid : centerMidShort;
      cell.border = EXCEL_BORDER;
    });
    applyRowBorders(r);
  }

  const lastRow = Math.max(ws.rowCount, 2);

  // 水印：工作表背景（单元格下方），双击编辑不会点到图片
  try {
    const approxW = widths.reduce((s, w) => s + w, 0) * 8;
    let approxH = 0;
    for (let r = 1; r <= lastRow; r += 1) {
      approxH += ((ws.getRow(r).height || 18) * 96) / 72;
    }
    // 画布略大于表格，降低平铺后表格内出现第二个水印的概率
    const wmBuf = await createWatermarkBuffer(approxW * 1.05, approxH * 1.08);
    const wmId = wb.addImage({
      buffer: wmBuf,
      extension: "png",
    });
    ws.addBackgroundImage(wmId);
  } catch (err) {
    console.warn("Excel 水印未写入", err);
  }

  // 头像仅占标题行一角；浮动图只影响标题区点击
  try {
    const avatarBuf = await loadAvatarBuffer();
    const imageId = wb.addImage({
      buffer: avatarBuf,
      extension: "png",
    });
    const avatarPx = Math.round((TITLE_ROW_PT * 96) / 72) - 4;
    const vPadFrac = 2 / TITLE_ROW_PT;
    ws.addImage(imageId, {
      tl: { col: 0.18, row: vPadFrac },
      ext: { width: avatarPx, height: avatarPx },
      editAs: "oneCell",
    });
  } catch (err) {
    console.warn("Excel 头像未写入", err);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function parsePredictedOutcomes(text) {
  const keys = new Set();
  const parts = String(text || "")
    .split(/[、,，/｜|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length && String(text || "").trim()) parts.push(String(text).trim());
  for (const p of parts) {
    // 让球项不参与全场胜平负核对
    if (/^让/.test(p)) continue;
    if (/半主|半平|半负/.test(p)) continue;
    if (/双平|平局|^平$/.test(p)) keys.add("draw");
    else if (/主负|^负$|客胜/.test(p)) keys.add("away");
    else if (/主胜|^胜$/.test(p)) keys.add("home");
    else {
      if (/负|客/.test(p) && !/胜平负|让负/.test(p)) keys.add("away");
      if (/胜|主/.test(p) && !/主负|让胜|半主/.test(p)) keys.add("home");
      if (/平/.test(p) && !/让平|半平/.test(p)) keys.add("draw");
    }
  }
  return keys;
}

/** 解析半全场预测，如 胜胜、平负 */
function parsePredictedHalfFull(text) {
  const set = new Set();
  const parts = String(text || "")
    .split(/[、,，/｜|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^([胜平负])([胜平负])$/);
    if (m) set.add(`${m[1]}${m[2]}`);
  }
  return set;
}

function actualHalfFullLabel(match) {
  const ht = actualHalfOutcomeKey(match);
  const ft = actualOutcomeKey(match);
  if (!ht || !ft) return null;
  const map = { home: "胜", draw: "平", away: "负" };
  return `${map[ht]}${map[ft]}`;
}

function parsePredictedScores(text) {
  const scores = new Set();
  const re = /(\d+)\s*[-:：]\s*(\d+)/g;
  let m;
  const raw = String(text || "");
  while ((m = re.exec(raw))) {
    scores.add(`${Number(m[1])}-${Number(m[2])}`);
    scores.add(`${Number(m[1])}:${Number(m[2])}`);
  }
  return scores;
}

function actualOutcomeKey(match) {
  if (!match?.finished || match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore > match.awayScore) return "home";
  if (match.homeScore < match.awayScore) return "away";
  return "draw";
}

function actualHalfOutcomeKey(match) {
  if (match?.homeHtScore == null || match?.awayHtScore == null) return null;
  if (match.homeHtScore > match.awayHtScore) return "home";
  if (match.homeHtScore < match.awayHtScore) return "away";
  return "draw";
}

function redFill() {
  return {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFCCCC" },
  };
}

function redFont() {
  return { color: { argb: "FFDC2626" }, bold: true };
}

function clearMarkStyle(cell) {
  if (!cell) return;
  // 去掉上一次核对留下的红底/红字，再按本次导入内容重判
  cell.fill = undefined;
  const prev = cell.font || {};
  cell.font = {
    name: prev.name,
    size: prev.size,
    family: prev.family,
    bold: false,
    italic: !!prev.italic,
    underline: prev.underline,
    color: { argb: "FF111827" },
  };
}

function markHit(cell) {
  cell.fill = redFill();
  const prev = cell.font || {};
  cell.font = {
    name: prev.name,
    size: prev.size,
    family: prev.family,
    italic: prev.italic,
    underline: prev.underline,
    ...redFont(),
  };
}

function normalizeTeamKey(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/VS|vs|对阵/g, "")
    .replace(/足球俱乐部|足球队|俱乐部/g, "")
    .toLowerCase();
}

function teamNamesLooselyEqual(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // 简称过短时避免误伤（如「联合」）
  if (a.length >= 2 && b.length >= 2) {
    const short = a.length <= b.length ? a : b;
    const long = a.length > b.length ? a : b;
    if (short.length >= 3 && long.includes(short)) return true;
  }
  return false;
}

function parseMatchupTeams(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  // 优先 VS / 对阵，避免队名里的 "-" 被拆坏
  let parts = raw.split(/\s*(?:VS|vs|Vs|对阵|－|—)\s*/);
  if (parts.length < 2) parts = raw.split(/\s+-\s+/);
  if (parts.length < 2) return null;
  const home = parts[0].trim();
  const away = parts.slice(1).join(" - ").trim();
  if (!home || !away) return null;
  return { home, away };
}

function matchTeams(finished, teams) {
  if (!teams) return false;
  const homeKey = normalizeTeamKey(teams.home);
  const awayKey = normalizeTeamKey(teams.away);
  const mh = normalizeTeamKey(finished.home);
  const ma = normalizeTeamKey(finished.away);
  return teamNamesLooselyEqual(mh, homeKey) && teamNamesLooselyEqual(ma, awayKey);
}

function findFinishedMatch(finishedMatches, { num, matchup, matchId }) {
  const idKey = String(matchId || "").trim();
  if (idKey) {
    const byId = finishedMatches.find((m) => String(m.id) === idKey);
    if (byId) return byId;
  }

  const numKey = String(num || "").trim();
  const teams = parseMatchupTeams(matchup);

  if (numKey) {
    const numHits = finishedMatches.filter(
      (m) => String(m.num || "").trim() === numKey || String(m.matchNum ?? "").trim() === numKey
    );
    if (numHits.length === 1) {
      // 有队名时校验，避免周编号串场；对不上则继续用队名匹配
      if (!teams || matchTeams(numHits[0], teams)) return numHits[0];
    } else if (numHits.length > 1) {
      if (teams) {
        const byTeams = numHits.find((m) => matchTeams(m, teams));
        if (byTeams) return byTeams;
      } else {
        return numHits[0];
      }
    }
  }

  if (!teams) return null;
  return finishedMatches.find((m) => matchTeams(m, teams)) || null;
}

/** 按表头识别列；结构不变时兼容用户只改内容 */
function resolveImportColumns(headerRow) {
  const map = {
    num: 1,
    league: 2,
    matchup: 3,
    analysis: 4,
    outcome: 5,
    half: 6,
    scores: 7,
    matchId: 0,
    actualOutcome: 9,
    actualScore: 10,
    actualHalf: 11,
  };
  headerRow.eachCell((cell, col) => {
    const t = cellText(cell).replace(/\s+/g, "");
    // 先匹配「实际*」，避免「实际半全场」被「半全场」抢走
    if (/实际半全场|实际半场/.test(t)) map.actualHalf = col;
    else if (/实际赛果/.test(t)) map.actualOutcome = col;
    else if (/实际比分/.test(t)) map.actualScore = col;
    else if (/场次ID|比赛ID|matchId/i.test(t)) map.matchId = col;
    else if (/场次编号|^场次$/.test(t)) map.num = col;
    else if (/联赛/.test(t)) map.league = col;
    else if (/对战|对阵|队伍/.test(t)) map.matchup = col;
    else if (/简要分析/.test(t) || (/分析/.test(t) && !/每日分析/.test(t))) map.analysis = col;
    else if (/胜负预测|胜平负/.test(t)) map.outcome = col;
    else if (/半全场|半场预测/.test(t)) map.half = col;
    else if (/比分预测/.test(t)) map.scores = col;
  });
  // 旧表无半场列时：比分在第 6 列（且尚未识别出「实际*」表头）
  const halfText = map.half ? cellText(headerRow.getCell(map.half)) : "";
  const hasActualHeader = /实际/.test(cellText(headerRow.getCell(map.actualOutcome)));
  if (!halfText.includes("半场") && /比分/.test(cellText(headerRow.getCell(6)))) {
    map.half = 0;
    map.scores = 6;
    if (!hasActualHeader) {
      map.actualOutcome = 7;
      map.actualScore = 8;
      map.actualHalf = 9;
    }
  }
  return map;
}

/** 查找含「场次编号」的表头行（兼容首行标题） */
function findHeaderRowNumber(ws) {
  const maxScan = Math.min(ws.rowCount || 0, 8);
  for (let r = 1; r <= maxScan; r += 1) {
    const row = ws.getRow(r);
    let hit = false;
    row.eachCell((cell) => {
      const t = cellText(cell).replace(/\s+/g, "");
      if (t.includes("场次编号") || t === "场次") hit = true;
    });
    if (hit) return r;
  }
  return 1;
}

/**
 * 导入预测表并标红：只依据「导入文件里当前单元格内容」核对，
 * 与导出时的原始预测无关；用户改过胜负/比分后按改后的值判断。
 * @param {File} file
 * @param {object[]} finishedMatches
 */
export async function gradeImportedWorkbook(file, finishedMatches = []) {
  const { ExcelJS } = await loadDeps();
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel 中没有工作表");

  const headerRowNumber = findHeaderRowNumber(ws);
  const headerRow = ws.getRow(headerRowNumber);
  const cols = resolveImportColumns(headerRow);
  // 始终保证赛果三列存在（兼容旧表或列被挪走）
  const needActualHeaders =
    !/实际赛果/.test(cellText(headerRow.getCell(cols.actualOutcome))) ||
    !/实际比分/.test(cellText(headerRow.getCell(cols.actualScore))) ||
    !/实际半全场|实际半场/.test(cellText(headerRow.getCell(cols.actualHalf)));
  if (needActualHeaders) {
    headerRow.getCell(cols.actualOutcome).value = "实际赛果";
    headerRow.getCell(cols.actualScore).value = "实际比分";
    headerRow.getCell(cols.actualHalf).value = "实际半全场";
    headerRow.getCell(cols.actualOutcome).font = { bold: true, name: "微软雅黑" };
    headerRow.getCell(cols.actualScore).font = { bold: true, name: "微软雅黑" };
    headerRow.getCell(cols.actualHalf).font = { bold: true, name: "微软雅黑" };
    headerRow.getCell(cols.actualOutcome).border = EXCEL_BORDER;
    headerRow.getCell(cols.actualScore).border = EXCEL_BORDER;
    headerRow.getCell(cols.actualHalf).border = EXCEL_BORDER;
    ws.getColumn(cols.actualOutcome).width = 12;
    ws.getColumn(cols.actualScore).width = 12;
    ws.getColumn(cols.actualHalf).width = 12;
  }

  let graded = 0;
  let pending = 0;
  let outcomeHits = 0;
  let scoreHits = 0;
  let halfHits = 0;
  let unmatched = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const num = cellText(row.getCell(cols.num)).trim();
    const matchup = cellText(row.getCell(cols.matchup)).trim();
    const matchId = cols.matchId ? cellText(row.getCell(cols.matchId)).trim() : "";
    if (!num && !matchup && !matchId) return;
    // 跳过误扫到的标题行
    if (/每日分析|娱乐参考/.test(`${num}${matchup}`)) return;

    // 始终以导入表当前内容为准（用户可能已改过）
    const outcomeCell = row.getCell(cols.outcome);
    const scoreCell = row.getCell(cols.scores);
    const halfCell = cols.half ? row.getCell(cols.half) : null;
    const outcomeText = cellText(outcomeCell).trim();
    const scoreText = cellText(scoreCell).trim();
    const halfText = halfCell ? cellText(halfCell).trim() : "";

    // 先清掉旧标红，避免沿用上一次核对结果
    clearMarkStyle(outcomeCell);
    clearMarkStyle(scoreCell);
    if (halfCell) clearMarkStyle(halfCell);

    const match = findFinishedMatch(finishedMatches, { num, matchup, matchId });
    if (!match) {
      unmatched += 1;
      row.getCell(cols.actualOutcome).value = "未完赛/未匹配";
      row.getCell(cols.actualScore).value = "";
      row.getCell(cols.actualHalf).value = "";
      row.getCell(cols.actualOutcome).border = EXCEL_BORDER;
      row.getCell(cols.actualScore).border = EXCEL_BORDER;
      row.getCell(cols.actualHalf).border = EXCEL_BORDER;
      pending += 1;
      return;
    }

    graded += 1;
    const actualKey = actualOutcomeKey(match);
    const actualHalfKey = actualHalfOutcomeKey(match);
    const actualScoreDash = `${Number(match.homeScore)}-${Number(match.awayScore)}`;
    const actualScoreColon = `${Number(match.homeScore)}:${Number(match.awayScore)}`;

    if (actualKey && parsePredictedOutcomes(outcomeText).has(actualKey)) {
      markHit(outcomeCell);
      outcomeHits += 1;
    }
    const predicted = parsePredictedScores(scoreText);
    if (predicted.has(actualScoreDash) || predicted.has(actualScoreColon)) {
      markHit(scoreCell);
      scoreHits += 1;
    }
    if (halfCell && halfText && halfText !== "—") {
      const actualHf = actualHalfFullLabel(match);
      if (actualHf && parsePredictedHalfFull(halfText).has(actualHf)) {
        markHit(halfCell);
        halfHits += 1;
      }
      halfCell.border = EXCEL_BORDER;
    }

    const label =
      actualKey === "home" ? "主胜" : actualKey === "away" ? "主负" : actualKey === "draw" ? "平局" : "";
    const halfFull = actualHalfFullLabel(match);
    row.getCell(cols.actualOutcome).value = label;
    row.getCell(cols.actualScore).value = actualScoreColon;
    row.getCell(cols.actualHalf).value = halfFull || (actualHalfKey == null ? "无半场" : "");
    row.getCell(cols.actualOutcome).border = EXCEL_BORDER;
    row.getCell(cols.actualScore).border = EXCEL_BORDER;
    row.getCell(cols.actualHalf).border = EXCEL_BORDER;
    outcomeCell.border = EXCEL_BORDER;
    scoreCell.border = EXCEL_BORDER;
  });

  const out = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    graded,
    pending,
    unmatched,
    outcomeHits,
    scoreHits,
    halfHits,
  };
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink && v.text) return String(v.text);
    if (v.formula != null && v.result != null) return String(v.result);
  }
  return String(v);
}

export async function packExportZip({ dayFolders, excelBlob, zipName }) {
  const { JSZip } = await loadDeps();
  const zip = new JSZip();
  for (const day of dayFolders) {
    const dayFolder = zip.folder(day.name);
    for (const match of day.matches) {
      const folder = dayFolder.folder(match.folder);
      if (match.historyPng) folder.file("01_综合战绩.png", match.historyPng);
      // 兼容旧字段
      if (!match.historyPng && match.recentPng) folder.file("01_近期10场.png", match.recentPng);
      if (!match.historyPng && match.commonPng) folder.file("02_共同对手.png", match.commonPng);
    }
  }
  if (excelBlob) zip.file("预测表.xlsx", excelBlob);
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName || `竞彩导出_${stamp()}.zip`);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export { matchFolderName, dateFolderName, sanitizeName, loadDeps, stamp };
