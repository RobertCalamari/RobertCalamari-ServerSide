const { wait, T, check, until, room, mv, V, TV } = require("./common");
async function play(n, timeouts) {
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "hushbid" });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "hushbid"));
  let v = V(ps[0]);
  check(n + "p: 6 lots, 100 coins each", v.lots.length === 6 && v.coins.length === n && v.coins.every((c) => c === 100) && v.phase === "bid" && v.lot === 0);
  check(n + "p: 2 mystery lots hidden", v.lots.filter((l) => l.mystery).length === 2 && v.lots.filter((l) => l.mystery).every((l) => l.value === null) && v.lots.filter((l) => !l.mystery).every((l) => l.value >= 2));
  check("tv has no me, no bids", !TV(tv).me && !("bids" in TV(tv)));
  check("bad bids refused", !(await mv(ps[0], { act: "bid", amt: 101 })).ok && !(await mv(ps[0], { act: "bid", amt: -1 })).ok && !(await mv(ps[0], { act: "bid", amt: 2.5 })).ok && !(await mv(ps[0], { act: "bid", amt: "5" })).ok && !(await mv(ps[0], { act: "zap" })).ok && !(await mv(ps[0], null)).ok);
  check("bid ok", (await mv(ps[0], { act: "bid", amt: 40 })).ok);
  await wait(100);
  const s1 = JSON.stringify(V(ps[1])), st = JSON.stringify(TV(tv));
  check("others see locked flag only", V(ps[1]).in[0] === true && V(ps[1]).me.bid === null && V(ps[0]).me.bid === 40);
  check("no leak of 40 to others/tv", !s1.includes("40") && !st.includes("40"), s1.slice(0, 200));
  check("change bid ok", (await mv(ps[0], { act: "bid", amt: 30 })).ok && (await mv(ps[0], { act: "unbid" })).ok);
  await wait(100);
  check("unbid clears flag", V(ps[1]).in[0] === false);
  // lot 0: tie at top -> nobody wins
  const t0 = Date.now();
  for (let i = 0; i < n; i++) await mv(ps[i], { act: "bid", amt: i < 2 ? 20 : 5 });
  await until(() => V(ps[0]).phase === "reveal", 3000);
  v = V(ps[0]);
  check("all in -> resolves early", v.phase === "reveal" && Date.now() - t0 < 2000);
  check("tie: nobody wins, nobody pays", v.last.tie && v.last.winner === null && v.coins.every((c) => c === 100) && v.lots[0].open && v.lots[0].value !== null);
  check("reveal shows all bids", JSON.stringify(v.last.bids) === JSON.stringify(Array.from({ length: n }, (_, i) => (i < 2 ? 20 : 5))));
  check("bid during reveal refused", !(await mv(ps[0], { act: "bid", amt: 1 })).ok);
  let expPts = new Array(n).fill(0), expCoins = new Array(n).fill(100);
  for (let L = 1; L < 6; L++) {
    await until(() => V(ps[0]).phase === "bid" && V(ps[0]).lot === L, 12000);
    if (L <= timeouts) {
      const s = Date.now();
      await mv(ps[1], { act: "bid", amt: 7 }); // only one bidder, the rest time out
      await until(() => V(ps[0]).phase === "reveal", 30000);
      check("lot " + L + " times out ~20s", Math.abs(Date.now() - s - 20000) < 2000, (Date.now() - s) + "ms");
      v = V(ps[0]);
      check("lone bidder wins and pays", v.last.winner === 1 && v.coins[1] === expCoins[1] - 7 && v.last.bids.filter((b) => b).length === 1);
      expCoins[1] -= 7; expPts[1] += v.last.value;
      continue;
    }
    const w = L % n;
    for (let i = 0; i < n; i++) await mv(ps[i], { act: "bid", amt: i === w ? Math.min(expCoins[i], 15) : Math.min(expCoins[i], 3) });
    await until(() => V(ps[0]).phase === "reveal", 3000);
    v = V(ps[0]);
    const exp = Math.min(expCoins[w], 15);
    check("lot " + L + " won by top bidder", v.last.winner === w && v.coins[w] === expCoins[w] - exp, JSON.stringify(v.last));
    expCoins[w] -= exp; expPts[w] += v.last.value;
  }
  await until(() => ps[0].last.match.result && tv.last.match.result, 12000);
  v = V(ps[0]);
  const res = ps[0].last.match.result;
  check(n + "p: done, points/coins add up", v.phase === "done" && JSON.stringify(v.points) === JSON.stringify(expPts) && JSON.stringify(v.coins) === JSON.stringify(expCoins), JSON.stringify([v.points, expPts, v.coins, expCoins]));
  check(n + "p: places sane", res.places.length === n && res.places[expPts.indexOf(Math.max(...expPts))] <= 2, JSON.stringify(res));
  check(n + "p: all lots revealed", v.lots.every((l) => l.open && l.value !== null));
  console.log("  ", res.text);
  [...ps, tv].forEach((p) => p.disconnect());
}
(async () => {
  await play(3, 1);
  await play(12, 0);
  console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
  process.exit(T.fails ? 1 : 0);
})();
