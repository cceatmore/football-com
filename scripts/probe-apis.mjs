const h = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  Accept: "application/json, text/plain, */*",
  Referer: "https://m.sporttery.cn/mjc/zqszsc/",
};

const id = 2040641;
const base = "https://webapi.sporttery.cn/gateway/uniform/football";

const names = [
  "getMatchResultListV1",
  "getMatchHomeResultListV1",
  "getMatchAwayResultListV1",
  "getMatchEachHomeAwayResultListV1",
  "getMatchSameHomeAwayResultListV1",
  "getMatchLastResultListV1",
  "getMatchHistoryResultListV1",
  "getMatchTeamHistoryListV1",
  "getMatchAgainstHistoryListV1",
  "getMatchRecentResultListV1",
  "getMatchNearHistoryListV1",
  "getTeamRecentResultListV1",
  "getTeamNearResultListV1",
];

const querySets = [
  `sportteryMatchId=${id}&termLimits=10`,
  `sportteryMatchId=${id}&termLimits=10&channel=c`,
  `sportteryMatchId=${id}&termLimits=10&clientCode=3001`,
  `sportteryMatchId=${id}&termLimits=10&source=web`,
  `sportteryMatchId=${id}&termLimits=10&dataFrom=1`,
];

for (const name of names) {
  for (const q of querySets) {
    const url = `${base}/${name}.qry?${q}`;
    try {
      const res = await fetch(url, { headers: h });
      const data = await res.json();
      if (data.success) {
        console.log("SUCCESS", name, q);
        console.log(JSON.stringify(data.value, null, 2).slice(0, 2000));
        console.log("");
      }
    } catch {
      /* ignore */
    }
  }
}
