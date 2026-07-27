const h = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  Referer: "https://m.sporttery.cn/mjc/zqszsc/",
  Accept: "application/json, text/plain, */*",
};

const id = 2040641;
const base = "https://webapi.sporttery.cn/gateway/uniform/football";

// Common patterns from sporttery mini-program / H5 apps
const endpoints = [
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&fixedOddsFlag=0`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&fixedOddsFlag=1`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&isFixed=0`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&isFixed=1`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&poolCode=had`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&poolCode=HHAD`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=1`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=2`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=3`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=4`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=5`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=6`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=7`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=8`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=9`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=10`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=11`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=12`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=13`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=14`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=15`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=16`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=17`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=18`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=19`,
  `getMatchResultListV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=20`,
];

for (const path of endpoints) {
  const res = await fetch(`${base}/${path}`, { headers: h });
  const data = await res.json();
  if (data.success) {
    console.log("HIT", path);
    console.log(JSON.stringify(data.value, null, 2).slice(0, 2500));
    break;
  }
}

console.log("done");
