const { wait, T, check, until, mv, V, TV, setup, S } = require("./common");
const DT = require(S + "games/digittarget.js");
function tokensFor(e, digits) {
  const used = new Set(), out = [];
  for (const m of e.match(/\d+|[×÷−+()]/g)) {
    if (/\d/.test(m)) for (const ch of m) { const i = digits.findIndex((d, k) => String(d) === ch && !used.has(k)); used.add(i); out.push("d" + i); }
    else out.push({ "×": "*", "÷": "/", "−": "-" }[m] || m);
  }
  return out;
}
async function play(mode) {
  const { ps, tv, all } = await setup(mode, "digittarget");
  const n = ps.length;
  const total = new Array(n).fill(0);
  for (let r = 0; r < 5; r++) {
    await until(() => V(ps[0]).phase === "ask" && V(ps[0]).index === r, 20000);
    const v = V(ps[0]);
    const best = DT.solve(v.digits);
    check(mode + " r" + r + ": target reachable " + v.target + " from " + v.digits, !!best[v.target]);
    const blob = JSON.stringify(V(ps[0])) + (tv ? JSON.stringify(TV(tv)) : "");
    check(mode + " r" + r + ": no solution leak", v.how === null && (best[v.target].e === String(v.target) || !blob.includes(best[v.target].e)) && !blob.includes('"how":"'), "");
    if (r === 0) {
      const d = v.digits;
      const bad = [
        [["d0", "+", "d0"], /once/], [["d0", "+"], /Unfinished/], [["(", "d0"], /bracket/], [["d0", ")"], /out of place/], [[")", "d0"], /out of place/],
        [["d0", "d1", "d2", "d3", "d4"], /Bad/], [["process.exit()"], /Bad/], [["d0", "**", "d1"], /Bad/], [[], /Build/], ["1+1", /Build/], [[1, 2], /Bad/], [["d0", "/", "(", "d1", "-", "d1", ")"], /once/],
        [["constructor"], /Bad/], [["__proto__"], /Bad/], [new Array(41).fill("("), /Build/],
      ];
      for (const [tk, re] of bad) { const res = await mv(ps[0], { q: 0, tokens: tk }); check(mode + ": refused " + JSON.stringify(tk).slice(0, 30), !res.ok && re.test(res.error), res.error); }
      // division by zero with a real zero tile if any
      const z = d.indexOf(0);
      if (z >= 0) { const o = z === 0 ? 1 : 0; const res = await mv(ps[0], { q: 0, tokens: ["d" + o, "/", "d" + z] }); check(mode + ": divide by zero refused", !res.ok && /zero/.test(res.error), res.error); }
      const res = await mv(ps[0], { q: 1, tokens: ["d0"] }); check(mode + ": wrong round refused", !res.ok);
      for (const [tk, re] of [[["!"], /out of place/], [["d0", "!!"], /Bad/], [["!", "d0"], /out of place/], [["d0!"], /Bad/], [["d0", "fact"], /Bad/], [["(", "!", ")"], /out of place/]]) { const res = await mv(ps[0], { q: 0, tokens: tk }); check(mode + ": factorial junk refused " + JSON.stringify(tk), !res.ok && re.test(res.error), res.error); }
      const nt = await mv(ps[0], { q: 0, act: "out" }); check(mode + ": give up refused when timed", !nt.ok, nt.error);
      const sk = await mv(ps[0], { q: 0, act: "skip" }); check(mode + ": skip refused when timed", !sk.ok, sk.error);
      check(mode + ": timed, deadline set", v.timed === true && v.deadline > Date.now());
      // a near miss first: single digit
      const near = await mv(ps[0], { q: 0, tokens: ["d0"] }); check(mode + ": near-miss accepted", near.ok);
      const fa = await mv(ps[0], { q: 0, tokens: ["d0", "!"] }); check(mode + ": factorial try accepted " + d[0] + "!", fa.ok, fa.error);
      await wait(100);
      const m0 = V(ps[0]).mine, blob0 = JSON.stringify(V(ps[0])) + (tv ? JSON.stringify(TV(tv)) : "");
      check(mode + ": no hint fields while playing", JSON.stringify(Object.keys(m0)) === '["e","tries","exact","out"]' && m0.e === d[0] + "!" && m0.exact === false && !blob0.includes('"gap"') && !blob0.includes('"v":') && V(ps[0]).tries === null, JSON.stringify(m0));
      check(mode + ": others see 'in' not the expression", !n > 1 || (V(ps[n - 1]).in[0] === true && V(ps[n - 1]).tries === null && !("mine" in (tv ? TV(tv) : {}))));
    }
    // seat 0 exact always; seat 1 exact on even rounds; others off by 3 (if possible)
    const tk = tokensFor(best[v.target].e, v.digits);
    const t0 = Date.now();
    for (let s = n - 1; s >= 0; s--) {
      if (s === 0 || (s === 1 && r % 2 === 0)) { const res = await mv(ps[s], { q: r, tokens: tk }); check(mode + " r" + r + " s" + s + ": exact ok " + best[v.target].e, res.ok, res.error); }
      else if (r < 4 || s > 1) { const res = await mv(ps[s], { q: r, tokens: ["d0"] }); check(mode + " r" + r + ": try ok", res.ok, res.error); }
    }
    if (r === 0) { const again = await mv(ps[0], { q: 0, tokens: tk }); }
    const ok = await until(() => V(ps[0]).phase === "reveal", 70000);
    const rv = V(ps[0]);
    const first = n > 1 && r % 2 === 0 ? 1 : 0;
    const exp = ps.map((_, s) => {
      if (s === 0 || (s === 1 && r % 2 === 0)) return 10 + (s === first ? 2 : 0);
      if (r === 4 && s === 1) return 0;
      const g = Math.abs(v.digits[0] - v.target); return g === 0 ? 10 : g <= 1 ? 7 : g <= 5 ? 5 : g <= 10 ? 2 : 0;
    });
    exp.forEach((x, s) => (total[s] += x));
    check(mode + " r" + r + ": reveal " + (n === 1 || r % 2 === 0 ? "early" : "on timeout") + ", points", ok && JSON.stringify(rv.got) === JSON.stringify(exp) && rv.how === best[v.target].e && rv.first === first, JSON.stringify([rv.got, exp, rv.first, Date.now() - t0]));
    check(mode + " r" + r + ": tries shown", rv.tries[0].v[0] === v.target);
  }
  const ok = await until(() => ps[0].last.match.result, 15000);
  const res = ps[0].last.match.result;
  check(mode + ": finished, totals", ok && JSON.stringify(V(ps[0]).score) === JSON.stringify(total), JSON.stringify([V(ps[0]).score, total]));
  if (n === 1) check("solo: score in result", res.score === total[0]);
  console.log("   ", res.text);
  all.forEach((p) => p.disconnect());
}
function unit() {
  const ev = (t, d) => JSON.stringify(DT.evaluate(t, d));
  const d = [3, 4, 5, 0];
  check("fact 3! = 6", ev(["d0", "!"], d) === '{"v":[6,1],"used":1}');
  check("fact 0! = 1", ev(["d3", "!"], d) === '{"v":[1,1],"used":1}');
  check("fact 3!! = (3!)! = 720", ev(["d0", "!", "!"], d) === '{"v":[720,1],"used":1}');
  check("fact (3+4)! = 5040", ev(["(", "d0", "+", "d1", ")", "!"], d) === '{"v":[5040,1],"used":2}');
  check("fact 3!*4! = 144", ev(["d0", "!", "*", "d1", "!"], d) === '{"v":[144,1],"used":2}');
  check("fact 10! ok", ev(["d0", "d1", "!"], [1, 0, 2, 3]) === '{"v":[3628800,1],"used":2}');
  check("fact 4!! too big", /0 to 10/.test(ev(["d1", "!", "!"], d)));
  check("fact 34! too big", /0 to 10/.test(ev(["d0", "d1", "!"], d)));
  check("fact (3/4)! refused", /0 to 10/.test(ev(["(", "d0", "/", "d1", ")", "!"], d)));
  check("fact (0-3)! refused", /0 to 10/.test(ev(["(", "d3", "-", "d0", ")", "!"], d)));
  check("fact product too big", /too big/.test(ev(["d0", "!", "*", "d1", "!", "*", "d2", "!", "*", "d3", "!"], [9, 8, 7, 6])), ev(["d0", "!", "*", "d1", "!", "*", "d2", "!", "*", "d3", "!"], [9, 8, 7, 6]));
  check("fact prefix refused", /out of place/.test(ev(["!", "d0"], d)));
}
// casual: no clock; a round ends when everyone's exact or done, or the host skips
async function casual(n) {
  const { ps, tv, all } = await setup(n, "digittarget", { timer: false, junk: 1 });
  await until(() => V(ps[0]).phase === "ask", 6000);
  let v = V(ps[0]);
  check(n + " casual: no deadline", v.timed === false && v.deadline === null && (!tv || (TV(tv).timed === false && TV(tv).deadline === null)));
  for (let r = 0; r < 5; r++) {
    await until(() => V(ps[0]).phase === "ask" && V(ps[0]).index === r, 15000);
    v = V(ps[0]);
    const tk = tokensFor(DT.solve(v.digits)[v.target].e, v.digits);
    if (r === 1 && n > 1) {
      const no = await mv(ps[n - 1], { q: r, act: "skip" }); check(n + " casual: non-host skip refused", !no.ok, no.error);
      const sk = await mv(ps[0], { q: r, act: "skip" }); check(n + " casual: host skip", sk.ok, sk.error);
    } else {
      check(n + " casual r" + r + ": exact", (await mv(ps[0], { q: r, tokens: tk })).ok);
      for (let s = 1; s < n; s++) {
        await mv(ps[s], { q: r, tokens: ["d0"] });
        if (s === n - 1) { await wait(400); check(n + " casual r" + r + ": waits for everyone", V(ps[0]).phase === "ask" && V(ps[0]).out[s - 1] === (s > 1)); }
        check(n + " casual r" + r + ": s" + s + " done", (await mv(ps[s], { q: r, act: "out" })).ok);
        if (s < n - 1) check(n + " casual: after giving up, no more tries", /gave/.test((await mv(ps[s], { q: r, tokens: ["d1"] })).error || ""));
      }
    }
    const ok = await until(() => V(ps[0]).phase === "reveal" && V(ps[0]).index === r, 3000);
    check(n + " casual r" + r + ": reveal" + (r === 1 && n > 1 ? " on skip" : " when all done"), ok && (r === 1 && n > 1 ? V(ps[0]).got.every((g) => g === 0) : V(ps[0]).got[0] === 12), JSON.stringify(V(ps[0]).got));
  }
  await until(() => ps[0].last.match.result, 15000);
  const res = ps[0].last.match.result;
  check(n + " casual: finished, no personal best when untimed", res && res.score === undefined, JSON.stringify(res));
  ps[0].emit("duel:rematch");
  await until(() => !ps[0].last.match.result && V(ps[0]).phase === "ask", 8000);
  check(n + " casual: rematch keeps the option", V(ps[0]).timed === false && V(ps[0]).deadline === null);
  all.forEach((p) => p.disconnect());
}
(async () => {
  if (process.argv[2] === "casual") { unit(); await casual(Number(process.argv[3] || 3)); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); }
  await play(process.argv[2] === "duel" ? "duel" : process.argv[2] === "solo" ? "solo" : Number(process.argv[2])); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); })();
