const G = require("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/games/ripple.js");
const { mulberry32 } = { mulberry32: (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } };
let busts = 0, maxp = 0, minNon0 = 1e9, worths = [];
for (let seed = 1; seed <= 300; seed++) {
  const rng = mulberry32(seed); let q = []; let now = 0;
  const ctx = { rng, now: () => now, later: (ms, fn) => q.push([now + ms, fn]) };
  const n = 1 + (seed % 8) + (seed % 8 ? 0 : 1);
  const s = G.init({ rng, ctx, players: Math.max(2, n) });
  while (!G.result(s)) {
    if (s.phase === "trade") {
      for (let p = 0; p < s.cash.length; p++) {
        const co = Math.floor(rng() * 5);
        if (s.hold[p][co] && rng() < 0.4) G.move(s, p, { act: "trade", co, qty: -s.hold[p][co] }, ctx);
        else if (s.price[co]) { const q2 = Math.floor(s.cash[p] / s.price[co] * rng()); if (q2) G.move(s, p, { act: "trade", co, qty: q2 }, ctx); }
        const h = s.hands[p].findIndex(c => !c.used); if (h >= 0 && rng() < 0.3) G.move(s, p, { act: "card", i: h, co: Math.floor(rng() * 5) }, ctx);
      }
    }
    q.sort((a, b) => a[0] - b[0]); const [t, fn] = q.shift(); now = t; fn(now);
  }
  busts += s.price.filter(p => !p).length; s.hist.flat().forEach(p => { maxp = Math.max(maxp, p); if (p) minNon0 = Math.min(minNon0, p); });
  worths.push(...G.result(s).places.map((_, i) => s.cash[i] + s.hold[i].reduce((a, h, c) => a + h * s.price[c], 0)));
  if (seed === 7) { console.log(JSON.stringify(s.hist)); console.log(JSON.stringify(s.links)); console.log(s.news.map(x=>x.text).join(" | ")); }
}
worths.sort((a, b) => a - b);
console.log({ busts, maxp, minNon0, med: worths[worths.length >> 1], lo: worths[0], hi: worths[worths.length - 1] });
