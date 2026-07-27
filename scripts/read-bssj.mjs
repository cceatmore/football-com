const res = await fetch("https://static.sporttery.cn/res_1_0/jcwm/default/zqlszl/bssj.js");
const js = await res.text();
console.log("len", js.length);

const idx = js.indexOf("getMatchResult");
while (idx >= 0) {
  console.log("\n--- context ---");
  console.log(js.slice(Math.max(0, idx - 150), idx + 400));
}

// dump all gateway URLs
const urls = [...js.matchAll(/gateway[^'"`]+/g)].map((m) => m[0]);
console.log("\nALL GATEWAYS:\n", [...new Set(urls)].join("\n"));
