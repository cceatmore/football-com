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

function measureRecentBlock(ctx, teamName, matches) {
  let h = 56 + 44;
  ctx.font = `600 26px ${FONT}`;
  const maxW = PHONE_W - PAD * 2 - 48;
  for (const m of matches) {
    const line = formatRecentLine(m, teamName);
    const row = `${line.when}  ${line.home} VS ${line.away}`;
    h += wrapLines(ctx, row, maxW).length * 34;
    ctx.font = `400 24px ${FONT}`;
    const detail = `${line.venue ? `[${line.venue}] ` : ""}${line.score}  赛果 ${line.result}`;
    h += wrapLines(ctx, detail, maxW).length * 30;
    h += 14;
    ctx.font = `600 26px ${FONT}`;
  }
  if (!matches.length) h += 40;
  return h + 28;
}

function drawRecentBlock(ctx, teamName, matches, y0) {
  let y = y0;
  const boxX = PAD;
  const boxW = PHONE_W - PAD * 2;
  const boxH = measureRecentBlock(ctx, teamName, matches);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, boxX, y, boxW, boxH, 20);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, y, boxW, boxH, 20);
  ctx.stroke();

  y += 44;
  ctx.fillStyle = "#111827";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`${teamLabel(teamName)} · 近10场`, boxX + 24, y);
  y += 44;

  if (!matches.length) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText("暂无近况数据", boxX + 24, y);
    return y0 + boxH + 28;
  }

  const maxW = boxW - 48;
  for (const m of matches) {
    const line = formatRecentLine(m, teamName);
    ctx.fillStyle = "#374151";
    ctx.font = `600 26px ${FONT}`;
    for (const t of wrapLines(ctx, `${line.when}  ${line.home} VS ${line.away}`, maxW)) {
      ctx.fillText(t, boxX + 24, y);
      y += 34;
    }
    const detail = `${line.venue ? `[${line.venue}] ` : ""}${line.score}  赛果 ${line.result}`;
    ctx.fillStyle = "#6b7280";
    ctx.font = `400 24px ${FONT}`;
    for (const t of wrapLines(ctx, detail, maxW)) {
      ctx.fillText(t, boxX + 24, y);
      y += 30;
    }
    // 赛果色标
    ctx.fillStyle = RESULT_COLOR[line.result] || "#6b7280";
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(line.result, boxX + boxW - 72, y - 30);
    y += 14;
  }
  return y0 + boxH + 28;
}

/** 双方近 10 场竖屏图（同图） */
export async function renderRecentFormImage(match, homeMatches, awayMatches) {
  const home = (homeMatches || []).filter((m) => m.finished).slice(0, 10);
  const away = (awayMatches || []).filter((m) => m.finished).slice(0, 10);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `400 26px ${FONT}`;

  let height = 220;
  height += measureRecentBlock(ctx, match.home, home) + 28;
  height += measureRecentBlock(ctx, match.away, away) + 28;
  height += 80;
  height = Math.max(height, 1920);

  canvas.width = PHONE_W;
  canvas.height = height;
  fillBackground(ctx, PHONE_W, height);

  let y = 72;
  y = drawHeader(ctx, match, "近期战绩", y);
  y = drawRecentBlock(ctx, match.home, home, y);
  y = drawRecentBlock(ctx, match.away, away, y);

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText("含半场 / 全场 / 加时 / 点球（如有）· 仅供参考", PAD, height - 40);

  return canvasToPngBlob(canvas);
}

function measureCommonBlock(ctx, items, homeName, awayName) {
  let h = 56;
  const maxW = PHONE_W - PAD * 2 - 48;
  ctx.font = `400 24px ${FONT}`;
  if (!items.length) return h + 48;
  for (const it of items) {
    h += 40;
    const homeLine = formatCommonSide(it.home, homeName, it.opponent);
    const awayLine = formatCommonSide(it.away, awayName, it.opponent);
    h += wrapLines(ctx, homeLine, maxW).length * 30;
    h += wrapLines(ctx, awayLine, maxW).length * 30;
    h += 28;
  }
  return h + 20;
}

function formatCommonSide(side, teamName, opponent) {
  if (!side?.match) return `${teamLabel(teamName)}：近1年未交手`;
  const m = side.match;
  const when = side.when || formatMatchWhen(m) || "";
  const score = scoreDetail(m);
  const full = formatHistoryScoreText(m) || `${m.homeScore}:${m.awayScore}`;
  return `${teamLabel(teamName)} ${side.venue || ""}场 ${side.result} · ${teamLabel(m.home)} VS ${teamLabel(m.away)} · ${score || full}${when ? ` · ${when}` : ""} · 对手 ${teamLabel(opponent)}`;
}

function drawCommonBlock(ctx, items, homeName, awayName, y0) {
  let y = y0;
  const boxX = PAD;
  const boxW = PHONE_W - PAD * 2;
  const boxH = measureCommonBlock(ctx, items, homeName, awayName);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, boxX, y, boxW, boxH, 20);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, y, boxW, boxH, 20);
  ctx.stroke();

  y += 44;
  ctx.fillStyle = "#111827";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText("近1年共同对手", boxX + 24, y);
  y += 48;

  if (!items.length) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText("暂无共同对手样本", boxX + 24, y);
    return y0 + boxH + 28;
  }

  const maxW = boxW - 48;
  for (const it of items) {
    ctx.fillStyle = "#2563eb";
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(`共同对手：${teamLabel(it.opponent)}`, boxX + 24, y);
    y += 38;

    ctx.fillStyle = "#374151";
    ctx.font = `400 24px ${FONT}`;
    for (const t of wrapLines(ctx, formatCommonSide(it.home, homeName, it.opponent), maxW)) {
      ctx.fillText(t, boxX + 24, y);
      y += 30;
    }
    for (const t of wrapLines(ctx, formatCommonSide(it.away, awayName, it.opponent), maxW)) {
      ctx.fillText(t, boxX + 24, y);
      y += 30;
    }
    y += 20;
  }
  return y0 + boxH + 28;
}

/** 双方近 1 年共同对手竖屏图 */
export async function renderCommonOpponentsImage(match, commonOpponents) {
  const items = commonOpponents?.items || [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `400 24px ${FONT}`;

  let height = 220 + measureCommonBlock(ctx, items, match.home, match.away) + 100;
  height = Math.max(height, 1920);

  canvas.width = PHONE_W;
  canvas.height = height;
  fillBackground(ctx, PHONE_W, height);

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

  drawCommonBlock(ctx, items, match.home, match.away, y);

  ctx.fillStyle = "#9ca3af";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText("近1年内双方都交过手的同一对手 · 仅供参考", PAD, height - 40);

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

const EXCEL_HEADERS = ["场次编号", "联赛信息", "对战队伍", "简要分析", "胜负预测", "比分预测"];

export async function buildPredictionsWorkbook(rows) {
  const { ExcelJS } = await loadDeps();
  const wb = new ExcelJS.Workbook();
  wb.creator = "football-com";
  const ws = wb.addWorksheet("预测导出", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: EXCEL_HEADERS[0], key: "num", width: 12 },
    { header: EXCEL_HEADERS[1], key: "league", width: 12 },
    { header: EXCEL_HEADERS[2], key: "matchup", width: 28 },
    { header: EXCEL_HEADERS[3], key: "analysis", width: 56 },
    { header: EXCEL_HEADERS[4], key: "outcome", width: 14 },
    { header: EXCEL_HEADERS[5], key: "scores", width: 22 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, size: 12 };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 22;

  for (const row of rows) {
    const r = ws.addRow({
      num: row.num,
      league: row.league,
      matchup: row.matchup,
      analysis: row.analysis,
      outcome: row.outcome,
      scores: row.scores,
    });
    r.alignment = { vertical: "top", wrapText: true };
    r.height = Math.min(120, 36 + Math.ceil(String(row.analysis || "").length / 28) * 14);
  }

  for (let i = 1; i <= 6; i += 1) {
    ws.getColumn(i).border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function parsePredictedOutcomes(text) {
  const keys = new Set();
  const parts = String(text || "")
    .split(/[、,，/｜|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length && text) parts.push(String(text).trim());
  for (const p of parts) {
    if (/双平|平局/.test(p) || p === "平") keys.add("draw");
    else if (/主负|^负$/.test(p) || p === "负") keys.add("away");
    else if (/主胜|^胜$/.test(p) || p === "胜") keys.add("home");
    else {
      if (p.includes("负")) keys.add("away");
      if (p.includes("胜")) keys.add("home");
      if (p.includes("平")) keys.add("draw");
    }
  }
  return keys;
}

function parsePredictedScores(text) {
  const scores = new Set();
  const re = /(\d+)\s*[-:：]\s*(\d+)/g;
  let m;
  const raw = String(text || "");
  while ((m = re.exec(raw))) {
    scores.add(`${m[1]}-${m[2]}`);
    scores.add(`${m[1]}:${m[2]}`);
  }
  return scores;
}

function actualOutcomeKey(match) {
  if (!match?.finished || match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore > match.awayScore) return "home";
  if (match.homeScore < match.awayScore) return "away";
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

/**
 * 导入预测表，按完赛结果核对：猜对的胜负/比分单元格标红，输出新 Excel
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

  const byNum = new Map();
  for (const m of finishedMatches) {
    if (m?.num) byNum.set(String(m.num).trim(), m);
    if (m?.matchNum != null) byNum.set(String(m.matchNum).trim(), m);
  }

  const headerRow = ws.getRow(1);
  const h7 = cellText(headerRow.getCell(7));
  if (!/实际/.test(h7)) {
    headerRow.getCell(7).value = "实际赛果";
    headerRow.getCell(8).value = "实际比分";
    headerRow.getCell(7).font = { bold: true };
    headerRow.getCell(8).font = { bold: true };
    ws.getColumn(7).width = 12;
    ws.getColumn(8).width = 12;
  }

  let graded = 0;
  let outcomeHits = 0;
  let scoreHits = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const num = String(row.getCell(1).value ?? "").trim();
    if (!num) return;
    const match = byNum.get(num);
    if (!match) return;
    graded += 1;

    const actualKey = actualOutcomeKey(match);
    const actualScore = `${match.homeScore}-${match.awayScore}`;
    const actualScoreAlt = `${match.homeScore}:${match.awayScore}`;

    const outcomeCell = row.getCell(5);
    const scoreCell = row.getCell(6);
    const outcomeText = cellText(outcomeCell);
    const scoreText = cellText(scoreCell);

    if (actualKey && parsePredictedOutcomes(outcomeText).has(actualKey)) {
      outcomeCell.fill = redFill();
      outcomeCell.font = { ...(outcomeCell.font || {}), ...redFont() };
      outcomeHits += 1;
    }
    const predicted = parsePredictedScores(scoreText);
    if (predicted.has(actualScore) || predicted.has(actualScoreAlt)) {
      scoreCell.fill = redFill();
      scoreCell.font = { ...(scoreCell.font || {}), ...redFont() };
      scoreHits += 1;
    }

    const label =
      actualKey === "home" ? "主胜" : actualKey === "away" ? "主负" : actualKey === "draw" ? "平局" : "";
    row.getCell(7).value = label;
    row.getCell(8).value = actualScoreAlt;
  });

  const out = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    graded,
    outcomeHits,
    scoreHits,
  };
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object" && v.richText) {
    return v.richText.map((t) => t.text).join("");
  }
  if (typeof v === "object" && v.text) return String(v.text);
  return String(v);
}

export async function packExportZip({ dayFolders, excelBlob, zipName }) {
  const { JSZip } = await loadDeps();
  const zip = new JSZip();
  for (const day of dayFolders) {
    const dayFolder = zip.folder(day.name);
    for (const match of day.matches) {
      const folder = dayFolder.folder(match.folder);
      if (match.recentPng) folder.file("01_近期10场.png", match.recentPng);
      if (match.commonPng) folder.file("02_共同对手.png", match.commonPng);
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
