// offline check of Shape Shifter: fake clock, solve every shape with its own solution and with a rotated copy
const path = require("path");
const game = require(path.join(__dirname, "../games/duels/games/shapeshift"));

let now = 1000;
const timers = [];
const ctx = { now: () => now, rng: Math.random, host: true, later: (ms, fn) => timers.push({ at: now + ms, fn }) };
function run(ms) {
    now += ms;
    timers.sort((a, b) => a.at - b.at);
    while (timers.length && timers[0].at <= now) timers.shift().fn(now);
}
const ok = (c, m) => {
    if (!c) {
        console.log("FAIL", m);
        process.exitCode = 1;
    } else console.log("ok  ", m);
};

const st = game.init({ rng: Math.random, ctx, players: 2, options: {} });
ok(game.move(st, 0, { act: "place", i: 0, at: [5, 5, 0, 0] }, ctx).error, "no moves during countdown");
run(3000);
ok(st.phase === "play", "playing after countdown");
ok(game.move(st, 0, { act: "place", i: 9, at: [5, 5, 0, 0] }, ctx).error, "bad piece index rejected");
ok(game.move(st, 0, { act: "place", i: 0, at: [50, 5, 0, 0] }, ctx).error, "off-board rejected");
ok(game.move(st, 0, { act: "place", i: 0, at: [5, 5, 1.5, 0] }, ctx).error, "bad rotation rejected");
for (let round = 0; round < 3; round++) {
    const v = game.view(st, 0);
    // place pieces matching the solution by type (board order is the tray order)
    const left = v.solution ? null : st.target.solution.slice();
    const used = new Set();
    v.mine.forEach((piece, i) => {
        const k = left.findIndex((s, j) => s.t === piece.t && !used.has(j));
        used.add(k);
        game.move(st, 0, { act: "place", i, at: left[k].at }, ctx);
    });
    ok(st.solvedAt[0] !== null, "seat 0 solves " + st.target.name);
    const other = game.view(st, 1);
    ok(other.cover[0] === 100 && !("boards" in other) && JSON.stringify(other.mine) !== JSON.stringify(game.view(st, 0).mine), "other seat sees progress, not the board");
    game.move(st, 1, { act: "place", i: 0, at: st.target.solution.find((s) => s.t === "L").at }, ctx);
    ok(st.cover[1] > 0 && st.cover[1] < 1, "partial cover " + Math.round(st.cover[1] * 100) + "%");
    ok(game.move(st, 1, { act: "skip" }, { ...ctx, host: false }).error, "non-host can't skip");
    game.move(st, 1, { act: "skip" }, ctx);
    ok(st.phase === "reveal", "host skip ends the shape");
    console.log("     points", st.points.join(" / "));
    run(6000);
    if (round < 2) run(3000);
}
ok(st.phase === "done", "done after three shapes");
const r = game.result(st);
ok(r && r.winner === 0, "seat 0 wins: " + r.text);

const solo = game.init({ rng: Math.random, ctx, players: 1, options: { timer: false } });
ok(solo.endAt === null, "untimed has no clock");
