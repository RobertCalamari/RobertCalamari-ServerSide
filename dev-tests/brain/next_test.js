const { wait, T, check, until, mv, V, TV, setup } = require("./common");
async function play(mode) {
  const { ps, tv, all } = await setup(mode, "nextup");
  const n = ps.length;
  const total = new Array(n).fill(0);
  for (let q = 0; q < 10; q++) {
    await until(() => V(ps[0]).phase === "ask" && V(ps[0]).index === q, 20000);
    const v = V(ps[0]);
    check(mode + " q" + q + ": no answer/rule leak", v.answer === null && v.rule === null && v.picks === null && (!tv || TV(tv).answer === null));
    if (q === 0) {
      for (const bad of [{ q: 0, choice: 4 }, { q: 0, choice: -1 }, { q: 0, choice: "1" }, { q: 0, choice: 1.5 }, { q: 3, choice: 1 }, null, {}]) {
        const r = await mv(ps[0], bad); check(mode + ": refused " + JSON.stringify(bad), !r.ok, r.error);
      }
    }
    const picks = ps.map((_, s) => (s === 0 ? q % 4 : (s + q) % 4));
    const skip = mode !== "solo" && q === 9 ? n - 1 : -1;
    for (let s = 0; s < n; s++) if (s !== skip) { const r = await mv(ps[s], { q, choice: picks[s] }); check(mode + " q" + q + " s" + s + ": pick ok", r.ok, r.error); }
    if (q === 0 && n > 1) {
      const again = await mv(ps[0], { q, choice: 1 }); check(mode + ": change refused", !again.ok || V(ps[0]).phase === "reveal");
    }
    await wait(80);
    if (n > 1 && skip >= 0) check(mode + ": picks hidden while waiting", V(ps[skip]).picks === null && V(ps[0]).mine === picks[0] && V(ps[skip]).mine === null && V(ps[skip]).in[0] === true && !JSON.stringify(V(ps[skip])).includes("\"answer\":" + "0"));
    const t0 = Date.now();
    await until(() => V(ps[0]).phase === "reveal" && V(ps[0]).index === q, 20000);
    const rv = V(ps[0]);
    check(mode + " q" + q + ": reveal " + (skip >= 0 ? "on timeout " + (Date.now() - t0) : "early") + ", scoring", rv.got.every((g, s) => (s !== skip && picks[s] === rv.answer ? g >= 5 && g <= 10 : g === 0)) && rv.rule && rv.picks[0] === picks[0], JSON.stringify([rv.got, rv.answer, rv.rule]));
    rv.got.forEach((g, s) => (total[s] += g));
  }
  const ok = await until(() => ps[0].last.match.result, 10000);
  const res = ps[0].last.match.result;
  check(mode + ": done, totals", ok && JSON.stringify(V(ps[0]).score) === JSON.stringify(total), JSON.stringify([V(ps[0]).score, total, res]));
  if (n === 1) check("solo: score in result", res.score === total[0]);
  console.log("   ", res.text);
  all.forEach((p) => p.disconnect());
}
(async () => { await play(process.argv[2] === "duel" ? "duel" : process.argv[2] === "solo" ? "solo" : Number(process.argv[2])); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); })();
