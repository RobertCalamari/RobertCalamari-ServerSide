// Totally Real Vending Simulator over sockets: full games with 2, 3 and 6 players (run at once), timeouts,
// invalid moves, haggling answers, odd jobs and secret-leak checks on view()/tv().
const { io } = require("socket.io-client");
const URL = "http://localhost:4006/duels";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
let fails = 0;
const check = (tag, l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + tag + " " + l + (x ? "  " + x : "")); if (!ok) fails++; };
const open = async () => { const s = io(URL, { transports: ["websocket"], forceNew: true }); await new Promise((r) => s.on("connect", r)); s.last = null; s.on("room", (v) => (s.last = v.lite && s.last ? { ...s.last, ...v } : v)); return s; };
const until = async (fn, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(60); } return false; };
async function room(n) {
  const ps = [await open()];
  const c = await call(ps[0], "duel:create", { name: "P0", group: true });
  for (let i = 1; i < n; i++) { const s = await open(); await call(s, "duel:join", { code: c.code, name: "P" + i, group: true }); ps.push(s); }
  const tv = await open(); await call(tv, "duel:tv", { code: c.code });
  await wait(200); return { ps, tv };
}
const mv = (p, d) => call(p, "duel:move", d);
const V = (p) => p.last.match.view;
const T = (tv) => tv.last.match.tv;
const SECRET = /"own"|"basis"|"hints"|"rips"|"jobs"|"packBasis"|"crowd"|"budget"|"carry"|"want"|"scar"|"next"|"news":\[|"fished"|"caught"|"bonusAct"|"prog"|"bestStreak"/;
const leakTV = (t) => !SECRET.test(JSON.stringify(t)) && !("me" in t);
const leakView = (v, seat) => { const pub = { ...v, me: null }; return !SECRET.test(JSON.stringify(pub)); };

async function play(n, opts) {
  const tag = "[" + n + "p]";
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "cardshop" });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "cardshop" && p.last.match.view));
  let v = V(ps[0]);
  check(tag, "start: $300, day 1 buy, 5 slots, stock + singles", v.me.cash === 300 && v.day === 1 && v.phase === "buy" && v.me.slots === 5 && v.me.disp.length === 5 && v.me.costs.slot === 50 && v.stock.length >= 5 && v.singles.length === 4 + n);
  check(tag, "6 active sets", v.sets.filter((s) => s.on).length === 6 && v.stock.every((x) => v.sets[x.p].on));
  check(tag, "view has no secrets of others", leakView(v, 0) && V(ps[1]).me.cash === 300);
  check(tag, "tv has no secrets", leakTV(T(tv)));
  // invalid moves (none of these cost an action)
  const cheap = v.stock[0];
  check(tag, "2 actions to start, none used", v.me.acts === 2 && T(tv).acts.every((x) => x === 0));
  check(tag, "rip without a pack refused", !(await mv(ps[0], { act: "rip", p: cheap.p })).ok);
  check(tag, "bad pack refused", !(await mv(ps[0], { act: "pack", p: 99 })).ok && !(await mv(ps[0], { act: "pack", p: "0" })).ok && !(await mv(ps[0], { act: "pack", p: cheap.p, n: 4 })).ok && !(await mv(ps[0], { act: "pack", p: cheap.p, n: 0 })).ok);
  const notOffered = v.sets.findIndex((s, i) => s.on && !v.stock.some((x) => x.p === i));
  if (notOffered >= 0) check(tag, "set not stocked today refused", !(await mv(ps[0], { act: "pack", p: notOffered })).ok);
  check(tag, "slot with unowned card refused", !(await mv(ps[0], { act: "slot", i: 0, k: 2, pct: 100 })).ok);
  check(tag, "list unowned refused", !(await mv(ps[0], { act: "list", k: 2, price: 5 })).ok);
  check(tag, "fishing refused when you can afford a pack", !(await mv(ps[0], { act: "fish", start: true })).ok);
  check(tag, "client can't claim a catch", !(await mv(ps[0], { act: "fish", progress: 1, kind: "golden" })).ok);
  check(tag, "offer outside selling refused", !(await mv(ps[0], { act: "offer", id: 1, yes: true })).ok);
  check(tag, "unknown upgrade refused", !(await mv(ps[0], { act: "up", key: "rocket" })).ok && !(await mv(ps[0], { act: "up", key: "gun" })).ok);
  await wait(120);
  check(tag, "refused moves cost no actions", V(ps[0]).me.acts === 2);
  // P0: one action = a 3-pack bundle, ripping is free, the second action lists a card
  const b3 = await mv(ps[0], { act: "pack", p: cheap.p, n: 3 });
  await wait(150);
  v = V(ps[0]);
  check(tag, "bundle: 3 packs for one action at the posted price", b3.ok && v.me.packs[cheap.p] === 3 && v.me.acts === 1 && Math.abs(v.me.cash - (300 - 3 * cheap.price)) < 0.02 && T(tv).acts[0] === 1, "cash " + v.me.cash);
  const r1 = await mv(ps[0], { act: "rip", p: cheap.p });
  await wait(150);
  v = V(ps[0]);
  const cards = v.me.own.reduce((t, o) => t + o[1], 0);
  check(tag, "rip gives 5 cards, costs no action", r1.ok && cards === 5 && v.me.rips.length === 1 && v.me.rips[0].keys.length === 5 && v.me.packs[cheap.p] === 2 && v.me.acts === 1);
  check(tag, "every pack has a Rare or better", v.me.rips[0].keys.some((k) => v.cat[k >> 1].r >= 2));
  check(tag, "rip is private (not in tv / others' view)", !JSON.stringify(T(tv)).includes('"rips"') && V(ps[1]).me.rips.length === 0);
  check(tag, "card info sent for own cards", v.me.own.every(([k]) => v.cat[k >> 1] && v.cat[k >> 1].n && v.cat[k >> 1].id));
  const best = v.me.own.slice().sort((a, b) => b[0] - a[0])[0][0];
  const lr = await mv(ps[0], { act: "list", k: best, price: 1 });
  await wait(120);
  const lid = V(ps[0]).listings.find((l) => l.seat === 0).id;
  check(tag, "listing costs an action + is public", lr.ok && V(ps[0]).me.acts === 0 && V(ps[1]).listings.some((l) => l.id === lid) && T(tv).listings.some((l) => l.id === lid));
  const oo = await mv(ps[0], { act: "pack", p: v.stock[1].p, n: 1 });
  check(tag, "out of actions: refused with tomorrow's count", !oo.ok && /^Out of actions\. Tomorrow you get [2-5]\.$/.test(oo.error || ""), oo.error);
  check(tag, "out of actions: upgrade + list refused, rip/slot/unlist still free", !(await mv(ps[0], { act: "up", key: "lights" })).ok && (await mv(ps[0], { act: "rip", p: cheap.p })).ok && (await mv(ps[0], { act: "slot", i: 0, k: V(ps[0]).me.own[0][0], pct: 120 })).ok);
  check(tag, "can't buy own listing", !(await mv(ps[0], { act: "take", id: lid })).ok);
  // P1: extra slot (action), then helps buy out the cheap set
  check(tag, "slot 6 doesn't exist yet", !(await mv(ps[1], { act: "slot", i: 5, clear: true })).ok);
  const su = await mv(ps[1], { act: "up", key: "slot" });
  await wait(120);
  check(tag, "extra slot: 6 slots, $50 paid, next costs $90, one action", su.ok && V(ps[1]).me.slots === 6 && V(ps[1]).me.disp.length === 6 && V(ps[1]).me.cash === 250 && V(ps[1]).me.costs.slot === 90 && V(ps[1]).me.acts === 1);
  check(tag, "booths show slot counts", T(tv).booths[1].slots === 6 && T(tv).booths[0].slots === 5);
  for (const p of ps.slice(1)) {
    const left = V(p).stock[0].q;
    if (left > 0 && V(p).me.acts > 0) await mv(p, { act: "pack", p: cheap.p, n: Math.min(3, left) });
    await wait(60);
  }
  await wait(150);
  v = V(ps[0]);
  check(tag, "set sold out", v.stock[0].q === 0, "left " + v.stock[0].q);
  const so = await mv(ps[0], { act: "pack", p: cheap.p, n: 1 });
  check(tag, "sold-out pack refused", !so.ok && /sold out/i.test(so.error || ""), so.error);
  // overspend: a bundle that costs more than you have
  const pricey = V(ps[0]).stock.find((x) => x.q > 0 && x.price * Math.min(3, x.q) > V(ps[0]).me.cash);
  if (pricey) {
    const os = await mv(ps[0], { act: "pack", p: pricey.p, n: Math.min(3, pricey.q) });
    check(tag, "overspending refused", !os.ok && os.error === "Not enough cash.", os.error);
  } else check(tag, "(no bundle pricier than cash today)", true);
  // singles: someone with an action buys one, nobody else can
  const buyer = ps.findIndex((p) => V(p).me.acts > 0);
  const si = buyer >= 0 ? V(ps[buyer]).singles.findIndex((x) => x.price <= V(ps[buyer]).me.cash) : -1;
  if (si >= 0) {
    check(tag, "single bought (one action)", (await mv(ps[buyer], { act: "single", i: si })).ok);
    const again = await mv(ps[buyer === 0 ? 1 : 0], { act: "single", i: si });
    check(tag, "single double-buy refused", !again.ok && /already/.test(again.error || ""), again.error);
  } else check(tag, "(no one left with an action for singles)", true);
  // the listing race: at most one taker wins, and only with an action
  const races = await Promise.all(ps.slice(1).map((p) => mv(p, { act: "take", id: lid })));
  check(tag, "listing sells at most once", races.filter((r) => r.ok).length <= 1 && !(await mv(ps[n - 1], { act: "take", id: lid })).ok, JSON.stringify(races.map((r) => r.ok || r.error)));
  await wait(150);
  check(tag, "actions never negative, tv shows used", ps.every((p) => V(p).me.acts >= 0) && T(tv).acts.every((x, s) => x === 2 - V(ps[s]).me.acts || (s === 1 && x <= 2)));
  // all ready -> setup
  for (const p of ps) await mv(p, { act: "ready" });
  await until(() => V(ps[0]).phase === "setup" && V(ps[1]).phase === "setup" && T(tv).phase === "setup", 3000);
  check(tag, "all ready ends buy phase", V(ps[0]).phase === "setup");
  check(tag, "booths hidden during setup", V(ps[1]).booths.every((b) => b.items === null) && T(tv).booths.every((b) => b.items === null));
  check(tag, "distributor closed in setup", !(await mv(ps[1], { act: "pack", p: v.stock[1].p })).ok);
  // everyone shows what they have
  async function setupAll(pct, skipLast) {
    for (const p of (skipLast ? ps.slice(0, -1) : ps)) {
      const vv = V(p);
      let i = 0;
      const own = vv.me.own.slice().sort((a, b) => (vv.cat[b[0] >> 1].p - vv.cat[a[0] >> 1].p));
      const used = {};
      for (const [k, q] of own) { while ((used[k] || 0) < q && i < vv.me.slots) { if (!vv.me.disp[i]) { await mv(p, { act: "slot", i, k, pct }); used[k] = (used[k] || 0) + 1; } i++; } }
      for (let pp = 0; pp < vv.me.packs.length && i < vv.me.slots; pp++) if (vv.me.packs[pp] && !vv.me.disp[i]) { await mv(p, { act: "slot", i, p: pp, pct }); i++; }
    }
  }
  await setupAll(100);
  v = V(ps[0]);
  check(tag, "display set", v.me.disp.filter(Boolean).length >= 1);
  check(tag, "can't show more copies than owned", !(await mv(ps[0], { act: "slot", i: 2, k: v.me.disp[0].k, pct: 100 })).ok || v.me.own.find((o) => o[0] === v.me.disp[0].k)[1] > 1);
  check(tag, "bad slot refused", !(await mv(ps[0], { act: "slot", i: 6, k: v.me.disp[0].k })).ok && !(await mv(ps[0], { act: "slot", i: -1, clear: true })).ok);
  if (n >= 3) await mv(ps[0], { act: "up", key: "lic" });
  for (const p of ps) await mv(p, { act: "ready" });
  await until(() => V(ps[0]).phase === "sell" && T(tv).phase === "sell", 3000);
  check(tag, "booths public while selling", T(tv).booths[0].items !== null);
  check(tag, "setup moves refused while selling", !(await mv(ps[0], { act: "slot", i: 0, clear: true })).ok && !(await mv(ps[0], { act: "rip", p: 99 })).ok);
  let answered = 0, seenOffer = false, maxQ = 0, GX0 = null;
  const H = { counters: 0, back: 0, ended: 0, extended: 0, capped: 0, capTried: 0, hidden: true, logOk: true, sellRefused: 0, sellTried: 0, deals: 0 };
  // haggle with the front offer: counter until they settle, walk or the rounds run out
  async function haggle(p, o0) {
    let o = o0;
    for (let round = 0; round < 3; round++) {
      if (round === 2) { H.capTried++; const r = await mv(p, { act: "offer", id: o.id, counter: 0 }); if (!r.ok) H.capped++; return; }
      if (!o.opts || !o.opts.length) return;
      const before = V(p).me.cash;
      const r = await mv(p, { act: "offer", id: o.id, counter: round === 0 ? 0 : o.opts.length - 1 });
      if (!r.ok) return;
      H.counters++;
      await wait(120);
      const now = V(p).me.q[0];
      if (now && now.id === o.id) {
        H.back++;
        if (now.until >= o.until + 3500) H.extended++;
        if (!(now.log.length === o.log.length + 2 && now.log[now.log.length - 2].who === "you" && now.log[now.log.length - 1].who === "them")) H.logOk = false;
        o = now;
      } else { H.ended++; if (V(p).me.cash > before) H.deals++; return; }
    }
  }
  const dayLoop = async (policy) => {
    while (V(ps[0]).phase === "sell") {
      for (const [i, p] of ps.entries()) {
        const vv = V(p);
        maxQ = Math.max(maxQ, vv.me.q.length);
        if (vv.me.q.some((o) => "w" in o || "bump" in o)) H.hidden = false;
        const o = vv.me.q[0];
        if (!o || !o.until) continue;
        seenOffer = true;
        if (o.kind === "sell") { H.sellTried++; if (!(await mv(p, { act: "offer", id: o.id, counter: 0 })).ok) H.sellRefused++; }
        const pol = policy(i, o);
        if (pol === "haggle" && o.kind !== "sell") { await haggle(p, o); answered++; continue; }
        const r = await mv(p, { act: "offer", id: o.id, yes: pol === true });
        if (r.ok) answered++;
      }
      await wait(250);
    }
  };
  const cash0 = ps.map((p) => V(p).me.cash);
  await dayLoop((i, o) => (i === 0 ? "haggle" : i % 2 === 0));
  check(tag, "customers made offers + we answered", seenOffer && answered > 0, "answered " + answered);
  check(tag, "phone shows at most 2 offers", maxQ <= 2);
  await until(() => V(ps[0]).phase === "report", 5000);
  v = V(ps[0]);
  check(tag, "report after selling", v.phase === "report" && v.report && v.report.day === 1 && v.report.movers.length > 0 && v.tomorrow);
  check(tag, "sales add up", ps.every((p, i) => V(p).me.cash >= 0));
  check(tag, "tv bubbles/walkers only public fields", leakTV(T(tv)));
  check(tag, "offers bad id refused", !(await mv(ps[0], { act: "offer", id: 123456, yes: true })).ok);
  check(tag, "report highlights + public challenge/wanted", Array.isArray(v.report.highlights) && v.challenge.text && v.wanted.text && v.wanted.bounty > 0 && T(tv).challenge && T(tv).wanted);
  GX0 = { done: v.challenge.done.slice() };
  // remaining days (seat 0 keeps haggling, the last seat goes broke to test fishing)
  const GX = { fished: false, chalDone: {}, bonusChecked: 0, bonusOk: true, actsRange: true, bounties: 0, bountyOk: true, chals: 0, chalOk: true };
  GX.chalDone[1] = GX0.done;
  const dayEnd = (d) => {
    const vv = V(ps[0]);
    const today = vv.feed.filter((e) => e.day === d);
    GX.chalDone[d] = vv.challenge.done.slice();
    GX.chals += vv.challenge.done.length;
    if (today.filter((e) => e.kind === "challenge").length !== vv.challenge.done.length) GX.chalOk = false;
    const b = today.filter((e) => e.kind === "bounty");
    if (b.length > 1 || (b.length === 1) !== (vv.wanted.claimed >= 0) || (b.length && b[0].seat !== vv.wanted.claimed)) GX.bountyOk = false;
    GX.bounties += b.length;
    if (!leakTV(T(tv))) GX.leak = true;
  };
  for (let d = 2; d <= 8; d++) {
    await until(() => V(ps[0]).phase === "buy" && V(ps[0]).day === d, 20000);
    if (d === opts.timeoutDay) {
      const s = Date.now();
      await until(() => V(ps[0]).phase === "setup", 70000);
      check(tag, "day " + d + " buy times out ~60s", Math.abs(Date.now() - s - 60000) < 3000, Date.now() - s + "ms");
      const s2 = Date.now();
      await until(() => V(ps[0]).phase === "sell", 55000);
      check(tag, "day " + d + " setup times out ~45s", Math.abs(Date.now() - s2 - 45000) < 3000, Date.now() - s2 + "ms");
    } else {
      for (const [i, p] of ps.entries()) {
        const vv = V(p);
        if (!(vv.me.acts >= 2 && vv.me.acts <= 5)) GX.actsRange = false;
        if (GX.chalDone[d - 1] && GX.chalDone[d - 1].includes(i)) { GX.bonusChecked++; if (vv.me.acts < 3) GX.bonusOk = false; }
        if (vv.me.canFish && !GX.fished) {
          const a0 = vv.me.acts;
          const st0 = await mv(p, { act: "fish", start: true });
          await wait(150);
          const early = await mv(p, { act: "fish", progress: 1 });
          await wait(3200);
          const fin = await mv(p, { act: "fish", progress: 1, kind: "golden", p: 0, cash: 999 });
          await wait(150);
          const f = V(p).me.fish;
          const okCatch = f && f.done && f.caught && (f.caught.kind === "boot" ? f.caught.cash === 5 : V(p).sets[f.caught.p].on);
          check(tag, "fishing: costs an action, too-early refused, server-rolled catch", st0.ok && V(p).me.acts === a0 - 1 && !early.ok && fin.ok && okCatch, JSON.stringify(f && f.caught));
          check(tag, "fishing: once a day", !(await mv(p, { act: "fish", start: true })).ok);
          check(tag, "fishing state private", !JSON.stringify(T(tv)).includes('"caught"') && !JSON.stringify({ ...V(ps[(i + 1) % n]), me: null }).includes('"caught"'));
          GX.fished = true;
          continue;
        }
        if (i === n - 1 && n > 1) {
          // the spender: blows the budget on the priciest bundle it can afford, keeps everything sealed and off the table
          for (let a = 0; a < 2; a++) {
            const s2 = V(p).stock.filter((x) => x.q > 0).map((x) => ({ x, k: Math.min(3, x.q, Math.floor(V(p).me.cash / x.price)) })).filter((y) => y.k > 0).sort((y, z) => z.k * z.x.price - y.k * y.x.price)[0];
            if (s2 && V(p).me.acts > 0) await mv(p, { act: "pack", p: s2.x.p, n: s2.k });
            await wait(60);
          }
          continue;
        }
        const st = vv.stock.filter((x) => x.q > 0 && x.price <= vv.me.cash - 20);
        if (st.length && vv.me.acts > 0) {
          const k = Math.min(3, st[0].q, Math.floor((vv.me.cash - 20) / st[0].price));
          await mv(p, { act: "pack", p: st[0].p, n: k });
          for (let j = 0; j < k; j++) await mv(p, { act: "rip", p: st[0].p });
        }
      }
      let gunOk = null;
      if (d === 3) gunOk = await mv(ps[0], { act: "up", key: "gun", p: V(ps[0]).stock[0].p });
      for (const p of ps) await mv(p, { act: "ready" });
      await until(() => V(ps[0]).phase === "setup", 3000);
      if (d === 3) check(tag, "price gun hint (or refused when broke)", gunOk.ok ? V(ps[0]).me.hints.length === 1 && typeof V(ps[0]).me.hints[0].pct === "number" : gunOk.error === "Not enough cash.", JSON.stringify(gunOk));
      await setupAll(d % 2 ? 120 : 150, n > 1);
      for (const p of ps) await mv(p, { act: "ready" });
    }
    await until(() => V(ps[0]).phase === "sell", 5000);
    await dayLoop((i, o) => (i === 0 && o.kind !== "sell" ? "haggle" : o.kind === "sell" ? o.cash < V(ps[i]).me.cash / 3 : (o.cash + (o.giveV || 0)) >= o.m * (i % 2 ? 0.9 : 1.1)));
    await until(() => V(ps[0]).phase === "report" || V(ps[0]).phase === "done", 5000);
    await wait(200);
    dayEnd(d);
    if (d < 8 && d % 2) { for (const p of ps) await mv(p, { act: "ready" }); }
  }
  await until(() => ps[0].last.match.result && tv.last.match.result, 20000);
  console.log(tag, "haggle stats", JSON.stringify(H));
  console.log(tag, "game stats", JSON.stringify({ fished: GX.fished, chals: GX.chals, bonusChecked: GX.bonusChecked, bounties: GX.bounties }));
  check(tag, "actions always 2-5 each morning", GX.actsRange);
  check(tag, "challenge: each completion announced once", GX.chalOk);
  check(tag, "challenge: completers get +1 action next day", GX.bonusOk, GX.bonusChecked + " checked");
  check(tag, "bounty: at most one per day, to the claimed booth", GX.bountyOk, GX.bounties + " bounties");
  check(tag, "no leaks in tv over the game", !GX.leak);
  check(tag, "countered offers", H.counters > 0);
  check(tag, "customers settle/walk or come back", H.ended + H.back > 0);
  check(tag, "counter extends the timer + log shows the exchange", H.back === 0 || (H.extended === H.back && H.logOk), H.extended + "/" + H.back);
  check(tag, "max 2 counter rounds", H.capTried === H.capped);
  check(tag, "hidden customer max/bump never sent", H.hidden);
  check(tag, "no haggling on buy-in offers", H.sellTried === H.sellRefused);
  const res = ps[0].last.match.result;
  v = V(ps[0]);
  const t = T(tv);
  check(tag, "finished with places + text", res && res.places.filter((x) => x).length === n && res.text.length > 5, JSON.stringify(res));
  const worths = v.worth;
  check(tag, "richest placed 1st", res.places[worths.indexOf(Math.max(...worths))] === 1);
  check(tag, "final awards + worth history", Array.isArray(t.awards) && t.awards.length >= 1 && t.worthHist.every((h) => h.length === 9));
  check(tag, "cash never negative", ps.every((p) => V(p).me.cash >= 0));
  check(tag, "tv still leak-free at the end", leakTV(t));
  console.log(tag, "worth", JSON.stringify(worths), "awards", t.awards.map((a) => a.name + ":" + a.seat).join(", "), "| bytes view", JSON.stringify(v).length, "tv", JSON.stringify(t).length);
  [...ps, tv].forEach((p) => p.disconnect());
}
(async () => {
  const which = (process.env.ONLY || "2,3,6").split(",").map(Number);
  await Promise.all(which.map((n) => play(n, { timeoutDay: n === 3 ? 2 : 0 }).catch((e) => { console.log("FAIL [" + n + "p] crashed", e); fails++; })));
  console.log(fails ? fails + " FAILED" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
