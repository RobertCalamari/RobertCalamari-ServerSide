// Rip-return distribution per active set at the opening prices.
const G = require("../../games/duels/games/cardshop.js");
const M = require("../../games/duels/cardshop/market.js");
if (process.env.SCALE) G.CFG.priceScale = +process.env.SCALE;
if (process.env.EV) G.CFG.packEV = +process.env.EV;
const ctx = { rng: Math.random, now: () => 0, later: () => {} };
const st = G.init({ rng: Math.random, ctx, players: 3 });
const q = (a, f) => a[Math.floor(a.length * f)];
let all = [];
st.active.forEach((p) => {
  const r = [];
  for (let i = 0; i < 4000; i++) r.push(M.openPack(Math.random, p, 5).reduce((t, k) => t + M.value(st, k), 0) / st.pack[p]);
  r.sort((a, b) => a - b); all = all.concat(r);
  console.log(M.D.SETS[p].name.padEnd(16), "pack $" + st.pack[p], "EV", (r.reduce((t, x) => t + x, 0) / r.length).toFixed(2), "p25", q(r, 0.25).toFixed(2), "median", q(r, 0.5).toFixed(2), "p75", q(r, 0.75).toFixed(2), "p95", q(r, 0.95).toFixed(2));
});
all.sort((a, b) => a - b);
console.log("ALL median", q(all, 0.5).toFixed(2), "share of rips returning 60-90%:", (all.filter((x) => x >= 0.6 && x <= 0.9).length / all.length).toFixed(2), "≥90%:", (all.filter((x) => x > 0.9).length / all.length).toFixed(2));
