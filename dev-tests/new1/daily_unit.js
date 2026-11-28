// daily.js without sockets: every kind on a date that picks it, fake clock
const S = "C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/";
const D = require(S + "games/daily.js");
const DT = require(S + "games/digittarget.js");
const { bfs } = require(S + "ladder.js");
const T = { fails: 0 };
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) T.fails++; };
let now = 1e12;
const timers = [];
const ctx = { now: () => now, rng: Math.random, later: (ms, fn) => timers.push({ at: now + ms, fn }) };
const tick = (ms) => { now += ms; timers.sort((a, b) => a.at - b.at); while (timers.length && timers[0].at <= now) timers.shift().fn(now); };
function tokensFor(e, digits) {
  const used = new Set(), out = [];
  for (const m of e.match(/\d+|[×÷−+()]/g)) {
    if (/\d/.test(m)) for (const ch of m) { const i = digits.findIndex((d, k) => String(d) === ch && !used.has(k)); used.add(i); out.push("d" + i); }
    else out.push({ "×": "*", "÷": "/", "−": "-" }[m] || m);
  }
  return out;
}
// solve a 4x4 slide puzzle: undo the shuffle is unknown, so use IDA*-free trick: BFS not feasible; use a greedy-free approach — replay the scramble with the same rng
const Sl = require(S + "slide.js");
function solveSlide(tiles, size) {
  // simple IDA* with manhattan, fine for ~50-move walk shuffles
  const goal = Sl.solvedBoard(size);
  let b = tiles.slice(), path = [], bound = Sl.distance(b, size);
  const search = (g, gap, prev) => {
    const h = Sl.distance(b, size); const f = g + h;
    if (f > bound) return f; if (h === 0) return true;
    let min = Infinity;
    for (const c of [gap - 1, gap + 1, gap - size, gap + size]) {
      if (c < 0 || c >= b.length || c === prev || !Sl.adjacent(c, gap, size)) continue;
      const t = b[c]; b[gap] = t; b[c] = 0; path.push(t);
      const r = search(g + 1, c, gap); if (r === true) return true; if (r < min) min = r;
      path.pop(); b[c] = t; b[gap] = 0;
    }
    return min;
  };
  for (;;) { const r = search(0, b.indexOf(0), -1); if (r === true) return path; bound = r; }
}
const dates = []; for (let d = 20; d <= 30; d++) dates.push("2026-11-" + d);
const byKind = {};
for (const d of dates) { const k = D.puzzleFor(d).kind; if (!byKind[k]) byKind[k] = d; }
check("all five kinds rotate", Object.keys(byKind).length === 5, JSON.stringify(byKind));
check("same date, same puzzle", JSON.stringify(D.puzzleFor("2026-11-27")) === JSON.stringify(D.puzzleFor("2026-11-27")));
check("NY date", D.dateOf(Date.UTC(2026, 10, 28, 3, 0)) === "2026-11-27" && D.dateOf(Date.UTC(2026, 10, 28, 6, 0)) === "2026-11-28");
for (const [kind, date] of Object.entries(byKind)) {
  const st = D.init({ ctx, players: 3, date });
  const mv = (s, p) => D.move(st, s, p, { ...ctx, host: s === 0 });
  mv(0, { act: "hi", name: "Ann" }); mv(1, { act: "hi", name: "Bo", practice: true }); mv(2, { act: "hi", name: "  " });
  check(kind + ": not before start", /Not yet/.test(mv(0, { act: "out" }).error || ""));
  check(kind + ": ready view hides puzzle", D.view(st, 0).puzzle === null);
  tick(3000);
  const z = st.puzzle;
  const blob = (s) => JSON.stringify(D.view(st, s)) + JSON.stringify(D.tv(st));
  if (kind === "target") {
    check(kind + ": no 'how' leak", !blob(0).includes(z.how) && !blob(0).includes('"how"'));
    const tk = tokensFor(DT.solve(z.digits)[z.target].e, z.digits);
    check(kind + ": junk refused", !!mv(0, { tokens: ["d0", "d0"] }).error && !!mv(0, { tokens: "x" }).error);
    mv(1, { tokens: ["d0"] }); check(kind + ": near miss, value hidden", D.view(st, 1).me.best === null && !blob(1).includes('"gap"'));
    tick(10000); check(kind + ": exact finishes", mv(0, { tokens: tk }).ok && D.view(st, 0).me.done && D.view(st, 0).me.score === 60 + Math.round(40 * (1 - 10000 / 120000)), D.view(st, 0).me.score);
    check(kind + ": how shown after", D.view(st, 0).me.how === z.how && !JSON.stringify(D.view(st, 2)).includes('"how"'));
    mv(1, { act: "done" });
  } else if (kind === "ladder") {
    const v = D.view(st, 2);
    check(kind + ": start/target/best only", v.puzzle.start === z.start && v.puzzle.best === z.path.length - 1 && !JSON.stringify(v).includes('"path"') && !blob(2).includes(JSON.stringify(z.path.slice(1, -1))));
    check(kind + ": shortest verified", bfs(z.start, (x) => x.length === z.start.length && require(S + "words.js").VALID.has(x), 9).dist[z.target] === z.path.length - 1);
    const L = z.start.length;
    check(kind + ": two letters refused", /exactly one/.test(mv(0, { w: z.path[2] }).error || ""));
    check(kind + ": non-word refused", /word we know/.test(mv(0, { w: "q" + z.start.slice(1) }).error || "") || /one letter/.test(mv(0, { w: "q" + z.start.slice(1) }).error || ""));
    check(kind + ": length refused", /letters/.test(mv(0, { w: z.start + "x" }).error || ""));
    tick(20000);
    for (const w of z.path.slice(1)) check(kind + ": step " + w, mv(0, { w }).ok);
    const me = D.view(st, 0).me;
    check(kind + ": done, score, path after", me.done && me.score === 50 + 25 + Math.round(25 * (1 - 20000 / 180000)) && JSON.stringify(me.path) === JSON.stringify(z.path), me.score);
    mv(1, { w: z.path[1] }); mv(1, { act: "undo" }); check(kind + ": undo", D.view(st, 1).me.chain.length === 1);
    mv(1, { act: "out" });
  } else if (kind === "slide") {
    check(kind + ": bad moves", /add up/.test(mv(0, { moves: [99] }).error || "") && /Not solved/.test(mv(0, { moves: [] }).error || ""));
    const sol = solveSlide(z.tiles, z.size);
    tick(60000);
    check(kind + ": solve " + sol.length + " moves", mv(0, { moves: sol }).ok && D.view(st, 0).me.done && D.view(st, 0).me.score > 80, D.view(st, 0).me.score);
    mv(1, { act: "out" });
  } else if (kind === "mine") {
    check(kind + ": no word leak", !blob(0).includes('"' + z.word + '"') && D.view(st, 0).puzzle.letters.length === z.word.length);
    const w = z.all.find((x) => x.length === 4);
    check(kind + ": word ok", mv(0, { w }).ok && /Already/.test(mv(0, { w }).error) && /letters/.test(mv(0, { w: "zzzz" }).error));
    mv(1, { act: "stop" });
    tick(80000);
    check(kind + ": time-up finishes all", st.phase === "done" && D.view(st, 0).me.score === 2 && D.view(st, 0).me.word === z.word);
  } else if (kind === "nextup") {
    const v = D.view(st, 0);
    check(kind + ": no answer leak", !JSON.stringify(v).includes('"answer"') && !JSON.stringify(v).includes('"rule"') && v.me.q && v.me.past.length === 0);
    check(kind + ": bad pick", !!mv(0, { q: 1, choice: 0 }).error && !!mv(0, { q: 0, choice: 7 }).error);
    tick(2000);
    for (let q = 0; q < 5; q++) check(kind + " q" + q, mv(0, { q, choice: z.qs[q].answer }).ok);
    const me = D.view(st, 0).me;
    check(kind + ": all right, fast", me.done && me.score === 5 * 10 + Math.round(10 * (1 - 2000 / 15000)) + 40, me.score);
    for (let q = 0; q < 5; q++) mv(1, { q, choice: (z.qs[q].answer + 1) % 4 });
    check(kind + ": wrong answers 0", D.view(st, 1).me.score === 0 && D.view(st, 1).me.past[0].rule);
  }
  if (st.phase !== "done") { tick(400000); }
  const r = D.result(st);
  check(kind + ": result", r && r.places.length === 3 && st.phase === "done", JSON.stringify(r));
  const b = D.view(st, 0).me.board;
  check(kind + ": board has Ann, not practice Bo", b.top.some((x) => x.name === "Ann") && !b.top.some((x) => x.name === "Bo") && b.top.some((x) => x.name === "Player"), JSON.stringify(b.top.map((x) => x.name)));
  check(kind + ": tv board at end, no secrets", D.tv(st).board && !JSON.stringify(D.tv(st)).includes('"path"') && !JSON.stringify(D.tv(st)).includes('"how"'));
  timers.length = 0;
}
console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
