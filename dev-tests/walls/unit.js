// Hedge Run rules, straight against the module with a fake clock.
const assert = require("assert");
const H = require("../../games/duels/games/hedgerun.js");
function mkctx() { const c = { t: 1000, timers: [] }; c.now = () => c.t; c.later = (ms, fn) => c.timers.push({ at: c.t + ms, fn }); c.advance = (ms) => { c.t += ms; let due; while ((due = c.timers.filter((x) => x.at <= c.t)).length) { c.timers = c.timers.filter((x) => x.at > c.t); due.forEach((x) => x.fn(c.t)); } }; return c; }
let pass = 0;
const ok = (cond, label) => { assert.ok(cond, label); pass++; };
function game(first = 0, options) {
  const ctx = mkctx();
  const st = H.init({ rng: () => (first ? 0.9 : 0.1), ctx, options });
  return { ctx, st };
}
const mv = (st, ctx, seat, p) => H.move(st, seat, p, ctx);
const set = (a) => JSON.stringify(a.map((m) => m.join()).sort());

let { ctx, st } = game(0);
ok(st.turn === 0 && st.pos[0].join() === "8,4" && st.pos[1].join() === "0,4", "start");
ok(set(H.view(st, 0).moves) === set([[7, 4], [8, 3], [8, 5]]), "opening moves");
ok(H.view(st, 1).moves.length === 0 && !H.view(st, 1).myTurn, "not your turn view");
ok(mv(st, ctx, 1, { act: "move", r: 1, c: 4 }).error === "It's not your turn.", "wrong turn");
ok(mv(st, ctx, 0, { act: "move", r: 6, c: 4 }).error, "two squares refused");
ok(mv(st, ctx, 0, { act: "move", r: 9, c: 4 }).error, "off board refused");
ok(mv(st, ctx, 0, { act: "move", r: "7", c: 4 }).error, "string coords refused");
ok(mv(st, ctx, 0, { act: "move", r: 7, c: 3 }).error, "diagonal refused");
ok(mv(st, ctx, 0, null).error && mv(st, ctx, 0, { act: "fly" }).error, "junk refused");
ok(mv(st, ctx, 0, { act: "wall", o: "x", r: 0, c: 0 }).error, "bad orientation");
ok(mv(st, ctx, 0, { act: "wall", o: "h", r: 8, c: 0 }).error === "That's off the lawn.", "wall off board");
ok(mv(st, ctx, 0, { act: "wall", o: "h", r: -1, c: 0 }).error && mv(st, ctx, 0, { act: "wall", o: "h", r: 1.5, c: 0 }).error, "wall bad coords");
// hedge in front of seat 0: h at (7,3) covers cols 3,4 between rows 7 and 8
ok(mv(st, ctx, 0, { act: "wall", o: "h", r: 7, c: 3 }).ok, "wall placed");
ok(st.left[0] === 9 && st.turn === 1, "hedge spent, turn passes");
ok(mv(st, ctx, 1, { act: "wall", o: "h", r: 7, c: 3 }).error === "There's already a hedge there.", "same wall");
ok(mv(st, ctx, 1, { act: "wall", o: "h", r: 7, c: 4 }).error === "That overlaps a hedge.", "overlap right");
ok(mv(st, ctx, 1, { act: "wall", o: "h", r: 7, c: 2 }).error === "That overlaps a hedge.", "overlap left");
ok(mv(st, ctx, 1, { act: "wall", o: "v", r: 7, c: 3 }).error === "That crosses a hedge.", "cross");
ok(mv(st, ctx, 1, { act: "wall", o: "h", r: 7, c: 5 }).ok, "adjacent end-to-end ok");
// seat 0 at (8,4): up blocked by h(7,3) (covers col 4)
ok(mv(st, ctx, 0, { act: "move", r: 7, c: 4 }).error === "You can't move there.", "through hedge refused");
ok(set(H.view(st, 0).moves) === set([[8, 3], [8, 5]]), "moves around hedge");
ok(mv(st, ctx, 0, { act: "wall", o: "v", r: 7, c: 4 }).ok, "v wall touching ok (not crossing)");
// now (8,4) can't go up or right; h(7,5) covers 5,6 so (8,5) also blocked up. Path: left to (8,3)? h(7,3) covers 3,4. (8,2) up ok.
ok(H.view(st, 1).dist[0] === 10, "dist around hedges: " + H.view(st, 1).dist[0]);
// trap: v at (7,2) between cols 2/3 rows 7-8 would leave seat 0 boxed in (8,3)-(8,4)
ok(mv(st, ctx, 1, { act: "wall", o: "v", r: 7, c: 2 }).error === "That would hedge someone in.", "path block refused");
ok(st.left[1] === 9 && st.walls.length === 3, "refused wall not spent");

// out of hedges
({ ctx, st } = game(0));
const spots = [[0, 0], [0, 2], [0, 4], [0, 6], [2, 0], [2, 2], [2, 4], [2, 6], [4, 0], [4, 2]];
for (let i = 0; i < 10; i++) {
  ok(mv(st, ctx, 0, { act: "wall", o: "v", r: spots[i][0], c: spots[i][1] }).ok, "hedge " + i);
  const m = H.view(st, 1).moves[0];
  ok(mv(st, ctx, 1, { act: "move", r: m[0], c: m[1] }).ok, "p1 shuffle");
}
ok(st.left[0] === 0 && mv(st, ctx, 0, { act: "wall", o: "h", r: 5, c: 5 }).error === "You're out of hedges.", "out of hedges");

// jumps: face to face in open field
({ ctx, st } = game(0));
st.pos = [[5, 4], [4, 4]];
ok(set(H.view(st, 0).moves) === set([[3, 4], [6, 4], [5, 3], [5, 5]]), "straight jump");
ok(mv(st, ctx, 0, { act: "move", r: 4, c: 4 }).error, "can't land on them");
// hedge behind them: diagonal hops
st.walls.push({ o: "h", r: 3, c: 3, seat: 1 });
ok(set(H.view(st, 0).moves) === set([[4, 3], [4, 5], [6, 4], [5, 3], [5, 5]]), "diagonal when hedge behind");
// plus hedge on their left side: only right diagonal
st.walls.push({ o: "v", r: 3, c: 3, seat: 1 });
ok(mv(st, ctx, 0, { act: "move", r: 4, c: 3 }).error, "diagonal blocked by side hedge");
ok(mv(st, ctx, 0, { act: "move", r: 4, c: 5 }).ok && st.pos[0].join() === "4,5", "diagonal jump made");
// edge behind them
({ ctx, st } = game(0));
st.pos = [[1, 0], [0, 0]];
ok(set(H.view(st, 0).moves) === set([[0, 1], [2, 0], [1, 1]]), "diagonal when edge behind");
// sideways jump
st.pos = [[4, 4], [4, 5]];
ok(set(H.view(st, 0).moves) === set([[3, 4], [5, 4], [4, 3], [4, 6]]), "sideways jump");
// jump onto goal row wins
({ ctx, st } = game(0));
st.pos = [[2, 4], [1, 4]];
ok(mv(st, ctx, 0, { act: "move", r: 0, c: 4 }).ok, "jump to goal");
ok(st.winner === 0 && H.result(st).winner === 0, "win by jump: " + H.result(st).text);
ok(mv(st, ctx, 1, { act: "move", r: 1, c: 3 }).error === "The game is over.", "no moves after win");

// timeout: auto step along the shortest path, timer resets, stale timers ignored
({ ctx, st } = game(0));
mv(st, ctx, 0, { act: "move", r: 7, c: 4 });
ok(st.turn === 1, "turn 1");
ctx.advance(44000);
ok(st.turn === 1, "still waiting");
ctx.advance(1100);
ok(st.turn === 0 && st.pos[1].join() === "1,4" && st.last.auto === true, "auto step down");
ok(st.turnEndsAt === ctx.t + 45000, "fresh timer");
// shortest path around a hedge
mv(st, ctx, 0, { act: "wall", o: "h", r: 1, c: 3 }); // blocks (1,4)->(2,4) and (1,3)->(2,3)
ctx.advance(45100);
ok(st.pos[1].join() === "1,5", "auto step goes around: " + st.pos[1]);
// many timeouts in a row finish the game
for (let i = 0; i < 40 && st.winner === null; i++) ctx.advance(45100);
ok(st.winner !== null && H.result(st), "timeouts alone end the game: " + JSON.stringify(H.result(st)));
// no timer option
({ ctx, st } = game(0, { timer: false }));
ok(st.turnEndsAt === null && H.view(st, 0).turnEndsAt === null, "untimed");
ctx.advance(200000);
ok(st.turn === 0 && st.turns === 0, "untimed never auto moves");

// resign
({ ctx, st } = game(1));
ok(st.turn === 1, "seat 1 can go first");
ok(mv(st, ctx, 0, { resign: true }).ok && H.result(st).winner === 1, "resign");

// random bot games: every refused wall really is illegal, every game ends, path always open
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
let games = 0, walls = 0, refused = 0;
for (let g = 0; g < 200; g++) {
  const R = rng(g + 1);
  ({ ctx, st } = game(g % 2));
  let guard = 0;
  while (!H.result(st) && guard++ < 1000) {
    const s = st.turn;
    if (R() < 0.45 && st.left[s] > 0) {
      const p = { act: "wall", o: R() < 0.5 ? "h" : "v", r: Math.floor(R() * 8), c: Math.floor(R() * 8) };
      const res = mv(st, ctx, s, p);
      if (res.ok) walls++; else { refused++; continue; }
    } else {
      const d = H.distances(st.walls, s ? 8 : 0);
      const moves = H.view(st, s).moves;
      moves.sort((a, b) => d[a[0]][a[1]] - d[b[0]][b[1]]);
      const m = R() < 0.7 ? moves[0] : moves[Math.floor(R() * moves.length)];
      assert.ok(mv(st, ctx, s, { act: "move", r: m[0], c: m[1] }).ok);
    }
    for (let x = 0; x < 2; x++) assert.ok(H.view(st, 0).dist[x] < Infinity && H.view(st, 0).dist[x] !== null, "path open");
    assert.ok(st.pos[0].join() !== st.pos[1].join(), "never share a square");
  }
  assert.ok(H.result(st), "game " + g + " ended");
  games++;
}
ok(games === 200, "200 bot games finished (" + walls + " hedges planted, " + refused + " refused)");
ok(JSON.stringify(H.view(st, 0)).length < 4000, "view small");
console.log("HEDGE UNIT OK", pass, "checks");
