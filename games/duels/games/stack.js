const makeRace = require("../race");

// Stack Tower: same seeded speeds for both players; the tallest tower in the time limit wins.
// The client sends where each block was dropped and the server replays the slicing to check the count.
const LEVELS = 150;
const BASE = { x: 0.2, w: 0.6 };
const SNAP = 0.012;

function speeds(rng) {
    const list = [];
    for (let i = 0; i < LEVELS; i++) list.push(Math.round(Math.min(1.9, 0.5 + i * 0.03) * (0.88 + rng() * 0.28) * 1000) / 1000);
    return list;
}

// same math as the client: the next block, or null on a miss
function slice(prev, x, w) {
    if (Math.abs(x - prev.x) < SNAP) x = prev.x;
    const left = Math.max(prev.x, x);
    const right = Math.min(prev.x + prev.w, x + w);
    const nw = Math.round((right - left) * 10000) / 10000;
    if (nw <= 0) return null;
    return { x: Math.round(left * 10000) / 10000, w: nw };
}

module.exports = makeRace({
    id: "stack",
    name: "Stack Tower",
    seconds: 60,
    better: "high",
    setup: (rng) => ({ base: BASE, speeds: speeds(rng), fromLeft: Array.from({ length: LEVELS }, () => rng() < 0.5), snap: SNAP }),
    validate: (puzzle, score, p) => {
        if (!Number.isInteger(score) || score > LEVELS) return false;
        const drops = Array.isArray(p.drops) ? p.drops.slice(0, LEVELS + 1) : [];
        let top = puzzle.base;
        let n = 0;
        for (const d of drops) {
            const x = Number(d);
            if (!Number.isFinite(x)) return false;
            const next = slice(top, x, top.w);
            if (!next) break;
            top = next;
            n++;
        }
        return n === score;
    },
    describe: (s) => s + (s === 1 ? " block" : " blocks"),
});
module.exports.slice = slice;
