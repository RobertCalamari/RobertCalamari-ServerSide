// Ripple Market over sockets: 3 players to the end (with timeouts, invalid moves, leak checks), plus 8 players.
const { io } = require("socket.io-client");
const URL = "http://localhost:4003/duels";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
let fails = 0;
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) fails++; };
const open = async () => { const s = io(URL, { transports: ["websocket"], forceNew: true }); await new Promise((r) => s.on("connect", r)); s.last = null; s.on("room", (v) => (s.last = v.lite && s.last ? { ...s.last, ...v } : v)); return s; };
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(50); } return false; };
async function room(n) {
  const ps = [await open()];
  const c = await call(ps[0], "duel:create", { name: "P0", group: true });
  for (let i = 1; i < n; i++) { const s = await open(); await call(s, "duel:join", { code: c.code, name: "P" + i, group: true }); ps.push(s); }
  const tv = await open(); await call(tv, "duel:tv", { code: c.code });
  await wait(200); return { ps, tv };
}
const mv = (p, d) => call(p, "duel:move", d);
const V = (p) => p.last.match.view;
const leakFree = (obj, label) => {
  const j = JSON.stringify(obj);
  return !/"hold"|"hands"|"tips"|"played"|"cash":|"net"|"fair"/.test(j) || console.log("leak in", label, j.slice(0, 300));
};

async function play(n, timeoutRounds) {
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "ripple" });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "ripple"));
  let v = V(ps[0]);
  check(n + "p: start 1000 cash, 5 companies, 3 cards", v.me.cash === 1000 && v.companies.length === 5 && v.price.every((p) => p >= 40 && p <= 120) && v.me.hand.length === 3);
  check(n + "p: view hides links/big/others", v.links === null && v.big === null && !("hold" in v) && leakFree({ ...v, me: null }, "view"));
  const t = tv.last.match.tv;
  check(n + "p: tv has no secrets", t && !t.me && t.links === null && leakFree(t, "tv"));
  // invalid moves
  const p0 = v.price[0];
  check("overspend refused", !(await mv(ps[0], { act: "trade", co: 0, qty: Math.floor(1000 / p0) + 1 })).ok);
  check("sell unowned refused", !(await mv(ps[0], { act: "trade", co: 1, qty: -1 })).ok);
  check("bad company refused", !(await mv(ps[0], { act: "trade", co: 7, qty: 1 })).ok && !(await mv(ps[0], { act: "trade", co: 0, qty: 1.5 })).ok && !(await mv(ps[0], { act: "trade", co: "0", qty: 1 })).ok);
  check("bad card refused", !(await mv(ps[0], { act: "card", i: 9, co: 0 })).ok);
  const buy = await mv(ps[0], { act: "trade", co: 0, qty: 5 });
  await wait(100);
  v = V(ps[0]);
  check("buy works", buy.ok && v.me.cash === 1000 - 5 * p0 && v.me.hold[0] === 5);
  check("sell more than held refused", !(await mv(ps[0], { act: "trade", co: 0, qty: -6 })).ok);
  check("partial sell ok", (await mv(ps[0], { act: "trade", co: 0, qty: -2 })).ok);
  await wait(100);
  check("others can't see p0 holdings", JSON.stringify(V(ps[1]).me.hold) === "[0,0,0,0,0]" && !JSON.stringify(V(ps[1])).includes('"hold":[3'));
  check("worth unchanged by trading at price", V(ps[1]).worth[0] === 1000);
  // card: p1 plays its first card on co 2 (or tip)
  const c1 = V(ps[1]).me.hand[0];
  const cr = await mv(ps[1], { act: "card", i: 0, co: 2 });
  check("card play ok", cr.ok);
  check("second card same round refused", !(await mv(ps[1], { act: "card", i: 1, co: 2 })).ok);
  await wait(100);
  check("card play secret to others + tv", V(ps[0]).last === null && !JSON.stringify(V(ps[0])).includes('"played":{') && !JSON.stringify(tv.last.match.tv).includes("played"));
  if (c1.type === "tip") check("tip revealed a real link", V(ps[1]).me.tips.length === 1);
  // ready: all ready ends early
  await mv(ps[0], { act: "ready" });
  check("ready trader can't trade", !(await mv(ps[0], { act: "trade", co: 0, qty: 1 })).ok);
  await wait(100);
  check("ready flags public", V(ps[1]).ready[0] === true && tv.last.match.tv.ready[0] === true);
  const t0 = Date.now();
  for (let i = 1; i < n; i++) await mv(ps[i], { act: "ready" });
  await until(() => V(ps[0]).phase === "reveal", 3000);
  check("all ready -> resolves early", V(ps[0]).phase === "reveal" && Date.now() - t0 < 2000 && V(ps[0]).hist[0].length === 2);
  check("reveal shows anon card", V(ps[0]).last.cards.length === 1 && !("seat" in V(ps[0]).last.cards[0]));
  check("trade during reveal refused", !(await mv(ps[0], { act: "trade", co: 0, qty: 1 })).ok);
  // remaining rounds
  for (let r = 2; r <= 8; r++) {
    await until(() => V(ps[0]).phase === "trade" && V(ps[0]).round === r, 15000);
    if (r <= timeoutRounds) { // nobody acts: wait for the 40s timer
      const s = Date.now();
      await until(() => V(ps[0]).phase === "reveal", 50000);
      check("round " + r + " times out after ~40s", Math.abs(Date.now() - s - 40000) < 2500, (Date.now() - s) + "ms");
      continue;
    }
    for (let i = 0; i < n; i++) {
      const vv = V(ps[i]);
      const co = (i + r) % 5;
      if (vv.price[co]) { const q = Math.floor(vv.me.cash / vv.price[co] / 2); if (q) await mv(ps[i], { act: "trade", co, qty: q }); }
      const held = vv.me.hold.findIndex((h, c) => h && c !== co);
      if (held >= 0) await mv(ps[i], { act: "trade", co: held, qty: -vv.me.hold[held] });
      const k = vv.me.hand.findIndex((c) => !c.used);
      if (k >= 0 && r % 2) await mv(ps[i], { act: "card", i: k, co: vv.price.findIndex((p) => p > 0) });
      await mv(ps[i], { act: "ready" });
    }
  }
  await until(() => ps[0].last.match.result && tv.last.match.result, 15000);
  const res = ps[0].last.match.result;
  v = V(ps[0]);
  check(n + "p: finished with places + text", res && res.places.filter((x) => x).length === n && res.text.length > 5, JSON.stringify(res));
  check(n + "p: final reveals map + big trades", v.phase === "done" && v.links.length === 5 && v.links.every((l) => l.length >= 1 && l.length <= 2) && v.big.length > 0 && tv.last.match.tv.links);
  check(n + "p: hist 9 points each", v.hist.every((h) => h.length === 9));
  const worths = v.worth;
  const best = worths.indexOf(Math.max(...worths));
  check(n + "p: richest placed 1st", res.places[best] === 1);
  check(n + "p: cash never negative", ps.every((p) => V(p).me.cash >= 0 && V(p).me.hold.every((h) => h >= 0)));
  console.log("  final prices", JSON.stringify(v.price), "worth", JSON.stringify(worths), res.text);
  [...ps, tv].forEach((p) => p.disconnect());
}
(async () => {
  await play(3, 2);
  if (!process.env.ONLY3) await play(8, 0);
  console.log(fails ? fails + " FAILED" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
