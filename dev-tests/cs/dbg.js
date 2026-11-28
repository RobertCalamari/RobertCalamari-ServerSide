const { run } = require("./sim");
const M = require("../../games/duels/cardshop/market.js");
let worst = null;
for (let g = 0; g < 30; g++) {
  const strats = ["ripper", "sealed", "singles", "dealer", "hype", "idle"].sort(() => Math.random() - 0.5);
  const r = run(5000 + g, strats);
  const top = Math.max(...r.worth);
  if (!worst || top > worst.top) worst = { top, r, strats };
}
const { r, strats } = worst;
const st = r.st;
strats.forEach((n, s) => {
  const own = Object.entries(st.own[s]).map(([k, q]) => [M.value(st, +k) * q, M.CARDS[(+k) >> 1].c.name, M.CARDS[(+k) >> 1].r, +k & 1]).sort((a, b) => b[0] - a[0]).slice(0, 3);
  console.log(n.padEnd(8), "worth", r.worth[s].toFixed(0), "cash", st.cash[s].toFixed(0), "rev", st.stats[s].rev, "vip", st.stats[s].vip || 0, "chal", st.stats[s].chal || 0, "packs", st.stats[s].packs, "top cards", JSON.stringify(own.map((x) => [Math.round(x[0]), x[1], x[2], x[3]])));
});
console.log(st.worthHist.map((h, s) => strats[s] + ": " + h.map(Math.round).join(" ")).join("\n"));
