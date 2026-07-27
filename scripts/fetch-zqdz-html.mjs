const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

const res = await fetch("https://www.sporttery.cn/jc/zqdz/index.html?mid=2040641&showType=2", {
  headers,
});
const html = await res.text();
console.log("status", res.status, "len", html.length);

const apis = [...html.matchAll(/gateway\/[^\"']+\.qry[^\"']*/g)].map((m) => m[0]);
console.log("apis", [...new Set(apis)].slice(0, 40));

const methods = [...html.matchAll(/getMatch[A-Za-z]+V1/g)].map((m) => m[0]);
console.log("methods", [...new Set(methods)].sort());

const scripts = [...html.matchAll(/src=\"([^\"]+\.js[^\"]*)\"/g)].map((m) => m[1]);
console.log("scripts", scripts.slice(0, 20));
