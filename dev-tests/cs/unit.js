// Direct module checks: slot cap at 10, slot costs, counter options.
const G = require("C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/games/cardshop.js");
let now = 1e12; const timers = [];
const ctx = { rng: Math.random, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
const st = G.init({ rng: Math.random, ctx, players: 3 });
st.cash[0] = 5000;
const costs = [];
let r;
while ((r = G.move(st, 0, { act: "up", key: "slot" }, ctx)).ok) costs.push(5000 - st.cash[0] - costs.reduce((a, b) => a + b, 0));
const ok = (l, c) => { console.log((c ? "PASS " : "FAIL ") + l); if (!c) process.exitCode = 1; };
ok("slots cap at 10, costs 50/90/140/200/270: " + JSON.stringify(costs), st.slots[0] === 10 && st.disp[0].length === 10 && JSON.stringify(costs) === "[50,90,140,200,270]" && /can't/.test(r.error));
ok("view says slot maxed", G.view(st, 0).me.costs.slot === null && G.tv(st).booths[0].slots === 10);
