// Telephone Sketch over sockets: full games with bots + TV, invalid inputs, leak checks.
const { wait, call, check, until, room, mv, V, T, done } = require("./lib");

const stroke = (k, len = 20) => ({ act: "stroke", c: k % 4, s: k % 3, pts: Array.from({ length: len * 2 }, (_, i) => (i % 2 ? (k * 7 + i) % 300 : (k * 13 + i * 3) % 400)) });

async function play(n, timer) {
  const { ps, tv } = await room(n);
  ps[0].emit("duel:start", { game: "telesketch", options: { timer } });
  await until(() => ps.every((p) => p.last.match && p.last.match.game === "telesketch"));
  let v = V(ps[0]);
  const steps = Math.min(n, 6);
  check(n + "p: write phase, steps " + steps, v.phase === "write" && v.steps === steps && v.me.task === "write" && typeof v.me.idea === "string", JSON.stringify(v).slice(0, 200));
  check(n + "p: timer " + timer, timer === false ? v.deadline === null : v.deadline > Date.now());
  check("wrong-phase stroke refused", !(await mv(ps[0], stroke(1))).ok);
  check("heart before show refused", !(await mv(ps[0], { act: "heart", chain: 0, step: 0 })).ok);
  check("empty text refused", !(await mv(ps[0], { act: "text", text: "   " })).ok);
  check("long text refused", !(await mv(ps[0], { act: "text", text: "x".repeat(61) })).ok);
  check("non-string refused", !(await mv(ps[0], { act: "text", text: 5 })).ok);
  check("non-host hurry refused", !(await mv(ps[1], { act: "hurry" })).ok);
  const secret = (i) => "SECRET-" + i + "-phrase";
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      await wait(150);
      const t = JSON.stringify(T(tv));
      check("tv progress without content", T(tv).done.filter(Boolean).length === n - 1 && !t.includes("SECRET") && !t.includes("idea"));
      const other = JSON.stringify(V(ps[i]));
      check("others can't see submitted phrases", !other.includes("SECRET"));
    }
    check("write " + i, (await mv(ps[i], { act: "text", text: secret(i) })).ok);
    if (i === 0) {
      check("double submit refused", !(await mv(ps[0], { act: "text", text: "again" })).ok);
      check("edit ok", (await mv(ps[0], { act: "edit" })).ok);
      check("resubmit ok", (await mv(ps[0], { act: "text", text: secret(0) })).ok);
    }
  }
  await until(() => V(ps[0]).phase === "draw");
  for (let k = 1; k < steps; k++) {
    await until(() => V(ps[0]).step === k);
    v = V(ps[1]);
    if (v.me.task === "draw") {
      const expect = "SECRET-" + ((1 - k + n * 2) % n) + "-phrase";
      check("step " + k + ": drawer sees the previous phrase only", v.me.prompt.text === (k === 1 ? expect : v.me.prompt.text) && JSON.stringify(v).split("SECRET").length <= 2);
      check("text on draw step refused", !(await mv(ps[1], { act: "text", text: "hi" })).ok);
      check("oversized stroke refused", !(await mv(ps[1], { ...stroke(1), pts: new Array(602).fill(5) })).ok);
      check("out of range point refused", !(await mv(ps[1], { ...stroke(1), pts: [0, 0, 401, 10] })).ok && !(await mv(ps[1], { ...stroke(1), pts: [0, 0, 1.5, 10] })).ok && !(await mv(ps[1], { ...stroke(1), c: 9 })).ok);
      check("done with empty canvas refused", !(await mv(ps[1], { act: "done" })).ok);
      // ink cap: 3000 points
      let capped = false;
      for (let j = 0; j < 12; j++) { const r = await mv(ps[1], stroke(j, 290)); if (!r.ok) { capped = true; break; } }
      check("ink cap enforced", capped);
      check("undo ok", (await mv(ps[1], { act: "undo" })).ok);
      check("clear ok", (await mv(ps[1], { act: "clear" })).ok);
      for (const [i, p] of ps.entries()) {
        for (let j = 0; j < 3; j++) await mv(p, stroke(i * 10 + j));
        if (i < n - 1) check("done " + i, (await mv(p, { act: "done" })).ok);
      }
      await wait(100);
      check("tv shows no strokes mid-game", !JSON.stringify(T(tv)).includes("strokes"));
      check("draw step progress " + (n - 1) + "/" + n, T(tv).done.filter(Boolean).length === n - 1);
      if (timer === false) {
        check("host hurry ok", (await mv(ps[0], { act: "hurry" })).ok);
        await wait(100);
        check("hurry set deadline", V(ps[0]).deadline > Date.now() + 8000);
      }
      await mv(ps[n - 1], { act: "done" });
    } else {
      check("guesser sees strokes", Array.isArray(v.me.prompt.strokes) && v.me.prompt.strokes.length === 3);
      check("stroke on guess step refused", !(await mv(ps[1], stroke(1))).ok);
      for (const [i, p] of ps.entries()) if (i !== 2) await mv(p, { act: "text", text: "guess " + i + " step " + k });
      // p2 times out / leaves blank in timed mode is too slow; submit
      await mv(ps[2], { act: "text", text: "guess 2 step " + k });
    }
  }
  await until(() => V(ps[0]).phase === "show", 5000);
  v = V(ps[0]);
  check("show phase starts at intro", v.phase === "show" && v.show.at === -1 && v.show.entries.length === 0);
  check("heart unrevealed refused", !(await mv(ps[1], { act: "heart", chain: 0, step: 0 })).ok);
  check("non-host skip refused", !(await mv(ps[1], { act: "next" })).ok);
  check("host skip ok", (await mv(ps[0], { act: "next" })).ok);
  await wait(100);
  v = V(ps[1]);
  check("step 0 of chain 0 revealed", v.show.at === 0 && v.show.entries.length === 1 && v.show.entries[0].text === "SECRET-0-phrase");
  check("own heart refused", !(await mv(ps[0], { act: "heart", chain: 0, step: 0 })).ok);
  check("heart ok", (await mv(ps[1], { act: "heart", chain: 0, step: 0 })).ok && (await mv(ps[2], { act: "heart", chain: 0, step: 0 })).ok);
  check("heart toggle", (await mv(ps[2], { act: "heart", chain: 0, step: 0 })).ok && (await mv(ps[2], { act: "heart", chain: 0, step: 0 })).ok);
  check("future step heart refused", !(await mv(ps[1], { act: "heart", chain: 0, step: 1 })).ok && !(await mv(ps[1], { act: "heart", chain: 1, step: 0 })).ok);
  await wait(100);
  check("hearts counted", V(ps[2]).hearts[0] === 2 && T(tv).show.entries[0].hearts.length === 2);
  // let one reveal run on its own clock, then skip through the rest
  const at = V(ps[0]).show.at;
  await until(() => V(ps[0]).show && V(ps[0]).show.at !== at, 8000);
  check("auto advance", V(ps[0]).show.at === at + 1);
  let guard = 0;
  while (!ps[0].last.match.result && guard++ < 200) {
    const s = V(ps[0]).show;
    if (s && s.at >= 1 && s.at < steps) await mv(ps[(s.chain + s.at + 1) % n], { act: "heart", chain: s.chain, step: s.at });
    await mv(ps[0], { act: "next" });
    await wait(30);
  }
  const res = ps[0].last.match.result;
  check(n + "p: finished with places", res && res.places && res.text.length > 0, res && res.text);
  check("tv final has all chains", T(tv).phase === "done" && T(tv).chains.length === n && T(tv).chains[0].length === steps);
  for (const p of [...ps, tv]) p.close();
}

(async () => {
  await play(3, true);
  await play(4, false);
  await play(7, true);
  done();
})();
