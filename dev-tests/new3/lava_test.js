// Floor Is Lava over sockets: bots dodge (greedy: walk toward the nearest solid tile far from warnings), one idles.
const { wait, check, until, room, mv, V, T, done } = require("./lib");
const n = Number(process.argv[2] || 3);

function steer(v, s) {
  const [C, R] = v.dims;
  const [x, y] = v.dots[s];
  let best = null;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (v.tiles[r * C + c] !== "0") continue;
    let danger = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const t = v.tiles[(r + dr) * C + c + dc]; if (t && t !== "0" && c + dc >= 0 && c + dc < C) danger++; }
    const d = Math.hypot(c + 0.5 - x, r + 0.5 - y) + danger * 0.6;
    if (!best || d < best.d) best = { d, c, r };
  }
  if (!best) return { x: 0, y: 0 };
  const dx = best.c + 0.5 - x, dy = best.r + 0.5 - y, m = Math.hypot(dx, dy);
  return m < 0.15 ? { x: 0, y: 0 } : { x: dx / Math.max(m, 0.5), y: dy / Math.max(m, 0.5) };
}

(async () => {
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "lavafloor" });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "lavafloor"));
  let v = V(ps[0]);
  check(n + "p: countdown, dots, tiles", v.phase === "count" && v.dots.length === n && v.tiles.length === v.dims[0] * v.dims[1] && /^0+$/.test(v.tiles));
  check("bad input refused", !(await mv(ps[0], { x: "a", y: 0 })).ok && !(await mv(ps[0], { x: NaN, y: 0 })).ok && !(await mv(ps[0], null)).ok);
  check("huge input clamped", (await mv(ps[0], { x: 1e9, y: 0 })).ok);
  await until(() => V(ps[0]).phase === "play", 5000);
  const x0 = V(ps[0]).dots[0][0];
  await wait(600);
  check("input moves dot (clamped speed)", V(ps[0]).dots[0][0] > x0 && V(ps[0]).dots[0][0] - x0 < 3.4 * 0.8);
  // ticks broadcast
  let msgs = 0; tv.on("room", () => msgs++);
  await wait(1000);
  check("tv gets ~12 ticks/s", msgs >= 8 && msgs <= 20, msgs + "");
  // collision: drive 0 and 1 into each other
  let rounds = new Set();
  let outMoveChecked = false;
  let bumped = false;
  const t0 = Date.now();
  while (!ps[0].last.match.result && Date.now() - t0 < 240000) {
    v = V(ps[0]);
    rounds.add(v.round);
    if (v.phase === "play") {
      await Promise.all(ps.map((p, s) => {
        if (!v.alive[s]) return null;
        if (s === n - 1 && v.round === 0) return mv(p, { x: 0, y: 0 }); // the idler
        return mv(p, steer(v, s));
      }));
      const out = v.alive.findIndex((a) => !a);
      if (out >= 0 && !outMoveChecked) { outMoveChecked = true; check("moving when out refused", !(await mv(ps[out], { x: 1, y: 0 })).ok); }
    }
    if (!bumped && v.phase === "play") {
      const d = Math.hypot(v.dots[0][0] - v.dots[1][0], v.dots[0][1] - v.dots[1][1]);
      if (d < 0.6 - 0.01 && v.alive[0] && v.alive[1]) { console.log("overlap seen", d); }
    }
    await wait(70);
  }
  const res = ps[0].last.match.result;
  v = V(ps[0]);
  console.log("rounds", [...rounds], "wins", v.wins, res && res.text);
  check(n + "p: finished, someone won 2 or 5 rounds played", res && res.places && (Math.max(...v.wins) >= 2 || v.round === 4), res && res.text);
  check("moving out refused seen", outMoveChecked);
  check("tv mirrors", T(tv).phase === "done" && T(tv).wins.join() === v.wins.join());
  for (const p of [...ps, tv]) p.close();
  done();
})();
