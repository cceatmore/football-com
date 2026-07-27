const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const pages = [
  "https://m.sporttery.cn/zqlszl/bssj/index.html?mid=2040641&f=match_list",
  "https://www.sporttery.cn/zqlszl/bssj/index.html?mid=2040641&f=match_list",
];

for (const page of pages) {
  const res = await fetch(page, { headers });
  const html = await res.text();
  console.log("\n===", page, res.status, html.length, "===");
  const scripts = [];
  const re = /src="([^"]+\.js[^"]*)"/g;
  let m;
  while ((m = re.exec(html))) scripts.push(m[1]);
  console.log("scripts", scripts);

  for (const src of scripts) {
    if (!src.includes("bssj") && !src.includes("zqlszl") && !src.includes("lszl")) continue;
    const url = src.startsWith("//") ? `https:${src}` : src.startsWith("/") ? `https://m.sporttery.cn${src}` : src;
    try {
      const jsRes = await fetch(url, { headers });
      const js = await jsRes.text();
      const methods = [...js.matchAll(/getMatch[A-Za-z]+V1/g)].map((x) => x[0]);
      console.log("JS", url, "methods:", [...new Set(methods)].sort().join(", "));
      const qrys = [...js.matchAll(/uniform\/football\/[A-Za-z0-9]+\.qry[^'"`]*/g)].map((x) => x[0]);
      console.log("qrys:", [...new Set(qrys)].slice(0, 20).join("\n"));
    } catch (err) {
      console.log("fail", url, err.message);
    }
  }
}
