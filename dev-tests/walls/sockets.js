// Hedge Run + Knife Throw over sockets against the local server on 4013.
const { io } = require("socket.io-client");
const URL = "http://localhost:4013/duels";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
let fails = 0;
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) fails++; };
const open = async () => { const s = io(URL, { transports: ["websocket"], forceNew: true }); await new Promise((r) => s.on("connect", r)); s.last = null; s.on("room", (v) => (s.last = v.lite && s.last ? { ...s.last, ...v } : v)); return s; };
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(30); } return false; };
const mv = (p, d) => call(p, "duel:move", d);
const V = (p) => p.last && p.last.match && p.last.match.view;
const H = require("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/games/hedgerun.js");

async function room(group) {
  const a = await open(), b = await open();
  const c = await call(a, "duel:create", { name: "A", group });
  await call(b, "duel:join", { code: c.code, name: "B", group });
  let tv = null;
  if (group) { tv = await open(); await call(tv, "duel:tv", { code: c.code }); }
  await wait(200);
  return { ps: [a, b], tv };
}
// game seat of a socket: whoever the view says it is
const seatOf = (ps) => { const v0 = V(ps[0]); return v0.myTurn ? [v0.turn, 1 - v0.turn] : [1 - v0.turn, v0.turn]; };

async function hedgeGame(group, options, label, R) {
  const { ps, tv } = await room(group);
  ps[0].emit("duel:start", { game: "hedgerun", options });
  await until(() => ps.every((p) => V(p) && V(p).size === 9));
  const [s0, s1] = seatOf(ps);
  const by = []; by[s0] = ps[0]; by[s1] = ps[1];
  let v = V(by[0]);
  check(label + ": started, 10 hedges each, 8 to go", v.left.join() === "10,10" && v.dist.join() === "8,8" && v.pos[0].join() === "8,4");
  if (tv) check(label + ": tv has board, no moves", tv.last.match.tv && tv.last.match.tv.walls && !("moves" in tv.last.match.tv));
  const t = V(by[0]).turn, o = 1 - t;
  check(label + ": wrong turn refused", (await mv(by[o], { act: "move", r: o ? 1 : 7, c: 4 })).error === "It's not your turn.");
  check(label + ": off board refused", !!(await mv(by[t], { act: "move", r: t ? -1 : 9, c: 4 })).error);
  check(label + ": two squares refused", !!(await mv(by[t], { act: "move", r: t ? 2 : 6, c: 4 })).error);
  check(label + ": bad wall refused", !!(await mv(by[t], { act: "wall", o: "d", r: 0, c: 0 })).error && !!(await mv(by[t], { act: "wall", o: "h", r: 8, c: 8 })).error);
  // bots play it out
  let moves = 0, walls = 0, refused = 0, guard = 0;
  while (!ps[0].last.match.result && guard++ < 600) {
    await until(() => by.some((p) => V(p).myTurn) || ps[0].last.match.result, 3000);
    if (ps[0].last.match.result) break;
    const s = V(by[0]).myTurn ? 0 : 1;
    const vv = V(by[s]);
    let res;
    if (R() < 0.35 && vv.left[s] > 0) {
      res = await mv(by[s], { act: "wall", o: R() < 0.5 ? "h" : "v", r: Math.floor(R() * 8), c: Math.floor(R() * 8) });
      if (res.ok) walls++; else { refused++; continue; }
    } else {
      const d = H.distances(vv.walls, s ? 8 : 0);
      const m = vv.moves.slice().sort((a, b) => d[a[0]][a[1]] - d[b[0]][b[1]])[R() < 0.75 ? 0 : Math.floor(R() * vv.moves.length)];
      res = await mv(by[s], { act: "move", r: m[0], c: m[1] });
      if (!res.ok) { check(label + ": legal move accepted", false, JSON.stringify(res)); break; }
      moves++;
    }
    await until(() => V(by[s]).turn !== s || ps[0].last.match.result, 2000);
  }
  await until(() => ps.every((p) => p.last.match.result), 3000);
  const r = ps[0].last.match.result;
  v = V(by[0]);
  check(label + ": game finished with a winner on the goal row", r && r.winner !== null && v.pos[v.winner][0] === (v.winner ? 8 : 0), JSON.stringify(r) + " moves " + moves + " hedges " + walls + " refused " + refused);
  if (tv) check(label + ": tv saw the end", tv.last.match.result && tv.last.match.tv.winner === v.winner);
  for (const p of ps.concat(tv || [])) p.close();
}

async function timeoutGame() {
  const { ps } = await room(false);
  ps[0].emit("duel:start", { game: "hedgerun" });
  await until(() => ps.every((p) => V(p) && V(p).size === 9));
  const [s0, s1] = seatOf(ps);
  const by = []; by[s0] = ps[0]; by[s1] = ps[1];
  const t = V(by[0]).turn;
  const v = V(by[t]);
  check("timer: turnEndsAt ~45s out", Math.abs(v.turnEndsAt - Date.now() - 45000) < 1500);
  const t0 = Date.now();
  await until(() => V(by[t]).turn !== t, 50000);
  const after = V(by[t]);
  check("timer: auto step after 45s toward goal", after.last && after.last.auto && after.last.seat === t && after.dist[t] === 7 && Math.abs(Date.now() - t0 - 45000) < 2000, (Date.now() - t0) + "ms " + JSON.stringify(after.last));
  for (const p of ps) p.close();
}

async function untimed() {
  const { ps, tv } = await room(true);
  ps[0].emit("duel:start", { game: "hedgerun", options: { timer: false } });
  await until(() => ps.every((p) => V(p) && V(p).size === 9));
  check("untimed: no turnEndsAt", V(ps[0]).turnEndsAt === null);
  for (const p of ps.concat(tv)) p.close();
}

async function knife() {
  const { ps, tv } = await room(true);
  ps[0].emit("duel:start", { game: "knifethrow" });
  await until(() => ps.every((p) => V(p) && V(p).log));
  const v = V(ps[0]);
  await wait(v.logStartAt - Date.now() + 300);
  const st = Date.now();
  const r0 = await mv(ps[0], { throwAt: st, log: 0, n: 1 });
  const r1 = await mv(ps[1], { throwAt: st, log: 0, n: 1 });
  await wait(200);
  const ev = V(ps[0]).events;
  check("knife: simultaneous throws from opposite sides both stick", r0.ok && r1.ok && ev.length === 2 && ev.every((e) => e.ok), JSON.stringify(ev));
  const TAU = Math.PI * 2, d = Math.abs(((ev[0].a - ev[1].a) % TAU + TAU) % TAU - Math.PI);
  check("knife: 180 degrees apart", d < 0.01, d);
  check("knife: tv headline", /Log 1\/5/.test(tv.last.match.tv.headline), tv.last.match.tv.headline);
  for (const p of ps.concat(tv)) p.close();
}

function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
(async () => {
  await knife();
  await hedgeGame(false, undefined, "duel", rng(7));
  await hedgeGame(true, { timer: true }, "gamenight", rng(11));
  for (let i = 0; i < 4; i++) await hedgeGame(i % 2 === 0, undefined, "bots" + i, rng(100 + i));
  await untimed();
  await timeoutGame();
  console.log(fails ? fails + " FAILED" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
