/** 球队名称 → ISO 3166-1 alpha-2（用于 emoji 国旗） */
export const TEAM_ISO = {
  Mexico: "mx",
  "South Africa": "za",
  "South Korea": "kr",
  "Czech Republic": "cz",
  Canada: "ca",
  "Bosnia & Herzegovina": "ba",
  Qatar: "qa",
  Switzerland: "ch",
  Brazil: "br",
  Morocco: "ma",
  Haiti: "ht",
  Scotland: "gb-sct",
  USA: "us",
  Paraguay: "py",
  Australia: "au",
  Turkey: "tr",
  Algeria: "dz",
  Argentina: "ar",
  Austria: "at",
  Belgium: "be",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  "Curaçao": "cw",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Portugal: "pt",
  "Saudi Arabia": "sa",
  Senegal: "sn",
  Spain: "es",
  Sweden: "se",
  Tunisia: "tn",
  Uruguay: "uy",
  Uzbekistan: "uz",
};

export const TEAM_ZH = {
  Mexico: "墨西哥",
  "South Africa": "南非",
  "South Korea": "韩国",
  "Czech Republic": "捷克",
  Canada: "加拿大",
  "Bosnia & Herzegovina": "波黑",
  Qatar: "卡塔尔",
  Switzerland: "瑞士",
  Brazil: "巴西",
  Morocco: "摩洛哥",
  Haiti: "海地",
  Scotland: "苏格兰",
  USA: "美国",
  Paraguay: "巴拉圭",
  Australia: "澳大利亚",
  Turkey: "土耳其",
  Algeria: "阿尔及利亚",
  Argentina: "阿根廷",
  Austria: "奥地利",
  Belgium: "比利时",
  "Cape Verde": "佛得角",
  Colombia: "哥伦比亚",
  Croatia: "克罗地亚",
  "Curaçao": "库拉索",
  "DR Congo": "刚果（金）",
  Ecuador: "厄瓜多尔",
  Egypt: "埃及",
  England: "英格兰",
  France: "法国",
  Germany: "德国",
  Ghana: "加纳",
  Iran: "伊朗",
  Iraq: "伊拉克",
  "Ivory Coast": "科特迪瓦",
  Japan: "日本",
  Jordan: "约旦",
  Netherlands: "荷兰",
  "New Zealand": "新西兰",
  Norway: "挪威",
  Panama: "巴拿马",
  Portugal: "葡萄牙",
  "Saudi Arabia": "沙特阿拉伯",
  Senegal: "塞内加尔",
  Spain: "西班牙",
  Sweden: "瑞典",
  Tunisia: "突尼斯",
  Uruguay: "乌拉圭",
  Uzbekistan: "乌兹别克斯坦",
};

/** FIFA 世界排名（2026-06-11 官方更新，来源：FIFA/Coca-Cola Men's World Ranking） */
export const FIFA_RANK = {
  Argentina: 1,
  Spain: 2,
  France: 3,
  England: 4,
  Portugal: 5,
  Brazil: 6,
  Morocco: 7,
  Netherlands: 8,
  Belgium: 9,
  Germany: 10,
  Croatia: 11,
  Colombia: 13,
  Mexico: 14,
  Senegal: 15,
  Uruguay: 16,
  USA: 17,
  Japan: 18,
  Switzerland: 19,
  Iran: 20,
  Turkey: 22,
  Ecuador: 23,
  Austria: 24,
  "South Korea": 25,
  Australia: 27,
  Algeria: 28,
  Egypt: 29,
  Canada: 30,
  Norway: 31,
  "Ivory Coast": 33,
  Panama: 34,
  Sweden: 38,
  "Czech Republic": 40,
  Paraguay: 41,
  Scotland: 42,
  Tunisia: 45,
  "DR Congo": 46,
  Uzbekistan: 50,
  Qatar: 56,
  Iraq: 57,
  "South Africa": 60,
  "Saudi Arabia": 61,
  Jordan: 63,
  "Bosnia & Herzegovina": 64,
  "Cape Verde": 67,
  Ghana: 73,
  Haiti: 82,
  "Curaçao": 83,
  "New Zealand": 85,
};

export function getFifaRank(name) {
  return FIFA_RANK[name] ?? null;
}

export function formatFifaRank(name) {
  const rank = getFifaRank(name);
  return rank ? `FIFA 第 ${rank} 名` : null;
}

export function teamDetailHtml(name, flagSize = 20) {
  const rankText = formatFifaRank(name);
  const rankHtml = rankText ? `<span class="fifa-rank">${rankText}</span>` : "";
  return `${flagHtml(name, flagSize)} <span class="team-detail-name">${teamLabel(name)}</span>${rankHtml}`;
}

export function isRealTeam(name) {
  return Boolean(TEAM_ISO[name]);
}

export function teamLabel(name) {
  return TEAM_ZH[name] || name;
}

function teamFlagEmoji(name) {
  const iso = TEAM_ISO[name];
  if (!iso) return "⚽";
  if (iso === "gb-eng" || iso === "gb-sct") return "🏴";
  const cc = iso.split("-")[0].toUpperCase();
  if (cc.length !== 2) return "⚽";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));
}

export function flagHtml(name, size = 24) {
  const emoji = teamFlagEmoji(name);
  const h = Math.round(size * 0.75);
  return `<span class="team-flag team-flag-emoji" style="width:${size}px;height:${h}px;font-size:${Math.round(size * 0.72)}px" aria-hidden="true">${emoji}</span>`;
}

export function teamInlineHtml(name, size = 18) {
  return `<span class="team-name-flag">${flagHtml(name, size)}<span class="team-name-flag-text">${teamLabel(name)}</span></span>`;
}

const TEAM_TEXT_LOOKUP = (() => {
  const entries = [];
  for (const key of Object.keys(TEAM_ISO)) {
    const zh = TEAM_ZH[key];
    if (zh) entries.push({ name: zh, key });
    if (key !== zh) entries.push({ name: key, key });
  }
  return entries.sort((a, b) => b.name.length - a.name.length);
})();

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 将纯文本中的球队名替换为「国旗 + 中文名」 */
export function enrichTextWithTeamFlags(text, size = 18) {
  if (!text) return text;
  const pattern = TEAM_TEXT_LOOKUP.map((e) => escapeRegExp(e.name)).join("|");
  if (!pattern) return text;
  const lookup = new Map(TEAM_TEXT_LOOKUP.map((e) => [e.name, e.key]));
  return text.replace(new RegExp(pattern, "g"), (match) => teamInlineHtml(lookup.get(match), size));
}
