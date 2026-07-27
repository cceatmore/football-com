const h = {
  Referer: "https://m.sporttery.cn/zqlszl/index.html?tournamentId=132",
  Accept: "application/json, text/plain, */*",
};

const base = "https://webapi.sporttery.cn/gateway/uniform/football/league/getTablesV1.qry";
const queries = [
  "uniformLeagueId=1085&seasonId=14355",
  "uniformLeagueId=1085&seasonId=14355&phaseId=48269",
  "tournamentId=132&seasonId=14355",
  "leagueId=1085&seasonId=14355",
  "uniformLeagueId=1085",
  "sportteryMatchId=2040641",
  "gmMatchId=2040641&uniformLeagueId=1085&seasonId=14355",
];

for (const q of queries) {
  const url = `${base}?${q}`;
  const res = await fetch(url, { headers: h });
  const data = await res.json();
  console.log("\n===", q, "===");
  console.log("success", data.success, data.errorMessage);
  if (data.success && data.value) {
    const v = data.value;
    console.log("keys", Object.keys(v));
    const phases = v.phaseList || v.phases || v.tablesList || v.list;
    if (Array.isArray(phases)) {
      console.log("phase count", phases.length);
      const first = phases[0];
      console.log("first phase keys", Object.keys(first || {}));
      const tables = first?.totalTables || first?.tables || first?.tableList;
      console.log("table count", tables?.length);
      console.log("sample", JSON.stringify(tables?.slice(0, 3), null, 2));
    } else {
      console.log(JSON.stringify(v, null, 2).slice(0, 1500));
    }
  }
}
