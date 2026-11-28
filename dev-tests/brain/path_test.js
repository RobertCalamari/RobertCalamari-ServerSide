const { wait, T, check, until, mv, V, TV, setup } = require("./common");
async function play(mode) {
  const { ps, tv, all } = await setup(mode, "pathrecall");
  const n = ps.length;
  const total = new Array(n).fill(0);
  const lives = new Array(n).fill(3);
  for (let r = 0; r < 8; r++) {
    const ok = await until(() => V(ps[0]).phase === "show" && V(ps[0]).round === r, 20000);
    const path = V(ps[0]).path;
    check(mode + " r" + r + ": path of " + (3 + r), ok && path.length === 3 + r && new Set(path).size === path.length);
    const early = await mv(ps[0], { r, cells: path }); check(mode + " r" + r + ": answer during show refused", !early.ok);
    await until(() => V(ps[0]).phase === "input", 15000);
    check(mode + " r" + r + ": path hidden in input", V(ps[0]).path === null && (!tv || TV(tv).path === null));
    if (r === 0) for (const bad of [{ r: 0, cells: [0, 1] }, { r: 0, cells: [0, 1, 99] }, { r: 0, cells: ["0", 1, 2] }, { r: 1, cells: path }, null, { r: 0, cells: "012" }]) { const x = await mv(ps[0], bad); check(mode + ": refused " + JSON.stringify(bad), !x.ok); }
    // seat 0 always right; seat 1 wrong on odd rounds (out after round 5); seats 2+ always wrong; in groups the last seat times out on round 0
    const wrongs = ps.map((_, s) => lives[s] > 0 && ((s === 1 && r % 2 === 1) || s >= 2));
    for (let s = 0; s < n; s++) {
      if (lives[s] <= 0) { const x = await mv(ps[s], { r, cells: path }); check(mode + ": out player refused", !x.ok); continue; }
      if (n > 2 && s === n - 1 && r === 0) continue;
      const x = await mv(ps[s], { r, cells: wrongs[s] ? path.slice().reverse() : path }); check(mode + " r" + r + " s" + s + ": answer in", x.ok, x.error);
    }
    if (r === 0 && n > 2) { const again = await mv(ps[0], { r, cells: path }); check(mode + ": second answer refused", !again.ok); }
    const t0 = Date.now();
    await until(() => V(ps[0]).phase === "reveal" && V(ps[0]).round === r, 30000);
    const v = V(ps[0]);
    wrongs.forEach((w, s) => w && lives[s]--);
    check(mode + " r" + r + ": reveal, lives", JSON.stringify(v.lives) === JSON.stringify(lives) && v.got[0] >= 3 + r && v.path.length === 3 + r, JSON.stringify([v.lives, lives, v.got, Date.now() - t0]));
    v.got.forEach((g, s) => (total[s] += g || 0));
  }
  // seat 0 now lets three trails time out to end it
  for (let k = 0; k < 3 && !ps[0].last.match.result; k++) {
    await until(() => V(ps[0]).phase === "input" || ps[0].last.match.result, 20000);
    if (ps[0].last.match.result) break;
    const t0 = Date.now();
    await until(() => V(ps[0]).phase === "reveal" || ps[0].last.match.result, 30000);
    check(mode + ": timeout reveal", Date.now() - t0 > 4000, Date.now() - t0 + "ms");
  }
  const ok = await until(() => ps[0].last.match.result, 20000);
  const res = ps[0].last.match.result;
  check(mode + ": done", ok && V(ps[0]).score[0] === total[0], JSON.stringify([V(ps[0]).score, total, res]));
  if (n === 1) check("solo: score in result", res.score === total[0]);
  console.log("   ", res.text);
  all.forEach((p) => p.disconnect());
}
(async () => { await play(process.argv[2] === "duel" ? "duel" : process.argv[2] === "solo" ? "solo" : Number(process.argv[2])); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); })();
