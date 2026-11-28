// Drink or Drown rule checks: several cards at once from one payment, host undo, the game ending the moment someone
// reaches the goal (also from a Wait card), and the counter window waiting for someone picking a counter.
const path = require("path");
const G = require(path.join(__dirname, "../../games/duels/games/drinkdrown"));
const { CARDS } = require(path.join(__dirname, "../../games/duels/drinkdrown/cards"));
let fails = 0;
const ok = (c, m) => {
    console.log((c ? "PASS " : "FAIL ") + m);
    if (!c) fails++;
};
let now = 1e12;
const timers = [];
const ctx = { rng: Math.random, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
const host = { ...ctx, host: true };
const run = (ms) => {
    now += ms;
    timers.sort((a, b) => a.t - b.t);
    while (timers.length && timers[0].t <= now) timers.shift().fn(now);
};
const find = (f) => CARDS.filter(f).map((c) => c.id);
const plain = find((c) => c.t === "action" && c.who === "everyone" && !c.fx && !c.pot);
const anyone = find((c) => c.t === "action" && c.who === "anyone" && !c.n && !c.fx && !c.share);
const nums = (v) => find((c) => c.t === "number" && c.v === v);
const fresh = (n = 3) => {
    const st = G.init({ rng: Math.random, ctx, players: n });
    G.move(st, 0, { act: "begin", goal: 25 }, host);
    return st;
};
const passAll = (st) => {
    for (let s = 0; s < st.n; s++) G.move(st, s, { act: "pass" }, ctx);
};

// several cards at once
{
    const st = fresh();
    const a = plain.find((id) => CARDS[id].v === 2);
    const b = anyone.find((id) => CARDS[id].v === 3);
    const [n4, n1] = [nums(4)[0], nums(1)[0]];
    st.hands[0] = [a, b, n4, n1];
    ok(!!G.move(st, 0, { act: "play", ids: [a, b], pay: [n4], targets: { [b]: [1] } }, ctx).error, "two cards (2+3) can't be paid with a 4");
    const r = G.move(st, 0, { act: "play", ids: [a, b], pay: [n4, n1], targets: { [b]: [1] } }, ctx);
    ok(r.ok && st.hands[0].length === 0, "two cards paid together with 4+1");
    ok(st.pending.card.id === a && st.queue.length === 1, "first card is up, second waits");
    passAll(st);
    G.move(st, 0, { act: "done" }, ctx);
    ok(st.phase === "react" && st.pending.card.id === b && st.pending.targets[0] === 1, "second card comes up on its own with its target");
    passAll(st);
    G.move(st, 0, { act: "done" }, ctx);
    ok(st.phase === "turn" && G.view(st, 0).points[0] === 5, "both scored, back to the turn (5 points)");
}
// a counter on the first card doesn't eat the second
{
    const st = fresh();
    const a = plain.find((id) => CARDS[id].v === 2);
    const b = plain.find((id) => CARDS[id].v === 1);
    const cancel = find((c) => c.t === "counter" && c.k === "cancel")[0];
    st.hands[0] = [a, b, nums(3)[0]];
    st.hands[1] = [cancel, nums(2)[0]];
    G.move(st, 0, { act: "play", ids: [a, b], pay: [nums(3)[0]] }, ctx);
    G.move(st, 1, { act: "counter", id: cancel, pay: [nums(2)[0]] }, ctx);
    ok(st.phase === "react" && st.pending.card.id === b, "first card cancelled, second still comes up");
}
// host undo
{
    const st = fresh();
    const a = plain.find((id) => CARDS[id].v === 2);
    const n2 = nums(2)[0];
    st.hands[0] = [a, n2];
    G.move(st, 0, { act: "play", id: a, pay: [n2] }, ctx);
    passAll(st);
    G.move(st, 0, { act: "done" }, ctx);
    ok(G.view(st, 0).points[0] === 2 && G.view(st, 0).undo, "scored 2, undo offered: " + G.view(st, 0).undo);
    ok(!!G.move(st, 1, { act: "undo" }, ctx).error, "only the host can undo");
    G.move(st, 0, { act: "undo" }, host);
    ok(st.phase === "resolve" && G.view(st, 0).points[0] === 0, "undo puts the card back to before it was done");
    G.move(st, 0, { act: "undo" }, host);
    ok(st.phase === "turn" && st.hands[0].includes(a) && st.hands[0].includes(n2), "undo again: card and payment back in hand");
    const before = timers.length;
    run(20000);
    ok(st.phase === "turn", "old counter timers don't fire after an undo");
}
// undo during a counter window keeps the window working
{
    const st = fresh();
    const a = plain.find((id) => CARDS[id].v === 1);
    st.hands[0] = [a, nums(1)[0]];
    st.hands[1] = [CARDS.find((c) => c.t === "wait").id];
    G.move(st, 0, { act: "play", id: a, pay: [nums(1)[0]] }, ctx);
    G.move(st, 1, { act: "claim", id: st.hands[1][0], by: 2 }, ctx);
    G.move(st, 1, { act: "undo" }, host);
    ok(st.phase === "react" && st.hands[1].length === 1, "claim undone mid-window, window still open");
    run(10000);
    ok(st.phase === "resolve", "the window still closes on time");
}
// the game ends the moment someone reaches the goal, even off their turn with a Wait card
{
    const st = fresh();
    const big = find((c) => c.t === "action" && c.v === 8)[0];
    st.scored[1] = [{ id: big, x: 2 }, { id: big, x: 1 }];
    const w = CARDS.find((c) => c.t === "wait" && c.v >= 2).id;
    st.hands[1] = [w];
    ok(st.phase === "turn" && st.turn === 0, "P2 has 24, it's P1's turn");
    G.move(st, 1, { act: "claim", id: w, by: 0 }, ctx);
    ok(st.phase === "done" && G.result(st).winner === 1, "P2 claims a Wait card, reaches 25+ and the game ends right away");
}
{
    const st = fresh();
    const big = find((c) => c.t === "action" && c.v === 8)[0];
    st.scored[1] = [{ id: big, x: 2 }, { id: big, x: 1 }];
    const a = plain.find((id) => CARDS[id].v === 1);
    st.hands[0] = [a, nums(1)[0]];
    const w = CARDS.find((c) => c.t === "wait" && c.v >= 2).id;
    st.hands[1] = [w];
    G.move(st, 0, { act: "play", id: a, pay: [nums(1)[0]] }, ctx);
    G.move(st, 1, { act: "claim", id: w, by: 0 }, ctx);
    ok(st.phase === "react", "reaching the goal mid-card waits for that card to finish");
    passAll(st);
    G.move(st, 0, { act: "done" }, ctx);
    ok(st.phase === "done", "then the game ends");
}
// counter window waits for someone choosing a counter
{
    const st = fresh();
    const a = plain.find((id) => CARDS[id].v === 1);
    st.hands[0] = [a, nums(1)[0]];
    G.move(st, 0, { act: "play", id: a, pay: [nums(1)[0]] }, ctx);
    G.move(st, 1, { act: "hold" }, ctx);
    run(12000);
    ok(st.phase === "react", "window still open 12s in while P2 picks a counter");
    run(15000);
    ok(st.phase === "resolve", "but it doesn't wait forever");
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
process.exit(fails ? 1 : 0);
