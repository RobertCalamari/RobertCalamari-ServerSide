// Offline sims with a virtual clock: whole games with bots, plus hand-built scoring cases.
const G = "../../games/duels/";
const { mulberry32 } = { mulberry32: (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } };
const spit = require(G + "games/spit.js"), spades = require(G + "games/spades.js"), rummy = require(G + "games/rummy500.js");
const { rank, suit } = require(G + "deck.js");
let fails = 0;
const check = (l, ok, x = "") => { if (!ok) { fails++; console.log("FAIL " + l + " " + x); } else console.log("PASS " + l); };

function world(seed) {
  const w = { t: 1e6, q: [], rng: mulberry32(seed) };
  w.ctx = { rng: w.rng, now: () => w.t, later: (ms, fn) => w.q.push({ at: w.t + ms, fn }) };
  w.step = (ms) => { // advance up to ms, running due timers
    const end = w.t + ms;
    for (;;) {
      w.q.sort((a, b) => a.at - b.at);
      if (!w.q.length || w.q[0].at > end) break;
      const e = w.q.shift(); w.t = e.at; e.fn(w.t);
    }
    w.t = end;
  };
  return w;
}
const count52 = (cards) => cards.length === 52 && new Set(cards).size === 52;

// ---------- Spit ----------
function simSpit(seed) {
  const w = world(seed);
  const s = spit.init({ seed, rng: w.rng, ctx: w.ctx, players: 2 });
  let moves = 0, steps = 0, bad = 0;
  while (!spit.result(s) && steps < 100000) {
    steps++;
    w.step(150);
    for (const seat of [0, 1]) {
      const v = spit.view(s, seat);
      if (v.phase === "slap" && w.rng() < 0.3) { spit.move(s, seat, { act: "slap", pile: w.rng() < 0.5 ? 0 : 1 }, w.ctx); continue; }
      if (v.phase !== "play") continue;
      if (w.rng() < 0.4) continue;
      let done = false;
      v.layout[seat].forEach((p, i) => {
        if (done || !p.top) return;
        v.centre.forEach((c, k) => {
          if (done || !c.top || !spit.fits(p.top, c.top)) return;
          const r = spit.move(s, seat, { act: "play", from: i, to: k, card: p.top }, w.ctx);
          if (r.error) bad++; else { moves++; done = true; }
        });
      });
      if (!done) {
        const empty = v.layout[seat].findIndex((p) => !p.n), deep = v.layout[seat].findIndex((p) => p.n >= 2);
        if (empty >= 0 && deep >= 0) { spit.move(s, seat, { act: "move", from: deep, to: empty }, w.ctx); done = true; }
      }
      if (!done && v.stuck && !v.votes[seat]) spit.move(s, seat, { act: "spit" }, w.ctx);
    }
    // conservation of cards
    const all = s.layout.flat(2).concat(s.spit.flat(), s.centre.flat());
    if (!count52(all)) { check("spit cards conserved", false, all.length); break; }
  }
  const r = spit.result(s);
  return { r, moves, bad, rounds: s.round, time: (w.t - 1e6) / 1000 };
}

// ---------- Spades ----------
function simSpades(seed, rand) {
  const w = world(seed);
  const s = spades.init({ seed, rng: w.rng, ctx: w.ctx, players: 4 });
  let steps = 0, illegal = 0;
  while (!spades.result(s) && steps < 200000) {
    steps++;
    if (s.turn !== null && (s.phase === "bid" || s.phase === "play") && !(rand && w.rng() < 0.02)) {
      const seat = s.turn, v = spades.view(s, seat);
      if (s.phase === "bid") spades.move(s, seat, { act: "bid", n: w.rng() < 0.1 ? 0 : 1 + Math.floor(w.rng() * 4) }, w.ctx);
      else {
        // try an illegal card sometimes
        const ill = v.myHand.find((c) => !v.legal.includes(c));
        if (ill && w.rng() < 0.2) { if (!spades.move(s, seat, { act: "play", c: ill }, w.ctx).error) illegal++; }
        const c = v.legal[Math.floor(w.rng() * v.legal.length)];
        const r = spades.move(s, seat, { act: "play", c }, w.ctx);
        if (r.error) { illegal++; console.log(r.error); }
      }
      // conservation
      if (s.phase !== "score" && s.phase !== "over") {
        const all = s.hands.flat().concat(s.trick.map((t) => t.c));
        if (all.length + (13 * 4 - all.length) !== 52 || new Set(all).size !== all.length) illegal++;
      }
    } else w.step(rand ? 25000 : 500);
  }
  return { r: spades.result(s), s, illegal };
}

// ---------- Rummy ----------
function bestMelds(hand) {
  // greedy: all sets, then runs
  const out = [];
  const byRank = {};
  hand.forEach((c) => (byRank[c[0]] = (byRank[c[0]] || []).concat(c)));
  Object.values(byRank).forEach((l) => { if (l.length >= 3) out.push(l); });
  const used = new Set(out.flat());
  for (const st of "SHDC") {
    const cs = hand.filter((c) => suit(c) === st && !used.has(c)).sort((a, b) => rank(a) - rank(b));
    let run = [];
    for (const c of cs) {
      if (run.length && rank(c) === rank(run[run.length - 1]) + 1) run.push(c);
      else { if (run.length >= 3) out.push(run); run = [c]; }
    }
    if (run.length >= 3) out.push(run);
  }
  return out;
}
function simRummy(seed, n, takeRate = 0.3) {
  const w = world(seed);
  const s = rummy.init({ seed, rng: w.rng, ctx: w.ctx, players: n });
  let steps = 0, errs = 0, takes = 0;
  while (!rummy.result(s) && steps < 100000) {
    steps++;
    if (s.phase === "draw" || s.phase === "meld") {
      const seat = s.turn, v = rummy.view(s, seat);
      if (s.phase === "draw") {
        // dig: try to take something from the discard pile that can be melded
        let took = false;
        if (w.rng() < takeRate) for (let i = v.discard.length - 1; i >= 0 && !took; i--) {
          const r = rummy.move(s, seat, { act: "take", index: i }, w.ctx);
          if (!r.error) { took = true; takes++; }
        }
        if (!took) rummy.move(s, seat, { act: "draw" }, w.ctx);
        continue;
      }
      if (s.must) {
        const f = rummy.findMeld(s.must, s.hands[seat], s.melds);
        const r = f.layoff !== undefined ? rummy.move(s, seat, { act: "layoff", meld: f.layoff, cards: [s.must] }, w.ctx) : rummy.move(s, seat, { act: "meld", cards: f.cards }, w.ctx);
        if (r.error) { errs++; console.log("must", r.error); }
        continue;
      }
      const ms = bestMelds(s.hands[seat]);
      if (ms.length) { const r = rummy.move(s, seat, { act: "meld", cards: ms[0] }, w.ctx); if (r.error) { errs++; console.log("meld", r.error, ms[0]); } continue; }
      let laid = false;
      for (const c of s.hands[seat]) {
        for (const m of s.melds) if (!laid && rummy.typeOf(m.cards.map((x) => x.c).concat(c)) === m.type) { rummy.move(s, seat, { act: "layoff", meld: m.id, cards: [c] }, w.ctx); laid = true; }
        if (laid) break;
      }
      if (laid) continue;
      const c = s.hands[seat].slice().sort((a, b) => rummy.value(b) - rummy.value(a))[0];
      const r = rummy.move(s, seat, { act: "discard", card: c }, w.ctx);
      if (r.error) { errs++; console.log("disc", r.error); }
      const all = s.hands.flat().concat(s.stock, s.discard, s.melds.flatMap((m) => m.cards.map((x) => x.c)));
      if (s.phase !== "over" && s.phase !== "score" && !count52(all)) { errs++; console.log("cards", all.length); }
    } else w.step(1000);
  }
  return { r: rummy.result(s), s, errs, takes };
}

// ---- runs
for (let i = 1; i <= 30; i++) {
  const o = simSpit(i);
  if (i <= 3 || !o.r) console.log("spit", i, JSON.stringify(o.r), "moves", o.moves, "bad", o.bad, "rounds", o.rounds, "t", o.time);
  if (!o.r || o.bad) check("spit sim " + i, false);
}
check("spit sims finish", true);
for (let i = 1; i <= 15; i++) {
  const o = simSpades(i, i > 12);
  if (i <= 2 || i > 12) console.log("spades", i, JSON.stringify(o.r), "hands", o.s.hand, o.s.scores, "bags", o.s.bags);
  if (!o.r || o.illegal) check("spades sim " + i, false, o.illegal);
  if (o.r && Math.max(...o.s.scores) < 250 && Math.min(...o.s.scores) > -200) check("spades end score", false, o.s.scores);
}
check("spades sims finish", true);
for (const n of [2, 3, 4]) for (let i = 1; i <= 10; i++) {
  const o = simRummy(i * 7 + n, n);
  if (i <= 2) console.log("rummy", n, i, JSON.stringify(o.r), "hands", o.s.hand, o.s.scores, "takes", o.takes);
  if (!o.r || o.errs) check("rummy sim " + n + "/" + i, false, o.errs);
}
check("rummy sims finish", true);

// ---- spades scoring cases
{
  const sc = (bids, tricks, bags = [0, 0], scores = [0, 0]) => spades.applyScore(scores, bags, bids, tricks);
  let r = sc([3, 4, 2, 3], [4, 3, 2, 4]);
  check("spades made 5, took 6: 51", r[0].pts === 51 && r[0].bags === 1, JSON.stringify(r[0]));
  check("spades set 7, took 7: 70", r[1].pts === 70 && r[1].bags === 0, JSON.stringify(r[1]));
  r = sc([3, 4, 2, 3], [2, 5, 2, 4]);
  check("spades team 0 set (4/5): -50", r[0].pts === -50, JSON.stringify(r[0]));
  r = sc([0, 4, 5, 3], [0, 4, 6, 3]);
  check("spades nil made +100, partner 5 took 6: 151", r[0].pts === 151, JSON.stringify(r[0]));
  r = sc([0, 4, 5, 3], [2, 4, 4, 3]);
  check("spades nil failed -100, partner short -50, nil tricks are bags", r[0].pts === -150 && r[0].bags === 2, JSON.stringify(r[0]));
  r = sc([3, 4, 2, 3], [5, 3, 3, 2], [8, 0]);
  check("spades 10 bags: -100", r[0].pts === 53 - 100 && r[0].bagsTotal === 1, JSON.stringify(r[0]));
  r = sc([0, 6, 0, 7], [1, 6, 0, 6]);
  check("spades double nil (one fails): 0", r[0].pts === 0 && r[0].bags === 1, JSON.stringify(r[0]));
  check("spades trick winner trump", spades.winnerOf([{ seat: 0, c: "AH" }, { seat: 1, c: "2S" }, { seat: 2, c: "KH" }, { seat: 3, c: "3S" }]) === 3);
  check("spades trick winner off-suit ignored", spades.winnerOf([{ seat: 0, c: "5H" }, { seat: 1, c: "AD" }, { seat: 2, c: "9H" }, { seat: 3, c: "2C" }]) === 2);
}
// ---- rummy cases
{
  const t = rummy.typeOf;
  check("rummy set", t(["7H", "7S", "7D"]) === "set" && t(["7H", "7S", "7D", "7C"]) === "set");
  check("rummy run low/high", t(["AH", "2H", "3H"]) === "run" && t(["QH", "KH", "AH"]) === "run" && t(["3H", "5H", "4H", "6H"]) === "run");
  check("rummy invalid", !t(["KH", "AH", "2H"]) && !t(["7H", "7S"]) && !t(["3H", "4H", "5S"]) && !t(["3H", "4H", "6H"]));
  const mp = (cards, type) => rummy.meldPoints({ type, cards: cards.map((c) => ({ c, by: 0 })) })(0);
  check("rummy points A low run = 1+2+3", mp(["AH", "2H", "3H"], "run") === 6);
  check("rummy points A high run = 10+10+15", mp(["QH", "KH", "AH"], "run") === 35);
  check("rummy points aces set = 45", mp(["AH", "AS", "AD"], "set") === 45);
  check("rummy findMeld run middle", JSON.stringify(rummy.findMeld("5H", ["4H", "6H", "9C"], [])) !== "null");
  check("rummy findMeld none", rummy.findMeld("5H", ["4S", "6H", "9C"], []) === null);
  check("rummy findMeld layoff", rummy.findMeld("8H", [], [{ id: 3, type: "run", cards: [{ c: "5H" }, { c: "6H" }, { c: "7H" }] }]).layoff === 3);
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
