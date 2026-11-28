// Headless balance sim: run the cardshop game module with bot strategies on simulated time.
const G = require("../../games/duels/games/cardshop.js");
const M = require("../../games/duels/cardshop/market.js");
function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function run(seed, strats, log) {
  let now = 1e12;
  const timers = [];
  const rng = mulberry32(seed);
  const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn, k: timers.length + Math.random() }) };
  const realNow = Date.now; Date.now = () => now;
  const st = G.init({ rng, ctx, players: strats.length, options: { timer: !process.env.UNTIMED } });
  const n = strats.length;
  const brng = mulberry32(seed + 99);
  const errs = {};
  global.advance = (ms) => (now += ms);
  const mv = (s, p) => { const r = G.move(st, s, p, ctx); if (r.error) errs[r.error] = (errs[r.error] || 0) + 1; return r; };
  let lastPhase = "";
  const revs = {};
  let guard = 0;
  while (!G.result(st) && guard++ < 100000) {
    const key = st.day + st.phase;
    if (key !== lastPhase && st.phase === "report") revs[st.day] = st.report.today.map((t) => t.rev);
    if (key !== lastPhase) { lastPhase = key; for (let s = 0; s < n; s++) BOTS[strats[s]].phase(st, s, mv, brng); 
      // untimed: everyone presses Ready, then the next phase's bot moves run right away (no timer would wake us)
      while (process.env.UNTIMED && ["buy", "setup", "report"].includes(st.phase) && !G.result(st)) {
        const ph = st.day + st.phase;
        for (let s = 0; s < n && st.day + st.phase === ph; s++) mv(s, { act: "ready" });
        const k2 = st.day + st.phase;
        if (k2 === ph) break;
        lastPhase = k2;
        if (st.phase === "report") revs[st.day] = st.report.today.map((t) => t.rev);
        for (let s = 0; s < n; s++) BOTS[strats[s]].phase(st, s, mv, brng);
      }
    }
    if (st.phase === "sell") for (let s = 0; s < n; s++) {
      const o = st.q[s][0];
      if (!o || brng() >= 0.5) continue;
      const c = BOTS[strats[s]].haggle ? BOTS[strats[s]].haggle(st, s, o) : -1;
      if (c >= 0 && o.opts && o.opts[c]) mv(s, { act: "offer", id: o.id, counter: c });
      else mv(s, { act: "offer", id: o.id, yes: BOTS[strats[s]].offer(st, s, o) });
    }
    timers.sort((a, b) => a.t - b.t);
    const t = timers.shift();
    if (!t) break;
    now = t.t;
    t.fn(now);
  }
  Date.now = realNow;
  const res = G.result(st);
  const v = G.view(st, 0);
  if (log) console.log(JSON.stringify(errs));
  return { res, worth: v.worth, st, v, revs };
}

const value = (st, k) => M.value(st, k);
const spare = (st, s, k) => (st.own[s][k] || 0) - st.disp[s].filter((d) => d && d.k === k).length;
function fillDisplay(st, s, mv, pct, packsToo) {
  const keys = Object.keys(st.own[s]).map(Number).sort((a, b) => value(st, b) - value(st, a));
  for (let i = 0; i < st.slots[s]; i++) {
    if (st.disp[s][i]) continue;
    const k = keys.find((k) => spare(st, s, k) > 0);
    if (k !== undefined && value(st, k) > 1) { mv(s, { act: "slot", i, k, pct }); continue; }
    if (packsToo) { const p = st.packs[s].findIndex((q, p) => q - st.disp[s].filter((d) => d && d.p === p).length > 0); if (p >= 0) mv(s, { act: "slot", i, p, pct }); }
  }
}
function buyPacks(st, s, mv, keep, pref) {
  let tries = 0;
  while (tries++ < 40) {
    if (st.acts[s] < 1) break;
    const opts = st.stock.filter((x) => x.q > 0 && st.pack[x.p] <= st.cash[s] - keep);
    if (!opts.length) break;
    const x = pref ? opts.sort(pref)[0] : opts[Math.floor(Math.random() * opts.length)];
    const n = Math.max(1, Math.min(G.CFG.actions.packs, x.q, Math.floor((st.cash[s] - keep) / st.pack[x.p])));
    mv(s, { act: "pack", p: x.p, n });
  }
}
const ripAll = (st, s, mv) => st.packs[s].forEach((q, p) => { for (let i = 0; i < q; i++) mv(s, { act: "rip", p }); });
const BOTS = {
  idle: { phase() {}, offer: () => false },
  ripper: {
    phase(st, s, mv) {
      if (st.phase === "buy") { if (mv(s, { act: "fish", start: true }).ok) { global.advance(5000); mv(s, { act: "fish", progress: Math.random() < 0.7 ? 1 : 0.6 }); } buyPacks(st, s, mv, 15); ripAll(st, s, mv); }
      if (st.phase === "setup") fillDisplay(st, s, mv, 120);
    },
    offer: (st, s, o) => o.kind === "sell" ? o.cash < o.m * 0.8 : o.cash + (o.giveV || 0) >= o.m * 0.95,
    haggle: (st, s, o) => (o.cash + (o.giveV || 0) < o.m ? 0 : -1),
  },
  sealed: {
    phase(st, s, mv) {
      if (st.phase === "buy") buyPacks(st, s, mv, 0, (a, b) => st.pack[b.p] - st.pack[a.p]);
      if (st.phase === "setup") { for (let i = 0; i < st.slots[s]; i++) if (!st.disp[s][i]) { const p = st.packs[s].findIndex((q, p) => q - st.disp[s].filter((d) => d && d.p === p).length > 0); if (p >= 0) mv(s, { act: "slot", i, p, pct: 150 }); } }
    },
    offer: (st, s, o) => o.cash + (o.giveV || 0) >= o.m * 1.05,
  },
  singles: {
    phase(st, s, mv) {
      if (st.phase === "buy") { st.singles.forEach((x, i) => x.sold < 0 && x.price < st.cash[s] * 0.5 && mv(s, { act: "single", i })); }
      if (st.phase === "setup") { if (st.slots[s] < 5 && st.cash[s] > 150) mv(s, { act: "up", key: "slot" }); fillDisplay(st, s, mv, 150); }
    },
    offer: (st, s, o) => o.kind !== "sell" && o.cash + (o.giveV || 0) >= o.m * 1.1,
  },
  dealer: { // license + decor, buys from customers, rips a bit
    phase(st, s, mv) {
      if (st.phase === "buy") { if (!st.up[s].lic) mv(s, { act: "up", key: "lic" }); else if (st.up[s].lic === 1 && st.cash[s] > 250) mv(s, { act: "up", key: "lic" }); if (!st.up[s].case && st.cash[s] > 200) mv(s, { act: "up", key: "case" }); buyPacks(st, s, mv, 120); ripAll(st, s, mv); }
      if (st.phase === "setup") { if (!st.up[s].bulk) mv(s, { act: "up", key: "bulk" }); if (st.slots[s] < 5 && st.cash[s] > 200) mv(s, { act: "up", key: "slot" }); fillDisplay(st, s, mv, 120, true); }
    },
    offer: (st, s, o) => o.kind === "sell" ? o.cash <= st.cash[s] - 20 : o.cash + (o.giveV || 0) >= o.m * 1.0,
    haggle: (st, s, o) => (o.opts && o.opts.length > 1 ? 1 : 0),
  },
  hype: { // price gun + chase tomorrow's riser, sells at 100 and accepts most
    phase(st, s, mv) {
      if (st.phase === "buy") { const best = st.stock.slice().sort((a, b) => b.p - a.p)[0]; if (best) mv(s, { act: "up", key: "gun", p: best.p }); buyPacks(st, s, mv, 10); ripAll(st, s, mv); }
      if (st.phase === "setup") { if (!st.up[s].lights && st.cash[s] > 60) mv(s, { act: "up", key: "lights" }); fillDisplay(st, s, mv, 100); }
    },
    offer: (st, s, o) => o.kind === "sell" ? o.cash < st.cash[s] * 0.3 : o.cash + (o.giveV || 0) >= o.m * 0.85,
  },
};
module.exports = { run, BOTS };
if (require.main === module) {
  if (process.env.SLOTS) G.CFG.slots = +process.env.SLOTS;
  if (process.env.NOHAGGLE) G.CFG.counters = 0;
  if (process.env.CUST) G.CFG.customers = process.env.CUST.split("-").map(Number);
  if (process.env.SCALE) G.CFG.priceScale = +process.env.SCALE;
  if (process.env.PPA) G.CFG.actions.packs = +process.env.PPA;
  if (process.env.BASE) G.CFG.actions.base = +process.env.BASE;
  if (process.env.EV) G.CFG.packEV = +process.env.EV;
  const d3 = [], d8 = [], best = [], worst = [];
  let sold = 0, cnt = 0;
  const bon = { chal: 0, vip: 0, streak: 0, rev: 0 };
  const strats = (process.argv[2] || "ripper,sealed,singles,dealer,hype,idle").split(",");
  const games = +process.argv[3] || 40;
  const wins = {}, tot = {}, mins = {};
  strats.forEach((s) => { wins[s] = 0; tot[s] = 0; mins[s] = 1e9; });
  for (let g = 0; g < games; g++) {
    const order = strats.slice().sort(() => Math.random() - 0.5);
    const { res, worth, st, revs } = run(1000 + g, order, g === 0);
    order.forEach((name, i) => { if (name !== "idle") { d3.push(revs[3][i]); d8.push(revs[8][i]); } });
    const ws = worth.slice().sort((a, b) => b - a); best.push(ws[0]); worst.push(ws[ws.length - 1]);
    st.stats.forEach((x) => { sold += x.served; cnt++; bon.chal += x.chal || 0; bon.vip += x.vip || 0; bon.streak += x.streak || 0; bon.rev += x.rev; });
    order.forEach((s, i) => { tot[s] += worth[i]; mins[s] = Math.min(mins[s], worth[i]); if (res.places[i] === 1) wins[s]++; });
  }
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)].toFixed(0); };
  const avg = (a) => (a.reduce((t, x) => t + x, 0) / a.length).toFixed(0);
  console.log("customer sales per player per day", (sold / cnt / 8).toFixed(2), "| day-3 sales avg", avg(d3), "med", med(d3), "| day-8 sales avg", avg(d8), "med", med(d8), "| leader med", med(best), "range", Math.min(...best).toFixed(0) + "-" + Math.max(...best).toFixed(0), "| last med", med(worst));
  console.log("per player per game: challenge $" + (bon.chal / cnt).toFixed(0), "bounty $" + (bon.vip / cnt).toFixed(0), "streak $" + (bon.streak / cnt).toFixed(0), "| all sales $" + (bon.rev / cnt).toFixed(0));
  strats.forEach((s) => console.log(s.padEnd(8), "wins", wins[s], "avg", (tot[s] / games).toFixed(0), "min", mins[s].toFixed(0)));
}
