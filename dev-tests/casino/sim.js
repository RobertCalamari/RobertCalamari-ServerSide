// Last Call Casino offline: whole nights with bots on a fake clock. Checks nothing crashes, chips never go negative,
// hands always settle, the shop/resolve/pause flow works, and measures when the big drinks become affordable.
const path = require("path");
const G = require(path.join(__dirname, "../../games/duels/games/casino"));
const { GAMES } = require(path.join(__dirname, "../../games/duels/casino/games"));
let fails = 0;
const ok = (c, m) => {
    if (!c) {
        fails++;
        console.log("FAIL", m);
    }
};
function night(seed, n, style) {
    let a = seed;
    const rng = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let now = 1e12;
    const timers = [];
    const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
    const host = { ...ctx, host: true };
    const st = G.init({ ctx, players: n });
    const mv = (s, p, c = ctx) => G.move(st, s, p, c);
    const cfg = { rounds: 8, play: 120, shop: 30, resolve: 20, spin: 20 };
    ok(!!mv(1 % n, { act: "begin", cfg }).error || n === 1, "only host begins");
    ok(!!mv(0, { act: "begin", cfg: { ...cfg, spin: 2 } }, host).error, "timer limits are checked");
    mv(0, { act: "begin", cfg }, host);
    ok(st.cfg.play === 120 && st.phase === "play", "host settings applied");
    const firstAfford = { finish: null, shot: null };
    const stats = { bets: 0, hands: 0, buys: 0, broke: 0, blocks: 0, pauses: 0, errors: 0 };
    const sel = (g) => ({
        dice: { dir: rng() < 0.5 ? "over" : "under", at: 5 + Math.floor(rng() * 90) },
        limbo: [1.5, 2, 3, 5, 10, 50][Math.floor(rng() * 6)],
        roulette: rng() < 0.2 ? { t: "n", n: Math.floor(rng() * 37) } : { t: ["red", "black", "odd", "even", "d1", "d2", "d3", "low", "high"][Math.floor(rng() * 9)] },
        baccarat: ["p", "b", "t"][Math.floor(rng() * 3)],
        plinko: ["low", "med", "high"][Math.floor(rng() * 3)],
        wheel: true, slots: true,
        horses: Math.floor(rng() * 6),
        craps: ["pass", "dont", "field"][Math.floor(rng() * 3)],
        crash: rng() < 0.5 ? 0 : [1.5, 2, 3][Math.floor(rng() * 3)],
        mines: [1, 3, 5, 10][Math.floor(rng() * 4)],
        hilo: true, blackjack: true, poker: true,
    })[g];
    let guard = 0;
    while (st.phase !== "done" && guard++ < 20000) {
        if (st.phase === "play") {
            for (let s = 0; s < n; s++) {
                if (rng() < 0.55) continue; // people bet every few seconds, not every tick
                if (st.paused[s]) {
                    if (rng() < 0.3) mv(s, { act: "unpause" });
                    stats.pauses++;
                    continue;
                }
                const ct = st.tables.crash;
                if (ct && ct.phase === "run" && ct.bets[s] && ct.cashed[s] === undefined && now > ct.startAt && rng() < 0.4) {
                    if (mv(s, { act: "hand", m: "cash" }).ok) stats.hands++;
                    continue;
                }
                const riding = Object.values(st.tables).some((t) => t.bets && t.bets[s]);
                if (st.chips[s] < 5 && !st.sess[s] && !riding) {
                    mv(s, { act: "rebuy" });
                    stats.broke++;
                    continue;
                }
                if (st.sess[s]) {
                    const x = st.sess[s];
                    const m = x.g === "mines" ? (rng() < 0.3 ? { m: "cash" } : { m: "tile", i: Math.floor(rng() * 25) }) : x.g === "hilo" ? (rng() < 0.3 ? { m: "cash" } : { m: rng() < 0.5 ? "hi" : "lo" }) : x.g === "blackjack" ? { m: ["hit", "stand", "double"][Math.floor(rng() * 3)] } : { m: rng() < 0.7 ? "play" : "fold" };
                    mv(s, { act: "hand", ...m });
                    stats.hands++;
                    continue;
                }
                const at = st.at[s];
                if (at && st.tables[at] && st.tables[at].bets && st.tables[at].bets[s]) continue; // waiting on the spin
                if (!st.at[s] || rng() < 0.15) mv(s, { act: "sit", g: st.open[Math.floor(rng() * st.open.length)] });
                const g = st.at[s];
                if (!g) continue;
                const frac = style === "bold" ? 0.25 : 0.1;
                const amount = Math.max(5, Math.floor(st.chips[s] * frac * (0.5 + rng())));
                const r = mv(s, { act: "bet", amount, sel: sel(g) });
                if (r.ok) stats.bets++;
                else stats.errors++;
            }
            ok(st.chips.every((c) => c >= 0 && Number.isInteger(c)), "chips stay whole and >= 0: " + st.chips);
            now += 3000;
        } else if (st.phase === "shop") {
            for (let s = 0; s < n; s++) {
                if (firstAfford.finish === null && st.chips[s] >= 200) firstAfford.finish = st.round + 1;
                if (firstAfford.shot === null && st.chips[s] >= 300) firstAfford.shot = st.round + 1;
                const wants = ["sip", "gulp", "table", "finish", "shot"].concat(st.specials[s]);
                const id = wants[Math.floor(rng() * wants.length)];
                const r = mv(s, { act: "buy", item: id, to: (s + 1) % n });
                if (r.ok) stats.buys++;
                mv(s, { act: "unpause" });
                mv(s, { act: "ready" });
            }
            now += 1000;
        } else if (st.phase === "resolve") {
            st.resolved.forEach((e) => e.to !== null && st.inv[e.to] && st.inv[e.to].dd > 0 && mv(e.to, { act: "block", id: e.id }).ok && stats.blocks++);
            for (let s = 0; s < n; s++) mv(s, { act: "ready" });
            now += 2000;
        }
        timers.sort((x, y) => x.t - y.t);
        while (timers.length && timers[0].t <= now) timers.shift().fn(now);
        JSON.stringify(G.view(st, 0));
        JSON.stringify(G.tv(st));
    }
    ok(st.phase === "done", "night " + seed + " finished");
    stats.spins = Object.values(st.tables).reduce((a, t) => a + (t.spins || 0), 0);
    ok(st.sess.every((x) => !x), "no hand left open");
    const res = G.result(st);
    ok(res && res.places.length === n, "result");
    return { ...stats, ...firstAfford, chips: st.chips.join("/"), owed: st.owed.join("/"), shots: st.shots.join("/") };
}
const rows = [];
for (let i = 0; i < 60; i++) rows.push(night(500 + i, 2 + (i % 7), i % 2 ? "bold" : "careful"));
rows.slice(0, 6).forEach((r) => console.log(JSON.stringify(r)));
const when = (k) => {
    const v = rows.map((r) => r[k]).filter((x) => x !== null);
    return v.length ? "median round " + v.sort((a, b) => a - b)[Math.floor(v.length / 2)] + ", earliest " + Math.min(...v) + ", never in " + (rows.length - v.length) + "/" + rows.length : "never";
};
console.log("first can afford Drown 'Em (200):", when("finish"));
console.log("first can afford Shot Caller (300):", when("shot"));
console.log(fails ? fails + " FAILED" : "ALL PASS");
process.exit(fails ? 1 : 0);
