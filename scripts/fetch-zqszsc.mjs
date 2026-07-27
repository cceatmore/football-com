const res = await fetch("https://m.sporttery.cn/mjc/zqszsc/index.html", {
  headers: { "User-Agent": "Mozilla/5.0 (iPhone)" },
});
const html = await res.text();
console.log("status", res.status, "len", html.length);

const scriptRe = /src="([^"]+)"/g;
const scripts = [];
let m;
while ((m = scriptRe.exec(html))) scripts.push(m[1]);
console.log("scripts", scripts);

const methodRe = /getMatch[A-Za-z]+V1/g;
const methods = [...html.matchAll(methodRe)].map((x) => x[0]);
console.log("methods", [...new Set(methods)].sort());

// fetch first app js if any
for (const src of scripts) {
  if (!src.includes(".js") || src.includes("vue") || src.includes("jquery")) continue;
  const url = src.startsWith("//") ? `https:${src}` : src;
  try {
    const jsRes = await fetch(url);
    const js = await jsRes.text();
    const jsMethods = [...js.matchAll(/getMatch[A-Za-z]+V1/g)].map((x) => x[0]);
    console.log("\nJS", url, "len", js.length);
    console.log([...new Set(jsMethods)].sort().join(", "));
    const idx = js.indexOf("getMatchResultList");
    if (idx >= 0) console.log(js.slice(idx - 100, idx + 500));
  } catch (err) {
    console.log("fail", url, err.message);
  }
}
