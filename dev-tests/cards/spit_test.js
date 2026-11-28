const { wait, T, check, until, mv, V, duel, cardsIn, bySeat } = require("./common");
const fits = (a, b) => { const r = (c) => "23456789TJQKA".indexOf(c[0]); const d = Math.abs(r(a) - r(b)); return d === 1 || d === 12; };
(async () => {
  const { ps: socks } = await duel();
  socks[0].emit("duel:start", { game: "spit" });
  await until(() => socks.every((p) => p.last.match && p.last.match.game === "spit"));
  const ps = bySeat(socks);
  let v = V(ps[0]);
  check("starts in ready, 15 layout + 11 spit each", v.phase === "ready" && v.totals.every((t) => t === 26) && v.spit.every((n) => n === 11) && v.layout[0].map((p) => p.n).join() === "1,2,3,4,5");
  check("play before flip refused", !(await mv(ps[0], { act: "play", from: 0, to: 0 })).ok);
  await until(() => V(ps[0]).phase === "play", 5000);
  v = V(ps[0]);
  check("flip: both centre piles have a card", v.centre.every((c) => c.n === 1) && v.spit.every((n) => n === 10));
  // leak check: only face-up cards appear
  const visible = new Set(v.layout.flat().map((p) => p.top).concat(v.centre.map((c) => c.top)).filter(Boolean));
  check("view shows only face-up cards", cardsIn(v).every((c) => visible.has(c)) && cardsIn(V(ps[1])).every((c) => visible.has(c)));
  // illegal: non-adjacent
  let bad = null;
  v.layout[0].forEach((p, i) => [0, 1].forEach((k) => { if (!bad && !fits(p.top, v.centre[k].top)) bad = { from: i, to: k }; }));
  if (bad) check("non-adjacent rank refused", !(await mv(ps[0], { act: "play", ...bad })).ok);
  check("move onto a non-empty space refused", !(await mv(ps[0], { act: "move", from: 4, to: 0 })).ok);
  check("bad payloads refused", !(await mv(ps[0], { act: "play", from: 9, to: 0 })).ok && !(await mv(ps[0], { act: "play", from: 0, to: 5 })).ok && !(await mv(ps[0], null)).ok && !(await mv(ps[0], { act: "zz", from: 0 })).ok);
  if (!V(ps[0]).stuck) check("spit when someone can play refused", !(await mv(ps[0], { act: "spit" })).ok);
  // race: both bots play as fast as they can
  const stats = { ok: 0, slow: 0, other: 0, spits: 0, slaps: 0, moves: 0, leaks: 0, sum: 0 };
  let done = false;
  const errs = {};
  const bot = async (seat, delay) => {
    const p = ps[seat];
    while (!done) {
      await wait(delay + Math.random() * delay);
      const m = p.last.match;
      if (!m || m.result) { done = true; break; }
      const v = m.view;
      const n = v.totals[0] + v.totals[1] + v.centre[0].n + v.centre[1].n;
      if (n !== 52) stats.sum++;
      if (v.phase === "slap") { if (Math.random() < 0.5) { await mv(p, { act: "slap", pile: v.centre[0].n <= v.centre[1].n ? 0 : 1 }); stats.slaps++; } continue; }
      if (v.phase !== "play") continue;
      const mine = v.layout[seat];
      let play = null;
      mine.forEach((pl, i) => [0, 1].forEach((k) => { if (!play && pl.top && v.centre[k].top && fits(pl.top, v.centre[k].top)) play = { act: "play", from: i, to: k, card: pl.top, saw: v.centre[k].top }; }));
      if (play) {
        const r = await mv(p, play);
        if (r.ok) stats.ok++; else if (r.error === "Too slow!") stats.slow++; else { stats.other++; errs[r.error] = (errs[r.error] || 0) + 1; }
        continue;
      }
      const empty = mine.findIndex((x) => !x.n), deep = mine.findIndex((x) => x.n >= 2);
      if (empty >= 0 && deep >= 0) { await mv(p, { act: "move", from: deep, to: empty, card: mine[deep].top }); stats.moves++; continue; }
      if (v.stuck && !v.votes[seat]) { await mv(p, { act: "spit" }); stats.spits++; }
    }
  };
  const t0 = Date.now();
  await Promise.all([bot(0, 25), bot(1, 25), until(() => ps[0].last.match.result, 240000)]);
  done = true;
  const res = ps[0].last.match.result;
  check("spit game finishes", !!res, JSON.stringify(stats));
  console.log("  ", res && res.text, "in", Math.round((Date.now() - t0) / 1000) + "s", JSON.stringify(stats), JSON.stringify(errs));
  check("card count always 52", stats.sum === 0);
  check("no unexpected errors (races only show as Too slow / one up or down)", Object.keys(errs).every((e) => /one up|Too slow|Hold on|empty/i.test(e)), JSON.stringify(errs));
  check("round reached > 1 or someone went out", V(ps[0]).round >= 1);
  ps.forEach((p) => p.disconnect());
  console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
  process.exit(T.fails ? 1 : 0);
})();
