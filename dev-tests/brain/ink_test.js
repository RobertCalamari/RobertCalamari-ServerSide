const { wait, T, check, until, mv, V, TV, setup } = require("./common");
const ans = (c) => (c[2] ? c[0] : c[1]);
async function play(mode) {
  const { ps, tv, all } = await setup(mode, "inkclash");
  const n = ps.length;
  check(mode + ": ready, no cards yet", V(ps[0]).phase === "ready" && V(ps[0]).me.cards.length === 0);
  check(mode + ": early tap refused", !(await mv(ps[0], { i: 0, pick: 0 })).ok);
  await until(() => V(ps[0]).phase === "play", 5000);
  check(mode + ": tv has no cards", !tv || !JSON.stringify(TV(tv)).includes("cards"));
  for (const bad of [{ i: 0, pick: 4 }, { i: 0, pick: "1" }, { i: "0", pick: 1 }, null, { pick: 1 }]) { const r = await mv(ps[0], bad); check(mode + ": refused " + JSON.stringify(bad), !r.ok); }
  const skipped = await mv(ps[0], { i: 5, pick: 0 }); check(mode + ": out-of-order ignored", skipped.ok && V(ps[0]).me.pos === 0);
  const exp = ps.map(() => ({ right: 0, wrong: 0, score: 0 }));
  let words = 0;
  const start = Date.now();
  await Promise.all(ps.map(async (p, s) => {
    let k = 0;
    while (Date.now() - start < 12000) {
      const me = V(p).me;
      const c = me.cards[0];
      if (!c) { await wait(20); continue; }
      if (c[2]) words++;
      const wrong = (k + 1) % (s + 3) === 0;
      const pick = wrong ? (ans(c) + 1) % 4 : ans(c);
      const r = await mv(p, { i: me.pos, pick });
      if (r.ok) { if (wrong) { exp[s].wrong++; exp[s].score = Math.max(0, exp[s].score - 1); await wait(750); } else { exp[s].right++; exp[s].score++; } }
      k++;
      await until(() => V(p).me.pos === me.pos + 1, 1000);
    }
  }));
  check(mode + ": WORD cards turn up", words > 0, words + "");
  const me = V(ps[0]).me; const c = me.cards[0];
  await mv(ps[0], { i: me.pos, pick: (ans(c) + 1) % 4 }); exp[0].wrong++; exp[0].score = Math.max(0, exp[0].score - 1);
  await wait(100);
  const fr = await mv(ps[0], { i: me.pos + 1, pick: ans(V(ps[0]).me.cards[0]) });
  await wait(100);
  check(mode + ": tap during freeze ignored", V(ps[0]).me.pos === me.pos + 1, JSON.stringify(fr));
  const v = V(ps[0]);
  check(mode + ": counts", ps.every((_, s) => v.right[s] === exp[s].right && v.wrong[s] === exp[s].wrong && v.score[s] === exp[s].score), JSON.stringify([v.right, v.wrong, v.score, exp]));
  const ok = await until(() => ps[0].last.match.result, 40000);
  const res = ps[0].last.match.result;
  check(mode + ": ends on time (~40s)", ok && Date.now() - start > 25000, (Date.now() - start) + "");
  check(mode + ": late tap refused", !(await mv(ps[0], { i: 0, pick: 0 })).ok);
  if (n === 1) check("solo: score in result", res.score === exp[0].score, JSON.stringify(res));
  console.log("   ", res.text);
  all.forEach((p) => p.disconnect());
}
(async () => { await play(process.argv[2] === "duel" ? "duel" : process.argv[2] === "solo" ? "solo" : Number(process.argv[2])); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); })();
