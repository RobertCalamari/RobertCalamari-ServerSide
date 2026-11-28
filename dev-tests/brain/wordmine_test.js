const { wait, T, check, until, mv, V, TV, setup, S } = require("./common");
const W = require(S + "words.js");
const WM = require(S + "games/wordmine.js");
async function play(mode) {
  const { ps, tv, all } = await setup(mode, "wordmine");
  const n = ps.length;
  check(mode + ": letters hidden while ready", V(ps[0]).phase === "ready" && V(ps[0]).letters === null);
  check(mode + ": early word refused", !(await mv(ps[0], { w: "the" })).ok);
  await until(() => V(ps[0]).phase === "play", 5000);
  const v = V(ps[0]);
  const letters = v.letters.join("").toLowerCase();
  const subs = W.inside(letters);
  const main = subs.filter((w) => w.length === letters.length);
  check(mode + ": main word not in view/tv", !JSON.stringify(V(ps[0])).toLowerCase().includes('"' + main[0] + '"') && v.word === null && (!tv || TV(tv).word === null), main.join(","));
  check(mode + ": " + subs.length + " sub-words >= 25", subs.length >= 25 && v.possible === null && (!tv || TV(tv).possible === null));
  const c = W.count(letters);
  const missing = "zqxjkvwy".split("").find((ch) => !c[ch]) || "z";
  const r1 = await mv(ps[0], { w: missing + "ap" });
  check(mode + ": unavailable letters refused", !r1.ok && /letters/.test(r1.error), r1.error);
  const twice = Object.keys(c).find((ch) => c[ch] === 1);
  const r2 = await mv(ps[0], { w: twice.repeat(3) });
  check(mode + ": letter reused too often refused", !r2.ok, r2.error);
  // a non-word made from the letters
  const nonword = [...letters.slice(0, 4)].reverse().join("");
  const nw = W.VALID.has(nonword) ? letters.slice(0, 3) + letters[0] : nonword;
  if (!W.VALID.has(nw) && W.fits(nw, c)) { const r3 = await mv(ps[0], { w: nw }); check(mode + ": non-word refused", !r3.ok && /dictionary/.test(r3.error), nw + " " + r3.error); }
  for (const bad of [{ w: "ab" }, { w: 42 }, { w: "a".repeat(30) }, { w: "<script>" }, { w: "t e" }, null, { w: ["the"] }, { act: "boom" }, { act: "end" }]) {
    const r = await mv(ps[0], bad); check(mode + ": junk refused " + JSON.stringify(bad).slice(0, 20), !r.ok, r.error);
  }
  // seat 0 finds the first 6, seat 1 the next 3 plus 2 shared
  const mine = subs.filter((w) => w.length < letters.length).slice(0, 6);
  for (const w of mine) check(mode + ": word " + w, (await mv(ps[0], { w: w.toUpperCase() })).ok);
  const dup = await mv(ps[0], { w: mine[0] });
  check(mode + ": duplicate refused", !dup.ok && /Already/.test(dup.error));
  if (n > 1) {
    for (const w of subs.filter((x) => !mine.includes(x) && x.length < letters.length).slice(0, 3).concat(mine.slice(0, 2))) await mv(ps[1], { w });
    await wait(150);
    const v1 = V(ps[1]);
    const leak = JSON.stringify(v1) + JSON.stringify(tv ? TV(tv) : {});
    check(mode + ": others' words hidden mid-round", !mine.slice(2).some((w) => leak.includes('"' + w + '"')) && v1.lists === null, mine.slice(2).filter((w) => leak.includes("\"" + w + "\"")).join(","));
    check(mode + ": counts live", v1.counts[0] === 6 && v1.counts[1] === 5, JSON.stringify(v1.counts));
  }
  // whole word
  if (main.length) check(mode + ": whole word ok", (await mv(ps[0], { w: main[0] })).ok);
  const exp0 = mine.reduce((t, w) => t + WM.points(w, letters.length), 0) + (main.length ? 13 : 0);
  check(mode + ": live score", V(ps[0]).me.score === exp0, V(ps[0]).me.score + " vs " + exp0);
  const t0 = Date.now();
  if (mode === "solo" || mode === "duel") for (const p of ps) await mv(p, { act: "stop" });
  const ok = await until(() => ps[0].last.match.result, 100000);
  check(mode + ": finished" + (mode === "solo" || mode === "duel" ? " early on stop" : " at time"), ok, (Date.now() - t0) + "ms");
  const fv = V(ps[0]), res = ps[0].last.match.result;
  check(mode + ": possible count only at the end", fv.possible === subs.length);
  check(mode + ": reveal has lists, word, missed", fv.word === letters.split("").sort().join("") ? false : fv.word && fv.lists.length === n && fv.missed.length > 0);
  if (n > 1) {
    const solo0 = fv.lists[0].filter((x) => x.solo).map((x) => x.w);
    check(mode + ": unique bonus marks", solo0.length === 4 + (main.length ? 1 : 0) && fv.scores[0] === exp0 + solo0.length, JSON.stringify(solo0) + " " + fv.scores[0]);
  } else check("solo: score in result", res.score === exp0 && fv.scores[0] === exp0, JSON.stringify(res));
  check(mode + ": places", n === 1 ? res.places === null || res.places.filter(Boolean).length === 1 : true, JSON.stringify(res));
  console.log("   ", res.text, "| word:", fv.word, "| missed:", fv.missed.slice(0, 5).join(" "));
  all.forEach((p) => p.disconnect());
}
// casual: no clock, ends when everyone's done (or the host ends it); bad option values fall back to the default
async function casual(n) {
  const { ps, tv, all } = await setup(n, "wordmine", { timer: false });
  await until(() => V(ps[0]).phase === "play", 5000);
  const v = V(ps[0]);
  check(n + " casual: no clock", v.timed === false && v.endAt === null && (!tv || (TV(tv).timed === false && TV(tv).endAt === null)) && v.possible === null);
  const subs = W.inside(v.letters.join("").toLowerCase()).filter((w) => w.length < v.letters.length);
  for (let s = 0; s < n; s++) check(n + " casual: s" + s + " word", (await mv(ps[s], { w: subs[s] })).ok);
  if (n > 1) {
    const no = await mv(ps[n - 1], { act: "end" }); check(n + " casual: non-host can't end it", !no.ok, no.error);
  }
  for (let s = 0; s < n - 1; s++) await mv(ps[s], { act: "stop" });
  await wait(400);
  check(n + " casual: still digging until the last one's done", n === 1 || (V(ps[0]).phase === "play" && !ps[0].last.match.result));
  await mv(ps[n - 1], { act: "stop" });
  const ok = await until(() => ps[0].last.match.result, 3000);
  const res = ps[0].last.match.result;
  check(n + " casual: ends when everyone's done, no personal best", ok && res.score === undefined && V(ps[0]).possible > 0, JSON.stringify(res));
  ps[0].emit("duel:rematch");
  await until(() => !ps[0].last.match.result && V(ps[0]).phase === "play", 8000);
  check(n + " casual: rematch keeps the option", V(ps[0]).timed === false && V(ps[0]).endAt === null);
  if (n > 1) {
    const e = await mv(ps[0], { act: "end" }); check(n + " casual: host ends it", e.ok && (await until(() => ps[0].last.match.result, 3000)), e.error);
  }
  all.forEach((p) => p.disconnect());
  const b = await setup("solo", "wordmine", { timer: "nope", x: 1 });
  await until(() => V(b.ps[0]).phase === "play", 5000);
  check("bad option value falls back to timed", V(b.ps[0]).timed === true && V(b.ps[0]).endAt > Date.now());
  b.all.forEach((p) => p.disconnect());
}
(async () => {
  if (process.argv[2] === "casual") { await casual(Number(process.argv[3] || 3)); console.log(T.fails ? T.fails + " FAILED" : "ALL PASS"); process.exit(0); }
  await play(process.argv[2] === "duel" ? "duel" : process.argv[2] === "solo" ? "solo" : 4);
  console.log(T.fails ? T.fails + " FAILED" : "ALL PASS");
  process.exit(0);
})();
