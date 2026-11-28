// Deterministic module checks for actions, fishing, challenge, VIP bounty and hot streaks.
const G = require("../../games/duels/games/cardshop.js");
const M = require("../../games/duels/cardshop/market.js");
const X = require("../../games/duels/cardshop/extras.js");
let fails = 0;
const ok = (l, c, x = "") => { console.log((c ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!c) fails++; };
function game(n = 3, seed = 7) {
  let now = 1e12;
  const timers = [];
  let a = seed;
  const rng = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
  const realNow = Date.now;
  Date.now = () => now;
  const st = G.init({ rng, ctx, players: n, options: { timer: true } });
  const mv = (s, p) => G.move(st, s, p, ctx);
  const step = () => { timers.sort((x, y) => x.t - y.t); const t = timers.shift(); now = t.t; t.fn(now); };
  const until = (f) => { for (let i = 0; i < 5000 && !f(); i++) step(); };
  return { st, mv, ctx, adv: (ms) => (now += ms), step, until, done: () => (Date.now = realNow) };
}

// ---- actions ----
{
  const { st, mv, done } = game();
  const cfg = G.CFG.actions;
  ok("start with " + cfg.base + " actions", st.acts.every((x) => x === cfg.base) && G.view(st, 0).me.acts === cfg.base);
  const x = st.stock[0];
  ok("bundle of " + (cfg.packs + 1) + " refused", !mv(0, { act: "pack", p: x.p, n: cfg.packs + 1 }).ok && !mv(0, { act: "pack", p: x.p, n: 1.5 }).ok && st.acts[0] === cfg.base);
  const r = mv(0, { act: "pack", p: x.p, n: cfg.packs });
  ok("one action buys " + cfg.packs + " pack" + (cfg.packs > 1 ? "s" : ""), r.ok && st.packs[0][x.p] === cfg.packs && st.acts[0] === cfg.base - 1);
  ok("ripping is free", mv(0, { act: "rip", p: x.p }).ok && st.acts[0] === cfg.base - 1);
  const k = +Object.keys(st.own[0])[0];
  ok("arranging the table is free", mv(0, { act: "slot", i: 0, k, pct: 120 }).ok && mv(0, { act: "slot", i: 0, pct: 150 }).ok && st.acts[0] === cfg.base - 1);
  ok("ready is free", mv(0, { act: "ready" }).ok && mv(0, { act: "ready", on: false }).ok && st.acts[0] === cfg.base - 1);
  const k2 = +Object.keys(st.own[0]).find((kk) => +kk !== k || st.own[0][kk] > 1);
  ok("listing costs an action", mv(0, { act: "list", k: k2, price: 5 }).ok && st.acts[0] === 0);
  const out = mv(0, { act: "single", i: 0 });
  ok("out of actions: buying refused with tomorrow's count", !out.ok && /Out of actions\. Tomorrow you get \d/.test(out.error), out.error);
  ok("out of actions: pack/upgrade/gun/list refused", !mv(0, { act: "pack", p: st.stock[1].p, n: 1 }).ok && !mv(0, { act: "up", key: "lights" }).ok && !mv(0, { act: "up", key: "gun", p: st.stock[0].p }).ok && st.acts[0] === 0);
  ok("unlisting stays free", mv(0, { act: "unlist", id: st.listings[0].id }).ok);
  if (!st.packs[0][x.p]) st.packs[0][x.p] = 1;
  ok("rip still free when out", mv(0, { act: "rip", p: x.p }).ok);
  // helper: +1 now and every day, cost 80 then 160, capped
  ok("helper costs an action, gives +1 now", mv(1, { act: "up", key: "helper" }).ok && st.up[1].helper === 1 && st.acts[1] === cfg.base && st.cash[1] === 220);
  ok("second helper $160", G.view(st, 1).me.costs.helper === 160 && mv(1, { act: "up", key: "helper" }).ok && st.up[1].helper === 2 && st.cash[1] === 60 && G.view(st, 1).me.costs.helper === null);
  done();
}
// ---- carry, bonus, cap across days ----
{
  const g = game(2, 11);
  const { st, mv, until } = g;
  st.up[0].helper = 2;
  st.acts[0] = 4; // two helpers on day 1 (as if bought): 2 + 2
  st.bonusAct[0] = 1; // as if the challenge was done
  mv(0, { act: "ready" }); mv(1, { act: "ready" });
  until(() => st.phase === "setup"); mv(0, { act: "ready" }); mv(1, { act: "ready" });
  until(() => st.day === 2 && st.phase === "buy");
  ok("tomorrow = base + helpers + challenge + carry(1), capped at max " + G.CFG.actions.max, st.acts[0] === G.CFG.actions.max, "got " + st.acts[0]);
  ok("unused actions carry at most 1", st.acts[1] === G.CFG.actions.base + 1, "got " + st.acts[1]);
  g.done();
}
// ---- fishing ----
{
  const { st, mv, adv, done } = game(3, 21);
  ok("can't fish with money", !mv(0, { act: "fish", start: true }).ok);
  st.cash[0] = 3;
  const v0 = G.view(st, 0);
  ok("broke: fishing offered", v0.me.canFish === true);
  ok("finish before start refused", !mv(0, { act: "fish", progress: 1 }).ok);
  ok("fishing starts and costs an action", mv(0, { act: "fish", start: true }).ok && st.acts[0] === G.CFG.actions.base - 1);
  adv(1000);
  ok("too-quick finish refused", mv(0, { act: "fish", progress: 1 }).error === "Keep reeling!");
  adv(4000);
  const packs0 = st.packs[0].reduce((a, b) => a + b, 0);
  const r = mv(0, { act: "fish", progress: 1, reward: "golden", p: 5, kind: "golden", cash: 9999 });
  const c = st.fished[0].caught;
  ok("landed: server-rolled catch", r.ok && ["pack", "boot", "golden"].includes(c.kind) && st.cash[0] < 100, JSON.stringify(c));
  ok("catch is a pack from active sets or a $5 boot", c.kind === "boot" ? st.cash[0] === 3 + G.CFG.fish.bootCash : st.active.includes(c.p) && st.packs[0].reduce((a, b) => a + b, 0) === packs0 + 1);
  ok("once a day", !mv(0, { act: "fish", start: true }).ok && !mv(0, { act: "fish", progress: 1 }).ok);
  st.cash[1] = 2;
  mv(1, { act: "fish", start: true }); adv(5000);
  ok("bad progress refused", !mv(1, { act: "fish", progress: 7 }).ok && !mv(1, { act: "fish", progress: -1 }).ok && !mv(1, { act: "fish", progress: "lots" }).ok && !st.fished[1].done);
  ok("failed reel = boot", mv(1, { act: "fish", progress: 0.4 }).ok && st.fished[1].caught.kind === "boot" && st.cash[1] === 2 + G.CFG.fish.bootCash);
  // catch odds over many trips
  const tally = { pack: 0, boot: 0, golden: 0 };
  for (let i = 0; i < 600; i++) { st.fished[2] = null; st.cash[2] = 1; st.acts[2] = 5; mv(2, { act: "fish", start: true }); adv(5000); mv(2, { act: "fish", progress: 1 }); tally[st.fished[2].caught.kind]++; }
  ok("catch table roughly 70/22/8", tally.pack > 360 && tally.golden > 20 && tally.golden < 90, JSON.stringify(tally));
  const v = G.view(st, 0), t = G.tv(st);
  ok("fishing state private (not in tv or others' view)", !JSON.stringify(t).includes('"fished"') && !JSON.stringify(t).includes('"caught"') && !G.view(st, 1).me.fish === false && !JSON.stringify({ ...G.view(st, 1), me: null }).includes('"caught"'));
  ok("golden catches announced publicly", st.feed.some((e) => e.kind === "golden") === tally.golden > 0 && JSON.stringify(t.feed).includes("golden") === st.feed.slice(-24).some((e) => e.kind === "golden"));
  done();
}
// ---- VIP bounty: the first booth to show it ----
{
  const g = game(3, 33);
  const { st, mv, until, adv } = g;
  const w = st.wanted;
  const fit = st.pool.find((i) => X.wants(w, i * 2));
  ok("wanted poster has text + bounty", w.text && w.bounty > 0 && fit !== undefined, w.text + " $" + w.bounty);
  [0, 1, 2].forEach((s) => (st.own[s][fit * 2] = 1));
  ok("player knows they have one", G.view(st, 0).me.hasWanted === true);
  mv(0, { act: "ready" }); mv(1, { act: "ready" }); mv(2, { act: "ready" });
  until(() => st.phase === "setup");
  adv(10); mv(1, { act: "slot", i: 2, k: fit * 2, pct: 150 });
  adv(10); mv(0, { act: "slot", i: 0, k: fit * 2, pct: 100 });
  adv(10); mv(0, { act: "slot", i: 0, pct: 120 }); // re-pricing keeps the placement time
  const cash = st.cash.slice();
  mv(0, { act: "ready" }); mv(1, { act: "ready" }); mv(2, { act: "ready" });
  until(() => st.phase === "sell");
  until(() => st.wanted.claimed !== -1 || st.phase !== "sell");
  ok("bounty goes to the first booth that showed it (seat 1)", st.wanted.claimed === 1, "claimed " + st.wanted.claimed);
  ok("bounty paid once, card taken, other table keeps theirs", st.feed.filter((e) => e.kind === "bounty").length === 1 && st.cash[1] >= cash[1] + st.wanted.bounty - 0.01 && !st.own[1][fit * 2] && st.own[0][fit * 2] === 1);
  ok("wanted claimed is public", G.tv(st).wanted.claimed === 1 && G.view(st, 2).wanted.claimed === 1);
  g.done();
}
{
  const g = game(2, 44);
  const { st, mv, until } = g;
  mv(0, { act: "ready" }); mv(1, { act: "ready" }); until(() => st.phase === "setup");
  mv(0, { act: "ready" }); mv(1, { act: "ready" }); until(() => st.phase === "sell");
  until(() => st.wanted.claimed !== -1 || st.phase !== "sell");
  ok("nobody has it: VIP leaves empty-handed", st.wanted.claimed === -2 && st.feed.some((e) => e.kind === "vipgone"));
  g.done();
}
// ---- hot streak rules ----
{
  const g = game(2, 55);
  const { st } = g;
  const cfg = G.CFG;
  const feed = () => {};
  st.cash[0] = 100;
  const b1 = X.onDeal(st, 0, { r: 1, full: true, how: "paid", ty: "fan" }, cfg, feed);
  const b2 = X.onDeal(st, 0, { r: 1, full: true, how: "accept", ty: "fan" }, cfg, feed);
  const b3 = X.onDeal(st, 0, { r: 1, full: true, how: "counter", ty: "fan" }, cfg, feed);
  ok("full-price deals build the streak, bonus from x2", st.streak[0] === 3 && b1 === 0 && b2 > 0 && b3 > b2, [b1, b2, b3].join(","));
  ok("streak adds appeal (capped)", G.view(st, 0).me.appeal === Math.min(3, cfg.streak.maxAppeal) && G.tv(st).streak[0] === 3);
  ok("streak x3 earns +1 action tomorrow", st.bonusAct[0] === 1);
  X.onDeal(st, 0, { r: 1, full: false, how: "accept", ty: "fan" }, cfg, feed);
  ok("a below-sticker deal doesn't add to it", st.streak[0] === 3);
  // a real decline (no bump) resets it
  st.phase = "sell";
  st.q[0] = [{ id: 999, kind: "buy", ty: "fan", slot: 0, list: 10, m: 8, cash: 7, bump: null, giveV: 0, rounds: 0, log: [], opts: [], until: Date.now() + 5000 }];
  G.move(st, 0, { act: "offer", id: 999, yes: false }, { rng: Math.random, now: () => Date.now(), later: () => {} });
  ok("declining (customer walks) resets the streak", st.streak[0] === 0);
  X.onDeal(st, 0, { r: 1, full: true, how: "paid", ty: "fan" }, cfg, feed);
  st.q[0] = [{ id: 1000, kind: "buy", ty: "fan", slot: 0, list: 10, m: 8, cash: 7, bump: null, giveV: 0, rounds: 0, log: [], opts: [], until: Date.now() - 1 }];
  G.move(st, 0, { act: "offer", id: 1000, yes: true }, { rng: Math.random, now: () => Date.now(), later: () => {} });
  ok("letting an offer time out resets it too", st.streak[0] === 0);
  g.done();
}
// ---- challenge: completion pays once + bonus action ----
{
  const g = game(3, 66);
  const { st } = g;
  const prize = G.CFG.challenge.prize;
  st.chal = { id: "holo", text: "Sell a Holo or better", prize, done: [], prog: [0, 0, 0], need: 1 };
  const c0 = st.cash[2];
  const fd = (s2, e) => st.feed.push({ id: 1, ...e });
  X.onDeal(st, 2, { r: 2, full: false, ty: "fan" }, G.CFG, fd);
  ok("a Rare doesn't complete 'sell a Holo'", !st.chal.done.length);
  X.onDeal(st, 2, { r: 3, full: false, ty: "fan" }, G.CFG, fd);
  X.onDeal(st, 2, { r: 4, full: false, ty: "fan" }, G.CFG, fd);
  ok("Holo completes it: prize paid once, +1 action tomorrow", st.chal.done.join() === "2" && st.cash[2] === c0 + prize && st.bonusAct[2] === 1);
  X.onDeal(st, 1, { r: 5, full: false, ty: "fan" }, G.CFG, fd);
  ok("everyone who completes it gets paid", st.chal.done.join() === "2,1");
  ok("challenge public: text, prize, who's done", G.tv(st).challenge.done.length === 2 && G.tv(st).challenge.text === "Sell a Holo or better");
  g.done();
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
process.exitCode = fails ? 1 : 0;
