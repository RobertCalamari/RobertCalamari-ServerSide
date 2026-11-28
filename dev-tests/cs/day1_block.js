  // invalid moves (none of these cost an action)
  const cheap = v.stock[0];
  check(tag, "2 actions to start, none used", v.me.acts === 2 && T(tv).acts.every((x) => x === 0));
  check(tag, "rip without a pack refused", !(await mv(ps[0], { act: "rip", p: cheap.p })).ok);
  check(tag, "bad pack refused", !(await mv(ps[0], { act: "pack", p: 99 })).ok && !(await mv(ps[0], { act: "pack", p: "0" })).ok && !(await mv(ps[0], { act: "pack", p: cheap.p, n: 4 })).ok && !(await mv(ps[0], { act: "pack", p: cheap.p, n: 0 })).ok);
  const notOffered = v.sets.findIndex((s, i) => s.on && !v.stock.some((x) => x.p === i));
  if (notOffered >= 0) check(tag, "set not stocked today refused", !(await mv(ps[0], { act: "pack", p: notOffered })).ok);
  check(tag, "slot with unowned card refused", !(await mv(ps[0], { act: "slot", i: 0, k: 2, pct: 100 })).ok);
  check(tag, "list unowned refused", !(await mv(ps[0], { act: "list", k: 2, price: 5 })).ok);
  check(tag, "fishing refused when you can afford a pack", !(await mv(ps[0], { act: "fish", start: true })).ok);
  check(tag, "client can't claim a catch", !(await mv(ps[0], { act: "fish", progress: 1, kind: "golden" })).ok);
  check(tag, "offer outside selling refused", !(await mv(ps[0], { act: "offer", id: 1, yes: true })).ok);
  check(tag, "unknown upgrade refused", !(await mv(ps[0], { act: "up", key: "rocket" })).ok && !(await mv(ps[0], { act: "up", key: "gun" })).ok);
  await wait(120);
  check(tag, "refused moves cost no actions", V(ps[0]).me.acts === 2);
  // P0: one action = a 3-pack bundle, ripping is free, the second action lists a card
  const b3 = await mv(ps[0], { act: "pack", p: cheap.p, n: 3 });
  await wait(150);
  v = V(ps[0]);
  check(tag, "bundle: 3 packs for one action at the posted price", b3.ok && v.me.packs[cheap.p] === 3 && v.me.acts === 1 && Math.abs(v.me.cash - (300 - 3 * cheap.price)) < 0.02 && T(tv).acts[0] === 1, "cash " + v.me.cash);
  const r1 = await mv(ps[0], { act: "rip", p: cheap.p });
  await wait(150);
  v = V(ps[0]);
  const cards = v.me.own.reduce((t, o) => t + o[1], 0);
  check(tag, "rip gives 5 cards, costs no action", r1.ok && cards === 5 && v.me.rips.length === 1 && v.me.rips[0].keys.length === 5 && v.me.packs[cheap.p] === 2 && v.me.acts === 1);
  check(tag, "every pack has a Rare or better", v.me.rips[0].keys.some((k) => v.cat[k >> 1].r >= 2));
  check(tag, "rip is private (not in tv / others' view)", !JSON.stringify(T(tv)).includes('"rips"') && V(ps[1]).me.rips.length === 0);
  check(tag, "card info sent for own cards", v.me.own.every(([k]) => v.cat[k >> 1] && v.cat[k >> 1].n && v.cat[k >> 1].id));
  const best = v.me.own.slice().sort((a, b) => b[0] - a[0])[0][0];
  const lr = await mv(ps[0], { act: "list", k: best, price: 1 });
  await wait(120);
  const lid = V(ps[0]).listings.find((l) => l.seat === 0).id;
  check(tag, "listing costs an action + is public", lr.ok && V(ps[0]).me.acts === 0 && V(ps[1]).listings.some((l) => l.id === lid) && T(tv).listings.some((l) => l.id === lid));
  const oo = await mv(ps[0], { act: "pack", p: v.stock[1].p, n: 1 });
  check(tag, "out of actions: refused with tomorrow's count", !oo.ok && /^Out of actions\. Tomorrow you get [2-5]\.$/.test(oo.error || ""), oo.error);
  check(tag, "out of actions: upgrade + list refused, rip/slot/unlist still free", !(await mv(ps[0], { act: "up", key: "lights" })).ok && (await mv(ps[0], { act: "rip", p: cheap.p })).ok && (await mv(ps[0], { act: "slot", i: 0, k: V(ps[0]).me.own[0][0], pct: 120 })).ok);
  check(tag, "can't buy own listing", !(await mv(ps[0], { act: "take", id: lid })).ok);
  // P1: extra slot (action), then helps buy out the cheap set
  check(tag, "slot 6 doesn't exist yet", !(await mv(ps[1], { act: "slot", i: 5, clear: true })).ok);
  const su = await mv(ps[1], { act: "up", key: "slot" });
  await wait(120);
  check(tag, "extra slot: 6 slots, $50 paid, next costs $90, one action", su.ok && V(ps[1]).me.slots === 6 && V(ps[1]).me.disp.length === 6 && V(ps[1]).me.cash === 250 && V(ps[1]).me.costs.slot === 90 && V(ps[1]).me.acts === 1);
  check(tag, "booths show slot counts", T(tv).booths[1].slots === 6 && T(tv).booths[0].slots === 5);
  for (const p of ps.slice(1)) {
    const left = V(p).stock[0].q;
    if (left > 0 && V(p).me.acts > 0) await mv(p, { act: "pack", p: cheap.p, n: Math.min(3, left) });
    await wait(60);
  }
  await wait(150);
  v = V(ps[0]);
  check(tag, "set sold out", v.stock[0].q === 0, "left " + v.stock[0].q);
  const so = await mv(ps[0], { act: "pack", p: cheap.p, n: 1 });
  check(tag, "sold-out pack refused", !so.ok && /sold out/i.test(so.error || ""), so.error);
  // overspend: a bundle that costs more than you have
  const pricey = V(ps[0]).stock.find((x) => x.q > 0 && x.price * Math.min(3, x.q) > V(ps[0]).me.cash);
  if (pricey) {
    const os = await mv(ps[0], { act: "pack", p: pricey.p, n: Math.min(3, pricey.q) });
    check(tag, "overspending refused", !os.ok && os.error === "Not enough cash.", os.error);
  } else check(tag, "(no bundle pricier than cash today)", true);
  // singles: someone with an action buys one, nobody else can
  const buyer = ps.findIndex((p) => V(p).me.acts > 0);
  const si = buyer >= 0 ? V(ps[buyer]).singles.findIndex((x) => x.price <= V(ps[buyer]).me.cash) : -1;
  if (si >= 0) {
    check(tag, "single bought (one action)", (await mv(ps[buyer], { act: "single", i: si })).ok);
    const again = await mv(ps[buyer === 0 ? 1 : 0], { act: "single", i: si });
    check(tag, "single double-buy refused", !again.ok && /already/.test(again.error || ""), again.error);
  } else check(tag, "(no one left with an action for singles)", true);
  // the listing race: at most one taker wins, and only with an action
  const races = await Promise.all(ps.slice(1).map((p) => mv(p, { act: "take", id: lid })));
  check(tag, "listing sells at most once", races.filter((r) => r.ok).length <= 1 && !(await mv(ps[n - 1], { act: "take", id: lid })).ok, JSON.stringify(races.map((r) => r.ok || r.error)));
  await wait(150);
  check(tag, "actions never negative, tv shows used", ps.every((p) => V(p).me.acts >= 0) && T(tv).acts.every((x, s) => x === 2 - V(ps[s]).me.acts || (s === 1 && x <= 2)));
