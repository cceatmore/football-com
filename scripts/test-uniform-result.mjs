const h = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html?mid=2040641",
  Accept: "application/json, text/plain, */*",
};

const id = 2040641;
const base = "https://webapi.sporttery.cn/gateway/uniform/football";

const paths = [
  `getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=10`,
  `getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=10&channel=c`,
  `getResultHistoryV1.qry?sportteryMatchId=${id}&termLimits=10`,
  `getFutureMatchesV1.qry?sportteryMatchId=${id}&termLimits=5`,
  `getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=1`,
  `getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=2`,
  `getMatchResultV1.qry?sportteryMatchId=${id}&termLimits=10&resultType=3`,
];

for (const path of paths) {
  const url = `${base}/${path}`;
  const res = await fetch(url, { headers: h });
  const data = await res.json();
  console.log(path.split("?")[0], path.includes("resultType") ? path.split("resultType=")[1] : "", data.success);
  if (data.success) {
    console.log(JSON.stringify(data.value, null, 2).slice(0, 2500));
  } else {
    console.log(data.errorMessage);
  }
  console.log("");
}
