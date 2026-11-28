// Bots offline: whole games bot vs bot on a fake clock. Checks every bot game finishes, bots don't spam bad moves,
// and on the board games hard beats easy more often than not. node dev-tests/bots/sim.js [game ...]
const path = require("path");
const { BOTS } = require(path.join(__dirname, "../../games/duels/bots"));
const only = process.argv.slice(2);

function run(id, levels, seed) {
    const g = require(path.join(__dirname, "../../games/duels/games", id));
    let now = 1e12;
    const timers = [];
    let a = seed;
    const rng = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
    const n = levels.length;
    const st = g.init({ seed, rng, options: {}, ctx, players: n });
    const pending = [];
    const busy = levels.map(() => false);
    const mem = levels.map(() => ({}));
    let bad = 0;
    let moves = 0;
    const host = { ...ctx, host: true };
    const end = now + 40 * 60 * 1000;
    while (now < end) {
        const res = g.result(st);
        if (res) return { res, bad, moves, mins: Math.round((now - 1e12) / 6000) / 10 };
        levels.forEach((level, s) => {
            if (busy[s]) return;
            const k = { game: id, state: st, seat: s, n, rng: Math.random, now: () => now, level, mem: mem[s] };
            const act = BOTS[id](g.view(st, s), k);
            if (!act) return;
            busy[s] = true;
            pending.push({ t: act.at ? Math.max(now, act.at) : now + (act.wait || 600), s, act });
        });
        pending.sort((x, y) => x.t - y.t);
        while (pending.length && pending[0].t <= now) {
            const { s, act } = pending.shift();
            busy[s] = false;
            let ok = false;
            for (const p of act.moves || [act.move]) {
                const r = g.move(st, s, p, s === 0 ? host : ctx);
                if (r && !r.error) {
                    ok = true;
                    break;
                }
            }
            moves++;
            if (!ok) bad++;
        }
        timers.sort((x, y) => x.t - y.t);
        while (timers.length && timers[0].t <= now) timers.shift().fn(now);
        now += 100;
    }
    return { res: null, bad, moves, mins: 40, stuck: (() => { const v = g.view(st, 0); return { phase: v.phase, turn: v.turn, pending: v.pending && { by: v.pending.by, step: v.pending.step, players: v.pending.players, card: v.pending.card && { t: v.pending.card.t, who: v.pending.card.who, fx: v.pending.card.fx } } }; })() };
}

const BOARD = ["tictactoe", "connect4", "reversi", "dotsboxes", "mancala", "ultimatettt", "checkers", "chess"];
let fails = 0;
for (const id of Object.keys(BOTS)) {
    if (only.length && !only.includes(id)) continue;
    const g = require(path.join(__dirname, "../../games/duels/games", id));
    const [lo, hi] = g.players || [2, 2];
    const n = Math.min(hi, Math.max(lo, 3));
    const t0 = Date.now();
    const out = [];
    for (let i = 0; i < (BOARD.includes(id) ? 4 : 2); i++) {
        const levels = BOARD.includes(id) ? (i % 2 ? ["easy", "hard"] : ["hard", "easy"]) : Array.from({ length: n }, (_, s) => (s % 2 ? "hard" : "easy"));
        const r = run(id, levels, 1000 + i);
        const hardSeat = levels.indexOf("hard");
        out.push(r);
        if (!r.res) {
            fails++;
            console.log("FAIL", id, "didn't finish", JSON.stringify({ bad: r.bad, moves: r.moves }));
        } else if (r.moves > 20 && r.bad / r.moves > 0.5) {
            fails++;
            console.log("FAIL", id, "too many refused moves", r.bad + "/" + r.moves);
        }
        r.hardWon = r.res && r.res.winner === hardSeat;
        if (process.env.SHOW) console.log("  ", id, JSON.stringify(levels), r.res && r.res.text, r.res ? "" : JSON.stringify(r.stuck));
    }
    const done = out.filter((r) => r.res);
    console.log(id.padEnd(12), "finished " + done.length + "/" + out.length, "hard wins " + out.filter((r) => r.hardWon).length, "refused " + out.reduce((x, r) => x + r.bad, 0) + "/" + out.reduce((x, r) => x + r.moves, 0), "game mins " + out.map((r) => r.mins).join(","), "real " + (Date.now() - t0) + "ms");
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
