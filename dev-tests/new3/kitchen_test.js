// Space Kitchen over sockets: a planner bot drives every phone through all three shifts; invalid moves checked.
const { wait, check, until, room, mv, V, T, done } = require("./lib");
const KINDS = {
  noodles: { src: "fridge", chop: false, cook: true }, star: { src: "fridge", chop: true, cook: false }, comet: { src: "fridge", chop: true, cook: true },
  cheese: { src: "fridge", chop: true, cook: false }, rice: { src: "pantry", chop: false, cook: true }, sauce: { src: "pantry", chop: false, cook: false }, bun: { src: "pantry", chop: false, cook: false },
};
const n = Number(process.argv[2] || 2);
const sloppy = process.argv[3] === "sloppy";
const owner = (v, st) => v.jobs.findIndex((j) => j.includes(st));
const ready = (it) => !it.burnt && (!KINDS[it.k].chop || it.chopped) && (!KINDS[it.k].cook || it.cooked);

async function tick(ps, v) {
  const P = owner(v, "plate");
  const S = owner(v, "serve");
  const acts = [];
  const plates = v.bench[P].filter((i) => i.k === "plate");
  // serve finished plates
  for (const [s, b] of v.bench.entries()) for (const it of b) {
    if (it.k !== "plate" || !it.parts.length) continue;
    const match = v.orders.some((o) => o.parts.slice().sort().join() === it.parts.slice().sort().join());
    if (match) acts.push(s === S ? [s, { act: "serve", id: it.id }] : [s, { act: "pass", id: it.id, to: S }]);
  }
  const target = v.orders[0];
  if (!target) return acts;
  const plate = plates.find((p) => p.parts.every((k) => target.parts.includes(k)) && p.parts.length < target.parts.length);
  if (!plate && plates.length < 2) acts.push([P, { act: "plate" }]);
  const have = (plate ? plate.parts.slice() : []);
  const loose = [];
  v.bench.forEach((b, s) => b.forEach((it) => it.k !== "plate" && loose.push({ it, s })));
  v.burners.forEach((b) => b && loose.push({ it: b.item, s: -1 }));
  const need = target.parts.slice();
  for (const k of have) need.splice(need.indexOf(k), 1);
  for (const { it } of loose) { const i = need.indexOf(it.k); if (i >= 0 && !it.burnt) need.splice(i, 1); }
  for (const k of need) acts.push([owner(v, KINDS[k].src), { act: "take", k }]);
  for (const { it, s } of loose) {
    if (s < 0) continue;
    const K = KINDS[it.k];
    if (it.burnt || !target.parts.includes(it.k)) { acts.push([s, { act: "bin", id: it.id }]); continue; }
    let st = K.chop && !it.chopped ? "chop" : K.cook && !it.cooked ? "stove" : "plate";
    const o = owner(v, st);
    if (o !== s) acts.push([s, { act: "pass", id: it.id, to: o }]);
    else if (st === "chop") acts.push([s, { act: "chop", id: it.id }]);
    else if (st === "stove") acts.push([s, { act: "cook", id: it.id }]);
    else if (plate) acts.push([s, { act: "add", id: it.id, plate: plate.id }]);
  }
  v.burners.forEach((b, i) => b && Date.now() - b.at > v.cookMs + 200 && acts.push([owner(v, "stove"), { act: "lift", b: i }]));
  return acts;
}

(async () => {
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "spacekitchen" });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "spacekitchen"));
  let v = V(ps[0]);
  check(n + "p: brief phase, every station covered", v.phase === "brief" && ["fridge", "pantry", "chop", "stove", "plate", "serve"].every((st) => v.jobs.filter((j) => j.includes(st)).length === 1) && v.jobs.length === n);
  check("move during brief refused", !(await mv(ps[0], { act: "take", k: "star" })).ok);
  check("tv has kitchen", T(tv) && T(tv).jobs.length === n);
  await until(() => V(ps[0]).phase === "cook", 10000);
  v = V(ps[0]);
  const F = owner(v, "fridge");
  const C = owner(v, "chop");
  const notF = (F + 1) % n;
  check("first order arrives", v.orders.length === 1);
  check("take from a station you don't run refused", !v.jobs[notF].includes("fridge") && !(await mv(ps[notF], { act: "take", k: "star" })).ok);
  check("bad ingredient refused", !(await mv(ps[F], { act: "take", k: "gold" })).ok && !(await mv(ps[F], { act: "take" })).ok);
  check("take ok", (await mv(ps[F], { act: "take", k: "noodles" })).ok);
  await wait(80);
  let it = V(ps[0]).bench[F].slice(-1)[0];
  check("pass to yourself refused", !(await mv(ps[F], { act: "pass", id: it.id, to: F })).ok);
  check("pass out of range refused", !(await mv(ps[F], { act: "pass", id: it.id, to: n })).ok && !(await mv(ps[F], { act: "pass", id: it.id, to: "1" })).ok);
  check("pass someone else's item refused", !(await mv(ps[notF], { act: "pass", id: it.id, to: F })).ok);
  if (F === C) check("chop noodles refused", !(await mv(ps[F], { act: "chop", id: it.id })).ok);
  else {
    check("pass ok", (await mv(ps[F], { act: "pass", id: it.id, to: C })).ok);
    check("chop noodles refused", !(await mv(ps[C], { act: "chop", id: it.id })).ok);
    await mv(ps[C], { act: "bin", id: it.id });
  }
  if (F === C) await mv(ps[F], { act: "bin", id: it.id });
  for (let i = 0; i < 5; i++) await mv(ps[F], { act: "take", k: "star" });
  check("full counter refused", !(await mv(ps[F], { act: "take", k: "star" })).ok);
  await wait(80);
  for (const x of V(ps[0]).bench[F]) await mv(ps[F], { act: "bin", id: x.id });
  check("serve with nothing refused", !(await mv(ps[owner(v, "serve")], { act: "serve", id: 999 })).ok);
  // play
  const t0 = Date.now();
  let lastShift = 0;
  while (!ps[0].last.match.result && Date.now() - t0 < 400000) {
    v = V(ps[0]);
    if (v.shift !== lastShift) { console.log("shift", lastShift, "stars", v.stars, "score", v.score, "served", v.served, "missed", v.missed); lastShift = v.shift; }
    if (v.phase === "cook") {
      const acts = await tick(ps, v);
      const seen = new Set();
      await Promise.all(acts.filter(([s]) => (seen.has(s) ? false : seen.add(s))).map(([s, a]) => mv(ps[s], a)));
    }
    await wait(sloppy ? 900 : 250);
  }
  v = V(ps[0]);
  const res = ps[0].last.match.result;
  console.log("final stars", v.stars, "score", v.score, "served", v.served, "missed", v.missed);
  check(n + "p: finished co-op, all first", res && res.places.every((p) => p === 1) && /stars/.test(res.text), res && res.text);
  check("tv events", T(tv).events.length > 0);
  for (const p of [...ps, tv]) p.close();
  done();
})();
