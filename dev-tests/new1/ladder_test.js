// Word Ladder over sockets: node ladder_test.js solo|duel|4|casual4
const { wait, T, check, until, mv, V, TV, setup } = require("./common");
async function play(mode) {
  const casual = mode === "casual4";
  const { ps, tv, all } = await setup(casual ? 4 : mode, "wordladder", casual ? { timer: false } : undefined);
  const n = ps.length;
  for (let r = 0; r < 3; r++) {
    await until(() => V(ps[0]).phase === "ask" && V(ps[0]).index === r, 100000);
    const v = V(ps[0]);
    const blob = JSON.stringify(V(ps[n - 1])) + (tv ? JSON.stringify(TV(tv)) : "");
    check(mode + " r" + r + ": no path leak", v.path === null && v.chains === null && !blob.includes('"path":[') && (!tv || TV(tv).mine === undefined), "");
    check(mode + " r" + r + ": words " + v.start + "→" + v.target + " best " + v.best + " len " + v.len, v.start.length === v.len && v.target.length === v.len && v.best >= 4 && v.best <= 7 && v.len === (r === 2 ? 5 : 4));
    if (r === 0) {
      const bad = [[{ q: 0, w: v.target }, /one letter/], [{ q: 0, w: v.start + "s" }, /letters/], [{ q: 0, w: "z" + v.start.slice(1, -1) + "q" }, /one letter/], [{ q: 0, w: 5 }, /Bad/], [{ q: 0, w: v.start }, /one letter/], [{ q: 1, w: v.start }, /Bad/], [null, /Bad/], [{ q: 0, w: "a1" + v.start.slice(2) }, /Letters/]];
      for (const [p, re] of bad) { const res = await mv(ps[0], p); check(mode + ": refused " + JSON.stringify(p), !res.ok && re.test(res.error), res.error); }
      // a non-word one letter off
      let fake = null;
      for (const c of "qxzjv") { const w = c + v.start.slice(1); if (w !== v.start) { const res = await mv(ps[0], { q: 0, w }); if (!res.ok && /word we know/.test(res.error)) { fake = w; break; } if (res.ok) await mv(ps[0], { q: 0, act: "undo" }); } }
      check(mode + ": non-word refused with a reason", !!fake, fake);
      if (casual) { const sk = await mv(ps[1], { q: 0, act: "skip" }); check(mode + ": non-host skip refused", !sk.ok); }
      else { const sk = await mv(ps[0], { q: 0, act: "skip" }); check(mode + ": timed skip refused", !sk.ok); }
    }
    // we can't see the path, so find one with the server's own ladder module (same word lists)
    const L = require("../../games/duels/ladder.js");
    const W = require("../../games/duels/words.js");
    const b = L.bfs(v.start, (x) => x.length === v.len && W.VALID.has(x), 9);
    const path = [v.target]; while (path[0] !== v.start) path.unshift(b.prev[path[0]]);
    check(mode + " r" + r + ": found shortest " + (path.length - 1), path.length - 1 === v.best);
    // seat 0 goes straight; seat 1 takes a detour (step, undo, step); seat n-1 gives up (or times out on round 1 if timed)
    for (const w of path.slice(1)) { const res = await mv(ps[0], { q: r, w }); check(mode + " r" + r + ": s0 " + w, res.ok, res.error); }
    await wait(80);
    if (n > 1) {
      check(mode + " r" + r + ": others see steps not chains", V(ps[1]).done[0] === true && V(ps[1]).steps[0] === v.best && V(ps[1]).chains === null && V(ps[1]).mine.chain.length === 1);
      const after = await mv(ps[0], { q: r, w: path[1] }); check(mode + ": done, no more moves", !after.ok, after.error);
      await mv(ps[1], { q: r, w: path[1] }); await mv(ps[1], { q: r, act: "undo" });
      for (const w of path.slice(1)) await mv(ps[1], { q: r, w });
      for (let s = 2; s < n; s++) if (!(s === n - 1 && r === 1 && !casual)) { const o = await mv(ps[s], { q: r, act: "out" }); check(mode + " r" + r + ": s" + s + " gives up", o.ok, o.error); }
    }
    const t0 = Date.now();
    const ok = await until(() => V(ps[0]).phase === "reveal" && V(ps[0]).index === r, 100000);
    const rv = V(ps[0]);
    check(mode + " r" + r + ": reveal (" + (Date.now() - t0) + "ms), path shown, s0 scored", ok && rv.path.length === path.length && rv.path[0] === v.start && rv.got[0] >= 15 && rv.got[0] <= 22 && (n < 2 || (rv.got[1] >= 15 && rv.got[0] > rv.got[1] - 3)) && rv.got.slice(2).every((g) => g === 0), JSON.stringify(rv.got));
    if (tv) check(mode + " r" + r + ": tv gets the reveal", await until(() => JSON.stringify(TV(tv).path) === JSON.stringify(rv.path), 2000), JSON.stringify(TV(tv).path));
  }
  const ok = await until(() => ps[0].last.match.result, 15000);
  const res = ps[0].last.match.result;
  check(mode + ": result", ok && res.text, JSON.stringify(res));
  if (n === 1) check("solo: score", res.score === V(ps[0]).score[0]);
  if (casual) check("casual: no score", res.score === undefined);
  console.log("   ", res.text);
  all.forEach((p) => p.disconnect());
}
(async () => { const a = process.argv[2]; await play(a === "duel" || a === "solo" || a === "casual4" ? a : Number(a)); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); })();
