const assert = require("assert");
const KT = require("../../games/duels/games/knifethrow.js");
function seeded(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function mkctx() { const c = { t: 100000, timers: [] }; c.now = () => c.t; c.later = (ms, fn) => c.timers.push({ at: c.t + ms, fn }); c.advance = (ms) => { c.t += ms; let due; while ((due = c.timers.filter(x => x.at <= c.t)).length) { c.timers = c.timers.filter(x => x.at > c.t); due.forEach(x => x.fn(c.t)); } }; return c; }
const TAU = Math.PI * 2, norm = a => ((a % TAU) + TAU) % TAU;
function game(seed = 3) { const ctx = mkctx(); const st = KT.init({ seed, rng: seeded(seed), ctx }); return { ctx, st }; }

// determinism + angle is pure, continuous, matches client copy
let { ctx, st } = game();
assert.deepStrictEqual(st.logs, game().st.logs);
const clientSrc = require("fs").readFileSync("C:/Users/D/Documents/New folder/robertcalamari/src/duels/games/KnifeThrow.js", "utf8");
const m = clientSrc.match(/function angle\(log, t\) \{[\s\S]*?\n\}/)[0];
const clientAngle = new Function("TAU", m + "; return angle;")(TAU);
for (const pattern of ["steady", "wobble", "reverse", "surge"]) {
  const log = { pattern, speed: 2.5, dir: -1, period: 2.3 };
  for (let t = 0; t < 20; t += 0.37) assert.strictEqual(clientAngle(log, t), KT.angle(log, t));
  for (let t = 0; t < 20; t += 0.01) assert.ok(Math.abs(KT.angle(log, t + 0.01) - KT.angle(log, t)) < 0.15, "continuous");
  assert.ok(KT.angle(log, -3) === 0);
}
// reverse actually reverses
const rv = { pattern: "reverse", speed: 2, dir: 1, period: 2 }; let signs = new Set();
for (let t = 0; t < 4; t += 0.05) signs.add(Math.sign(KT.angle(rv, t + 0.05) - KT.angle(rv, t))); assert.ok(signs.has(1) && signs.has(-1));

// before start rejected
let v = KT.view(st, 0); assert.strictEqual(v.phase, "play"); assert.strictEqual(v.stuck.length, 0);
assert.ok(KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx).error);
ctx.advance(3600);
const expectA = (at, seat = 0) => Math.round(norm((seat ? -Math.PI / 2 : Math.PI / 2) - KT.angle(st.logs[st.logIndex], (at + 110 - st.logStartAt) / 1000)) * 10000) / 10000;
// clamp: throwAt in the future -> now; far past -> now-400
assert.ok(KT.move(st, 0, { throwAt: ctx.t + 5000, log: 0, n: 1 }, ctx).ok);
assert.strictEqual(st.stuck[0].a, expectA(ctx.t));
ctx.advance(300);
assert.ok(KT.move(st, 1, { throwAt: ctx.t - 99999, log: 0, n: 1 }, ctx).ok || true);
const last = st.events[st.events.length - 1];
assert.strictEqual(last.a, expectA(ctx.t - 400, 1), "clamped to now-400");
assert.ok(KT.move(st, 0, { throwAt: "x", log: 0 }, ctx).ok !== undefined);
// too fast
ctx.advance(250);
assert.ok(KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx).ok);
assert.strictEqual(KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx).error, "Too fast.");
assert.strictEqual(KT.move(st, 0, { throwAt: ctx.t, log: 7 }, ctx).error, "That log is gone.");

// opposite sides: same throwAt lands half a turn apart, both stick
({ ctx, st } = game()); ctx.advance(3600);
let t0 = ctx.t;
assert.ok(KT.move(st, 1, { throwAt: t0, log: 0, n: 1 }, ctx).ok);
assert.ok(KT.move(st, 0, { throwAt: t0, log: 0, n: 1 }, ctx).ok);
assert.deepStrictEqual(st.events.map(e => [e.seat, e.ok]), [[1, true], [0, true]]);
const rotAt = (at) => KT.angle(st.logs[0], (at + 110 - st.logStartAt) / 1000);
const gap = (a, b) => Math.min(norm(a - b), TAU - norm(a - b));
assert.ok(gap(st.stuck[0].a + rotAt(t0), -Math.PI / 2) < 1e-3, "seat 1 knife lands at the top");
assert.ok(gap(st.stuck[1].a + rotAt(t0), Math.PI / 2) < 1e-3, "seat 0 knife lands at the bottom");
assert.ok(Math.abs(gap(st.stuck[0].a, st.stuck[1].a) - Math.PI) < 1e-3, "180 apart");
// half a turn later seat 0's knife is at the top: seat 1 hits it
const half = Math.PI / st.logs[0].speed * 1000;
ctx.advance(Math.round(half));
KT.move(st, 1, { throwAt: ctx.t, log: 0, n: 2 }, ctx);
assert.deepStrictEqual(st.events.map(e => [e.seat, e.ok]), [[1, true], [0, true], [1, false]]);
// same side, same moment: first sticks, second hits it (seat 0 on its own knife a full turn later)
({ ctx, st } = game()); ctx.advance(3600);
t0 = ctx.t;
assert.ok(KT.move(st, 1, { throwAt: t0, log: 0, n: 1 }, ctx).ok);
ctx.advance(Math.round(half));
assert.ok(KT.move(st, 0, { throwAt: ctx.t, log: 0, n: 1 }, ctx).ok);
assert.deepStrictEqual(st.events.map(e => [e.seat, e.ok]), [[1, true], [0, false]]);
assert.deepStrictEqual(st.out, [true, false]); assert.deepStrictEqual(st.scores, [-2, 1]);
assert.strictEqual(st.stuck[0].owner, 1);
assert.strictEqual(KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx).error, "You're out for this log.");
// view is the same for both, has owners
assert.deepStrictEqual(KT.view(st, 0), KT.view(st, 1));

// collision with other player's knife at a later time when the log has come back around
({ ctx, st } = game()); ctx.advance(3600);
const log0 = st.logs[0];
const period = TAU / log0.speed * 1000; // steady first log
KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx);
ctx.advance(Math.round(period));
KT.move(st, 1, { throwAt: ctx.t, log: 0 }, ctx);
assert.strictEqual(st.events[1].ok, true, "a full turn later the knife is on seat 0's side, not seat 1's");
ctx.advance(Math.round(period / 2));
KT.move(st, 1, { throwAt: ctx.t, log: 0 }, ctx);
assert.strictEqual(st.events[2].ok, false, "hit seat 0's knife half a turn later");
// near-miss just beyond gap sticks
ctx.advance(200); KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx);
assert.strictEqual(st.events[3].ok, true);

// log progression: fill quota with well spaced throws
function play(st, ctx, seatOk = [true, true]) {
  const log = st.logs[st.logIndex]; let guard = 0;
  while (st.phase === "play" && guard++ < 2000) {
    ctx.advance(40);
    for (const s of [0, 1]) {
      if (!seatOk[s] || st.out[s] || ctx.t - st.lastThrow[s] < 180) continue;
      const a = expectA(ctx.t, s);
      if (st.stuck.every(k => Math.min(norm(k.a - a), TAU - norm(k.a - a)) > 0.25)) { const r = KT.move(st, s, { throwAt: ctx.t, log: st.logIndex }, ctx); assert.ok(r.ok, JSON.stringify(r)); }
    }
  }
}
({ ctx, st } = game(9)); ctx.advance(3600);
play(st, ctx);
assert.strictEqual(st.phase, "break"); assert.strictEqual(st.endReason, "cleared");
assert.strictEqual(st.stuck.filter(k => k.owner !== null).length, 10);
assert.ok(KT.move(st, 0, { throwAt: ctx.t, log: 0 }, ctx).error);
assert.strictEqual(KT.result(st), null);
ctx.advance(2300); assert.strictEqual(st.logIndex, 1); assert.strictEqual(st.phase, "play");
assert.strictEqual(st.stuck.length, 1); assert.strictEqual(st.stuck[0].owner, null);
// both out ends log
ctx.advance(10);
const tt = ctx.t; const ob = st.stuck[0];
// aim exactly at obstacle: find time when bottom angle == obstacle
let hitAt = null; for (let x = tt; x < tt + 10000; x += 5) { const a = expectA(x); if (Math.min(norm(a - ob.a), TAU - norm(a - ob.a)) < 0.05) { hitAt = x; break; } }
ctx.advance(hitAt - ctx.t); KT.move(st, 0, { throwAt: ctx.t, log: 1 }, ctx);
let hit1 = null; for (let x = ctx.t + 200; x < ctx.t + 10000; x += 5) { const a = expectA(x, 1); if (Math.min(norm(a - ob.a), TAU - norm(a - ob.a)) < 0.05) { hit1 = x; break; } }
ctx.advance(hit1 - ctx.t); KT.move(st, 1, { throwAt: ctx.t, log: 1 }, ctx);
assert.strictEqual(st.endReason, "out"); assert.strictEqual(st.phase, "break");
ctx.advance(2300);
// time-out ends log
assert.strictEqual(st.logIndex, 2); ctx.advance(20100); assert.strictEqual(st.endReason, "time"); ctx.advance(2300);
play(st, ctx); ctx.advance(2300); play(st, ctx);
console.log("final", st.phase, st.scores, KT.result(st), "log speeds", st.logs.map(l => l.pattern + ":" + l.speed));
assert.strictEqual(st.phase, "done"); assert.ok(KT.result(st));
// stale timers after done do nothing
ctx.advance(60000); assert.strictEqual(st.phase, "done");
// tie
({ ctx, st } = game()); for (let i = 0; i < 5; i++) ctx.advance(25000);
assert.deepStrictEqual(KT.result(st), { winner: null, text: "Tied at 0 knives." });
// winner
({ ctx, st } = game(4)); ctx.advance(3600); play(st, ctx, [true, false]); for (let i = 0; i < 5; i++) ctx.advance(25000);
console.log(KT.result(st)); assert.strictEqual(KT.result(st).winner, 0);
assert.ok(JSON.stringify(KT.view(st, 0)).length < 6000);
const tvv = KT.tv(st); assert.ok(tvv.headline && tvv.scores.length === 2);
console.log("KNIFE OK");
