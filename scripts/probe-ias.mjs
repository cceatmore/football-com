async function jina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } });
  return res.text();
}

const urls = [
  "https://injuriesandsuspensions.com/sweden-allsvenskan-injuries-suspensions-152/",
  "https://injuriesandsuspensions.com/sweden-allsvenskan-injuries-suspensions-49/",
  "https://injuriesandsuspensions.com/brazil-serie-a-injuries-suspensions/",
];

for (const url of urls) {
  const t = await jina(url);
  console.log("\n====", url, "len", t.length);
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (
      /\*\*.*vs.*\*\*/i.test(l) ||
      /^Out \(/i.test(l) ||
      /^Suspended:/i.test(l) ||
      /^Doubtful:/i.test(l) ||
      /Halmstad|Sirius|Djurg|Vaster|Athletico|Vitoria|Kick-off/i.test(l)
    ) {
      console.log(l.slice(0, 200));
    }
  }
}
