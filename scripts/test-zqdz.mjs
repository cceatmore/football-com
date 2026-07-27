const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.sporttery.cn/jc/zqdz/index.html?mid=2040641",
  Origin: "https://www.sporttery.cn",
};

const mid = 2040641;
const urls = [
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultListV1.qry?sportteryMatchId=${mid}&termLimits=10&resultType=1`,
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultListV1.qry?sportteryMatchId=${mid}&termLimits=10&resultType=2`,
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultListV1.qry?sportteryMatchId=${mid}&termLimits=10&resultType=3`,
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultListV1.qry?sportteryMatchId=${mid}&termLimits=10&resultType=4`,
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchResultListV1.qry?sportteryMatchId=${mid}&termLimits=10&resultType=5`,
  `https://webapi.sporttery.cn/gateway/jc/football/getFixedBonusV1.qry?clientCode=3001&matchId=${mid}`,
  `https://webapi.sporttery.cn/gateway/jc/football/getMatchDetailV1.qry?matchId=${mid}&clientCode=3001`,
  `https://webapi.sporttery.cn/gateway/jc/football/getMatchInfoV1.qry?matchId=${mid}&clientCode=3001`,
  `https://webapi.sporttery.cn/gateway/uniform/football/getMatchDetailV1.qry?sportteryMatchId=${mid}`,
];

for (const url of urls) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(res.status, url.split("/").pop());
    console.log(text.slice(0, 600));
  } catch (err) {
    console.log("ERR", url, err.message);
  }
  console.log("");
}
