/** 联赛简称 → 展示色 */
export const LEAGUE_COLORS = {
  英超: "3d195b",
  西甲: "ff4b44",
  德甲: "d20515",
  意甲: "008fd7",
  法甲: "091c3e",
  荷甲: "f36c21",
  葡超: "006600",
  瑞超: "004488",
  挪超: "666666",
  芬超: "003580",
  日职: "e60012",
  日乙: "005baa",
  韩职: "003478",
  澳超: "ff6600",
  美职: "c4122e",
  欧冠: "001e62",
  欧罗巴: "f68e00",
};

export function isRealTeam(name) {
  return Boolean(name && String(name).trim());
}

export function teamLabel(name) {
  return name || "待定";
}

export function getLeagueColor(leagueShort, fallback = "") {
  return LEAGUE_COLORS[leagueShort] || fallback || "64748b";
}

export function leagueBadgeHtml(leagueShort, color, size = 20) {
  const bg = getLeagueColor(leagueShort, color);
  const label = leagueShort ? leagueShort.slice(0, 2) : "⚽";
  const fontSize = Math.max(9, Math.round(size * 0.45));
  return `<span class="league-badge" style="background:#${bg};width:${size}px;height:${Math.round(size * 0.72)}px;font-size:${fontSize}px" title="${leagueShort || ""}">${label}</span>`;
}

/** @deprecated 兼容旧引用 */
export function flagHtml(name, size = 24, match = null) {
  if (match?.leagueShort) {
    return leagueBadgeHtml(match.leagueShort, match.leagueColor, size);
  }
  const h = Math.round(size * 0.75);
  return `<span class="team-flag team-flag-emoji" style="width:${size}px;height:${h}px;font-size:${Math.round(size * 0.72)}px" aria-hidden="true">⚽</span>`;
}

export function formatRank(rank, league) {
  if (rank == null) return null;
  return league ? `${league}第 ${rank} 名` : `第 ${rank} 名`;
}

export function getFifaRank() {
  return null;
}

export function formatFifaRank() {
  return null;
}

export function teamDetailHtml(name, flagSize = 20, match = null) {
  return `${flagHtml(name, flagSize, match)} <span class="team-detail-col"><span class="team-detail-name">${teamLabel(name)}</span></span>`;
}

export function teamInlineHtml(name, size = 18, match = null) {
  return `<span class="team-name-flag">${flagHtml(name, size, match)}<span class="team-name-flag-text">${teamLabel(name)}</span></span>`;
}
