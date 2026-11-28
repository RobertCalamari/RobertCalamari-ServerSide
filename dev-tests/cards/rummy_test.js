const { wait, T, check, until, room, mv, V, TV, cardsIn, bySeat } = require("./common");
const RM = require("../../games/duels/games/rummy500.js");
const rank = (c) => "23456789TJQKA".indexOf(c[0]) + 2;
const pubCards = (v) => new Set(v.discard.concat(v.melds.flatMap((m) => m.cards.map((x) => x.c)), (v.log && v.log.cards) || [], v.must ? [v.must] : []));
async function start(n) {
  const { ps: socks, tv } = await room(n);
  socks[0].emit("duel:start", { game: "rummy500" });
  await until(() => socks.every((p) => p.last.match && p.last.match.game === "rummy500") && tv.last.match);
  return { ps: bySeat(socks), tv };
}
function meldsIn(hand) {
  const out = [], by = {};
  hand.forEach((c) => (by[c[0]] = (by[c[0]] || []).concat(c)));
  Object.values(by).forEach((l) => l.length >= 3 && out.push(l.slice(0, 4)));
  const used = new Set(out.flat());
  for (const s of "SHDC") {
    const cs = hand.filter((c) => c[1] === s && !used.has(c)).sort((a, b) => rank(a) - rank(b));
    let run = [];
    for (const c of cs) { if (run.length && rank(c) === rank(run[run.length - 1]) + 1) run.push(c); else { if (run.length >= 3) out.push(run); run = [c]; } }
    if (run.length >= 3) out.push(run);
  }
  return out;
}
async function game(n) {
  const { ps, tv } = await start(n);
  let v = V(ps[0]);
  const size = n === 2 ? 13 : 7;
  check(n + "p: dealt " + size + " each, 1 discard", v.counts.every((c) => c === size) && v.discard.length === 1 && v.stock === 52 - n * size - 1 && v.phase === "draw");
  const st = { leaks: 0, tvLeaks: 0, wrongTurn: 0, badMeldOk: 0, badMeld: 0, badTake: 0, badTakeOk: 0, mustDisc: 0, mustDiscOk: 0, undo: 0, takes: 0, hands: 0, scoreBad: 0, scoreChecks: 0 };
  let lastHand = 0;
  while (!ps[0].last.match.result) {
    await wait(10);
    for (let s = 0; s < n; s++) { const vs = V(ps[s]); const pub = pubCards(vs), mine = new Set(vs.myHand); if (cardsIn(vs).some((c) => !mine.has(c) && !pub.has(c))) st.leaks++; }
    const tvv = TV(tv); if (tvv && cardsIn(tvv).some((c) => !pubCards(tvv).has(c))) st.tvLeaks++;
    v = V(ps[0]);
    if (ps[0].last.match.result) break;
    if (v.phase === "score" && v.hand !== lastHand) {
      lastHand = v.hand; st.hands++;
      for (let s = 0; s < n; s++) {
        const vs = V(ps[s]);
        const melded = vs.melds.reduce((a, m) => a + RM.meldPoints(m)(s), 0), left = vs.myHand.reduce((a, c) => a + RM.value(c), 0);
        st.scoreChecks++;
        if (vs.summary.rows[s].melded !== melded || vs.summary.rows[s].left !== left || vs.summary.rows[s].pts !== melded - left) { st.scoreBad++; console.log("score", s, JSON.stringify(vs.summary.rows[s]), melded, left); }
      }
      continue;
    }
    if (v.phase !== "draw" && v.phase !== "meld") continue;
    const s = v.turn, p = ps[s], vs = V(p);
    if (vs.turn !== s) continue;
    if (Math.random() < 0.05) { const r = await mv(ps[(s + 1) % n], { act: "draw" }); if (r.ok) st.wrongTurn++; }
    const hand = vs.myHand;
    if (vs.phase === "draw") {
      // a take that can't be melded must be refused
      const badI = vs.discard.findIndex((c, i) => !RM.findMeld(c, hand.concat(vs.discard.slice(i)), vs.melds));
      if (badI >= 0 && Math.random() < 0.3) { const r = await mv(p, { act: "take", index: badI }); if (r.ok) st.badTakeOk++; else st.badTake++; continue; }
      const goodI = vs.discard.findIndex((c, i) => RM.findMeld(c, hand.concat(vs.discard.slice(i)), vs.melds));
      if (goodI >= 0 && Math.random() < 0.5) {
        const r = await mv(p, { act: "take", index: goodI });
        if (r.ok) {
          st.takes++;
          await wait(30);
          // first try to discard without melding it (refused), sometimes undo
          const v2 = V(p);
          const other = v2.myHand.find((c) => c !== v2.must);
          const d = await mv(p, { act: "discard", card: other }); if (d.ok) st.mustDiscOk++; else st.mustDisc++;
          if (Math.random() < 0.2) { const u = await mv(p, { act: "undo" }); if (u.ok) st.undo++; }
        }
        continue;
      }
      await mv(p, { act: "draw" });
      continue;
    }
    if (vs.must) {
      const f = RM.findMeld(vs.must, hand, vs.melds);
      if (f.layoff !== undefined) await mv(p, { act: "layoff", meld: f.layoff, cards: [vs.must] }); else await mv(p, { act: "meld", cards: f.cards });
      continue;
    }
    // invalid meld attempt now and then
    if (Math.random() < 0.15 && hand.length >= 3) {
      const tri = hand.slice(0, 3);
      if (!RM.typeOf(tri)) { const r = await mv(p, { act: "meld", cards: tri }); if (r.ok) st.badMeldOk++; else st.badMeld++; }
      const r2 = await mv(p, { act: "meld", cards: hand.slice(0, 2) }); if (r2.ok) st.badMeldOk++;
    }
    const ms = meldsIn(hand);
    if (ms.length) { await mv(p, { act: "meld", cards: ms[0] }); continue; }
    let laid = false;
    for (const c of hand) { const m = vs.melds.find((m) => RM.typeOf(m.cards.map((x) => x.c).concat(c)) === m.type); if (m) { await mv(p, { act: "layoff", meld: m.id, cards: [c] }); laid = true; break; } }
    if (laid) continue;
    const c = hand.slice().sort((a, b) => RM.value(b) - RM.value(a))[0];
    await mv(p, { act: "discard", card: c });
  }
  const res = ps[0].last.match.result;
  v = V(ps[0]);
  console.log("  " + n + "p:", res.text, JSON.stringify(v.scores), JSON.stringify(st));
  check(n + "p: someone reached 300", Math.max(...v.scores) >= 300 && res.places[v.scores.indexOf(Math.max(...v.scores))] === 1);
  check(n + "p: no hand leaks", st.leaks === 0 && st.tvLeaks === 0 && !("myHand" in TV(tv)));
  check(n + "p: wrong turn refused", st.wrongTurn === 0);
  check(n + "p: invalid melds refused", st.badMeldOk === 0);
  check(n + "p: unmeldable discard take refused", st.badTakeOk === 0 && st.badTake > 0, st.badTake);
  check(n + "p: discard before melding the taken card refused", st.mustDiscOk === 0 && st.mustDisc > 0, st.mustDisc);
  check(n + "p: hand scores add up", st.scoreChecks > 0 && st.scoreBad === 0);
  [...Object.values(ps), tv].forEach((p) => p.disconnect());
}
async function timeout() {
  const { ps, tv } = await start(2);
  const v = V(ps[0]), t = v.turn, t0 = Date.now(), d0 = v.discard.length;
  await until(() => V(ps[0]).turn !== t, 70000);
  const v2 = V(ps[0]);
  check("turn timeout (60s): auto draw + discard", Math.abs(Date.now() - t0 - 60000) < 2500 && v2.discard.length === d0 + 1 && v2.counts[t] === 13 && v2.log.act === "discard" && v2.log.auto, (Date.now() - t0) + "ms");
  [...Object.values(ps), tv].forEach((p) => p.disconnect());
}
(async () => {
  await Promise.all([game(2), game(4), game(3), process.argv[2] === "fast" ? null : timeout()]);
  console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
  process.exit(T.fails ? 1 : 0);
})();
