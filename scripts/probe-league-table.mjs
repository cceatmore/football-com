const h = {
  Referer: "https://m.sporttery.cn/zqlszl/bssj/index.html?mid=2040641",
  Accept: "application/json, text/plain, */*",
};

const bases = [
  "https://webapi.sporttery.cn/gateway/uniform/football",
  "https://webapi.sporttery.cn/gateway/wbsj/football",
  "https://webapi.sporttery.cn/gateway/uniform/basketball",
];

const names = [
  "getLeagueTablesV1",
  "getLeagueTableV1",
  "getTournamentTablesV1",
  "getSeasonTablesV1",
  "getUniformLeagueTablesV1",
  "getPhaseTablesV1",
  "getGroupTablesV1",
  "getTablesV1",
  "getStandingListV1",
  "getStandingsV1",
  "getLeagueStandingV1",
  "getLeagueStandingsV1",
  "getTournamentStandingV1",
  "getSeasonStandingV1",
  "getUniformTablesV1",
  "getMatchLeagueTablesV1",
  "getLeagueRankV1",
  "getTeamStandingListV1",
];

const queries = [
  "sportteryMatchId=2040641",
  "tournamentId=132&seasonId=14355",
  "uniformLeagueId=1085&seasonId=14355",
  "uniformLeagueId=1085&phaseId=48269",
  "tournamentId=132&phaseId=48269",
  "seasonId=14355&phaseId=48269",
  "sportteryTournamentId=58",
  "leagueId=58",
];

for (const base of bases) {
  for (const name of names) {
    for (const q of queries) {
      const url = `${base}/${name}.qry?${q}`;
      try {
        const res = await fetch(url, { headers: h });
        const data = await res.json();
        if (!data?.success) continue;
        const v = data.value;
        const tables = v?.tables || v?.tableList || v?.standingList || v?.list || v?.data;
        const count = Array.isArray(tables) ? tables.length : Array.isArray(v) ? v.length : 0;
        if (count > 2) {
          console.log("FOUND", url, "count", count);
          console.log(JSON.stringify(tables?.slice?.(0, 2) || v, null, 2).slice(0, 500));
        }
      } catch {
        /* ignore */
      }
    }
  }
}
