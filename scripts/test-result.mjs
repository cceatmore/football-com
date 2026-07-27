const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Referer: "https://www.sporttery.cn/jc/zqsgkj/",
  Origin: "https://www.sporttery.cn",
};

const urls = [
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=1&matchBeginDate=2026-07-01&matchEndDate=2026-07-27",
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchResultV1.qry?matchPage=1&pcOrWap=1&matchBeginDate=2026-06-01&matchEndDate=2026-07-27&pageSize=100",
];

for (const url of urls) {
  const res = await fetch(url, { headers });
  console.log(res.status, url);
  console.log((await res.text()).slice(0, 800));
  console.log("");
}
