const { wait, T, check, until, room, mv, V, TV, cardsIn, bySeat } = require("./common");
const R = (c) => "23456789TJQKA".indexOf(c[0]);
const pubCards = (v) => new Set((v.trick || []).map((t) => t.c).concat(v.last ? v.last.cards.map((t) => t.c) : []));
async function start() {
  const { ps: socks, tv } = await room(4);
  socks[0].emit("duel:start", { game: "spades" });
  await until(() => socks.every((p) => p.last.match && p.last.match.game === "spades") && tv.last.match);
  return { ps: bySeat(socks), tv, socks };
}
async function full() {
  const { ps, tv } = await start();
  let v = V(ps[0]);
  check("13 cards each, bidding", v.phase === "bid" && v.myHand.length === 13 && v.counts.every((n) => n === 13));
  const t = v.turn;
  check("wrong turn bid refused", !(await mv(ps[(t + 1) % 4], { act: "bid", n: 3 })).ok);
  check("bad bids refused", !(await mv(ps[t], { act: "bid", n: 14 })).ok && !(await mv(ps[t], { act: "bid", n: -1 })).ok && !(await mv(ps[t], { act: "bid", n: "3" })).ok && !(await mv(ps[t], { act: "play", c: V(ps[t]).myHand[0] })).ok);
  const st = { leaks: 0, tvLeaks: 0, follow: 0, spadeLead: 0, wrongTurn: 0, illegalOk: 0, hands: 0, scoreChecks: 0, scoreBad: 0 };
  let lastHand = 0;
  while (!ps[0].last.match.result) {
    await wait(15);
    const m = ps[0].last.match;
    if (m.result) break;
    // leak checks
    for (let s = 0; s < 4; s++) {
      const vs = V(ps[s]); const pub = pubCards(vs); const mine = new Set(vs.myHand);
      if (cardsIn(vs).some((c) => !mine.has(c) && !pub.has(c))) st.leaks++;
    }
    const tvv = TV(tv);
    if (tvv && cardsIn(tvv).some((c) => !pubCards(tvv).has(c))) st.tvLeaks++;
    v = V(ps[0]);
    if (v.phase === "score" && v.hand !== lastHand) {
      lastHand = v.hand; st.hands++;
      // recheck the hand's score from bids/tricks
      const s = v.summary;
      for (const tm of [0, 1]) {
        const seats = [tm, tm + 2];
        const con = seats.filter((x) => s.bids[x] > 0).reduce((a, x) => a + s.bids[x], 0);
        const took = seats.filter((x) => s.bids[x] > 0).reduce((a, x) => a + s.tricks[x], 0);
        let pts = con ? (took >= con ? con * 10 + took - con : -con * 10) : 0;
        seats.filter((x) => s.bids[x] === 0).forEach((x) => (pts += s.tricks[x] ? -100 : 100));
        pts += s.rows[tm].penalty;
        st.scoreChecks++;
        if (pts !== s.rows[tm].pts) { st.scoreBad++; console.log("score mismatch", JSON.stringify(s)); }
      }
      check("hand " + v.hand + " tricks add to 13", v.summary.tricks.reduce((a, b) => a + b, 0) === 13);
    }
    if (v.turn === null || (v.phase !== "bid" && v.phase !== "play")) continue;
    const s = v.turn, p = ps[s], vs = V(p);
    if (vs.turn !== s) continue;
    // someone else tries to move
    const o = (s + 1) % 4;
    if (Math.random() < 0.1) { const r = await mv(ps[o], vs.phase === "bid" ? { act: "bid", n: 2 } : { act: "play", c: V(ps[o]).myHand[0] }); if (r.ok) st.wrongTurn++; }
    if (vs.phase === "bid") { await mv(p, { act: "bid", n: Math.random() < 0.08 ? 0 : 1 + Math.floor(Math.random() * 4) }); continue; }
    const ill = vs.myHand.find((c) => !vs.legal.includes(c));
    if (ill) {
      const r = await mv(p, { act: "play", c: ill });
      if (r.ok) st.illegalOk++;
      else if (/Follow suit/.test(r.error)) st.follow++;
      else if (/broken/.test(r.error)) st.spadeLead++;
      if (r.ok) continue;
    }
    const c = vs.legal[Math.floor(Math.random() * vs.legal.length)];
    await mv(p, { act: "play", c });
  }
  const res = ps[0].last.match.result;
  v = V(ps[0]);
  console.log("  ", res.text, JSON.stringify(v.scores), JSON.stringify(st));
  check("game reached the target (or -200)", Math.max(...v.scores) >= 250 || Math.min(...v.scores) <= -200);
  check("places: partners share", res.places[0] === res.places[2] && res.places[1] === res.places[3] && res.places[0] !== res.places[1] && res.winner === null);
  check("winning team has the higher score", res.places[v.scores[0] > v.scores[1] ? 0 : 1] === 1);
  check("no hand leaks to other players", st.leaks === 0);
  check("tv shows no hands", st.tvLeaks === 0 && !("myHand" in TV(tv)));
  check("not following suit refused", st.follow > 0 && st.illegalOk === 0, st.follow);
  check("leading spades unbroken refused", st.spadeLead > 0, st.spadeLead);
  check("wrong turn refused", st.wrongTurn === 0);
  check("scores recomputed match", st.scoreChecks > 0 && st.scoreBad === 0);
  [...Object.values(ps), tv].forEach((p) => p.disconnect());
}
async function timeouts() {
  const { ps, tv } = await start();
  let v = V(ps[0]);
  const t = v.turn, t0 = Date.now();
  await until(() => V(ps[0]).bids[t] !== null, 40000);
  v = V(ps[0]);
  check("bid timeout auto-bids ~30s", v.bids[t] >= 1 && Math.abs(Date.now() - t0 - 30000) < 2500 && v.auto && v.auto.seat === t, (Date.now() - t0) + "ms " + v.bids[t]);
  while (V(ps[0]).phase === "bid") { const s = V(ps[0]).turn; await mv(ps[s], { act: "bid", n: 3 }); await wait(50); }
  await until(() => V(ps[0]).phase === "play");
  const lead = V(ps[0]).turn, lv = V(ps[lead]);
  const off = lv.legal.filter((c) => c[1] !== "S");
  const exp = (off.length ? off : lv.legal).slice().sort((a, b) => R(a) - R(b) || "SHCD".indexOf(a[1]) - "SHCD".indexOf(b[1]))[0];
  const t1 = Date.now();
  await until(() => V(ps[0]).trick.length === 1, 25000);
  check("play timeout plays lowest legal card ~20s", V(ps[0]).trick[0].c === exp && V(ps[0]).trick[0].seat === lead && Math.abs(Date.now() - t1 - 20000) < 2500, V(ps[0]).trick[0].c + " vs " + exp);
  // second consecutive timeout for the same seat gets shorter (afk): let the trick go round then wait for that seat again
  check("auto card left the hand", !V(ps[lead]).myHand.includes(exp) && V(ps[lead]).myHand.length === 12);
  [...Object.values(ps), tv].forEach((p) => p.disconnect());
}
(async () => {
  await Promise.all([full(), process.argv[2] === "fast" ? null : timeouts()]);
  console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
  process.exit(T.fails ? 1 : 0);
})();
